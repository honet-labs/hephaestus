import { Pool, Client } from "pg";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import config, { updateActiveGrafanaCache, updateActivePrometheusCache } from "./env";

export let isDbConnected = false;
export let dbConnectionError: string | null = null;
let activePool: Pool;
let activeDbConfig: any;

// Encryption helpers for DB password at rest
const ALGORITHM = "aes-256-gcm";
const IV_LEN = 12;
const KEY_LEN = 32;
const KEY_FILE = path.join(config.dbDir, ".encryption_key");

function getEncryptionKey(): Buffer {
  const envKey = process.env.ENCRYPTION_KEY;
  if (envKey) {
    return crypto.scryptSync(envKey, "hephaestus-db-salt", KEY_LEN);
  }
  // Derive or load a persistent key from disk
  try {
    if (fs.existsSync(KEY_FILE)) {
      return Buffer.from(fs.readFileSync(KEY_FILE, "utf-8"), "hex");
    }
  } catch { /* ignore */ }
  // Generate new key and persist
  const newKey = crypto.randomBytes(KEY_LEN);
  try {
    fs.mkdirSync(path.dirname(KEY_FILE), { recursive: true });
    fs.writeFileSync(KEY_FILE, newKey.toString("hex"), { mode: 0o600 });
  } catch { /* best effort */ }
  return newKey;
}

export function encryptText(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag();
  // Format: iv:authTag:ciphertext (all hex)
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;
}

export function decryptText(encryptedStr: string): string {
  // If not in expected format, return as-is (plaintext fallback)
  const parts = encryptedStr.split(":");
  if (parts.length !== 3) return encryptedStr;
  try {
    const key = getEncryptionKey();
    const iv = Buffer.from(parts[0], "hex");
    const authTag = Buffer.from(parts[1], "hex");
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(parts[2], "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch {
    // Decryption failed — might be old plaintext, return as-is
    return encryptedStr;
  }
}

export function loadDbConfig() {
  const dbConfigPath = path.join(config.dbDir, "db_config.json");
  if (fs.existsSync(dbConfigPath)) {
    try {
      const saved = JSON.parse(fs.readFileSync(dbConfigPath, "utf-8"));
      // Decrypt password if it was encrypted
      const password = saved.password
        ? (saved.encrypted ? decryptText(saved.password) : saved.password)
        : (process.env.PGPASSWORD || "postgres");
      return {
        host: saved.host || process.env.PGHOST || "localhost",
        port: parseInt(saved.port || process.env.PGPORT || "5432", 10),
        user: saved.user || process.env.PGUSER || "postgres",
        password,
        database: saved.database || process.env.PGDATABASE || "hephaestus",
        ssl: saved.ssl ? { rejectUnauthorized: config.sslRejectUnauthorized } : undefined
      };
    } catch (err) {
      console.error("[DB] Failed to parse db_config.json, falling back to process.env", err);
    }
  }

  return {
    host: process.env.PGHOST || "localhost",
    port: parseInt(process.env.PGPORT || "5432", 10),
    user: process.env.PGUSER || "postgres",
    password: process.env.PGPASSWORD || "postgres",
    database: process.env.PGDATABASE || "hephaestus",
    ssl: process.env.PGSSL === "true" ? { rejectUnauthorized: config.sslRejectUnauthorized } : undefined,
  };
}

export function saveDbConfigToFile(newConfig: any) {
  const dbConfigPath = path.join(config.dbDir, "db_config.json");
  try {
    fs.mkdirSync(config.dbDir, { recursive: true });
    fs.writeFileSync(dbConfigPath, JSON.stringify({
      host: newConfig.host,
      port: newConfig.port,
      user: newConfig.user,
      password: newConfig.password ? encryptText(newConfig.password) : "",
      database: newConfig.database,
      ssl: !!newConfig.ssl,
      encrypted: true
    }, null, 2), "utf-8");
    console.log(`[DB] Saved database configuration to persistent storage: ${dbConfigPath}`);
  } catch (err: any) {
    console.error("[DB] Failed to save database configuration to file:", err.message);
  }
}

export function updateEnvFile(newConfig: any) {
  const envFilePath = path.resolve(__dirname, "../../.env");
  let content = "";
  if (fs.existsSync(envFilePath)) {
    content = fs.readFileSync(envFilePath, "utf-8");
  }

  const lines = content.split(/\r?\n/);
  const keysToUpdate = {
    PGHOST: newConfig.host,
    PGPORT: newConfig.port.toString(),
    PGUSER: newConfig.user,
    PGPASSWORD: newConfig.password || "",
    PGDATABASE: newConfig.database,
    PGSSL: newConfig.ssl ? "true" : "false"
  };

  const updatedKeys = new Set<string>();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line && !line.startsWith("#")) {
      const parts = line.split("=");
      if (parts.length >= 2) {
        const key = parts[0].trim();
        if (key in keysToUpdate) {
          lines[i] = `${key}=${keysToUpdate[key as keyof typeof keysToUpdate]}`;
          updatedKeys.add(key);
        }
      }
    }
  }

  // Append any keys that weren't already in the file
  for (const [key, value] of Object.entries(keysToUpdate)) {
    if (!updatedKeys.has(key)) {
      if (lines.length > 0 && lines[lines.length - 1] !== "") {
        lines.push("");
      }
      lines.push(`${key}=${value}`);
    }
  }

  fs.writeFileSync(envFilePath, lines.join("\n"), "utf-8");

  // Also update process.env immediately!
  process.env.PGHOST = newConfig.host;
  process.env.PGPORT = newConfig.port.toString();
  process.env.PGUSER = newConfig.user;
  process.env.PGPASSWORD = newConfig.password || "";
  process.env.PGDATABASE = newConfig.database;
  process.env.PGSSL = newConfig.ssl ? "true" : "false";
}

