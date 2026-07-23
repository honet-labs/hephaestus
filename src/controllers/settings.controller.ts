import crypto from "crypto";
import { Request, Response } from "express";
import { grafanaService } from "../services/grafana.service";
import config from "../config/env";
import { logActivity } from "../config/db";

// Mask token for security
function maskToken(token: string): string {
  if (!token) return "";
  if (token.length <= 10) return "************";
  // Keep first 6 and last 4 chars, mask the rest
  return `${token.substring(0, 6)}****************${token.substring(token.length - 4)}`;
}

export class SettingsController {
  /**
   * GET /api/v1/settings/grafana
   * Retrieve active Grafana integration status and configurations
   */
  public async getGrafanaSettings(req: Request, res: Response): Promise<void> {
    try {
      const activeConfig = config.getGrafanaConfig();
      
      res.status(200).json({
        success: true,
        data: {
          id: activeConfig.id,
          name: activeConfig.name,
          host: activeConfig.host,
          datasourceUid: activeConfig.datasourceUid,
          isConfigured: activeConfig.isConfigured,
          // Mask the token for UI safety
          maskedToken: activeConfig.token ? maskToken(activeConfig.token) : ""
        }
      });
    } catch (error: any) {
      console.error("[SettingsController] GET error:", error);
      res.status(500).json({
        success: false,
        error: "Internal Server Error",
        message: "Failed to retrieve Grafana settings."
      });
    }
  }

  /**
   * GET /api/v1/settings/grafana/datasources
   * Fetch all datasources from Grafana server using active configuration
   */
  public async getGrafanaDatasources(req: Request, res: Response): Promise<void> {
    try {
      const configId = req.query.configId && typeof req.query.configId === "string" ? req.query.configId : undefined;
      
      let host: string | undefined;
      let token: string | undefined;

      if (configId) {
        const list = await grafanaService.getConfigsList();
        const found = list.find(c => c.id === configId);
        if (found) {
          host = found.host;
          token = found.token;
        }
      }

      const datasources = await grafanaService.getDatasources(host, token);
      res.status(200).json({
        success: true,
        data: datasources
      });
    } catch (error: any) {
      console.error("[SettingsController] GET datasources error:", error);
      res.status(500).json({
        success: false,
        error: "Grafana Datasources Error",
        message: "Failed to retrieve datasources from Grafana server."
      });
    }
  }

