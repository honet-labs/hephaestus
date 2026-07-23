import { Client } from "ssh2";
import { query, encryptText } from "../config/db";
import crypto from "crypto";
import { WebSocket } from "ws";

export interface RemoteHostConfig {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  authType: "password" | "key";
  password?: string;
  sshKey?: string;
  groupName?: string;
  tags?: string[];
  createdAt?: string;
}

class RemoteHostService {
  public async getConfigs(): Promise<RemoteHostConfig[]> {
    const res = await query(
      `SELECT id, name, host, port, username, auth_type AS "authType",
              password, ssh_key AS "sshKey", group_name AS "groupName",
              tags, created_at AS "createdAt"
       FROM remote_host_configs ORDER BY group_name ASC, name ASC`
    );
    return res.rows.map((r: any) => ({
      ...r,
      password: r.password ? "********" : "",
      sshKey: r.sshKey ? "********" : "",
      groupName: r.groupName || "Default",
      tags: r.tags || [],
    }));
  }

  public async getConfigById(id: string): Promise<RemoteHostConfig | null> {
    const res = await query(
      `SELECT id, name, host, port, username, auth_type AS "authType",
              password, ssh_key AS "sshKey", group_name AS "groupName", tags
       FROM remote_host_configs WHERE id = $1`, [id]
    );
    if (res.rows.length === 0) return null;
    const r = res.rows[0];
    r.groupName = r.groupName || "Default";
    r.tags = r.tags || [];
    r.password = r.password ? "********" : "";
    r.sshKey = r.sshKey ? "********" : "";
    return r;
  }

