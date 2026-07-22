import { Client } from "ssh2";
import { decryptText } from "../config/db";

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface CpuInfo {
  model: string;
  cores: number;
  usage: number;
}

export interface MemoryInfo {
  total: number;
  used: number;
  free: number;
  available: number;
  percent: number;
}

export interface DiskInfo {
  filesystem: string;
  mount: string;
  total: string;
  used: string;
  available: string;
  percent: number;
}

export interface ProcessInfo {
  pid: number;
  user: string;
  cpu: number;
  mem: number;
  vsz: number;
  rss: number;
  command: string;
}

export interface ServiceInfo {
  name: string;
  description: string;
  status: string;
  activeState: string;
  subState: string;
}

export interface SystemInfo {
  hostname: string;
  os: string;
  kernel: string;
  arch: string;
  uptime: string;
  loadAvg: number[];
}

export interface NetworkInterface {
  name: string;
  ipv4: string;
  ipv6: string;
  mac: string;
  state: string;
  mtu: number;
}

class VpsControlService {
  private async createSshConnection(hostConfigId: string): Promise<Client> {
    const { query } = await import("../config/db");
    const res = await query(
      `SELECT host, port, username, auth_type AS "authType", password, ssh_key AS "sshKey"
       FROM remote_host_configs WHERE id = $1`, [hostConfigId]
    );
    if (res.rows.length === 0) throw new Error("Host config not found.");
    const r = res.rows[0];

    const ssh = new Client();
    return new Promise((resolve, reject) => {
      ssh.on("ready", () => resolve(ssh));
      ssh.on("error", (err: Error) => reject(err));

      const connectOpts: any = {
        host: r.host,
        port: r.port || 22,
        username: r.username,
        readyTimeout: 10000,
        keepaliveInterval: 15000,
        keepaliveCountMax: 3,
      };
      if (r.authType === "key" && r.sshKey) {
        connectOpts.privateKey = decryptText(r.sshKey);
      } else {
        connectOpts.password = r.password ? decryptText(r.password) : "";
      }
      ssh.connect(connectOpts);
    });
  }

  public async execCommand(hostConfigId: string, command: string): Promise<ExecResult> {
    const ssh = await this.createSshConnection(hostConfigId);
    return new Promise((resolve, reject) => {
      ssh.exec(command, (err: any, stream: any) => {
        if (err) { ssh.end(); reject(err); return; }
        let stdout = "";
        let stderr = "";
        stream.on("data", (data: Buffer) => { stdout += data.toString("utf-8"); });
        stream.stderr.on("data", (data: Buffer) => { stderr += data.toString("utf-8"); });
        stream.on("close", (code: number) => { ssh.end(); resolve({ stdout, stderr, exitCode: code ?? 0 }); });
      });
    });
  }