  /**
   * POST /api/v1/settings/grafana
   * Handles actions: test, save, reset
   */
  public async handleGrafanaSettingsAction(req: Request, res: Response): Promise<void> {
    try {
      const { action, host, token, datasourceUid } = req.body;

      if (!action || !["test", "save", "reset"].includes(action)) {
        res.status(400).json({
          success: false,
          error: "Validation Error",
          message: "Valid action ('test', 'save', or 'reset') is required."
        });
        return;
      }

      // Handle Reset
      if (action === "reset") {
        await grafanaService.resetConfig();
        await logActivity("Grafana Settings", "Reset Configuration", "Reverted Grafana connection settings to environment defaults", "SUCCESS");
        res.status(200).json({
          success: true,
          message: "Grafana integration settings reset successfully. Reverted to default settings."
        });
        return;
      }

      // Validate other fields for test and save
      if (!host || typeof host !== "string" || host.trim() === "") {
        res.status(400).json({
          success: false,
          error: "Validation Error",
          message: "Grafana Host URL is required."
        });
        return;
      }

      // If token is masked (meaning user didn't change it), use the active token from configuration
      let targetToken = token;
      const activeConfig = config.getGrafanaConfig();
      
      if (token && (token.includes("******") || token.includes("************"))) {
        targetToken = activeConfig.token;
      }

      if (!targetToken || typeof targetToken !== "string" || targetToken.trim() === "") {
        res.status(400).json({
          success: false,
          error: "Validation Error",
          message: "Grafana Service Account Token is required."
        });
        return;
      }

      // Handle Test Connection
      if (action === "test") {
        try {
          const success = await grafanaService.testConnection(host, targetToken);
          if (success) {
            await logActivity("Grafana Settings", "Test Connection", `Successful connection test to Grafana host "${host}"`, "SUCCESS");
            res.status(200).json({
              success: true,
              message: "Connection to Grafana successful!"
            });
          } else {
            await logActivity("Grafana Settings", "Test Connection", `Unusual response from connection test to Grafana host "${host}"`, "WARNING");
            res.status(200).json({
              success: false,
              message: "Grafana responded with an unusual status. Connection status doubtful."
            });
          }
        } catch (err: any) {
          await logActivity("Grafana Settings", "Test Connection", `Failed connection test to Grafana host "${host}": ${err.message}`, "ERROR");
          res.status(200).json({
            success: false,
            error: "Connection Failed",
            message: err.message || "Failed to connect to Grafana."
          });
        }
        return;
      }

      // Handle Save Configuration
      if (action === "save") {
        // Test connection first to verify validity before saving
        try {
          await grafanaService.testConnection(host, targetToken);
        } catch (err: any) {
          await logActivity("Grafana Settings", "Save Configuration", `Failed to save Grafana settings to host "${host}" because connection test failed`, "ERROR");
          res.status(400).json({
            success: false,
            error: "Save Failed",
            message: `Save canceled because connection test failed: ${err.message}`
          });
          return;
        }

        // Detect datasource UID if not provided or empty
        let finalDatasourceUid = datasourceUid ? datasourceUid.trim() : "";
        let autoDetectedName = "";
        
        if (!finalDatasourceUid) {
          try {
            const datasources = await grafanaService.getDatasources(host, targetToken);
            const promoDs = datasources.find((ds: any) => ds.type === "prometheus");
            if (promoDs) {
              finalDatasourceUid = promoDs.uid;
              autoDetectedName = promoDs.name;
              console.log(`[SettingsController] Auto-detected Prometheus datasource: ${autoDetectedName} (${finalDatasourceUid})`);
            } else if (datasources.length > 0) {
              finalDatasourceUid = datasources[0].uid;
              autoDetectedName = datasources[0].name;
              console.log(`[SettingsController] No Prometheus datasource found. Selected first available: ${autoDetectedName} (${finalDatasourceUid})`);
            }
          } catch (err: any) {
            console.error("[SettingsController] Failed to auto-detect datasource UID:", err.message);
          }
        }

        if (!finalDatasourceUid) {
          finalDatasourceUid = "bf5jy3ppyomwwd"; // Fallback to original default
        }

        // Save
        await grafanaService.saveConfig(host, targetToken, finalDatasourceUid);
        await logActivity("Grafana Settings", "Save Configuration", `Saved Grafana integration settings to host "${host}"`, "SUCCESS");
        
        let successMessage = "Grafana configuration saved and applied successfully!";
        if (autoDetectedName) {
          successMessage += ` (Prometheus UID auto-detected: "${autoDetectedName}")`;
        }

        res.status(200).json({
          success: true,
          message: successMessage
        });
        return;
      }

    } catch (error: any) {
      console.error("[SettingsController] POST error:", error);
      res.status(500).json({
        success: false,
        error: "Internal Server Error",
        message: "Failed to process Grafana settings action."
      });
    }
  }

  /**
   * GET /api/v1/settings/grafana/configs
   * List all saved configurations
   */
  public async getConfigsList(req: Request, res: Response): Promise<void> {
    try {
      const list = await grafanaService.getConfigsList();
      const sanitized = list.map(c => ({
        id: c.id,
        name: c.name,
        host: c.host,
        datasourceUid: c.datasourceUid,
        isActive: c.isActive,
        maskedToken: maskToken(c.token)
      }));

      res.status(200).json({
        success: true,
        data: sanitized
      });
    } catch (error: any) {
      console.error("[SettingsController] list configs error:", error);
      res.status(500).json({
        success: false,
        error: "Internal Server Error",
        message: "Failed to list configurations."
      });
    }
  }

