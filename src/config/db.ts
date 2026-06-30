import { Pool, Client } from "pg";
import fs from "fs";
import path from "path";
import config, { updateActiveGrafanaCache, updateActivePrometheusCache } from "./env";

export let isDbConnected = false;
export let dbConnectionError: string | null = null;
let activePool: Pool;
let activeDbConfig: any;

export function loadDbConfig() {
  if (fs.existsSync(config.dbConfigFile)) {
    try {
      const content = fs.readFileSync(config.dbConfigFile, "utf-8");
      const parsed = JSON.parse(content);
      return {
        host: parsed.host || process.env.PGHOST || "localhost",
        port: parseInt(parsed.port || process.env.PGPORT || "5432", 10),
        user: parsed.user || process.env.PGUSER || "postgres",
        password: parsed.password || process.env.PGPASSWORD || "postgres",
        database: parsed.database || process.env.PGDATABASE || "hephaestus",
        ssl: parsed.ssl === "true" || parsed.ssl === true || process.env.PGSSL === "true" ? { rejectUnauthorized: false } : undefined,
      };
    } catch (e) {
      console.error("[DB] Error reading db_config.json:", e);
    }
  }
  return {
    host: process.env.PGHOST || "localhost",
    port: parseInt(process.env.PGPORT || "5432", 10),
    user: process.env.PGUSER || "postgres",
    password: process.env.PGPASSWORD || "postgres",
    database: process.env.PGDATABASE || "hephaestus",
    ssl: process.env.PGSSL === "true" ? { rejectUnauthorized: false } : undefined,
  };
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
    if (duration > 100) {
      console.warn(`[DB] Slow query detected: ${text} took ${duration}ms`);
    }
    return res;
  } catch (err) {
    console.error("[DB] Query error:", err);
    throw err;
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
    // 1. Grafana configs table
    `CREATE TABLE IF NOT EXISTS grafana_configs (
      id VARCHAR(50) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      host VARCHAR(255) NOT NULL,
      token TEXT NOT NULL,
      datasource_uid VARCHAR(100) NOT NULL,
      is_active BOOLEAN DEFAULT false
    );`,
    
    // 2. Prometheus configs table
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
      is_active BOOLEAN DEFAULT false
    );`,

    // 3. Monitoring Views table
    `CREATE TABLE IF NOT EXISTS monitoring_views (
      id VARCHAR(50) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      description TEXT,
      interval INTEGER NOT NULL,
      mode VARCHAR(50) NOT NULL,
      panels JSONB NOT NULL
    );`,

    // 4. MIB Modules table
    `CREATE TABLE IF NOT EXISTS imported_mibs (
      name VARCHAR(255) PRIMARY KEY,
      node_count INTEGER NOT NULL,
      imported_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );`,

    // 5. OID Registry table
    `CREATE TABLE IF NOT EXISTS oid_registry (
      oid VARCHAR(255) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      mib_name VARCHAR(255) NOT NULL REFERENCES imported_mibs(name) ON DELETE CASCADE,
      syntax VARCHAR(255),
      access VARCHAR(255),
      description TEXT
    );`
  ];

  // Run schema creation
  for (const q of schemaQueries) {
    await pool.query(q);
  }

  // Create performance indexes for tuning
  const indexQueries = [
    `CREATE INDEX IF NOT EXISTS idx_oid_registry_mib_name ON oid_registry(mib_name);`,
    `CREATE INDEX IF NOT EXISTS idx_oid_registry_name ON oid_registry(name);`,
    `CREATE INDEX IF NOT EXISTS idx_oid_registry_lower_name ON oid_registry(lower(name));`,
    `CREATE INDEX IF NOT EXISTS idx_oid_registry_lower_oid ON oid_registry(lower(oid));`,
    `CREATE INDEX IF NOT EXISTS idx_grafana_configs_is_active ON grafana_configs(is_active) WHERE is_active = true;`,
    `CREATE INDEX IF NOT EXISTS idx_prometheus_configs_is_active ON prometheus_configs(is_active) WHERE is_active = true;`
  ];

  for (const q of indexQueries) {
    await pool.query(q);
  }

  console.log("✅ [DB] PostgreSQL tables and indexes checked/created successfully.");

  // Automatic Data Migration from local JSON files
  await migrateLocalDataToPg();

  // Populate dynamic configurations in-memory caches
  await populateMemoryCaches();
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

        // Insert OIDs with chunks to prevent huge query payload
        const oids = Object.keys(registry);
        const batchSize = 100;
        let oidsMigrated = 0;

        for (let i = 0; i < oids.length; i += batchSize) {
          const chunk = oids.slice(i, i + batchSize);
          for (const oid of chunk) {
            const info = registry[oid];
            const checkOid = await client.query("SELECT 1 FROM oid_registry WHERE oid = $1", [oid]);
            if (checkOid.rowCount === 0) {
              await client.query(
                `INSERT INTO oid_registry (oid, name, mib_name, syntax, access, description)
                 VALUES ($1, $2, $3, $4, $5, $6)
                 ON CONFLICT (oid) DO NOTHING`,
                [oid, info.name, info.mib, info.syntax || null, info.access || null, info.description || null]
              );
              oidsMigrated++;
            }
          }
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
