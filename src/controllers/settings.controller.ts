import { Request, Response } from "express";
import { grafanaService } from "../services/grafana.service";
import config from "../config/env";

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
        message: error.message || "Failed to retrieve Grafana settings."
      });
    }
  }

  /**
   * GET /api/v1/settings/grafana/datasources
   * Fetch all datasources from Grafana server using active configuration
   */
  public async getGrafanaDatasources(req: Request, res: Response): Promise<void> {
    try {
      const datasources = await grafanaService.getDatasources();
      res.status(200).json({
        success: true,
        data: datasources
      });
    } catch (error: any) {
      console.error("[SettingsController] GET datasources error:", error);
      res.status(500).json({
        success: false,
        error: "Grafana Datasources Error",
        message: error.message || "Failed to retrieve datasources from Grafana server."
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
        grafanaService.resetConfig();
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
            res.status(200).json({
              success: true,
              message: "Koneksi ke Grafana berhasil!"
            });
          } else {
            res.status(200).json({
              success: false,
              message: "Grafana merespon dengan status tidak biasa. Koneksi diragukan."
            });
          }
        } catch (err: any) {
          res.status(200).json({
            success: false,
            error: "Koneksi Gagal",
            message: err.message || "Gagal menghubungkan ke Grafana."
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
          res.status(400).json({
            success: false,
            error: "Gagal Menyimpan",
            message: `Penyimpanan dibatalkan karena uji koneksi gagal: ${err.message}`
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
        grafanaService.saveConfig(host, targetToken, finalDatasourceUid);
        
        let successMessage = "Konfigurasi Grafana berhasil disimpan dan diterapkan!";
        if (autoDetectedName) {
          successMessage += ` (Prometheus UID terdeteksi otomatis: "${autoDetectedName}")`;
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
        message: error.message || "Failed to process Grafana settings action."
      });
    }
  }
}

export const settingsController = new SettingsController();
