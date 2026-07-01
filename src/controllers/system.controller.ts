import { Request, Response } from "express";
import fs from "fs";
import path from "path";
import config from "../config/env";
import { isDbConnected, dbConnectionError, setupPool, initDb, loadDbConfig, ensureDatabaseExists, updateEnvFile, saveDbConfigToFile, logActivity } from "../config/db";

function maskPassword(pwd: string): string {
  if (!pwd) return "";
  if (pwd.length <= 4) return "****";
  return pwd.substring(0, 2) + "******" + pwd.substring(pwd.length - 2);
}

export class SystemController {
  /**
   * GET /api/v1/system/db-config
   * Retrieve current active database connection configurations
   */
  public getDbConfig = async (req: Request, res: Response): Promise<void> => {
    try {
      const activeConfig = loadDbConfig();
      res.status(200).json({
        success: true,
        isConnected: isDbConnected,
        error: dbConnectionError,
        config: {
          host: activeConfig.host,
          port: activeConfig.port,
          user: activeConfig.user,
          database: activeConfig.database,
          ssl: !!activeConfig.ssl,
          // Mask database password for UI rendering
          maskedPassword: activeConfig.password ? maskPassword(activeConfig.password) : ""
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
   * Save and apply database configuration settings
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

        await logActivity(
          "Database Configuration",
          "Save Configuration",
          `Failed database configuration change to host "${host}"`,
          "ERROR"
        );

        res.status(400).json({
          success: false,
          error: "Connection Failed",
          message: `Failed to connect to database with new configuration: ${dbConnectionError}`
        });
        return;
      }

      // 2. Connection success! Save configuration to persistent JSON file and .env file
      saveDbConfigToFile(newConfig);
      updateEnvFile(newConfig);

      await logActivity(
        "Database Configuration",
        "Save Configuration",
        `Successfully updated database configuration to host "${host}"`,
        "SUCCESS"
      );

      res.status(200).json({
        success: true,
        message: "Database configuration saved and applied successfully!",
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

  /**
   * POST /api/v1/system/db-config/test
   * Tests a proposed database configuration without modifying the persistent config or active pool.
   */
  public testDbConfig = async (req: Request, res: Response): Promise<void> => {
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

      const existing = loadDbConfig();
      let targetPassword = password;
      if (password && (password.includes("******") || password.includes("****"))) {
        targetPassword = existing.password;
      }

      const testConfig = {
        host: host.trim(),
        port: parseInt(port, 10),
        user: user.trim(),
        password: targetPassword,
        database: database.trim(),
        ssl: ssl === true || ssl === "true" ? { rejectUnauthorized: false } : undefined
      };

      const { Pool } = require("pg");
      const tempPool = new Pool({
        ...testConfig,
        max: 1,
        connectionTimeoutMillis: 3000,
      });

      try {
        await ensureDatabaseExists(testConfig);
        const tempClient = await tempPool.connect();
        await tempClient.query("SELECT version()");
        tempClient.release();
        await tempPool.end();

        await logActivity(
          "Database Configuration",
          "Test Connection",
          `Successful database connection test to host "${host}"`,
          "SUCCESS"
        );

        res.status(200).json({
          success: true,
          message: "Database connection test successful! Configuration is valid."
        });
      } catch (err: any) {
        await tempPool.end().catch(() => {});

        await logActivity(
          "Database Configuration",
          "Test Connection",
          `Failed database connection test to host "${host}": ${err.message}`,
          "ERROR"
        );

        res.status(400).json({
          success: false,
          error: "Connection Failed",
          message: `Failed to connect to database: ${err.message || String(err)}`
        });
      }
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
