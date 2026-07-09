import { promises as fsPromises } from "fs";
import path from "path";
import os from "os";
import crypto from "crypto";
import { exec } from "child_process";
import axios from "axios";
import yaml from "js-yaml";
import { Client } from "ssh2";
import config, { PrometheusConfigItem, updateActivePrometheusCache } from "../config/env";
import pool, { query } from "../config/db";

const SSH_IDLE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Escape a string for safe use inside double-quoted shell context.
 * Prevents command injection via shell metacharacters.
 */
function shellEscape(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\$/g, "\\$")
    .replace(/`/g, "\\`")
    .replace(/!/g, "\\!")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t");
}

export class PrometheusService {
  private sshConnections = new Map<string, { client: Client; lastUsed: number; alive: boolean }>();

  private getSSHConnectionKey(activeConfig: any): string {
    return `${activeConfig.sshHost}:${activeConfig.sshPort || 22}:${activeConfig.sshUser}`;
  }

  private isConnectionAlive(entry: { client: Client; lastUsed: number; alive: boolean }): boolean {
    return entry.alive && Date.now() - entry.lastUsed < SSH_IDLE_TIMEOUT_MS;
  }

  public async cleanupIdleSshConnections(): Promise<void> {
    for (const [key, entry] of this.sshConnections) {
      if (!this.isConnectionAlive(entry)) {
        try { entry.client.end(); } catch (_e) { /* ignore close errors */ }
        this.sshConnections.delete(key);
      }
    }
  }

  private removeSSHConnection(key: string): void {
    this.sshConnections.delete(key);
  }

  private closeAndRemoveConnection(conn: Client, activeConfig: any): void {
    const key = this.getSSHConnectionKey(activeConfig);
    this.sshConnections.delete(key);
    try { conn.end(); } catch (_e) { /* ignore */ }
  }

  private getSSHConnection(activeConfig: any): Promise<Client> {
    const key = this.getSSHConnectionKey(activeConfig);
    const cached = this.sshConnections.get(key);
    if (cached && this.isConnectionAlive(cached)) {
      cached.lastUsed = Date.now();
      return Promise.resolve(cached.client);
    }

    // Remove stale entry if exists
    if (cached) {
      try { cached.client.end(); } catch (_e) { /* ignore */ }
      this.sshConnections.delete(key);
    }

    return new Promise((resolve, reject) => {
      const conn = new Client();
      conn.on("ready", () => {
        this.sshConnections.set(key, { client: conn, lastUsed: Date.now(), alive: true });
        resolve(conn);
      })
          .on("error", (err) => {
            this.sshConnections.delete(key);
            reject(err);
          })
          .on("close", () => {
            this.sshConnections.delete(key);
          })
          .connect({
            host: activeConfig.sshHost,
            port: activeConfig.sshPort || 22,
            username: activeConfig.sshUser,
            password: activeConfig.sshAuth === "password" ? activeConfig.sshPassword : undefined,
            privateKey: activeConfig.sshAuth === "key" ? activeConfig.sshKey : undefined,
            readyTimeout: 10000
          });
    });
  }

  /**
   * Helper to read file content over SFTP
   */
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