  public async getMetrics(hostConfigId: string): Promise<{ cpu: CpuInfo; memory: MemoryInfo; disks: DiskInfo[]; loadAvg: number[] }> {
    const ssh = await this.createSshConnection(hostConfigId);
    return new Promise((resolve, reject) => {
      const cmds = [
        `grep -c ^processor /proc/cpuinfo`,
        `cat /proc/cpuinfo | grep "model name" | head -1`,
        `free -b | awk 'NR==2{printf "%s %s %s %s", $2, $3, $4, $7}'`,
        `df -B1 --output=source,target,size,used,avail,pcent -x tmpfs -x devtmpfs -x squashfs 2>/dev/null | tail -n +2`,
        `cat /proc/loadavg | awk '{print $1, $2, $3}'`,
        `grep 'cpu ' /proc/stat | awk '{usage=($2+$4)*100/($2+$4+$5)} END {printf "%.1f", usage}'`
      ].join(" && echo '---SEPARATOR---' && ");

      ssh.exec(cmds, (err: any, stream: any) => {
        if (err) { ssh.end(); reject(err); return; }
        let output = "";
        stream.on("data", (data: Buffer) => { output += data.toString("utf-8"); });
        stream.stderr.on("data", () => {});
        stream.on("close", () => {
          ssh.end();
          try {
            const parts = output.split("---SEPARATOR---").map((s: string) => s.trim());
            const cores = parseInt(parts[0]) || 1;
            const modelLine = parts[1] || "";
            const cpuModel = modelLine.replace("model name\t:", "").trim() || "Unknown";
            const cpuUsage = parseFloat(parts[5]) || 0;

            const memParts = (parts[2] || "0 0 0 0").split(" ");
            const memTotal = parseInt(memParts[0]) || 0;
            const memUsed = parseInt(memParts[1]) || 0;
            const memFree = parseInt(memParts[2]) || 0;
            const memAvail = parseInt(memParts[3]) || 0;

            const diskLines = (parts[3] || "").split("\n").filter((l: string) => l.trim());
            const disks: DiskInfo[] = diskLines.map((line: string) => {
              const cols = line.trim().split(/\s+/);
              return {
                filesystem: cols[0] || "",
                mount: cols[1] || "",
                total: cols[2] || "0",
                used: cols[3] || "0",
                available: cols[4] || "0",
                percent: parseInt(cols[5]) || 0,
              };
            });

            const loadParts = (parts[4] || "0 0 0").split(" ");
            resolve({
              cpu: { model: cpuModel, cores, usage: cpuUsage },
              memory: {
                total: memTotal, used: memUsed, free: memFree, available: memAvail,
                percent: memTotal > 0 ? Math.round((memUsed / memTotal) * 100 * 10) / 10 : 0,
              },
              disks,
              loadAvg: loadParts.map((l: string) => parseFloat(l) || 0),
            });
          } catch (_) {
            reject(new Error("Failed to parse metrics"));
          }
        });
      });
    });
  }

  public async getProcesses(hostConfigId: string, sortBy: "cpu" | "mem" = "cpu"): Promise<ProcessInfo[]> {
    const sortFlag = sortBy === "cpu" ? "--sort=-%cpu" : "--sort=-%mem";
    const result = await this.execCommand(hostConfigId, `ps aux ${sortFlag} | head -51`);
    const lines = result.stdout.split("\n").slice(1);
    return lines.filter((l: string) => l.trim()).map((line: string) => {
      const parts = line.trim().split(/\s+/);
      return {
        pid: parseInt(parts[1]) || 0,
        user: parts[0] || "",
        cpu: parseFloat(parts[2]) || 0,
        mem: parseFloat(parts[3]) || 0,
        vsz: parseInt(parts[4]) || 0,
        rss: parseInt(parts[5]) || 0,
        command: parts.slice(10).join(" ") || "",
      };
    });
  }

  public async getServices(hostConfigId: string): Promise<ServiceInfo[]> {
    const result = await this.execCommand(
      hostConfigId,
      `systemctl list-units --type=service --all --no-pager --no-legend --plain 2>/dev/null | head -100`
    );
    return result.stdout.split("\n").filter((l: string) => l.trim()).map((line: string) => {
      const parts = line.trim().split(/\s+/);
      return {
        name: (parts[0] || "").replace(".service", ""),
        description: parts.slice(3).join(" ") || "",
        status: parts[2] || "unknown",
        activeState: parts[2] || "unknown",
        subState: parts[3] || "unknown",
      };
    });
  }

  public async controlService(hostConfigId: string, serviceName: string, action: "start" | "stop" | "restart" | "enable" | "disable"): Promise<ExecResult> {
    const sanitized = serviceName.replace(/[^a-zA-Z0-9._@-]/g, "");
    return this.execCommand(hostConfigId, `sudo systemctl ${action} ${sanitized}`);
  }

  public async getSystemLogs(hostConfigId: string, options: { lines?: number; unit?: string; since?: string } = {}): Promise<string> {
    const lines = Math.min(options.lines || 100, 500);
    let cmd = `journalctl -n ${lines} --no-pager -o short-iso`;
    if (options.unit) {
      const unit = options.unit.replace(/[^a-zA-Z0-9._@-]/g, "");
      cmd += ` -u ${unit}`;
    }
    if (options.since) {
      cmd += ` --since "${options.since.replace(/[^a-zA-Z0-9 :.-]/g, "")}"`;
    }
    const result = await this.execCommand(hostConfigId, cmd);
    return result.stdout;
  }

