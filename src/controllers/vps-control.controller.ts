import { Request, Response } from "express";
import { vpsControlService } from "../services/vps-control.service";

const metricsCache = new Map<string, { data: any; expires: number }>();
const METRICS_CACHE_TTL = 10000;

export class VpsControlController {
  public async execCommand(req: Request, res: Response): Promise<void> {
    try {
      const { hostConfigId, command } = req.body;
      if (!hostConfigId || !command) {
        res.status(400).json({ error: "hostConfigId and command are required" });
        return;
      }
      if (command.length > 2048) {
        res.status(400).json({ error: "Command too long (max 2048 chars)" });
        return;
      }
      const blocked = new RegExp([
        "^\\s*(rm\\s+-rf\\s+/|mkfs|dd\\s+if=|:\\(\\){\\s*:\\|:&\\s*};:)",
        "chmod\\s+777\\s+/",
        "wget.*\\|\\s*(ba)?sh",
        "curl.*\\|\\s*(ba)?sh",
        "curl.*\\|\\s*sh",
        "nc\\s+-[el]",
        "python3?\\s+-c",
        "perl\\s+-e",
        "ruby\\s+-e",
        "shutdown",
        "reboot",
        "halt",
        "poweroff",
        "init\\s+[06]",
        "iptables\\s+-F",
        "ip6tables\\s+-F",
        "crontab\\s+-r",
        "base64\\s+-d\\s*\\|",
        "cat\\s+/etc/(shadow|passwd)",
        "find\\s+/\\s+-perm",
        "mount\\s+/",
        "umount\\s+/",
        "fdisk",
        "parted",
        "mkswap",
        "swapon",
        "swapoff",
        "insmod",
        "rmmod",
        "modprobe",
        "systemctl\\s+(mask|unmask|disable)\\s+",
        "kill\\s+-9\\s+1\\b",
        "killall",
        "pkill\\s+-9",
      ].join("|"), "i");
      if (blocked.test(command)) {
        res.status(403).json({ error: "Dangerous command blocked" });
        return;
      }
      const result = await vpsControlService.execCommand(hostConfigId, command);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: "Failed to execute command" });
    }
  }

  public async getMetrics(req: Request, res: Response): Promise<void> {
    try {
      const { hostConfigId } = req.body;
      if (!hostConfigId) {
        res.status(400).json({ error: "hostConfigId is required" });
        return;
      }
      const cached = metricsCache.get(hostConfigId);
      if (cached && cached.expires > Date.now()) {
        res.json(cached.data);
        return;
      }
      const metrics = await vpsControlService.getMetrics(hostConfigId);
      metricsCache.set(hostConfigId, { data: metrics, expires: Date.now() + METRICS_CACHE_TTL });
      res.json(metrics);
    } catch (err: any) {
      res.status(500).json({ error: "Failed to get metrics" });
    }
  }

  public async getProcesses(req: Request, res: Response): Promise<void> {
    try {
      const { hostConfigId, sortBy } = req.body;
      if (!hostConfigId) {
        res.status(400).json({ error: "hostConfigId is required" });
        return;
      }
      const validSort = sortBy === "mem" ? "mem" : "cpu";
      const processes = await vpsControlService.getProcesses(hostConfigId, validSort);
      res.json(processes);
    } catch (err: any) {
      res.status(500).json({ error: "Failed to get processes" });
    }
  }

  public async getServices(req: Request, res: Response): Promise<void> {
    try {
      const { hostConfigId } = req.body;
      if (!hostConfigId) {
        res.status(400).json({ error: "hostConfigId is required" });
        return;
      }
      const services = await vpsControlService.getServices(hostConfigId);
      res.json(services);
    } catch (err: any) {
      res.status(500).json({ error: "Failed to get services" });
    }
  }

  public async controlService(req: Request, res: Response): Promise<void> {
    try {
      const { hostConfigId, serviceName, action } = req.body;
      if (!hostConfigId || !serviceName || !action) {
        res.status(400).json({ error: "hostConfigId, serviceName, and action are required" });
        return;
      }
      const validActions = ["start", "stop", "restart", "enable", "disable"];
      if (!validActions.includes(action)) {
        res.status(400).json({ error: "Invalid action" });
        return;
      }
      const result = await vpsControlService.controlService(hostConfigId, serviceName, action);
      res.json({ success: true, message: `${action} ${serviceName} executed`, stdout: result.stdout, stderr: result.stderr, exitCode: result.exitCode });
    } catch (err: any) {
      res.status(200).json({ success: false, error: err.message || "Failed to control service" });
    }
  }

  public async getSystemLogs(req: Request, res: Response): Promise<void> {
    try {
      const { hostConfigId, lines, unit, since } = req.body;
      if (!hostConfigId) {
        res.status(400).json({ error: "hostConfigId is required" });
        return;
      }
      const logLines = Math.min(Math.max(parseInt(String(lines)) || 100, 1), 500);
      const logs = await vpsControlService.getSystemLogs(hostConfigId, { lines: logLines, unit, since });
      res.json({ logs });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to get system logs" });
    }
  }

  public async getSystemInfo(req: Request, res: Response): Promise<void> {
    try {
      const { hostConfigId } = req.body;
      if (!hostConfigId) {
        res.status(400).json({ error: "hostConfigId is required" });
        return;
      }
      const info = await vpsControlService.getSystemInfo(hostConfigId);
      res.json(info);
    } catch (err: any) {
      res.status(500).json({ error: "Failed to get system info" });
    }
  }

  public async getNetwork(req: Request, res: Response): Promise<void> {
    try {
      const { hostConfigId } = req.body;
      if (!hostConfigId) {
        res.status(400).json({ error: "hostConfigId is required" });
        return;
      }
      const network = await vpsControlService.getNetwork(hostConfigId);
      res.json(network);
    } catch (err: any) {
      res.status(500).json({ error: "Failed to get network info" });
    }
  }

  public async killProcess(req: Request, res: Response): Promise<void> {
    try {
      const { hostConfigId, pid, signal } = req.body;
      if (!hostConfigId || !pid) {
        res.status(400).json({ error: "hostConfigId and pid are required" });
        return;
      }
      const pidNum = parseInt(String(pid));
      if (isNaN(pidNum) || pidNum < 1 || pidNum > 4194304) {
        res.status(400).json({ error: "Invalid PID" });
        return;
      }
      const result = await vpsControlService.killProcess(hostConfigId, pidNum, signal || "SIGTERM");
      res.json({ success: true, message: `Process ${pidNum} killed with ${signal || 'SIGTERM'}`, stdout: result.stdout, stderr: result.stderr, exitCode: result.exitCode });
    } catch (err: any) {
      res.status(200).json({ success: false, error: err.message || "Failed to kill process" });
    }
  }
}

export const vpsControlController = new VpsControlController();