  public async saveConfig(cfg: Partial<RemoteHostConfig> & { id?: string }): Promise<RemoteHostConfig> {
    const id = cfg.id || `rhc-${crypto.randomUUID().slice(0, 8)}`;
    const hasPassword = cfg.password !== undefined && cfg.password !== null && cfg.password !== "" && cfg.password !== "********";
    const hasKey = cfg.sshKey !== undefined && cfg.sshKey !== null && cfg.sshKey !== "" && cfg.sshKey !== "********";
    const encryptedPassword = hasPassword ? encryptText(cfg.password!) : undefined;
    const encryptedKey = hasKey ? encryptText(cfg.sshKey!) : undefined;

    console.log(`[RemoteHost] saveConfig id=${id} hasPassword=${hasPassword} hasKey=${hasKey} authType=${cfg.authType}`);

    const existing = await this.getConfigById(id);
    if (existing) {
      const fields: string[] = [];
      const values: any[] = [];
      if (cfg.name !== undefined) { fields.push("name"); values.push(cfg.name); }
      if (cfg.host !== undefined) { fields.push("host"); values.push(cfg.host); }
      if (cfg.port !== undefined) { fields.push("port"); values.push(cfg.port); }
      if (cfg.username !== undefined) { fields.push("username"); values.push(cfg.username); }
      if (cfg.authType !== undefined) { fields.push("auth_type"); values.push(cfg.authType); }
      if (encryptedPassword !== undefined) { fields.push("password"); values.push(encryptedPassword); }
      if (encryptedKey !== undefined) { fields.push("ssh_key"); values.push(encryptedKey); }
      if (cfg.groupName !== undefined) { fields.push("group_name"); values.push(cfg.groupName); }
      if (cfg.tags !== undefined) { fields.push("tags"); values.push(cfg.tags); }
      console.log(`[RemoteHost] UPDATE fields: [${fields.join(", ")}]`);
      if (fields.length > 0) {
        const setClauses = fields.map((f, i) => `${f} = $${i + 1}`).join(", ");
        await query(
          `UPDATE remote_host_configs SET ${setClauses} WHERE id = $${fields.length + 1}`,
          [...values, id]
        );
      }
    } else {
      console.log(`[RemoteHost] INSERT new config id=${id}`);
      await query(
        `INSERT INTO remote_host_configs (id, name, host, port, username, auth_type, password, ssh_key, group_name, tags)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [id, cfg.name, cfg.host, cfg.port || 22, cfg.username, cfg.authType || "password", encryptedPassword || null, encryptedKey || null, cfg.groupName || "Default", cfg.tags || []]
      );
    }
    return (await this.getConfigById(id))!;
  }

  public async deleteConfig(id: string): Promise<void> {
    await query("DELETE FROM remote_host_configs WHERE id = $1", [id]);
  }

  public async getRawConfig(id: string): Promise<RemoteHostConfig | null> {
    const res = await query(
      `SELECT id, name, host, port, username, auth_type AS "authType", password, ssh_key AS "sshKey"
       FROM remote_host_configs WHERE id = $1`, [id]
    );
    if (res.rows.length === 0) return null;
    const r = res.rows[0];
    const { decryptText } = await import("../config/db");
    if (r.password) {
      const decrypted = decryptText(r.password);
      r.password = decrypted;
    }
    if (r.sshKey) {
      const decrypted = decryptText(r.sshKey);
      r.sshKey = decrypted;
    }
    return r;
  }

  public handleWebSocket(ws: WebSocket, hostConfigId: string, cols: number, rows: number, userId?: number): void {
    this.getRawConfig(hostConfigId).then((cfg) => {
      if (!cfg) {
        ws.send(JSON.stringify({ type: "error", message: "Host config not found." }));
        ws.close();
        return;
      }

      console.log(`[RemoteHost] WS connect id=${cfg.id} host=${cfg.host} user=${cfg.username} authType=${cfg.authType} hasPassword=${!!cfg.password} hasKey=${!!cfg.sshKey}`);

      const ssh = new Client();
      let termStream: any = null;

      ssh.on("ready", () => {
        ssh.shell({ term: "xterm-256color", cols, rows } as any, (err: any, stream: any) => {
          if (err) {
            ws.send(JSON.stringify({ type: "error", message: `Shell error: ${err.message}` }));
            ws.close();
            return;
          }
          termStream = stream;
          ws.send(JSON.stringify({ type: "connected", host: cfg.host, username: cfg.username }));

          stream.on("data", (data: Buffer) => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: "data", data: data.toString("utf-8") }));
            }
          });
          stream.stderr.on("data", (data: Buffer) => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: "data", data: data.toString("utf-8") }));
            }
          });
          stream.on("close", () => {
            ws.send(JSON.stringify({ type: "disconnected" }));
            ws.close();
          });
        });
      });

      ssh.on("error", (err: Error) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "error", message: `SSH error: ${err.message}` }));
          ws.close();
        }
      });

      ssh.on("close", () => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "disconnected" }));
          ws.close();
        }
      });

      // Handle messages from client
      ws.on("message", (msg: Buffer) => {
        try {
          const parsed = JSON.parse(msg.toString());
          if (parsed.type === "input" && termStream) {
            termStream.write(parsed.data);
          } else if (parsed.type === "resize" && termStream) {
            termStream.setWindow(parsed.rows, parsed.cols, 0, 0);
          } else if (parsed.type === "disconnect") {
            termStream?.close();
            ssh.end();
          } else if (parsed.type === "ping") {
            // Respond pong and extend session expiry
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: "pong" }));
            }
            if (userId) {
              const { query } = require("../config/db");
              // Extend session but cap at 7 days from creation to prevent perpetual sessions
              query(
                `UPDATE user_sessions SET expires_at = LEAST(NOW() + INTERVAL '24 hours', created_at + INTERVAL '7 days')
                 WHERE user_id = $1 AND expires_at > NOW()`,
                [userId]
              ).catch(() => {});
            }
          }
        } catch (_) {
          // If not JSON, treat as raw input
          if (termStream) {
            termStream.write(msg.toString());
          }
        }
      });

      ws.on("close", () => {
        termStream?.close();
        ssh.end();
      });

      // Connect
      const connectOpts: any = {
        host: cfg.host,
        port: cfg.port || 22,
        username: cfg.username,
        keepaliveInterval: 15000,
        keepaliveCountMax: 10,
        readyTimeout: 10000,
      };
      if (cfg.authType === "key" && cfg.sshKey) {
        connectOpts.privateKey = cfg.sshKey;
      } else {
        connectOpts.password = cfg.password || "";
      }
      ssh.connect(connectOpts);
    }).catch((err) => {
      ws.send(JSON.stringify({ type: "error", message: `Failed to load config: ${err.message}` }));
      ws.close();
    });
  }

  public async testConnection(params: {
    host: string; port: number; username: string;
    authType: "password" | "key"; password?: string; sshKey?: string;
  }): Promise<{ success: boolean; message: string }> {
    return new Promise((resolve) => {
      const ssh = new Client();
      const timeout = setTimeout(() => {
        ssh.end();
        resolve({ success: false, message: "Connection timed out (10s)." });
      }, 10000);

      ssh.on("ready", () => {
        clearTimeout(timeout);
        ssh.end();
        resolve({ success: true, message: `Connected as ${params.username}@${params.host}:${params.port}` });
      });

      ssh.on("error", (err: Error) => {
        clearTimeout(timeout);
        resolve({ success: false, message: err.message });
      });

      const connectOpts: any = {
        host: params.host,
        port: params.port || 22,
        username: params.username,
      };
      if (params.authType === "key" && params.sshKey) {
        connectOpts.privateKey = params.sshKey;
      } else {
        connectOpts.password = params.password || "";
      }
      ssh.connect(connectOpts);
    });
  }

  private sftpPool = new Map<string, { ssh: Client; sftp: any; lastUsed: number }>();
  private SFTP_POOL_TIMEOUT = 3 * 60 * 1000; // 3 minutes

  private sanitizeRemotePath(remotePath: string): string {
    if (!remotePath || !remotePath.trim()) return "/";
    let p = remotePath.replace(/\0/g, "");
    p = p.replace(/~+/g, "");
    const parts = p.split("/").filter(Boolean);
    const resolved: string[] = [];
    for (const part of parts) {
      if (part === "..") { resolved.pop(); continue; }
      if (part === ".") continue;
      resolved.push(part);
    }
    return "/" + resolved.join("/");
  }

  private async getSftpConnection(hostConfigId: string): Promise<{ sftp: any; ssh: Client }> {
    const cfg = await this.getRawConfig(hostConfigId);
    if (!cfg) throw new Error("Host config not found.");

    const poolKey = hostConfigId;
    const existing = this.sftpPool.get(poolKey);
    if (existing && (Date.now() - existing.lastUsed) < this.SFTP_POOL_TIMEOUT) {
      existing.lastUsed = Date.now();
      return { sftp: existing.sftp, ssh: existing.ssh };
    }

    // Close stale connection
    if (existing) { try { existing.ssh.end(); } catch (_) {} this.sftpPool.delete(poolKey); }

    return new Promise((resolve, reject) => {
      const ssh = new Client();
      ssh.on("ready", () => {
        ssh.sftp((err: any, sftp: any) => {
          if (err) { ssh.end(); reject(err); return; }
          ssh.on("close", () => { const e = this.sftpPool.get(poolKey); if (e && e.ssh === ssh) this.sftpPool.delete(poolKey); });
          this.sftpPool.set(poolKey, { ssh, sftp, lastUsed: Date.now() });
          resolve({ sftp, ssh });
        });
      });
      ssh.on("error", (err: Error) => reject(err));
      const connectOpts: any = {
        host: cfg.host,
        port: cfg.port || 22,
        username: cfg.username,
        keepaliveInterval: 15000,
        readyTimeout: 10000,
      };
      if (cfg.authType === "key" && cfg.sshKey) {
        connectOpts.privateKey = cfg.sshKey;
      } else {
        connectOpts.password = cfg.password || "";
      }
      ssh.connect(connectOpts);
    });
  }

  public async sftpListDir(hostConfigId: string, remotePath: string): Promise<{ name: string; isDir: boolean; size: number; modTime: string }[]> {
    const safePath = this.sanitizeRemotePath(remotePath);
    const { sftp, ssh } = await this.getSftpConnection(hostConfigId);
    return new Promise((resolve, reject) => {
      sftp.readdir(safePath, (err: any, list: any[]) => {
        ssh.end();
        if (err) { reject(err); return; }
        resolve(list.map((item: any) => ({
          name: item.filename,
          isDir: item.attrs.isDirectory(),
          size: item.attrs.size,
          modTime: new Date(item.attrs.mtime * 1000).toISOString(),
        })));
      });
    });
  }

  public async sftpUpload(hostConfigId: string, remotePath: string, fileBuffer: Buffer, fileName: string): Promise<{ success: boolean; message: string }> {
    const safePath = this.sanitizeRemotePath(remotePath);
    const { sftp, ssh } = await this.getSftpConnection(hostConfigId);
    return new Promise((resolve, reject) => {
      const writeStream = sftp.createWriteStream(safePath);
      writeStream.on("close", () => { ssh.end(); resolve({ success: true, message: `Uploaded ${fileName} to ${safePath}` }); });
      writeStream.on("error", (err: any) => { ssh.end(); reject(err); });
      writeStream.end(fileBuffer);
    });
  }

  public async sftpDownload(hostConfigId: string, remotePath: string): Promise<{ buffer: Buffer; fileName: string; size: number }> {
    const safePath = this.sanitizeRemotePath(remotePath);
    const { sftp, ssh } = await this.getSftpConnection(hostConfigId);
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      const readStream = sftp.createReadStream(safePath);
      readStream.on("data", (chunk: Buffer) => chunks.push(chunk));
      readStream.on("end", () => { ssh.end(); const buf = Buffer.concat(chunks); resolve({ buffer: buf, fileName: safePath.split("/").pop() || "download", size: buf.length }); });
      readStream.on("error", (err: any) => { ssh.end(); reject(err); });
    });
  }

  public async sftpRemoteToRemote(
    fromHostConfigId: string, fromPath: string,
    toHostConfigId: string, toPath: string,
  ): Promise<{ success: boolean; message: string }> {
    const safeFromPath = this.sanitizeRemotePath(fromPath);
    const safeToPath = this.sanitizeRemotePath(toPath);
    const fromCfg = await this.getRawConfig(fromHostConfigId);
    const toCfg = await this.getRawConfig(toHostConfigId);
    if (!fromCfg || !toCfg) throw new Error("One or both host configs not found.");

    return new Promise((resolve, reject) => {
      const fromSsh = new Client();
      const toSsh = new Client();
      let cleaned = false;
      function cleanup() {
        if (cleaned) return;
        cleaned = true;
        try { fromSsh.end(); } catch (_) { /* ignore */ }
        try { toSsh.end(); } catch (_) { /* ignore */ }
      }

      fromSsh.on("error", (err: Error) => { cleanup(); reject(err); });
      toSsh.on("error", (err: Error) => { cleanup(); reject(err); });

      const fromConnOpts: any = { host: fromCfg.host, port: fromCfg.port || 22, username: fromCfg.username, keepaliveInterval: 15000, readyTimeout: 10000 };
      if (fromCfg.authType === "key" && fromCfg.sshKey) fromConnOpts.privateKey = fromCfg.sshKey;
      else fromConnOpts.password = fromCfg.password || "";

      const toConnOpts: any = { host: toCfg.host, port: toCfg.port || 22, username: toCfg.username, keepaliveInterval: 15000, readyTimeout: 10000 };
      if (toCfg.authType === "key" && toCfg.sshKey) toConnOpts.privateKey = toCfg.sshKey;
      else toConnOpts.password = toCfg.password || "";

      toSsh.on("ready", () => {
        toSsh.sftp((toErr: any, toSftp: any) => {
          if (toErr) { cleanup(); reject(toErr); return; }
          const writeStream = toSftp.createWriteStream(safeToPath);
          writeStream.on("close", () => { cleanup(); resolve({ success: true, message: `Transferred ${safeFromPath} → ${safeToPath}` }); });
          writeStream.on("error", (err: any) => { cleanup(); reject(err); });

          fromSsh.on("ready", () => {
            fromSsh.sftp((fromErr: any, fromSftp: any) => {
              if (fromErr) { cleanup(); reject(fromErr); return; }
              const readStream = fromSftp.createReadStream(safeFromPath);
              readStream.on("error", (err: any) => { cleanup(); reject(err); });
              readStream.pipe(writeStream);
            });
          });
          fromSsh.connect(fromConnOpts);
        });
      });
      toSsh.connect(toConnOpts);
    });
  }
}

export const remoteHostService = new RemoteHostService();