  public async getSystemInfo(hostConfigId: string): Promise<SystemInfo> {
    const cmds = [
      `hostname`,
      `cat /etc/os-release 2>/dev/null | grep "^PRETTY_NAME" | cut -d'"' -f2 || echo "Unknown"`,
      `uname -r`,
      `uname -m`,
      `uptime -p 2>/dev/null || uptime`,
      `cat /proc/loadavg | awk '{print $1, $2, $3}'`
    ].join(" && echo '---SEP---' && ");
    const result = await this.execCommand(hostConfigId, cmds);
    const parts = result.stdout.split("---SEP---").map((s: string) => s.trim());
    return {
      hostname: parts[0] || "",
      os: parts[1] || "",
      kernel: parts[2] || "",
      arch: parts[3] || "",
      uptime: parts[4] || "",
      loadAvg: (parts[5] || "0 0 0").split(" ").map((l: string) => parseFloat(l) || 0),
    };
  }

  public async getNetwork(hostConfigId: string): Promise<{ interfaces: NetworkInterface[]; connections: string }> {
    const ssh = await this.createSshConnection(hostConfigId);
    return new Promise((resolve, reject) => {
      const cmd = [
        `ip -o addr show | awk '{print $2, $3, $4}'`,
        `ip link show | grep -E "^[0-9]+" | awk '{print $2, $NF}'`,
        `cat /sys/class/net/*/address 2>/dev/null`,
        `ss -tuln | head -20`
      ].join(" && echo '---SEP---' && ");
      ssh.exec(cmd, (err: any, stream: any) => {
        if (err) { ssh.end(); reject(err); return; }
        let output = "";
        stream.on("data", (data: Buffer) => { output += data.toString("utf-8"); });
        stream.stderr.on("data", () => {});
        stream.on("close", () => {
          ssh.end();
          try {
            const parts = output.split("---SEP---").map((s: string) => s.trim());
            const addrLines = parts[0] ? parts[0].split("\n") : [];
            const linkLines = parts[1] ? parts[1].split("\n") : [];
            const macLines = parts[2] ? parts[2].split("\n") : [];

            const interfaces: NetworkInterface[] = [];
            linkLines.forEach((line: string, idx: number) => {
              const linkParts = line.split(" ");
              const name = linkParts[0].replace(":", "");
              if (name === "lo") return;
              const state = linkParts[linkParts.length - 1] || "unknown";
              const macAddr = macLines[idx] || "N/A";
              const ipv4 = addrLines.find((a: string) => a.startsWith(name))?.split(" ").find((p: string) => p.startsWith("inet/"))?.replace("inet/", "") || "N/A";
              const ipv6 = addrLines.find((a: string) => a.startsWith(name))?.split(" ").find((p: string) => p.startsWith("inet6/"))?.replace("inet6/", "").split("/")[0] || "N/A";
              interfaces.push({ name, ipv4, ipv6, mac: macAddr, state, mtu: 1500 });
            });

            resolve({ interfaces, connections: parts[3] || "" });
          } catch (_) {
            reject(new Error("Failed to parse network info"));
          }
        });
      });
    });
  }

  public async killProcess(hostConfigId: string, pid: number, signal: string = "SIGTERM"): Promise<ExecResult> {
    if (pid < 1 || pid > 4194304) throw new Error("Invalid PID");
    const validSignals = ["SIGTERM", "SIGKILL", "SIGHUP", "SIGINT"];
    if (!validSignals.includes(signal)) throw new Error("Invalid signal");
    return this.execCommand(hostConfigId, `sudo kill -${signal} ${pid}`);
  }

  public async getUserList(hostConfigId: string): Promise<string> {
    const result = await this.execCommand(hostConfigId, `cat /etc/passwd | grep -v nologin | grep -v false`);
    return result.stdout;
  }

  public async getDiskIO(hostConfigId: string): Promise<string> {
    const result = await this.execCommand(hostConfigId, `cat /proc/diskstats | head -10`);
    return result.stdout;
  }
}

export const vpsControlService = new VpsControlService();
