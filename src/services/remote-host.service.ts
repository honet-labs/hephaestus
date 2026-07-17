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
    return r;
  }

  public async saveConfig(cfg: Partial<RemoteHostConfig> & { id?: string }): Promise<RemoteHostConfig> {
    const id = cfg.id || `rhc-${crypto.randomUUID().slice(0, 8)}`;
    const encryptedPassword = cfg.password && cfg.password !== "********" ? encryptText(cfg.password) : undefined;
    const encryptedKey = cfg.sshKey && cfg.sshKey !== "********" ? encryptText(cfg.sshKey) : undefined;

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
      if (fields.length > 0) {
        const setClauses = fields.map((f, i) => `${f} = $${i + 1}`).join(", ");
        await query(
          `UPDATE remote_host_configs SET ${setClauses} WHERE id = $${fields.length + 1}`,
          [...values, id]
        );
      }
    } else {
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
    try { if (r.password) r.password = decryptText(r.password); } catch (_) { /* already-encrypted */ }
    try { if (r.sshKey) r.sshKey = decryptText(r.sshKey); } catch (_) { /* already-encrypted */ }
    return r;
  }

  public handleWebSocket(ws: WebSocket, hostConfigId: string, cols: number, rows: number): void {
    this.getRawConfig(hostConfigId).then((cfg) => {
      if (!cfg) {
        ws.send(JSON.stringify({ type: "error", message: "Host config not found." }));
        ws.close();
        return;
      }

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
}

export const remoteHostService = new RemoteHostService();