  /**
   * Helper to write file content over SFTP.
   * Falls back to sudo tee if SFTP write fails with permission denied.
   */
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
        console.log(`[PrometheusService] SFTP write denied on ${remotePath}, retrying with sudo cp...`);
        const tmpPath = `/tmp/prometheus-write-${Date.now()}.yml`;
        await new Promise<void>((resolve, reject) => {
          conn.sftp((err, sftp) => {
            if (err) return reject(err);
            sftp.writeFile(tmpPath, content, "utf8", (err) => {
              if (err) return reject(err);
              resolve();
            });
          });
        });
        const sudoPrefix = sshPassword ? `echo "${shellEscape(sshPassword)}" | sudo -S ` : "sudo ";
        await this.executeRemoteCommand(conn, `${sudoPrefix}cp "${tmpPath}" "${remotePath}"`);
        await this.executeRemoteCommand(conn, `rm -f "${tmpPath}"`);
        return;
      }
      throw sftpErr;
    }
  }

  /**
   * Helper to execute remote command
   */
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

  /**
   * Helper to get the config to use for operations.
   * If configId is provided, looks up that specific profile.
   * Otherwise uses the active config.
   * Returns UNMASKED passwords for actual SSH operations.
   */
  private async getConfigToUse(configId?: string): Promise<PrometheusConfigItem> {
    if (configId) {
      const res = await query(
        `SELECT id, name, mode, path, reload_url AS "reloadUrl", ssh_host AS "sshHost", ssh_port AS "sshPort",
                ssh_user AS "sshUser", ssh_auth AS "sshAuth", ssh_password AS "sshPassword", ssh_key AS "sshKey", is_active AS "isActive"
         FROM prometheus_configs WHERE id = $1`, [configId]
      );
      if (res.rows.length === 0) throw new Error(`Prometheus config profile '${configId}' not found.`);
      return res.rows[0] as PrometheusConfigItem;
    }
    return config.getActivePrometheusConfig();
  }

  /**
   * Reads the current prometheus.yml file.
   * If configId is provided, reads from that specific profile.
   * If it doesn't exist, creates a starter config (local mode only).
   */
  public async readConfig(configId?: string): Promise<{ path: string; content: string }> {
    const activeConfig = await this.getConfigToUse(configId);

    if (activeConfig.mode === "local") {
      const configPath = activeConfig.path;
      const dir = path.dirname(configPath);

      await fsPromises.mkdir(dir, { recursive: true });

      try {
        await fsPromises.access(configPath);
      } catch (_) {
        const defaultYaml = `global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'prometheus'
    static_configs:
      - targets: ['localhost:9090']
`;
        await fsPromises.writeFile(configPath, defaultYaml, "utf-8");
      }

      const content = await fsPromises.readFile(configPath, "utf-8");
      return {
        path: configPath,
        content
      };
    } else {
      // Remote SSH mode
      let conn;
      try {
        conn = await this.getSSHConnection(activeConfig);
        const content = await this.readRemoteFile(conn, activeConfig.path);
        return {
          path: activeConfig.path,
          content
        };
      } catch (err: any) {
        throw new Error(`SSH Read Failed: ${err.message || err}`);
      } finally {
        if (conn) this.closeAndRemoveConnection(conn, activeConfig);
      }
    }
  }

  /**
   * Validates YAML configuration using js-yaml parser.
   * Runs promtool locally or remotely depending on access mode.
   * If configId is provided, validates against that profile.
   */
  public async validateConfig(content: string, configId?: string): Promise<{ valid: boolean; error?: string }> {
    // 1. Basic JS-YAML syntax check (always run locally first)
    try {
      yaml.load(content);
    } catch (err: any) {
      return {
        valid: false,
        error: `YAML Syntax Error: ${err.message || err}`
      };
    }

    const activeConfig = await this.getConfigToUse(configId);

    if (activeConfig.mode === "local") {
      const tempFilePath = path.join(os.tmpdir(), `prometheus-validate-${Date.now()}.yml`);
      try {
        await fsPromises.writeFile(tempFilePath, content, "utf-8");
      } catch (e: any) {
        return { valid: true };
      }

      return new Promise((resolve) => {
        exec(`promtool check config "${tempFilePath}"`, async (err, stdout, stderr) => {
          try {
            await fsPromises.unlink(tempFilePath);
          } catch (_) {
            // ignore
          }

          if (err) {
            if (stderr.toLowerCase().includes("not found") || stderr.toLowerCase().includes("not recognized")) {
              return resolve({ valid: true });
            }
            return resolve({
              valid: false,
              error: `Prometheus Semantic Error: ${stderr.trim() || stdout.trim() || err.message}`
            });
          }
          resolve({ valid: true });
        });
      });
    } else {
      // Remote SSH validation
      let conn;
      try {
        conn = await this.getSSHConnection(activeConfig);
        
        // Write validation file to remote /tmp directory
        const tempPath = `/tmp/prometheus-validate-${Date.now()}.yml`;
        await this.writeRemoteFile(conn, tempPath, content);

        try {
          await this.executeRemoteCommand(conn, `promtool check config "${tempPath}"`);
          return { valid: true };
        } catch (execErr: any) {
          if (execErr.message.toLowerCase().includes("not found")) {
            return { valid: true }; // Skip if promtool not installed remotely
          }
          return {
            valid: false,
            error: `Remote Prometheus Semantic Error: ${execErr.message}`
          };
        } finally {
          try {
            await this.executeRemoteCommand(conn, `rm -f "${tempPath}"`);
          } catch (_) {
            // ignore
          }
        }
      } catch (err: any) {
        // If SSH connection fails during validate check, report it
        return {
          valid: false,
          error: `SSH Connection Validation Failed: ${err.message || err}`
        };
      } finally {
        if (conn) this.closeAndRemoveConnection(conn, activeConfig);
      }
    }
  }

  /**
   * Validates and saves the Prometheus configuration, then triggers a hot reload.
   */
  public async saveConfig(content: string, configId?: string): Promise<{ success: boolean; message: string; reloaded: boolean }> {
    const activeConfig = await this.getConfigToUse(configId);

    // Validate first
    const validation = await this.validateConfig(content, configId);
    if (!validation.valid) {
      return {
        success: false,
        message: validation.error || "Invalid Prometheus configuration.",
        reloaded: false
      };
    }

    if (activeConfig.mode === "local") {
      const configPath = activeConfig.path;
      await fsPromises.writeFile(configPath, content, "utf-8");

      // Try hot-reload via multiple possible endpoints
      const reloadUrls = [
        activeConfig.reloadUrl,
        "http://localhost:9090/-/reload",
        "http://host.docker.internal:9090/-/reload"
      ].filter(Boolean) as string[];

      let lastError = "";
      for (const url of reloadUrls) {
        try {
          await axios.post(url, {}, { timeout: 5000 });
          return {
            success: true,
            message: "Configuration saved and Prometheus reloaded successfully.",
            reloaded: true
          };
        } catch (err: any) {
          lastError = err.message || String(err);
          console.log(`[PrometheusService] Hot-reload failed for ${url}: ${lastError}`);
        }
      }

      return {
        success: true,
        message: `Configuration saved, but hot-reload failed (${lastError}). Ensure Prometheus has --web.enable-lifecycle flag enabled, or use SSH mode to allow service restart.`,
        reloaded: false
      };
    } else {
      // Remote SSH Mode
      let conn;
      try {
        conn = await this.getSSHConnection(activeConfig);
        await this.writeRemoteFile(conn, activeConfig.path, content, activeConfig.sshPassword);
        
        let reloaded = false;
        let reloadMsg = "";
        const sudoPrefix = activeConfig.sshPassword ? `echo "${shellEscape(activeConfig.sshPassword)}" | sudo -S ` : "sudo ";

        // 1. Try hot-reload first
        try {
          let reloadCmd = `curl -sf -X POST http://localhost:9090/-/reload`;
          if (activeConfig.reloadUrl) {
            reloadCmd = `curl -sf -X POST "${activeConfig.reloadUrl}"`;
          }
          await this.executeRemoteCommand(conn, reloadCmd);
          reloaded = true;
          reloadMsg = "Configuration saved and Prometheus reloaded successfully.";
        } catch (e: any) {
          console.log(`[PrometheusService] Hot-reload failed: ${e.message}, trying systemctl restart...`);

          // 2. Fallback: restart service
          try {
            await this.executeRemoteCommand(conn, `${sudoPrefix}systemctl restart prometheus`);
            reloaded = true;
            reloadMsg = "Configuration saved and Prometheus service restarted successfully.";
          } catch (restartErr: any) {
            reloadMsg = `Configuration saved, but reload/restart failed: ${restartErr.message || restartErr}. You may need to restart Prometheus manually.`;
          }
        }
        
        return {
          success: true,
          message: reloadMsg,
          reloaded
        };
      } catch (err: any) {
        return {
          success: false,
          message: `SSH Save Failed: ${err.message || err}`,
          reloaded: false
        };
      } finally {
        if (conn) this.closeAndRemoveConnection(conn, activeConfig);
      }
    }
  }

  /**
   * Tests SSH connection to a remote Prometheus server.
   */
  public async testSSHConnection(activeConfig: any): Promise<{ success: boolean; message: string }> {
    let conn;
    try {
      conn = await this.getSSHConnection(activeConfig);
      
      // Try to read remote file path to check access
      try {
        await this.readRemoteFile(conn, activeConfig.path);
        return {
          success: true,
          message: "SSH Connection and file read check successful."
        };
      } catch (fileErr: any) {
        return {
          success: true,
          message: `SSH Connection successful, but configuration file could not be read: ${fileErr.message}`
        };
      }
    } catch (err: any) {
      return {
        success: false,
        message: `SSH Connection failed: ${err.message || err}`
      };
    } finally {
      if (conn) this.closeAndRemoveConnection(conn, activeConfig);
    }
  }
  /**
   * Retrieves all saved Prometheus configurations.
   * Secrets (sshPassword, sshKey) are masked in the response.
   */
  public async getConfigsList(): Promise<PrometheusConfigItem[]> {
    const res = await query(
      `SELECT id, name, mode, path, reload_url AS "reloadUrl", ssh_host AS "sshHost", ssh_port AS "sshPort", 
              ssh_user AS "sshUser", ssh_auth AS "sshAuth", ssh_password AS "sshPassword", ssh_key AS "sshKey", is_active AS "isActive"
       FROM prometheus_configs
       ORDER BY name ASC`
    );
    return res.rows.map((row: any) => ({
      ...row,
      sshPassword: row.sshPassword ? this.maskSecret(row.sshPassword) : row.sshPassword,
      sshKey: row.sshKey ? this.maskSecret(row.sshKey) : row.sshKey,
    }));
  }

  private maskSecret(value: string): string {
    if (!value || value.length <= 4) return "***";
    return value.substring(0, 4) + "***";
  }

  /**
   * Retrieves a single config by ID with UNMASKED secrets (for SSH operations).
   */
  public async getConfigById(id: string): Promise<PrometheusConfigItem | null> {
    const res = await query(
      `SELECT id, name, mode, path, reload_url AS "reloadUrl", ssh_host AS "sshHost", ssh_port AS "sshPort",
              ssh_user AS "sshUser", ssh_auth AS "sshAuth", ssh_password AS "sshPassword", ssh_key AS "sshKey", is_active AS "isActive"
       FROM prometheus_configs WHERE id = $1`, [id]
    );
    return res.rows.length > 0 ? (res.rows[0] as PrometheusConfigItem) : null;
  }

  /**
   * Writes the configurations list to database.
   */
  public async saveConfigsList(list: PrometheusConfigItem[]): Promise<void> {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const incomingIds = list.map(item => item.id);
      if (incomingIds.length > 0) {
        await client.query("DELETE FROM prometheus_configs WHERE id NOT IN (" + incomingIds.map((_, i) => `$${i + 1}`).join(", ") + ")", incomingIds);
      } else {
        await client.query("DELETE FROM prometheus_configs");
      }
      for (const item of list) {
        await client.query(
          `INSERT INTO prometheus_configs (
             id, name, mode, path, reload_url, ssh_host, ssh_port, ssh_user, ssh_auth, ssh_password, ssh_key, is_active
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
           ON CONFLICT (id) DO UPDATE SET
             name = EXCLUDED.name,
             mode = EXCLUDED.mode,
             path = EXCLUDED.path,
             reload_url = EXCLUDED.reload_url,
             ssh_host = EXCLUDED.ssh_host,
             ssh_port = EXCLUDED.ssh_port,
             ssh_user = EXCLUDED.ssh_user,
             ssh_auth = EXCLUDED.ssh_auth,
             ssh_password = EXCLUDED.ssh_password,
             ssh_key = EXCLUDED.ssh_key,
             is_active = EXCLUDED.is_active`,
          [
            item.id, item.name, item.mode, item.path, item.reloadUrl,
            item.sshHost || null, item.sshPort || null, item.sshUser || null,
            item.sshAuth || null, item.sshPassword || null, item.sshKey || null,
            !!item.isActive
          ]
        );
      }
      await client.query("COMMIT");

      // Also write back to JSON file for physical persistence redundancy
      try {
        await fsPromises.writeFile(config.prometheusConfigsFile, JSON.stringify(list, null, 2), "utf-8");
        console.log(`[PrometheusService] Synchronized configurations to disk: ${config.prometheusConfigsFile}`);
      } catch (err: any) {
        console.error("[PrometheusService] Failed to write configurations to JSON file:", err.message);
      }

      // Update memory cache for active profile
      const active = list.find(c => c.isActive);
      if (active) {
        updateActivePrometheusCache(active);
      }
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Saves or updates a Prometheus configuration profile.
   */
  public async saveConfigProfile(profile: Partial<PrometheusConfigItem>): Promise<PrometheusConfigItem> {
    const list = await this.getConfigsList();
    let item: PrometheusConfigItem;

    if (profile.id) {
      const existing = list.find(c => c.id === profile.id);
      if (!existing) {
        throw new Error(`Profile with id ${profile.id} not found.`);
      }
      // Update existing
      existing.name = profile.name || existing.name;
      existing.mode = profile.mode || existing.mode;
      existing.path = profile.path || existing.path;
      existing.reloadUrl = profile.reloadUrl || existing.reloadUrl;
      existing.sshHost = profile.sshHost;
      existing.sshPort = profile.sshPort;
      existing.sshUser = profile.sshUser;
      existing.sshAuth = profile.sshAuth;
      existing.sshPassword = profile.sshPassword;
      existing.sshKey = profile.sshKey;
      item = existing;
    } else {
      // Create new
      item = {
        id: "prom-cfg-" + crypto.randomUUID(),
        name: profile.name || "Remote Prometheus",
        mode: profile.mode || "local",
        path: profile.path || "/etc/prometheus/prometheus.yml",
        reloadUrl: profile.reloadUrl || "http://localhost:9090/-/reload",
        sshHost: profile.sshHost,
        sshPort: profile.sshPort,
        sshUser: profile.sshUser,
        sshAuth: profile.sshAuth,
        sshPassword: profile.sshPassword,
        sshKey: profile.sshKey,
        isActive: list.length === 0 // Active if first profile
      };
      
      if (item.isActive) {
        list.forEach(c => c.isActive = false);
      }
      list.push(item);
    }

    await this.saveConfigsList(list);
    return item;
  }

  /**
   * Activates a configuration profile.
   */
  public async activateConfigProfile(id: string): Promise<void> {
    const list = await this.getConfigsList();
    const target = list.find(c => c.id === id);
    if (!target) {
      throw new Error(`Profile with id ${id} not found.`);
    }

    list.forEach(c => c.isActive = (c.id === id));
    await this.saveConfigsList(list);
  }

  /**
   * Deletes a configuration profile.
   */
  public async deleteConfigProfile(id: string): Promise<void> {
    const list = await this.getConfigsList();
    const index = list.findIndex(c => c.id === id);
    if (index === -1) {
      throw new Error(`Profile with id ${id} not found.`);
    }

    const wasActive = list[index].isActive;
    list.splice(index, 1);

    // If active profile deleted, activate another one
    if (wasActive && list.length > 0) {
      list[0].isActive = true;
    }

    await this.saveConfigsList(list);
  }
}

export const prometheusService = new PrometheusService();
