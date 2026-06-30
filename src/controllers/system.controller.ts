import { Request, Response } from "express";
import fs from "fs";
import path from "path";
import config from "../config/env";
import { isDbConnected, dbConnectionError, setupPool, initDb, loadDbConfig } from "../config/db";

function maskPassword(pwd: string): string {
  if (!pwd) return "";
  if (pwd.length <= 4) return "****";
  return pwd.substring(0, 2) + "******" + pwd.substring(pwd.length - 2);
}

export class SystemController {
  /**
   * GET /api/v1/system/db-config
   * Retrieves the current database configuration status and credentials (masked).
   */
  public getDbConfig = async (req: Request, res: Response): Promise<void> => {
    try {
      const dbConfig = loadDbConfig();
      res.status(200).json({
        success: true,
        isConnected: isDbConnected,
        error: dbConnectionError,
        config: {
          host: dbConfig.host,
          port: dbConfig.port,
          user: dbConfig.user,
          database: dbConfig.database,
          ssl: !!dbConfig.ssl,
          maskedPassword: maskPassword(dbConfig.password || "")
        }
      });
    } catch (err: any) {
      res.status(500).json({
        success: false,
        error: "Internal Server Error",
        message: err.message
      });
    }
  };

  /**
   * POST /api/v1/system/db-config
   * Tests and saves a new database configuration, then hot-reloads the connection pool.
   */
  public saveDbConfig = async (req: Request, res: Response): Promise<void> => {
    try {
      const { host, port, user, password, database, ssl } = req.body;

      if (!host || !port || !user || !database) {
        res.status(400).json({
          success: false,
          error: "Validation Error",
          message: "Fields 'host', 'port', 'user', and 'database' are required."
        });
        return;
      }

      // Load existing config to reuse password if it was masked
      const existing = loadDbConfig();
      let targetPassword = password;
      if (password && (password.includes("******") || password.includes("****"))) {
        targetPassword = existing.password;
      }

      const newConfig = {
        host: host.trim(),
        port: parseInt(port, 10),
        user: user.trim(),
        password: targetPassword,
        database: database.trim(),
        ssl: ssl === true || ssl === "true" ? { rejectUnauthorized: false } : undefined
      };

      // 1. Setup new Pool and test connection
      setupPool(newConfig);
      await initDb();

      if (!isDbConnected) {
        // Revert to old configuration if connection fails
        setupPool(existing);
        await initDb();

        res.status(400).json({
          success: false,
          error: "Connection Failed",
          message: `Gagal terhubung ke database dengan konfigurasi baru: ${dbConnectionError}`
        });
        return;
      }

      // 2. Connection success! Save configuration to data/db_config.json
      if (!fs.existsSync(config.dbDir)) {
        fs.mkdirSync(config.dbDir, { recursive: true });
      }
      fs.writeFileSync(config.dbConfigFile, JSON.stringify(newConfig, null, 2), "utf-8");

      res.status(200).json({
        success: true,
        message: "Konfigurasi database berhasil disimpan dan diterapkan!",
        isConnected: isDbConnected
      });
    } catch (err: any) {
      res.status(500).json({
        success: false,
        error: "Internal Server Error",
        message: err.message
      });
    }
  };
}

export const systemController = new SystemController();