export async function ensureDatabaseExists(dbConfig: any) {
  const targetDb = dbConfig.database || "hephaestus";
  const tempPool = new Pool({
    ...dbConfig,
    max: 1,
    connectionTimeoutMillis: 3000,
  });

  try {
    const client = await tempPool.connect();
    client.release();
    await tempPool.end();
  } catch (err: any) {
    await tempPool.end().catch(() => {});
    if (err.code === "3D000" || (err.message && err.message.includes("does not exist"))) {
      console.log(`[DB] Database "${targetDb}" does not exist. Attempting to create it automatically...`);
      const adminClient = new Client({
        host: dbConfig.host,
        port: dbConfig.port,
        user: dbConfig.user,
        password: dbConfig.password,
        database: "postgres",
        ssl: dbConfig.ssl,
      });

      try {
        await adminClient.connect();
        const safeDbName = targetDb.replace(/[^a-zA-Z0-9_]/g, "");
        await adminClient.query(`CREATE DATABASE ${safeDbName}`);
        console.log(`[DB] Database "${safeDbName}" created successfully!`);
      } catch (createErr: any) {
        console.error(`[DB] Failed to create database "${targetDb}":`, createErr.message);
        throw createErr;
      } finally {
        await adminClient.end().catch(() => {});
      }
    } else {
      throw err;
    }
  }
}

export function setupPool(dbConfig: any) {
  activeDbConfig = dbConfig;
  if (activePool) {
    activePool.end().catch(err => console.error("[DB] Error ending old pool:", err));
  }
  activePool = new Pool({
    ...dbConfig,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 3000,
  });
}

// Initial setup
setupPool(loadDbConfig());

// Export the proxy pool
const pool = new Proxy({} as Pool, {
  get(target, prop) {
    if (!activePool) {
      throw new Error("Database pool is not initialized.");
    }
    const val = Reflect.get(activePool, prop);
    if (typeof val === "function") {
      return val.bind(activePool);
    }
    return val;
  }
});

export default pool;

export async function query(text: string, params?: any[]) {
  const start = Date.now();
  try {
    if (!activePool) {
      throw new Error("Database is not connected.");
    }
    const res = await activePool.query(text, params);
    const duration = Date.now() - start;
    if (duration > 500) {
      console.warn(`[DB] Slow query detected: ${text} took ${duration}ms`);
    }
    return res;
  } catch (err) {
    console.error("[DB] Query error:", err);
    throw err;
  }
}