  /**
   * POST /api/v1/settings/grafana/configs
   * Add or update a configuration
   */
  public async saveOrUpdateConfig(req: Request, res: Response): Promise<void> {
    try {
      const { id, name, host, token, datasourceUid } = req.body;

      if (!name || typeof name !== "string" || name.trim() === "") {
        res.status(400).json({
          success: false,
          error: "Validation Error",
          message: "Name is required."
        });
        return;
      }

      if (!host || typeof host !== "string" || host.trim() === "") {
        res.status(400).json({
          success: false,
          error: "Validation Error",
          message: "Grafana Host URL is required."
        });
        return;
      }

      const list = await grafanaService.getConfigsList();
      let targetToken = token;

      if (id) {
        const existing = list.find(c => c.id === id);
        if (existing && (token.includes("******") || token.includes("************"))) {
          targetToken = existing.token;
        }
      }

      if (!targetToken || typeof targetToken !== "string" || targetToken.trim() === "") {
        res.status(400).json({
          success: false,
          error: "Validation Error",
          message: "Grafana Service Account Token is required."
        });
        return;
      }

      // Test connection
      try {
        await grafanaService.testConnection(host, targetToken);
      } catch (err: any) {
        res.status(400).json({
          success: false,
          error: "Connection Test Failed",
          message: `Connection failed: ${err.message}`
        });
        return;
      }

      // Resolve datasourceUid if empty
      let finalDsUid = datasourceUid ? datasourceUid.trim() : "";
      if (!finalDsUid) {
        try {
          const datasources = await grafanaService.getDatasources(host, targetToken);
          const promoDs = datasources.find((ds: any) => ds.type === "prometheus");
          if (promoDs) finalDsUid = promoDs.uid;
          else if (datasources.length > 0) finalDsUid = datasources[0].uid;
        } catch (e) {
          console.error("Auto-detect failed:", e);
        }
      }
      if (!finalDsUid) finalDsUid = "bf5jy3ppyomwwd";

      if (id) {
        const existing = list.find(c => c.id === id);
        if (existing) {
          existing.name = name.trim();
          existing.host = host.trim();
          existing.token = targetToken.trim();
          existing.datasourceUid = finalDsUid;
        }
      } else {
        const newItem = {
          id: "cfg-" + crypto.randomUUID(),
          name: name.trim(),
          host: host.trim(),
          token: targetToken.trim(),
          datasourceUid: finalDsUid,
          isActive: list.length === 0
        };
        list.push(newItem);
      }

      await grafanaService.saveConfigsList(list);
      await logActivity("Grafana Settings", "Save Profile", `Saved/updated Grafana profile "${name}" (Host: ${host})`, "SUCCESS");

      res.status(200).json({
        success: true,
        message: "Grafana configuration saved successfully."
      });
    } catch (error: any) {
      console.error("[SettingsController] save/update config error:", error);
      res.status(500).json({
        success: false,
        error: "Internal Server Error",
        message: "Failed to save configuration."
      });
    }
  }

  /**
   * DELETE /api/v1/settings/grafana/configs/:id
   * Delete a configuration
   */
  public async deleteConfig(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      let list = await grafanaService.getConfigsList();
      const itemToDelete = list.find(c => c.id === id);
      
      if (!itemToDelete) {
        res.status(404).json({
          success: false,
          error: "Not Found",
          message: "Configuration not found."
        });
        return;
      }

      list = list.filter(c => c.id !== id);
      if (itemToDelete.isActive && list.length > 0) {
        list[0].isActive = true;
      }

      await grafanaService.saveConfigsList(list);
      await logActivity("Grafana Settings", "Delete Profile", `Deleted Grafana profile "${itemToDelete.name}" (Host: ${itemToDelete.host})`, "SUCCESS");

      res.status(200).json({
        success: true,
        message: "Configuration deleted successfully."
      });
    } catch (error: any) {
      console.error("[SettingsController] delete config error:", error);
      res.status(500).json({
        success: false,
        error: "Internal Server Error",
        message: "Failed to delete configuration."
      });
    }
  }

  /**
   * POST /api/v1/settings/grafana/configs/:id/activate
   * Set configuration as active
   */
  public async activateConfig(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const list = await grafanaService.getConfigsList();
      const target = list.find(c => c.id === id);

      if (!target) {
        res.status(404).json({
          success: false,
          error: "Not Found",
          message: "Configuration not found."
        });
        return;
      }

      list.forEach(c => c.isActive = (c.id === id));
      await grafanaService.saveConfigsList(list);
      await logActivity("Grafana Settings", "Activate Profile", `Activated Grafana profile "${target.name}" (Host: ${target.host})`, "SUCCESS");

      res.status(200).json({
        success: true,
        message: `Activated configuration: ${target.name}`
      });
    } catch (error: any) {
      console.error("[SettingsController] activate config error:", error);
      res.status(500).json({
        success: false,
        error: "Internal Server Error",
        message: "Failed to activate configuration."
      });
    }
  }

  /**
   * POST /api/v1/settings/grafana/configs/:id/test
   * Test connection of a registered server configuration
   */
  public async testConfigConnection(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    try {
      const list = await grafanaService.getConfigsList();
      const target = list.find(c => c.id === id);

      if (!target) {
        res.status(404).json({
          success: false,
          error: "Not Found",
          message: "Configuration not found."
        });
        return;
      }

      const success = await grafanaService.testConnection(target.host, target.token);
      await logActivity("Grafana Settings", "Test Connection Profile", `${success ? "Successful" : "Failed"} connection test to Grafana profile "${target.name}"`, success ? "SUCCESS" : "ERROR");
      res.status(200).json({
        success: true,
        isConnected: success,
        message: success ? "Connection successful!" : "Connection failed."
      });
    } catch (error: any) {
      await logActivity("Grafana Settings", "Test Connection Profile", `Failed connection test to Grafana profile "${id}": ${error.message}`, "ERROR");
      res.status(200).json({
        success: false,
        isConnected: false,
        message: "Failed to connect to Grafana."
      });
    }
  }
}

export const settingsController = new SettingsController();
