import { Pool, Client } from "pg";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import config from "./env";
import logger from "./logger";

// Encryption helpers for DB password at rest
const ALGORITHM = "aes-256-gcm";
const IV_LEN = 12;
const KEY_LEN = 32;
const KEY_FILE = path.join(config.dbDir, ".encryption_key");

let _cachedKey: Buffer | null = null;

function getEncryptionKey(): Buffer {
  if (_cachedKey) return _cachedKey;

  const envKey = process.env.ENCRYPTION_KEY;
  if (envKey) {
    logger.db(`Using ENCRYPTION_KEY env var (scrypt derivation)`);
    _cachedKey = crypto.scryptSync(envKey, "hephaestus-db-salt", KEY_LEN);
    return _cachedKey;
  }
  try {
    if (fs.existsSync(KEY_FILE)) {
      const raw = fs.readFileSync(KEY_FILE, "utf-8").trim();
      logger.db(`Loaded key from ${KEY_FILE}`);
      _cachedKey = Buffer.from(raw, "hex");
      return _cachedKey;
    }
  } catch (e) { logger.dbError(`Failed to read key file: ${e}`); }
  logger.db(`Generating NEW encryption key at ${KEY_FILE}`);
  _cachedKey = crypto.randomBytes(KEY_LEN);
  try {
    fs.mkdirSync(path.dirname(KEY_FILE), { recursive: true });
    fs.writeFileSync(KEY_FILE, _cachedKey.toString("hex"), { mode: 0o600 });
    logger.db(`Key saved to ${KEY_FILE}`);
  } catch (e: any) {
    logger.dbError(`Failed to write key file: ${e.message} — key cached in memory only`);
  }
  return _cachedKey;
}

export function encryptText(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;
}

export function decryptText(encryptedStr: string): string {
  const parts = encryptedStr.split(":");
  if (parts.length !== 3) {
    logger.db(`decryptText: not encrypted format, returning as-is`);
    return encryptedStr;
  }
  try {
    const key = getEncryptionKey();
    const iv = Buffer.from(parts[0], "hex");
    const authTag = Buffer.from(parts[1], "hex");
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(parts[2], "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch (e: any) {
    logger.dbError(`decryptText FAILED: ${e.message}`);
    throw new Error(`Decryption failed: ${e.message}`);
  }
}

export function loadDbConfig() {
  const dbConfigPath = path.join(config.dbDir, "db_config.json");
  if (fs.existsSync(dbConfigPath)) {
    try {
      const saved = JSON.parse(fs.readFileSync(dbConfigPath, "utf-8"));
      const password = saved.password
        ? (saved.encrypted ? decryptText(saved.password) : saved.password)
        : (process.env.PGPASSWORD || "");
      return {
        host: saved.host || process.env.PGHOST || "localhost",
        port: parseInt(saved.port || process.env.PGPORT || "5432", 10),
        user: saved.user || process.env.PGUSER || "postgres",
        password,
        database: saved.database || process.env.PGDATABASE || "hephaestus",
        ssl: saved.ssl ? { rejectUnauthorized: config.sslRejectUnauthorized } : undefined
      };
    } catch (err) {
      logger.dbError("Failed to parse db_config.json, falling back to process.env");
    }
  }

  return {
    host: process.env.PGHOST || "localhost",
    port: parseInt(process.env.PGPORT || "5432", 10),
    user: process.env.PGUSER || "postgres",
    password: process.env.PGPASSWORD || "",
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
    logger.db(`Saved database configuration to persistent storage`);
  } catch (err: any) {
    logger.dbError(`Failed to save database configuration: ${err.message}`);
  }
}

export function updateEnvFile(newConfig: any) {
  const envFilePath = path.resolve(__dirname, "../../.env");
  let content = "";
  if (fs.existsSync(envFilePath)) {
    content = fs.readFileSync(envFilePath, "utf-8");
  }

  const lines = content.split(/\r?\n/);
  const keysToUpdate: Record<string, string> = {
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
          lines[i] = `${key}=${keysToUpdate[key]}`;
          updatedKeys.add(key);
        }
      }
    }
  }

  for (const [key, value] of Object.entries(keysToUpdate)) {
    if (!updatedKeys.has(key)) {
      if (lines.length > 0 && lines[lines.length - 1] !== "") {
        lines.push("");
      }
      lines.push(`${key}=${value}`);
    }
  }

  fs.writeFileSync(envFilePath, lines.join("\n"), "utf-8");

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
      logger.db(`Database "${targetDb}" does not exist. Attempting to create...`);
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
        logger.db(`Database "${safeDbName}" created successfully!`);
      } catch (createErr: any) {
        logger.dbError(`Failed to create database "${targetDb}": ${createErr.message}`);
        throw createErr;
      } finally {
        await adminClient.end().catch(() => {});
      }
    } else {
      throw err;
    }
  }
}

export let isDbConnected = false; // eslint-disable-line prefer-const
export let dbConnectionError: string | null = null; // eslint-disable-line prefer-const
let activePool: Pool;
let activeDbConfig: any; // eslint-disable-line @typescript-eslint/no-unused-vars

export function setupPool(dbConfig: any) {
  activeDbConfig = dbConfig;
  if (activePool) {
    activePool.end().catch(err => logger.dbError(`Error ending old pool: ${err}`));
  }
  activePool = new Pool({
    ...dbConfig,
    max: 10,
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
      logger.warn("Database", `Slow query detected (${duration}ms)`);
    }
    return res;
  } catch (err) {
    logger.dbError(`Query error: ${err}`);
    throw err;
  }
}

export async function logActivity(module: string, action: string, details: string, status: string = "SUCCESS", userId: number | null = null) {
  try {
    if (!isDbConnected || !activePool) {
      logger.info(module, `${action}: ${details} (${status})`);
      return;
    }
    await activePool.query(
      `INSERT INTO activity_logs (module, action, details, status, user_id) VALUES ($1, $2, $3, $4, $5)`,
      [module, action, details, status, userId]
    );
  } catch (err) {
    logger.dbError(`Failed to write activity log: ${err}`);
  }
}
