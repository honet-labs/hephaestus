import { Client } from "ssh2";
import { query, encryptText } from "../config/db";
import crypto from "crypto";
import cron from "node-cron";

function shellEscape(s: string): string {
  return "'" + s.replace(/'/g, "'\\''") + "'";
}

export interface BackupDbConfig {
  id: string;
  name: string;
  dbType: "mysql" | "mariadb" | "postgresql" | "sqlserver";
  host: string;
  port: number;
  username: string;
  password: string;
  databaseName: string;
  sshHost?: string;
  sshPort?: number;
  sshUser?: string;
  sshAuth?: "password" | "key";
  sshPassword?: string;
  sshKey?: string;
}

export interface BackupDestination {
  id: string;
  name: string;
  destType: "local" | "gdrive" | "nas" | "r2";
  config: Record<string, any>;
  isActive: boolean;
}

export interface BackupHistoryEntry {
  id: string;
  dbConfigId: string;
  destinationId: string;
  dbName: string;
  dbType: string;
  destType: string;
  filename: string;
  fileSize: number;
  status: "running" | "success" | "failed";
  errorMessage?: string;
  startedAt: string;
  completedAt?: string;
}

export interface BackupSchedule {
  id: string;
  name: string;
  dbConfigId: string;
  destinationId: string;
  cronExpression: string;
  isActive: boolean;
  lastRun?: string;
  nextRun?: string;
  createdAt: string;
}

class BackupService {
  // ---- SSH Connection Pool (reuse pattern from dataprepper) ----
  private sshConnections: Map<string, { conn: Client; lastActive: number }> = new Map();
  private SSH_IDLE_TIMEOUT_MS = 5 * 60 * 1000;

  private getSshKey(cfg: BackupDbConfig): string {
    return `${cfg.sshHost || cfg.host}:${cfg.sshPort || 22}:${cfg.sshUser || "root"}`;
  }

  private async getSshConnection(cfg: BackupDbConfig): Promise<Client> {
    const key = this.getSshKey(cfg);
    const existing = this.sshConnections.get(key);
    if (existing && Date.now() - existing.lastActive < this.SSH_IDLE_TIMEOUT_MS) {
      existing.lastActive = Date.now();
      return existing.conn;
    }
    if (existing) {
      try { existing.conn.end(); } catch (_) { /* ignore close error */ }
      this.sshConnections.delete(key);
    }
    const conn = await new Promise<Client>((resolve, reject) => {
      const c = new Client();
      c.on("ready", () => resolve(c));
      c.on("error", (err) => reject(err));
      const connectOpts: any = {
        host: cfg.sshHost || cfg.host,
        port: cfg.sshPort || 22,
        username: cfg.sshUser || "root",
      };
      if (cfg.sshAuth === "key" && cfg.sshKey) {
        connectOpts.privateKey = cfg.sshKey;
      } else {
        connectOpts.password = cfg.sshPassword || "";
      }
      c.connect(connectOpts);
    });
    this.sshConnections.set(key, { conn, lastActive: Date.now() });
    return conn;
  }

  private closeAndRemoveConnection(cfg: BackupDbConfig) {
    const key = this.getSshKey(cfg);
    const entry = this.sshConnections.get(key);
    if (entry) {
      try { entry.conn.end(); } catch (_) { /* ignore close error */ }
      this.sshConnections.delete(key);
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

  // ---- Database Config CRUD ----
  public async getDbConfigs(): Promise<BackupDbConfig[]> {
    const res = await query(
      `SELECT id, name, db_type AS "dbType", host, port, username, password,
              database_name AS "databaseName",
              ssh_host AS "sshHost", ssh_port AS "sshPort", ssh_user AS "sshUser",
              ssh_auth AS "sshAuth", ssh_password AS "sshPassword", ssh_key AS "sshKey",
              created_at AS "createdAt"
       FROM backup_database_configs ORDER BY name ASC`
    );
    return res.rows.map((r: any) => ({
      ...r,
      password: "********",
      sshPassword: r.sshPassword ? "********" : "",
      sshKey: r.sshKey ? "********" : "",
    }));
  }

  public async getDbConfigById(id: string): Promise<BackupDbConfig | null> {
    const res = await query(
      `SELECT id, name, db_type AS "dbType", host, port, username, password,
              database_name AS "databaseName",
              ssh_host AS "sshHost", ssh_port AS "sshPort", ssh_user AS "sshUser",
              ssh_auth AS "sshAuth", ssh_password AS "sshPassword", ssh_key AS "sshKey"
       FROM backup_database_configs WHERE id = $1`, [id]
    );
    return res.rows.length > 0 ? res.rows[0] as BackupDbConfig : null;
  }

  public async saveDbConfig(cfg: Partial<BackupDbConfig> & { id?: string; password: string; sshPassword?: string; sshKey?: string }): Promise<BackupDbConfig> {
    const id = cfg.id || `bdc-${crypto.randomUUID().slice(0, 8)}`;
    const encryptedPassword = cfg.password === "********" ? undefined : encryptText(cfg.password);
    const encryptedSshPassword = cfg.sshPassword && cfg.sshPassword !== "********" ? encryptText(cfg.sshPassword) : (cfg.sshPassword === "********" ? undefined : null);
    const encryptedSshKey = cfg.sshKey && cfg.sshKey !== "********" ? encryptText(cfg.sshKey) : (cfg.sshKey === "********" ? undefined : null);

    // Fetch existing for conditional update
    const existing = await this.getDbConfigById(id);

    const fields: string[] = [];
    const values: any[] = [];

    const upsert = async () => {
      const setClauses = fields.map((f, i) => `${f} = $${i + 1}`).join(", ");
      if (existing) {
        await query(
          `UPDATE backup_database_configs SET ${setClauses} WHERE id = $${fields.length + 1}`,
          [...values, id]
        );
      } else {
        const valPlaceholders = fields.map((_, i) => `$${i + 2}`);
        await query(
          `INSERT INTO backup_database_configs (id, ${fields.join(", ")}) VALUES ($1, ${valPlaceholders.join(", ")})`,
          [id, ...values]
        );
      }
    };

    if (cfg.name !== undefined) { fields.push("name"); values.push(cfg.name); }
    if (cfg.dbType !== undefined) { fields.push("db_type"); values.push(cfg.dbType); }
    if (cfg.host !== undefined) { fields.push("host"); values.push(cfg.host); }
    if (cfg.port !== undefined) { fields.push("port"); values.push(cfg.port); }
    if (cfg.username !== undefined) { fields.push("username"); values.push(cfg.username); }
    if (cfg.databaseName !== undefined) { fields.push("database_name"); values.push(cfg.databaseName); }
    if (encryptedPassword !== undefined) { fields.push("password"); values.push(encryptedPassword); }
    if (cfg.sshHost !== undefined) { fields.push("ssh_host"); values.push(cfg.sshHost || null); }
    if (cfg.sshPort !== undefined) { fields.push("ssh_port"); values.push(cfg.sshPort || 22); }
    if (cfg.sshUser !== undefined) { fields.push("ssh_user"); values.push(cfg.sshUser || null); }
    if (cfg.sshAuth !== undefined) { fields.push("ssh_auth"); values.push(cfg.sshAuth || "password"); }
    if (encryptedSshPassword !== undefined) { fields.push("ssh_password"); values.push(encryptedSshPassword); }
    if (encryptedSshKey !== undefined) { fields.push("ssh_key"); values.push(encryptedSshKey); }

    await upsert();
    const saved = await this.getDbConfigById(id);
    return saved!;
  }

  public async deleteDbConfig(id: string): Promise<void> {
    await query("DELETE FROM backup_database_configs WHERE id = $1", [id]);
  }

  // ---- Destination CRUD ----
  public async getDestinations(): Promise<BackupDestination[]> {
    const res = await query(
      `SELECT id, name, dest_type AS "destType", config, is_active AS "isActive", created_at AS "createdAt"
       FROM backup_destinations ORDER BY name ASC`
    );
    return res.rows.map((r: any) => {
      const cfg = typeof r.config === "string" ? JSON.parse(r.config) : r.config;
      // Mask secrets
      if (cfg.secretAccessKey) cfg.secretAccessKey = "********";
      if (cfg.accessToken) cfg.accessToken = "********";
      if (cfg.password) cfg.password = "********";
      return { ...r, config: cfg };
    });
  }

  public async getDestinationById(id: string): Promise<BackupDestination | null> {
    const res = await query(
      `SELECT id, name, dest_type AS "destType", config, is_active AS "isActive"
       FROM backup_destinations WHERE id = $1`, [id]
    );
    if (res.rows.length === 0) return null;
    const r = res.rows[0];
    return { ...r, config: typeof r.config === "string" ? JSON.parse(r.config) : r.config };
  }

  public async saveDestination(dest: { id?: string; name: string; destType: string; config: Record<string, any> }): Promise<BackupDestination> {
    const id = dest.id || `bdest-${crypto.randomUUID().slice(0, 8)}`;
    // Encrypt secrets in config
    const safeConfig = { ...dest.config };
    if (safeConfig.secretAccessKey && safeConfig.secretAccessKey !== "********") {
      safeConfig.secretAccessKey = encryptText(safeConfig.secretAccessKey);
    }
    if (safeConfig.accessToken && safeConfig.accessToken !== "********") {
      safeConfig.accessToken = encryptText(safeConfig.accessToken);
    }
    if (safeConfig.password && safeConfig.password !== "********") {
      safeConfig.password = encryptText(safeConfig.password);
    }

    const existing = await this.getDestinationById(id);
    if (existing) {
      await query(
        `UPDATE backup_destinations SET name = $1, dest_type = $2, config = $3 WHERE id = $4`,
        [dest.name, dest.destType, JSON.stringify(safeConfig), id]
      );
    } else {
      await query(
        `INSERT INTO backup_destinations (id, name, dest_type, config) VALUES ($1, $2, $3, $4)`,
        [id, dest.name, dest.destType, JSON.stringify(safeConfig)]
      );
    }
    return (await this.getDestinationById(id))!;
  }

  public async deleteDestination(id: string): Promise<void> {
    await query("DELETE FROM backup_destinations WHERE id = $1", [id]);
  }

  // ---- Connection Testing ----
  public async testDbConnection(cfg: BackupDbConfig): Promise<{ success: boolean; message: string }> {
    if (cfg.sshHost) {
      return this.testDbViaSsh(cfg);
    }
    return this.testDbDirect(cfg);
  }

  private async testDbDirect(cfg: BackupDbConfig): Promise<{ success: boolean; message: string }> {
    try {
      if (cfg.dbType === "postgresql") {
        const { Client } = await import("pg");
        const c = new Client({ host: cfg.host, port: cfg.port, user: cfg.username, password: cfg.password, database: cfg.databaseName, connectionTimeoutMillis: 10000 });
        await c.connect();
        await c.query("SELECT 1");
        await c.end();
        return { success: true, message: "PostgreSQL connection successful." };
      }
      if (cfg.dbType === "mysql" || cfg.dbType === "mariadb") {
        const mysql = await import("mysql2/promise");
        const c = await mysql.createConnection({ host: cfg.host, port: cfg.port, user: cfg.username, password: cfg.password, database: cfg.databaseName, connectTimeout: 10000 });
        await c.query("SELECT 1");
        await c.end();
        return { success: true, message: `${cfg.dbType === "mariadb" ? "MariaDB" : "MySQL"} connection successful.` };
      }
      if (cfg.dbType === "sqlserver") {
        const sql = await import("mssql");
        const pool = await sql.connect({ user: cfg.username, password: cfg.password, database: cfg.databaseName, server: cfg.host, port: cfg.port, options: { encrypt: false, trustServerCertificate: true }, connectionTimeout: 10000 });
        await pool.request().query("SELECT 1");
        await pool.close();
        return { success: true, message: "SQL Server connection successful." };
      }
      return { success: false, message: `Unsupported database type: ${cfg.dbType}` };
    } catch (err: any) {
      return { success: false, message: `Connection failed: ${err.message || err}` };
    }
  }

  private async testDbViaSsh(cfg: BackupDbConfig): Promise<{ success: boolean; message: string }> {
    let conn;
    try {
      conn = await this.getSshConnection(cfg);
      const testCmd = this.getTestCommand(cfg);
      await this.executeRemoteCommand(conn, testCmd);
      return { success: true, message: `Connection to ${cfg.dbType} via SSH successful.` };
    } catch (err: any) {
      return { success: false, message: `SSH connection failed: ${err.message || err}` };
    } finally {
      if (conn) this.closeAndRemoveConnection(cfg);
    }
  }

  private getTestCommand(cfg: BackupDbConfig): string {
    const pass = cfg.password;
    switch (cfg.dbType) {
      case "postgresql":
        return `PGPASSWORD=${shellEscape(pass)} psql -h ${shellEscape(cfg.host)} -p ${cfg.port} -U ${shellEscape(cfg.username)} -d ${shellEscape(cfg.databaseName)} -c "SELECT 1"`;
      case "mysql":
      case "mariadb":
        return `mysql -h ${shellEscape(cfg.host)} -P ${cfg.port} -u ${shellEscape(cfg.username)} -p${shellEscape(pass)} ${shellEscape(cfg.databaseName)} -e "SELECT 1"`;
      case "sqlserver":
        return `echo "SELECT 1" | sqlcmd -S ${shellEscape(cfg.host)},${cfg.port} -U ${shellEscape(cfg.username)} -P ${shellEscape(pass)} -d ${shellEscape(cfg.databaseName)}`;
      default:
        return "echo 'Unsupported'";
    }
  }

  // ---- Backup Execution ----
  public async executeBackup(dbConfigId: string, destinationId: string): Promise<BackupHistoryEntry> {
    const dbCfg = await this.getDbConfigById(dbConfigId);
    if (!dbCfg) throw new Error("Database config not found.");
    // Restore the actual password from DB
    const rawCfg = await this.getRawDbConfig(dbConfigId);
    if (!rawCfg) throw new Error("Database config not found.");

    const dest = await this.getRawDestination(destinationId);
    if (!dest) throw new Error("Backup destination not found.");

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const dumpFilename = `${rawCfg.databaseName}_${timestamp}.sql`;

    // Create history entry
    const historyId = `bh-${crypto.randomUUID().slice(0, 8)}`;
    await query(
      `INSERT INTO backup_history (id, db_config_id, destination_id, db_name, db_type, dest_type, filename, status, started_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'running', NOW())`,
      [historyId, dbConfigId, destinationId, rawCfg.databaseName, rawCfg.dbType, dest.destType, dumpFilename]
    );

    try {
      let dumpContent: string;
      if (rawCfg.sshHost) {
        dumpContent = await this.executeDumpViaSsh(rawCfg, dumpFilename);
      } else {
        dumpContent = await this.executeDumpDirect(rawCfg);
      }

      const dumpBuffer = Buffer.from(dumpContent, "utf-8");
      const fileSize = dumpBuffer.length;

      // Upload to destination
      await this.uploadToDestination(dumpBuffer, dumpFilename, dest);

      // Update history
      await query(
        `UPDATE backup_history SET status = 'success', file_size = $1, completed_at = NOW() WHERE id = $2`,
        [fileSize, historyId]
      );

      return {
        id: historyId,
        dbConfigId,
        destinationId,
        dbName: rawCfg.databaseName,
        dbType: rawCfg.dbType,
        destType: dest.destType,
        filename: dumpFilename,
        fileSize,
        status: "success",
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      };
    } catch (err: any) {
      await query(
        `UPDATE backup_history SET status = 'failed', error_message = $1, completed_at = NOW() WHERE id = $2`,
        [err.message || String(err), historyId]
      );
      throw err;
    }
  }

  private async getRawDbConfig(id: string): Promise<BackupDbConfig | null> {
    const res = await query(
      `SELECT id, name, db_type AS "dbType", host, port, username, password,
              database_name AS "databaseName",
              ssh_host AS "sshHost", ssh_port AS "sshPort", ssh_user AS "sshUser",
              ssh_auth AS "sshAuth", ssh_password AS "sshPassword", ssh_key AS "sshKey"
       FROM backup_database_configs WHERE id = $1`, [id]
    );
    if (res.rows.length === 0) return null;
    const r = res.rows[0] as BackupDbConfig;
    // Decrypt passwords
    const { decryptText } = await import("../config/db");
    try { r.password = decryptText(r.password); } catch (_) { /* already-encrypted */ }
    if (r.sshPassword) try { r.sshPassword = decryptText(r.sshPassword); } catch (_) { /* already-encrypted */ }
    if (r.sshKey) try { r.sshKey = decryptText(r.sshKey); } catch (_) { /* already-encrypted */ }
    return r;
  }

  private async getRawDestination(id: string): Promise<BackupDestination | null> {
    const res = await query(
      `SELECT id, name, dest_type AS "destType", config FROM backup_destinations WHERE id = $1`, [id]
    );
    if (res.rows.length === 0) return null;
    const r = res.rows[0];
    const cfg = typeof r.config === "string" ? JSON.parse(r.config) : r.config;
    // Decrypt secrets
    if (cfg.secretAccessKey) {
      try { const { decryptText } = await import("../config/db"); cfg.secretAccessKey = decryptText(cfg.secretAccessKey); } catch (_) { /* already-encrypted */ }
    }
    if (cfg.accessToken) {
      try { const { decryptText } = await import("../config/db"); cfg.accessToken = decryptText(cfg.accessToken); } catch (_) { /* already-encrypted */ }
    }
    if (cfg.password) {
      try { const { decryptText } = await import("../config/db"); cfg.password = decryptText(cfg.password); } catch (_) { /* already-encrypted */ }
    }
    return { ...r, config: cfg };
  }

  private async executeDumpDirect(cfg: BackupDbConfig): Promise<string> {
    if (cfg.dbType === "postgresql") {
      const { Client } = await import("pg");
      const c = new Client({ host: cfg.host, port: cfg.port, user: cfg.username, password: cfg.password, database: cfg.databaseName });
      await c.connect();
      const tables = await c.query("SELECT tablename FROM pg_tables WHERE schemaname = 'public'");
      let dump = "-- PostgreSQL dump\n";
      for (const row of tables.rows) {
        const safeName = row.tablename.replace(/[^a-zA-Z0-9_]/g, "");
        if (!safeName) continue;
        const createRes = await c.query(`SELECT pg_get_tabledef('public', $1)`, [safeName]);
        dump += createRes.rows[0]?.pg_get_tabledef || "";
        dump += ";\n\n";
        const dataRes = await c.query(`SELECT * FROM "${safeName}"`);
        for (const d of dataRes.rows) {
          const cols = Object.keys(d).map(c => c.replace(/[^a-zA-Z0-9_]/g, ""));
          const vals = cols.map((c, i) => {
            const v = d[Object.keys(d)[i]];
            if (v === null) return "NULL";
            if (typeof v === "string") return `'${v.replace(/'/g, "''")}'`;
            return String(v);
          });
          dump += `INSERT INTO "${safeName}" (${cols.map(c => `"${c}"`).join(", ")}) VALUES (${vals.join(", ")});\n`;
        }
        dump += "\n";
      }
      await c.end();
      return dump;
    }
    if (cfg.dbType === "mysql" || cfg.dbType === "mariadb") {
      const mysql = await import("mysql2/promise");
      const c = await mysql.createConnection({ host: cfg.host, port: cfg.port, user: cfg.username, password: cfg.password, database: cfg.databaseName });
      const [tables] = await c.query("SHOW TABLES");
      let dump = `-- ${cfg.dbType} dump\n`;
      for (const row of Object.values(tables) as any[]) {
        const tableName = row[`Tables_in_${cfg.databaseName}`];
        if (!tableName) continue;
        const safeName = tableName.replace(/[^a-zA-Z0-9_]/g, "");
        if (!safeName) continue;
        const [createRows] = await c.query(`SHOW CREATE TABLE \`${safeName}\``);
        dump += (createRows as any[])[0]?.["Create Table"] || "";
        dump += ";\n\n";
        const [dataRows] = await c.query(`SELECT * FROM \`${safeName}\``);
        for (const d of dataRows as any[]) {
          const cols = Object.keys(d);
          const vals = cols.map(c => d[c] === null ? "NULL" : typeof d[c] === "string" ? `'${d[c].replace(/'/g, "''")}'` : d[c]);
          dump += `INSERT INTO \`${safeName}\` (${cols.map(c => `\`${c}\``).join(", ")}) VALUES (${vals.join(", ")});\n`;
        }
        dump += "\n";
      }
      await c.end();
      return dump;
    }
    if (cfg.dbType === "sqlserver") {
      const sql = await import("mssql");
      const pool = await sql.connect({ user: cfg.username, password: cfg.password, database: cfg.databaseName, server: cfg.host, port: cfg.port, options: { encrypt: false, trustServerCertificate: true } });
      const tablesResult = await pool.request().query("SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = 'BASE TABLE'");
      let dump = "-- SQL Server dump\n";
      for (const row of tablesResult.recordset) {
        const tableName = row.TABLE_NAME;
        const safeName = tableName.replace(/[^a-zA-Z0-9_]/g, "");
        if (!safeName) continue;
        const dataResult = await pool.request().query(`SELECT * FROM [${safeName}]`);
        for (const d of dataResult.recordset) {
          const cols = Object.keys(d);
          const vals = cols.map(c => d[c] === null ? "NULL" : typeof d[c] === "string" ? `'${d[c].replace(/'/g, "''")}'` : d[c]);
          dump += `INSERT INTO [${safeName}] (${cols.map(c => `[${c}]`).join(", ")}) VALUES (${vals.join(", ")});\n`;
        }
        dump += "\n";
      }
      await pool.close();
      return dump;
    }
    throw new Error(`Unsupported database type: ${cfg.dbType}`);
  }

  private async executeDumpViaSsh(cfg: BackupDbConfig, filename: string): Promise<string> {
    let conn;
    try {
      conn = await this.getSshConnection(cfg);
      const remotePath = `/tmp/${filename}`;
      let dumpCmd: string;

      switch (cfg.dbType) {
        case "postgresql":
          dumpCmd = `PGPASSWORD=${shellEscape(cfg.password)} pg_dump -h ${shellEscape(cfg.host)} -p ${cfg.port} -U ${shellEscape(cfg.username)} -d ${shellEscape(cfg.databaseName)} -Fc -f ${shellEscape(remotePath)}`;
          break;
        case "mysql":
        case "mariadb":
          dumpCmd = `mysqldump -h ${shellEscape(cfg.host)} -P ${cfg.port} -u ${shellEscape(cfg.username)} -p${shellEscape(cfg.password)} ${shellEscape(cfg.databaseName)} > ${shellEscape(remotePath)}`;
          break;
        case "sqlserver":
          dumpCmd = `echo "SELECT * FROM INFORMATION_SCHEMA.TABLES" | sqlcmd -S ${shellEscape(cfg.host)},${cfg.port} -U ${shellEscape(cfg.username)} -P ${shellEscape(cfg.password)} -d ${shellEscape(cfg.databaseName)} -s "|" -W > ${shellEscape(remotePath)}`;
          break;
        default:
          throw new Error(`Unsupported database type: ${cfg.dbType}`);
      }

      await this.executeRemoteCommand(conn, dumpCmd);

      // Download the dump file
      const content = await new Promise<string>((resolve, reject) => {
        conn!.sftp((err: Error | null, sftp: any) => {
          if (err) return reject(err);
          const chunks: Buffer[] = [];
          const stream = sftp.createReadStream(remotePath);
          stream.on("data", (chunk: Buffer) => chunks.push(chunk));
          stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
          stream.on("error", (e: Error) => reject(e));
        });
      });

      // Cleanup remote file
      await this.executeRemoteCommand(conn, `rm -f ${shellEscape(remotePath)}`).catch(() => {});

      return content;
    } catch (err: any) {
      throw new Error(`SSH dump failed: ${err.message || err}`);
    } finally {
      if (conn) this.closeAndRemoveConnection(cfg);
    }
  }

  // ---- Destination Upload ----
  private async uploadToDestination(buffer: Buffer, filename: string, dest: BackupDestination): Promise<void> {
    switch (dest.destType) {
      case "local":
        await this.uploadToLocal(buffer, filename, dest.config);
        break;
      case "r2":
        await this.uploadToR2(buffer, filename, dest.config);
        break;
      case "gdrive":
        await this.uploadToGDrive(buffer, filename, dest.config);
        break;
      case "nas":
        await this.uploadToNas(buffer, filename, dest.config);
        break;
      default:
        throw new Error(`Unsupported destination type: ${dest.destType}`);
    }
  }

  private async uploadToLocal(buffer: Buffer, filename: string, config: Record<string, any>): Promise<void> {
    const fs = await import("fs/promises");
    const path = await import("path");
    const destDir = path.resolve(config.path || "/opt/backups");
    const safeDir = destDir.replace(/\0/g, "");
    const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "");
    if (!safeName) throw new Error("Invalid filename");
    try { await fs.access(safeDir); } catch { await fs.mkdir(safeDir, { recursive: true }); }
    await fs.writeFile(path.join(safeDir, safeName), buffer);
  }

  private async uploadToR2(buffer: Buffer, filename: string, config: Record<string, any>): Promise<void> {
    const { S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3");
    const s3 = new S3Client({
      region: "auto",
      endpoint: config.endpoint || `https://${config.accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    });
    await s3.send(new PutObjectCommand({ Bucket: config.bucket, Key: filename, Body: buffer }));
  }

  private async uploadToGDrive(buffer: Buffer, filename: string, config: Record<string, any>): Promise<void> {
    // Google Drive upload via API
    const axios = (await import("axios")).default;
    const accessToken = config.accessToken;
    const folderId = config.folderId || "";

    // Step 1: Create file metadata
    const metadata: any = { name: filename, mimeType: "application/octet-stream" };
    if (folderId) metadata.parents = [folderId];

    // Step 2: Multipart upload
    const boundary = "----BackupBoundary" + Date.now();
    const parts: Buffer[] = [];

    // Metadata part
    parts.push(Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`));
    // File data part
    parts.push(Buffer.from(`--${boundary}\r\nContent-Type: application/octet-stream\r\n\r\n`));
    parts.push(buffer);
    parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));

    const body = Buffer.concat(parts);
    await axios.post("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart", body, {
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": `multipart/related; boundary=${boundary}` },
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    });
  }

  private async uploadToNas(buffer: Buffer, filename: string, config: Record<string, any>): Promise<void> {
    // NAS via SCP using SSH
    const conn = new (await import("ssh2")).Client();
    await new Promise<void>((resolve, reject) => {
      conn.on("ready", () => resolve());
      conn.on("error", (err: Error) => reject(err));
      const connectOpts: any = { host: config.host, port: config.port || 22, username: config.username || "root" };
      if (config.sshAuth === "key" && config.sshKey) {
        connectOpts.privateKey = config.sshKey;
      } else {
        connectOpts.password = config.password || "";
      }
      conn.connect(connectOpts);
    });

    const remotePath = `${config.path || "/backups"}/${filename}`;
    await new Promise<void>((resolve, reject) => {
      conn.sftp((err, sftp) => {
        if (err) { conn.end(); return reject(err); }
        const stream = sftp.createWriteStream(remotePath);
        stream.on("close", () => { conn.end(); resolve(); });
        stream.on("error", (e: Error) => { conn.end(); reject(e); });
        stream.end(buffer);
      });
    });
  }

  // ---- History ----
  public async getHistory(limit: number = 50, offset: number = 0): Promise<BackupHistoryEntry[]> {
    const res = await query(
      `SELECT id, db_config_id AS "dbConfigId", destination_id AS "destinationId",
              db_name AS "dbName", db_type AS "dbType", dest_type AS "destType",
              filename, file_size AS "fileSize", status, error_message AS "errorMessage",
              started_at AS "startedAt", completed_at AS "completedAt"
       FROM backup_history ORDER BY started_at DESC LIMIT $1 OFFSET $2`, [limit, offset]
    );
    return res.rows;
  }

  public async getHistoryCount(): Promise<number> {
    const res = await query("SELECT COUNT(*) AS count FROM backup_history");
    return parseInt(res.rows[0].count, 10);
  }

  public async deleteHistory(id: string): Promise<void> {
    await query("DELETE FROM backup_history WHERE id = $1", [id]);
  }

  // ---- Schedule CRUD ----
  private cronJobs: Map<string, cron.ScheduledTask> = new Map();

  public async getSchedules(): Promise<BackupSchedule[]> {
    const res = await query(
      `SELECT id, name, db_config_id AS "dbConfigId", destination_id AS "destinationId",
              cron_expression AS "cronExpression", is_active AS "isActive",
              last_run AS "lastRun", next_run AS "nextRun", created_at AS "createdAt"
       FROM backup_schedules ORDER BY created_at DESC`
    );
    return res.rows;
  }

  public async getScheduleById(id: string): Promise<BackupSchedule | null> {
    const res = await query(
      `SELECT id, name, db_config_id AS "dbConfigId", destination_id AS "destinationId",
              cron_expression AS "cronExpression", is_active AS "isActive",
              last_run AS "lastRun", next_run AS "nextRun", created_at AS "createdAt"
       FROM backup_schedules WHERE id = $1`, [id]
    );
    return res.rows.length > 0 ? res.rows[0] : null;
  }

  public async saveSchedule(schedule: { id?: string; name: string; dbConfigId: string; destinationId: string; cronExpression: string; isActive?: boolean }): Promise<BackupSchedule> {
    const id = schedule.id || `bsch-${crypto.randomUUID().slice(0, 8)}`;
    const existing = await this.getScheduleById(id);

    if (existing) {
      await query(
        `UPDATE backup_schedules SET name = $1, db_config_id = $2, destination_id = $3,
         cron_expression = $4, is_active = $5 WHERE id = $6`,
        [schedule.name, schedule.dbConfigId, schedule.destinationId, schedule.cronExpression, schedule.isActive !== false, id]
      );
    } else {
      await query(
        `INSERT INTO backup_schedules (id, name, db_config_id, destination_id, cron_expression, is_active)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [id, schedule.name, schedule.dbConfigId, schedule.destinationId, schedule.cronExpression, schedule.isActive !== false]
      );
    }

    // Reload cron job for this schedule
    this.reloadCronJob(id);

    return (await this.getScheduleById(id))!;
  }

  public async deleteSchedule(id: string): Promise<void> {
    // Stop cron job if running
    const job = this.cronJobs.get(id);
    if (job) {
      job.stop();
      this.cronJobs.delete(id);
    }
    await query("DELETE FROM backup_schedules WHERE id = $1", [id]);
  }

  public async toggleSchedule(id: string, isActive: boolean): Promise<BackupSchedule> {
    await query("UPDATE backup_schedules SET is_active = $1 WHERE id = $2", [isActive, id]);
    if (isActive) {
      this.reloadCronJob(id);
    } else {
      const job = this.cronJobs.get(id);
      if (job) {
        job.stop();
        this.cronJobs.delete(id);
      }
    }
    return (await this.getScheduleById(id))!;
  }

  public async runScheduleNow(id: string): Promise<BackupHistoryEntry> {
    const schedule = await this.getScheduleById(id);
    if (!schedule) throw new Error("Schedule not found.");
    const result = await this.executeBackup(schedule.dbConfigId, schedule.destinationId);
    await query("UPDATE backup_schedules SET last_run = NOW() WHERE id = $1", [id]);
    return result;
  }

  // ---- Cron Scheduler ----
  private async reloadCronJob(scheduleId: string): Promise<void> {
    // Stop existing job
    const existing = this.cronJobs.get(scheduleId);
    if (existing) {
      existing.stop();
      this.cronJobs.delete(scheduleId);
    }

    const schedule = await this.getScheduleById(scheduleId);
    if (!schedule || !schedule.isActive) return;

    // Validate cron expression
    if (!cron.validate(schedule.cronExpression)) {
      console.error(`[Backup] Invalid cron expression for schedule ${scheduleId}: ${schedule.cronExpression}`);
      return;
    }

    const task = cron.schedule(schedule.cronExpression, async () => {
      console.log(`[Backup] Running scheduled backup: ${schedule.name} (${schedule.id})`);
      try {
        await this.executeBackup(schedule.dbConfigId, schedule.destinationId);
        await query("UPDATE backup_schedules SET last_run = NOW() WHERE id = $1", [schedule.id]);
        console.log(`[Backup] Scheduled backup completed: ${schedule.name}`);
      } catch (err: any) {
        console.error(`[Backup] Scheduled backup failed: ${schedule.name} - ${err.message}`);
      }
    });

    this.cronJobs.set(scheduleId, task);
    console.log(`[Backup] Cron job started for schedule: ${schedule.name} (${schedule.cronExpression})`);
  }

  public async initScheduler(): Promise<void> {
    console.log("[Backup] Initializing backup scheduler...");
    const schedules = await this.getSchedules();
    let activeCount = 0;
    for (const s of schedules) {
      if (s.isActive) {
        await this.reloadCronJob(s.id);
        activeCount++;
      }
    }
    console.log(`[Backup] Scheduler initialized. ${activeCount} active schedule(s).`);
  }
}

export const backupService = new BackupService();