export async function logActivity(module: string, action: string, details: string, status: string = "SUCCESS", userId: number | null = null) {
  try {
    if (!isDbConnected || !activePool) {
      console.log(`[Activity Log (DB Offline)] [${module}] ${action}: ${details} (${status})`);
      return;
    }
    await activePool.query(
      `INSERT INTO activity_logs (module, action, details, status, user_id) VALUES ($1, $2, $3, $4, $5)`,
      [module, action, details, status, userId]
    );
  } catch (err) {
    console.error("Failed to write activity log:", err);
  }
}

export async function initDb() {
  console.log("⚙️  [DB] Initializing PostgreSQL connection pool and tables...");
  isDbConnected = false;
  dbConnectionError = null;

  try {
    // 1. Automatically create database if it doesn't exist yet
    await ensureDatabaseExists(activeDbConfig);
    
    // 2. Test connection
    await activePool.query("SELECT version()");
    isDbConnected = true;
  } catch (err: any) {
    dbConnectionError = err.message || String(err);
    console.warn("⚠️  [DB] PostgreSQL connection failed. Server will run in Setup Mode:", dbConnectionError);
    return;
  }
  
  // Create tables with proper schemas and relationships
  const schemaQueries = [
    // 1. GrafanaConfigs - Stores Grafana server connection profiles
    `CREATE TABLE IF NOT EXISTS grafana_configs (
      id VARCHAR(50) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      host VARCHAR(255) NOT NULL,
      token TEXT NOT NULL,
      datasource_uid VARCHAR(100) NOT NULL,
      is_active BOOLEAN DEFAULT false,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );`,

    // 2. PrometheusConfigs - Stores Prometheus server connection profiles
    `CREATE TABLE IF NOT EXISTS prometheus_configs (
      id VARCHAR(50) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      mode VARCHAR(50) NOT NULL,
      path VARCHAR(255) NOT NULL,
      reload_url VARCHAR(255) NOT NULL,
      ssh_host VARCHAR(255),
      ssh_port INTEGER,
      ssh_user VARCHAR(255),
      ssh_auth VARCHAR(50),
      ssh_password TEXT,
      ssh_key TEXT,
      is_active BOOLEAN DEFAULT false,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );`,

    // 3. MonitoringViews - Dashboard slideshow configurations
    `CREATE TABLE IF NOT EXISTS monitoring_views (
      id VARCHAR(50) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      description TEXT,
      interval INTEGER NOT NULL,
      mode VARCHAR(50) NOT NULL,
      panels JSONB NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );`,

    // 4. ImportedMibs - SNMP MIB modules imported into the system
    `CREATE TABLE IF NOT EXISTS imported_mibs (
      name VARCHAR(255) PRIMARY KEY,
      node_count INTEGER NOT NULL,
      imported_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );`,

    // 5. OidRegistry - OID definitions extracted from imported MIBs
    `CREATE TABLE IF NOT EXISTS oid_registry (
      oid VARCHAR(255) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      mib_name VARCHAR(255) NOT NULL REFERENCES imported_mibs(name) ON DELETE CASCADE,
      syntax VARCHAR(255),
      access VARCHAR(255),
      description TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );`,

    // 6. SystemRoles - Available user roles (ADMIN, operator, etc.)
    `CREATE TABLE IF NOT EXISTS system_roles (
      id SERIAL PRIMARY KEY,
      name VARCHAR(50) UNIQUE NOT NULL,
      description VARCHAR(255),
      is_default BOOLEAN DEFAULT false,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );`,

    // 7. Users - Registered portal users
    `CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(100) UNIQUE NOT NULL,
      email VARCHAR(100) UNIQUE NOT NULL,
      password VARCHAR(255) NOT NULL,
      role VARCHAR(50) DEFAULT 'operator',
      force_password_change BOOLEAN DEFAULT false,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );`,

    // 8. UserSessions - Active user login sessions
    `CREATE TABLE IF NOT EXISTS user_sessions (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      token VARCHAR(255) UNIQUE NOT NULL,
      expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );`,

    // 9. ActivityLogs - Audit trail of all system actions
    `CREATE TABLE IF NOT EXISTS activity_logs (
      id SERIAL PRIMARY KEY,
      timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      module VARCHAR(100) NOT NULL,
      action VARCHAR(100) NOT NULL,
      details TEXT,
      status VARCHAR(50) DEFAULT 'SUCCESS',
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL
    );`,

    // 10. QueryPanels - Saved query configurations for data explorer
    `CREATE TABLE IF NOT EXISTS query_panels (
      id VARCHAR(50) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      description TEXT,
      datasource_type VARCHAR(50) NOT NULL,
      datasource_uid VARCHAR(100) NOT NULL,
      time_range_from VARCHAR(50) DEFAULT 'now-1h',
      time_range_to VARCHAR(50) DEFAULT 'now',
      step VARCHAR(50) DEFAULT '1m',
      columns JSONB NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );`,

    // 11. AppConfig - Key-value store for app settings (setup_completed, etc.)
    `CREATE TABLE IF NOT EXISTS app_config (
      key VARCHAR(100) PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );`,

    // 12. UptimeKumaConfigs - Uptime Kuma server connection profiles
    `CREATE TABLE IF NOT EXISTS uptime_kuma_configs (
      id VARCHAR(50) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      url VARCHAR(255) NOT NULL,
      username VARCHAR(255) NOT NULL,
      password TEXT NOT NULL,
      is_active BOOLEAN DEFAULT false,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );`,

    // 13. DataPrepperConfigs - Data Prepper pipeline connection profiles
    `CREATE TABLE IF NOT EXISTS dataprepper_configs (
      id VARCHAR(50) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      mode VARCHAR(10) NOT NULL DEFAULT 'local',
      pipelines_dir TEXT NOT NULL DEFAULT '/opt/data-prepper/pipelines',
      reload_url TEXT,
      ssh_host VARCHAR(255),
      ssh_port INTEGER DEFAULT 22,
      ssh_user VARCHAR(255),
      ssh_auth VARCHAR(20) DEFAULT 'password',
      ssh_password TEXT,
      ssh_key TEXT,
      is_active BOOLEAN DEFAULT false,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );`,

    // 14. BackupDatabaseConfigs - Database connections for backup
    `CREATE TABLE IF NOT EXISTS backup_database_configs (
      id VARCHAR(50) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      db_type VARCHAR(50) NOT NULL,
      host VARCHAR(255) NOT NULL,
      port INTEGER NOT NULL,
      username VARCHAR(255) NOT NULL,
      password TEXT NOT NULL,
      database_name VARCHAR(255) NOT NULL,
      ssh_host VARCHAR(255),
      ssh_port INTEGER DEFAULT 22,
      ssh_user VARCHAR(255),
      ssh_auth VARCHAR(20) DEFAULT 'password',
      ssh_password TEXT,
      ssh_key TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );`,

    // 15. BackupDestinations - Storage destinations for backups
    `CREATE TABLE IF NOT EXISTS backup_destinations (
      id VARCHAR(50) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      dest_type VARCHAR(50) NOT NULL,
      config JSONB NOT NULL DEFAULT '{}',
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );`,

    // 16. BackupHistory - Backup execution history
    `CREATE TABLE IF NOT EXISTS backup_history (
      id VARCHAR(50) PRIMARY KEY,
      db_config_id VARCHAR(50) REFERENCES backup_database_configs(id) ON DELETE SET NULL,
      destination_id VARCHAR(50) REFERENCES backup_destinations(id) ON DELETE SET NULL,
      db_name VARCHAR(255) NOT NULL,
      db_type VARCHAR(50) NOT NULL,
      dest_type VARCHAR(50) NOT NULL,
      filename VARCHAR(500) NOT NULL,
      file_size BIGINT DEFAULT 0,
      status VARCHAR(50) NOT NULL DEFAULT 'running',
      error_message TEXT,
      started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      completed_at TIMESTAMP
    );`,

    // 17. BackupSchedules - Automated backup scheduling
    `CREATE TABLE IF NOT EXISTS backup_schedules (
      id VARCHAR(50) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      db_config_id VARCHAR(50) REFERENCES backup_database_configs(id) ON DELETE CASCADE,
      destination_id VARCHAR(50) REFERENCES backup_destinations(id) ON DELETE CASCADE,
      cron_expression VARCHAR(100) NOT NULL,
      is_active BOOLEAN DEFAULT true,
      last_run TIMESTAMP,
      next_run TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );`
  ];

  // Run schema creation in parallel
  await Promise.all(schemaQueries.map(q => pool.query(q)));

  // Auto-migration: add missing columns/tables for existing databases (BEFORE indexes)
  const migrationQueries = [
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS force_password_change BOOLEAN DEFAULT false;`,
    `ALTER TABLE activity_logs ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;`,
    `ALTER TABLE grafana_configs ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;`,
    `ALTER TABLE prometheus_configs ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;`,
    `ALTER TABLE monitoring_views ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;`,
    `ALTER TABLE oid_registry ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;`,
    `CREATE TABLE IF NOT EXISTS uptime_kuma_configs (
      id VARCHAR(50) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      url VARCHAR(255) NOT NULL,
      username VARCHAR(255) NOT NULL,
      password TEXT NOT NULL,
      is_active BOOLEAN DEFAULT false,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );`,
    `CREATE TABLE IF NOT EXISTS app_config (
      key VARCHAR(100) PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );`
  ];
  await Promise.all(migrationQueries.map(q => pool.query(q)));

  // Create performance indexes in parallel (AFTER migration ensures columns exist)
  const indexQueries = [
    `CREATE INDEX IF NOT EXISTS idx_oid_registry_mib_name ON oid_registry(mib_name);`,
    `CREATE INDEX IF NOT EXISTS idx_oid_registry_name ON oid_registry(name);`,
    `CREATE INDEX IF NOT EXISTS idx_oid_registry_lower_name ON oid_registry(lower(name));`,
    `CREATE INDEX IF NOT EXISTS idx_oid_registry_lower_oid ON oid_registry(lower(oid));`,
    `CREATE INDEX IF NOT EXISTS idx_grafana_configs_is_active ON grafana_configs(is_active) WHERE is_active = true;`,
    `CREATE INDEX IF NOT EXISTS idx_prometheus_configs_is_active ON prometheus_configs(is_active) WHERE is_active = true;`,
    `CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);`,
    `CREATE INDEX IF NOT EXISTS idx_user_sessions_token ON user_sessions(token);`,
    `CREATE INDEX IF NOT EXISTS idx_activity_logs_timestamp ON activity_logs(timestamp DESC);`,
    `CREATE INDEX IF NOT EXISTS idx_activity_logs_user_id ON activity_logs(user_id);`,
    `CREATE INDEX IF NOT EXISTS idx_query_panels_created_at ON query_panels(created_at DESC);`,
    `CREATE INDEX IF NOT EXISTS idx_uptime_kuma_configs_is_active ON uptime_kuma_configs(is_active) WHERE is_active = true;`,
    `CREATE INDEX IF NOT EXISTS idx_backup_schedules_is_active ON backup_schedules(is_active) WHERE is_active = true;`,
    `CREATE INDEX IF NOT EXISTS idx_backup_history_started_at ON backup_history(started_at DESC);`
  ];
  await Promise.all(indexQueries.map(q => pool.query(q)));

  console.log("✅ [DB] PostgreSQL tables and indexes checked/created successfully.");

  // Seed default system roles if not exists
  try {
    const roleCheck = await pool.query("SELECT 1 FROM system_roles LIMIT 1");
    if (roleCheck.rowCount === 0) {
      await pool.query(
        `INSERT INTO system_roles (name, description, is_default) VALUES 
         ('ADMIN', 'Full system administrator with unrestricted access', true),
         ('operator', 'Standard operator with read and execute permissions', true)`
      );
      console.log("🌱 [DB] Seeded default system roles: ADMIN, operator");
    }
  } catch (err) {
    console.error("❌ [DB] Failed to seed default roles:", err);
  }

  // Seed setup_completed = false if not exists
  try {
    await pool.query(
      `INSERT INTO app_config (key, value) VALUES ('setup_completed', 'false')
       ON CONFLICT (key) DO NOTHING`
    );
  } catch (err) {
    console.error("❌ [DB] Failed to seed setup_completed:", err);
  }

  // Automatic Data Migration from local JSON files
  await migrateLocalDataToPg();

  // Populate dynamic configurations in-memory caches
  await populateMemoryCaches();

  // Log startup activity
  await logActivity("System", "Database Connected", "Database tables initialized and connection established successfully", "SUCCESS");
}

export async function populateMemoryCaches() {
  try {
    // 1. Get active Grafana config
    const grafanaRes = await pool.query(
      `SELECT id, name, host, token, datasource_uid AS "datasourceUid" 
       FROM grafana_configs 
       WHERE is_active = true 
       LIMIT 1`
    );
    if (grafanaRes.rows.length > 0) {
      const active = grafanaRes.rows[0];
      updateActiveGrafanaCache({
        id: active.id,
        name: active.name,
        host: active.host.replace(/\/$/, ""),
        token: active.token,
        datasourceUid: active.datasourceUid || "bf5jy3ppyomwwd",
        isConfigured: true
      });
    }

    // 2. Get active Prometheus config
    const prometheusRes = await pool.query(
      `SELECT id, name, mode, path, reload_url AS "reloadUrl", ssh_host AS "sshHost", ssh_port AS "sshPort", 
              ssh_user AS "sshUser", ssh_auth AS "sshAuth", ssh_password AS "sshPassword", ssh_key AS "sshKey", is_active AS "isActive"
       FROM prometheus_configs 
       WHERE is_active = true 
       LIMIT 1`
    );
    if (prometheusRes.rows.length > 0) {
      updateActivePrometheusCache(prometheusRes.rows[0]);
    }
    console.log("⚡ [DB] Memory caches for active configurations synchronized successfully.");
  } catch (err) {
    console.error("❌ [DB] Failed to populate memory caches from database:", err);
  }
}

/**
 * Reads existing JSON configurations and migrates them to PostgreSQL.
 * Once migrated, it keeps the JSON files in place so as not to break any external syncs,
 * but the application database of record is now PostgreSQL.
 */
async function migrateLocalDataToPg() {
  console.log("🚚 [DB] Checking for legacy local JSON data to migrate...");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1. Migrate Grafana Configs
    const grafanaFile = config.grafanaConfigsFile;
    if (fs.existsSync(grafanaFile)) {
      try {
        const list = JSON.parse(fs.readFileSync(grafanaFile, "utf-8"));
        for (const item of list) {
          const check = await client.query("SELECT 1 FROM grafana_configs WHERE id = $1", [item.id]);
          if (check.rowCount === 0) {
            await client.query(
              `INSERT INTO grafana_configs (id, name, host, token, datasource_uid, is_active)
               VALUES ($1, $2, $3, $4, $5, $6)`,
              [item.id, item.name, item.host, item.token, item.datasourceUid || "bf5jy3ppyomwwd", !!item.isActive]
            );
            console.log(`[DB Migration] Migrated Grafana config: ${item.name}`);
          }
        }
      } catch (err) {
        console.error("[DB Migration] Error migrating Grafana configs:", err);
      }
    }

    // 2. Migrate Prometheus Configs
    const promFile = config.prometheusConfigsFile;
    if (fs.existsSync(promFile)) {
      try {
        const list = JSON.parse(fs.readFileSync(promFile, "utf-8"));
        for (const item of list) {
          const check = await client.query("SELECT 1 FROM prometheus_configs WHERE id = $1", [item.id]);
          if (check.rowCount === 0) {
            await client.query(
              `INSERT INTO prometheus_configs (
                id, name, mode, path, reload_url, ssh_host, ssh_port, ssh_user, ssh_auth, ssh_password, ssh_key, is_active
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
              [
                item.id, item.name, item.mode, item.path, item.reloadUrl,
                item.sshHost || null, item.sshPort || null, item.sshUser || null,
                item.sshAuth || null, item.sshPassword || null, item.sshKey || null,
                !!item.isActive
              ]
            );
            console.log(`[DB Migration] Migrated Prometheus config: ${item.name}`);
          }
        }
      } catch (err) {
        console.error("[DB Migration] Error migrating Prometheus configs:", err);
      }
    }

    // 3. Migrate Monitoring Views
    const viewsFile = config.monitoringViewsFile;
    if (fs.existsSync(viewsFile)) {
      try {
        const list = JSON.parse(fs.readFileSync(viewsFile, "utf-8"));
        for (const item of list) {
          const check = await client.query("SELECT 1 FROM monitoring_views WHERE id = $1", [item.id]);
          if (check.rowCount === 0) {
            const name = item.title || item.name || "Untitled View";
            const interval = item.slideDuration || item.interval || 10;
            const mode = item.mode || "slideshow";
            const panels = item.urls || item.panels || [];
            await client.query(
              `INSERT INTO monitoring_views (id, name, description, interval, mode, panels)
               VALUES ($1, $2, $3, $4, $5, $6)`,
              [item.id, name, item.description || "", interval, mode, JSON.stringify(panels)]
            );
            console.log(`[DB Migration] Migrated Monitoring View: ${name}`);
          }
        }
      } catch (err) {
        console.error("[DB Migration] Error migrating Monitoring Views:", err);
      }
    }

    // 4. Migrate MIB Modules and Registry
    const mibsDir = path.join(config.dbDir, "mibs");
    const importedMibsFile = path.join(mibsDir, "imported_mibs.json");
    const oidRegistryFile = path.join(mibsDir, "oid_registry.json");

    if (fs.existsSync(importedMibsFile) && fs.existsSync(oidRegistryFile)) {
      try {
        const mibsList = JSON.parse(fs.readFileSync(importedMibsFile, "utf-8"));
        const registry = JSON.parse(fs.readFileSync(oidRegistryFile, "utf-8"));

        for (const mib of mibsList) {
          const checkMib = await client.query("SELECT 1 FROM imported_mibs WHERE name = $1", [mib.name]);
          if (checkMib.rowCount === 0) {
            await client.query(
              "INSERT INTO imported_mibs (name, node_count, imported_at) VALUES ($1, $2, $3)",
              [mib.name, mib.nodeCount, mib.importedAt ? new Date(mib.importedAt) : new Date()]
            );
            console.log(`[DB Migration] Migrated MIB module record: ${mib.name}`);
          }
        }

        // Insert OIDs with bulk INSERT ON CONFLICT DO NOTHING to avoid N+1 queries
        const oids = Object.keys(registry);
        const batchSize = 100;
        let oidsMigrated = 0;

        for (let i = 0; i < oids.length; i += batchSize) {
          const chunk = oids.slice(i, i + batchSize);
          const valuePlaceholders = chunk.map((_, idx) =>
            `($${idx * 6 + 1}, $${idx * 6 + 2}, $${idx * 6 + 3}, $${idx * 6 + 4}, $${idx * 6 + 5}, $${idx * 6 + 6})`
          ).join(", ");

          const values: any[] = [];
          for (const oid of chunk) {
            const info = registry[oid];
            values.push(oid, info.name, info.mib, info.syntax || null, info.access || null, info.description || null);
          }

          const res = await client.query(
            `INSERT INTO oid_registry (oid, name, mib_name, syntax, access, description)
             VALUES ${valuePlaceholders}
             ON CONFLICT (oid) DO NOTHING`,
            values
          );
          oidsMigrated += res.rowCount || 0;
        }

        if (oidsMigrated > 0) {
          console.log(`[DB Migration] Migrated ${oidsMigrated} OID registry definitions to PostgreSQL.`);
        }
      } catch (err) {
        console.error("[DB Migration] Error migrating MIBs/OIDs:", err);
      }
    }

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("[DB Migration] Transaction failed, rolled back changes:", err);
  } finally {
    client.release();
  }
}
