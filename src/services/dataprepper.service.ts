import { promises as fsPromises } from "fs";
import path from "path";
import crypto from "crypto";
import yaml from "js-yaml";
import { Client } from "ssh2";
import { query } from "../config/db";

const SSH_IDLE_TIMEOUT_MS = 5 * 60 * 1000;

export interface DataPrepperConfigItem {
  id: string;
  name: string;
  mode: "local" | "ssh";
  pipelinesDir: string;
  reloadUrl?: string;
  sshHost?: string;
  sshPort?: number;
  sshUser?: string;
  sshAuth?: "password" | "key";
  sshPassword?: string;
  sshKey?: string;
  isActive: boolean;
}

/**
 * Escape a string for safe use inside single-quoted shell context.
 */
function shellEscape(s: string): string {
  return "'" + s.replace(/'/g, "'\\''") + "'";
}

export class DataPrepperService {
  private sshConnections = new Map<string, { client: Client; lastUsed: number; alive: boolean }>();

  private getSSHConnectionKey(cfg: any): string {
    return `${cfg.sshHost}:${cfg.sshPort || 22}:${cfg.sshUser}`;
  }

  private async getSSHConnection(cfg: DataPrepperConfigItem): Promise<Client> {
    const key = this.getSSHConnectionKey(cfg);
    const existing = this.sshConnections.get(key);
    if (existing && existing.alive) {
      existing.lastUsed = Date.now();
      return existing.client;
    }

    if (existing) {
      try { existing.client.end(); } catch (_e) { /* ignore */ }
      this.sshConnections.delete(key);
    }

    return new Promise<Client>((resolve, reject) => {
      const conn = new Client();
      const timeout = setTimeout(() => {
        conn.end();
        reject(new Error("SSH connection timed out"));
      }, 15000);

      conn.on("ready", () => {
        clearTimeout(timeout);
        this.sshConnections.set(key, { client: conn, lastUsed: Date.now(), alive: true });
        conn.on("close", () => { this.sshConnections.delete(key); });
        conn.on("error", () => {
          const entry = this.sshConnections.get(key);
          if (entry) entry.alive = false;
        });
        resolve(conn);
      }).on("error", (err) => {
        clearTimeout(timeout);
        reject(err);
      });

      const connectOpts: any = {
        host: cfg.sshHost,
        port: cfg.sshPort || 22,
        username: cfg.sshUser,
        readyTimeout: 15000,
        keepaliveInterval: 10000,
        algorithms: { kex: ["ecdh-sha2-nistp256", "ecdh-sha2-nistp384", "ecdh-sha2-nistp521", "diffie-hellman-group-exchange-sha256"] }
      };

      if (cfg.sshAuth === "key" && cfg.sshKey) {
        connectOpts.privateKey = cfg.sshKey;
      } else if (cfg.sshPassword) {
        connectOpts.password = cfg.sshPassword;
      } else {
        connectOpts.agent = process.env.SSH_AUTH_SOCK || undefined;
      }

      conn.connect(connectOpts);
    });
  }

  closeAndRemoveConnection(conn: Client, cfg: any) {
    const key = this.getSSHConnectionKey(cfg);
    try { conn.end(); } catch (_e) { /* ignore */ }
    this.sshConnections.delete(key);
  }

  async closeIdleConnections() {
    const now = Date.now();
    for (const [key, entry] of this.sshConnections.entries()) {
      if (now - entry.lastUsed > SSH_IDLE_TIMEOUT_MS) {
        try { entry.client.end(); } catch (_e) { /* ignore */ }
        this.sshConnections.delete(key);
      }
    }
  }

  async stopIdleSshScanner() { /* placeholder */ void 0; }

  private readRemoteFile(conn: Client, remotePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      conn.sftp((err, sftp) => {
        if (err) return reject(err);
        sftp.readFile(remotePath, "utf8", (err, data) => {
          if (err) return reject(err);
          resolve(data.toString());
        });
      });
    });
  }

  private async writeRemoteFile(conn: Client, remotePath: string, content: string, sshPassword?: string): Promise<void> {
    try {
      await new Promise<void>((resolve, reject) => {
        conn.sftp((err, sftp) => {
          if (err) return reject(err);
          sftp.writeFile(remotePath, content, "utf8", (err) => {
            if (err) return reject(err);
            resolve();
          });
        });
      });
    } catch (sftpErr: any) {
      const msg = (sftpErr.message || "").toLowerCase();
      if (msg.includes("permission denied") || sftpErr.code === 3) {
        console.log(`[DataPrepperService] SFTP write denied on ${remotePath}, retrying with sudo cp...`);
        const tmpPath = `/tmp/dataprepper-write-${Date.now()}.yml`;
        await new Promise<void>((resolve, reject) => {
          conn.sftp((err, sftp) => {
            if (err) return reject(err);
            sftp.writeFile(tmpPath, content, "utf8", (err) => {
              if (err) return reject(err);
              resolve();
            });
          });
        });
        const sudoPrefix = sshPassword ? `echo ${shellEscape(sshPassword)} | sudo -S ` : "sudo ";
        await this.executeRemoteCommand(conn, `${sudoPrefix}cp ${shellEscape(tmpPath)} ${shellEscape(remotePath)}`);
        await this.executeRemoteCommand(conn, `rm -f ${shellEscape(tmpPath)}`);
        return;
      }
      throw sftpErr;
    }
  }

  private executeRemoteCommand(conn: Client, command: string): Promise<string> {
    return new Promise((resolve, reject) => {
      conn.exec(command, (err, stream) => {
        if (err) return reject(err);
        let stdout = "";
        let stderr = "";
        stream.on("close", (code: number) => {
          if (code !== 0) {
            reject(new Error(stderr.trim() || stdout.trim() || `Exit code ${code}`));
          } else {
            resolve(stdout.trim());
          }
        }).on("data", (data: any) => {
          stdout += data.toString();
        }).stderr.on("data", (data: any) => {
          stderr += data.toString();
        });
      });
    });
  }

  private async getConfigToUse(configId?: string): Promise<DataPrepperConfigItem> {
    if (configId) {
      const res = await query(
        `SELECT id, name, mode, pipelines_dir AS "pipelinesDir", reload_url AS "reloadUrl",
                ssh_host AS "sshHost", ssh_port AS "sshPort", ssh_user AS "sshUser",
                ssh_auth AS "sshAuth", ssh_password AS "sshPassword", ssh_key AS "sshKey", is_active AS "isActive"
         FROM dataprepper_configs WHERE id = $1`, [configId]
      );
      if (res.rows.length === 0) throw new Error(`DataPrepper config profile '${configId}' not found.`);
      return res.rows[0] as DataPrepperConfigItem;
    }
    // Get active config
    const res = await query(
      `SELECT id, name, mode, pipelines_dir AS "pipelinesDir", reload_url AS "reloadUrl",
              ssh_host AS "sshHost", ssh_port AS "sshPort", ssh_user AS "sshUser",
              ssh_auth AS "sshAuth", ssh_password AS "sshPassword", ssh_key AS "sshKey", is_active AS "isActive"
       FROM dataprepper_configs WHERE is_active = true LIMIT 1`
    );
    if (res.rows.length > 0) return res.rows[0] as DataPrepperConfigItem;
    // Fallback to default local config
    return {
      id: "dp-default",
      name: "Default Local",
      mode: "local",
      pipelinesDir: "/opt/data-prepper/pipelines",
      isActive: true
    };
  }

  public async getConfigById(id: string): Promise<DataPrepperConfigItem | null> {
    const res = await query(
      `SELECT id, name, mode, pipelines_dir AS "pipelinesDir", reload_url AS "reloadUrl",
              ssh_host AS "sshHost", ssh_port AS "sshPort", ssh_user AS "sshUser",
              ssh_auth AS "sshAuth", ssh_password AS "sshPassword", ssh_key AS "sshKey", is_active AS "isActive"
       FROM dataprepper_configs WHERE id = $1`, [id]
    );
    return res.rows.length > 0 ? (res.rows[0] as DataPrepperConfigItem) : null;
  }

  public async getConfigsList(): Promise<DataPrepperConfigItem[]> {
    const res = await query(
      `SELECT id, name, mode, pipelines_dir AS "pipelinesDir", reload_url AS "reloadUrl",
              ssh_host AS "sshHost", ssh_port AS "sshPort", ssh_user AS "sshUser",
              ssh_auth AS "sshAuth", ssh_password AS "sshPassword", ssh_key AS "sshKey", is_active AS "isActive"
       FROM dataprepper_configs ORDER BY name ASC`
    );
    return res.rows.map((row: any) => ({
      ...row,
      sshPassword: row.sshPassword ? "********" : "",
      sshKey: row.sshKey ? "********" : ""
    }));
  }

  /**
   * List all pipeline YAML files in the pipelines directory.
   */
  public async listPipelineFiles(configId?: string): Promise<{ files: string[]; dir: string }> {
    const cfg = await this.getConfigToUse(configId);

    if (cfg.mode === "local") {
      const dir = cfg.pipelinesDir;
      try {
        await fsPromises.access(dir);
      } catch (_e) {
        await fsPromises.mkdir(dir, { recursive: true });
      }
      const entries = await fsPromises.readdir(dir);
      const files = entries.filter(f => f.endsWith(".yml") || f.endsWith(".yaml"));
      return { files, dir };
    } else {
      // SSH mode
      let conn;
      try {
        conn = await this.getSSHConnection(cfg);
        const output = await this.executeRemoteCommand(conn, `ls -1 ${shellEscape(cfg.pipelinesDir)}/*.yml ${shellEscape(cfg.pipelinesDir)}/*.yaml 2>/dev/null || true`);
        const files = output.split("\n").filter(f => f.trim()).map(f => path.basename(f.trim()));
        return { files, dir: cfg.pipelinesDir };
      } finally {
        if (conn) this.closeAndRemoveConnection(conn, cfg);
      }
    }
  }

  /**
   * Read a specific pipeline YAML file.
   */
  public async readPipelineFile(filename: string, configId?: string): Promise<{ path: string; content: string }> {
    const cfg = await this.getConfigToUse(configId);
    const filePath = path.join(cfg.pipelinesDir, filename);

    // Security: prevent path traversal
    const normalized = path.posix.normalize(filename);
    if (normalized.includes("..") || path.isAbsolute(filename)) {
      throw new Error("Invalid filename: path traversal is not allowed.");
    }

    if (cfg.mode === "local") {
      const dir = cfg.pipelinesDir;
      try { await fsPromises.access(dir); } catch (_e) { await fsPromises.mkdir(dir, { recursive: true }); }
      try {
        const content = await fsPromises.readFile(filePath, "utf-8");
        return { path: filePath, content };
      } catch (_e) {
        return { path: filePath, content: "# Data Prepper Pipeline Configuration\n" };
      }
    } else {
      let conn;
      try {
        conn = await this.getSSHConnection(cfg);
        const content = await this.readRemoteFile(conn, filePath);
        return { path: filePath, content };
      } catch (_e) {
        return { path: filePath, content: "# Data Prepper Pipeline Configuration\n" };
      } finally {
        if (conn) this.closeAndRemoveConnection(conn, cfg);
      }
    }
  }

  /**
   * Save a pipeline YAML file.
   */
  public async savePipelineFile(filename: string, content: string, configId?: string): Promise<{ success: boolean; message: string }> {
    // Validate YAML
    try {
      yaml.load(content);
    } catch (e: any) {
      return { success: false, message: `Invalid YAML: ${e.message}` };
    }

    const cfg = await this.getConfigToUse(configId);
    const filePath = path.join(cfg.pipelinesDir, filename);

    // Security: prevent path traversal
    const normalized = path.posix.normalize(filename);
    if (normalized.includes("..") || path.isAbsolute(filename)) {
      return { success: false, message: "Invalid filename: path traversal is not allowed." };
    }

    if (cfg.mode === "local") {
      const dir = cfg.pipelinesDir;
      try { await fsPromises.access(dir); } catch (_e) { await fsPromises.mkdir(dir, { recursive: true }); }
      await fsPromises.writeFile(filePath, content, "utf-8");
      return { success: true, message: `Pipeline file "${filename}" saved successfully.` };
    } else {
      let conn;
      try {
        conn = await this.getSSHConnection(cfg);
        await this.writeRemoteFile(conn, filePath, content, cfg.sshPassword);
        return { success: true, message: `Pipeline file "${filename}" saved successfully.` };
      } finally {
        if (conn) this.closeAndRemoveConnection(conn, cfg);
      }
    }
  }

  /**
   * Validate a pipeline YAML file.
   */
  public validatePipeline(content: string): { valid: boolean; error?: string; pipelineNames?: string[] } {
    try {
      const parsed = yaml.load(content);
      if (!parsed || typeof parsed !== "object") {
        return { valid: false, error: "Pipeline file must contain a YAML object." };
      }
      const pipelineNames = Object.keys(parsed as any).filter(k => !k.startsWith("_"));
      return { valid: true, pipelineNames };
    } catch (e: any) {
      return { valid: false, error: `YAML Parse Error: ${e.message}` };
    }
  }

  /**
   * Save a connection profile.
   */
  public async saveConfigProfile(profile: Partial<DataPrepperConfigItem>): Promise<DataPrepperConfigItem> {
    const id = profile.id || `dp-${crypto.randomBytes(8).toString("hex")}`;
    const item: DataPrepperConfigItem = {
      id,
      name: profile.name || "New DataPrepper",
      mode: profile.mode || "local",
      pipelinesDir: profile.pipelinesDir || "/opt/data-prepper/pipelines",
      reloadUrl: profile.reloadUrl || "",
      sshHost: profile.sshHost || "",
      sshPort: profile.sshPort || 22,
      sshUser: profile.sshUser || "",
      sshAuth: profile.sshAuth || "password",
      sshPassword: profile.sshPassword || "",
      sshKey: profile.sshKey || "",
      isActive: profile.isActive !== undefined ? profile.isActive : false
    };

    await query(
      `INSERT INTO dataprepper_configs (
         id, name, mode, pipelines_dir, reload_url, ssh_host, ssh_port, ssh_user, ssh_auth, ssh_password, ssh_key, is_active
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT (id) DO UPDATE SET
         name=EXCLUDED.name, mode=EXCLUDED.mode, pipelines_dir=EXCLUDED.pipelines_dir,
         reload_url=EXCLUDED.reload_url, ssh_host=EXCLUDED.ssh_host, ssh_port=EXCLUDED.ssh_port,
         ssh_user=EXCLUDED.ssh_user, ssh_auth=EXCLUDED.ssh_auth, ssh_password=EXCLUDED.ssh_password,
         ssh_key=EXCLUDED.ssh_key, is_active=EXCLUDED.is_active`,
      [item.id, item.name, item.mode, item.pipelinesDir, item.reloadUrl,
       item.sshHost, item.sshPort, item.sshUser, item.sshAuth,
       item.sshPassword || "", item.sshKey || "", item.isActive]
    );

    return item;
  }

  /**
   * Delete a connection profile.
   */
  public async deleteConfigProfile(id: string): Promise<void> {
    await query("DELETE FROM dataprepper_configs WHERE id = $1", [id]);
  }

  /**
   * Activate a profile (deactivate all others).
   */
  public async activateConfigProfile(id: string): Promise<void> {
    await query("UPDATE dataprepper_configs SET is_active = false");
    await query("UPDATE dataprepper_configs SET is_active = true WHERE id = $1", [id]);
  }

  /**
   * Test SSH connection.
   */
  public async testSSHConnection(cfg: DataPrepperConfigItem): Promise<{ success: boolean; message: string }> {
    let conn;
    try {
      conn = await this.getSSHConnection(cfg);
      // Check if pipelines dir exists
      try {
        await this.executeRemoteCommand(conn, `ls ${shellEscape(cfg.pipelinesDir)}`);
        return { success: true, message: "SSH Connection successful. Pipelines directory accessible." };
      } catch (e: any) {
        return { success: true, message: `SSH Connection successful, but pipelines directory issue: ${e.message}` };
      }
    } catch (err: any) {
      return { success: false, message: `SSH Connection failed: ${err.message || err}` };
    } finally {
      if (conn) this.closeAndRemoveConnection(conn, cfg);
    }
  }
}

export const dataprepperService = new DataPrepperService();
