import { Request, Response } from "express";
import fs from "fs";
import path from "path";
import { prometheusService } from "../services/prometheus.service";
import { logActivity } from "../config/db";

export class PrometheusController {
  /**
   * GET /api/v1/prometheus/config
   * Fetch current Prometheus configuration content.
   * Optional query param: configId - specific profile to read from
   */
  public async getConfig(req: Request, res: Response) {
    try {
      const configId = req.query.configId as string | undefined;
      const result = await prometheusService.readConfig(configId);
      return res.status(200).json({
        success: true,
        path: result.path,
        content: result.content
      });
    } catch (err: any) {
      console.error("[PrometheusController] Error getting config:", err);
      return res.status(500).json({
        success: false,
        error: "Internal Server Error",
        message: "Failed to read Prometheus configuration file."
      });
    }
  }

  /**
   * POST /api/v1/prometheus/config/validate
   * Dry-run validation of YAML configuration content.
   * Optional body param: configId - specific profile to validate against
   */
  public async validateConfig(req: Request, res: Response) {
    try {
      const { content, configId } = req.body;
      if (typeof content !== "string") {
        return res.status(400).json({
          success: false,
          error: "Bad Request",
          message: "Request body must contain 'content' string."
        });
      }

      const validation = await prometheusService.validateConfig(content, configId);
      if (validation.valid) {
        return res.status(200).json({
          success: true,
          message: "Configuration is valid."
        });
      } else {
        return res.status(422).json({
          success: false,
          error: "Unprocessable Entity",
          message: validation.error
        });
      }
    } catch (err: any) {
      console.error("[PrometheusController] Error validating config:", err);
      return res.status(500).json({
        success: false,
        error: "Internal Server Error",
        message: "An error occurred during validation check."
      });
    }
  }

  /**
   * POST /api/v1/prometheus/config
   * Validate, save, and reload Prometheus configuration.
   * Optional body param: configId - specific profile to save to
   */
  public async saveConfig(req: Request, res: Response) {
    try {
      const { content, configId } = req.body;
      if (typeof content !== "string") {
        return res.status(400).json({
          success: false,
          error: "Bad Request",
          message: "Request body must contain 'content' string."
        });
      }

      const result = await prometheusService.saveConfig(content, configId);
      if (result.success) {
        await logActivity("Prometheus Config", "Edit Config", "Successfully validated, saved, and reloaded prometheus.yml", "SUCCESS");
        return res.status(200).json(result);
      } else {
        await logActivity("Prometheus Config", "Edit Config", `Failed to save/reload prometheus.yml: ${result.message}`, "ERROR");
        return res.status(422).json(result);
      }
    } catch (err: any) {
      console.error("[PrometheusController] Error saving config:", err);
      return res.status(500).json({
        success: false,
        error: "Internal Server Error",
        message: "Failed to save Prometheus configuration."
      });
    }
  }

  /**
   * GET /api/v1/prometheus/configs
   * List all registered Prometheus connection profiles.
   */
  public async getConfigsList(req: Request, res: Response) {
    try {
      const list = await prometheusService.getConfigsList();
      return res.status(200).json({
        success: true,
        configs: list
      });
    } catch (err: any) {
      console.error("[PrometheusController] Error getting configs list:", err);
      return res.status(500).json({
        success: false,
        error: "Internal Server Error",
        message: "Failed to retrieve configuration list."
      });
    }
  }

  /**
   * POST /api/v1/prometheus/configs
   * Add or update a Prometheus connection profile.
   */
  public async saveConfigProfile(req: Request, res: Response) {
    try {
      const profile = req.body;
      if (!profile.name || !profile.mode || !profile.path) {
        return res.status(400).json({
          success: false,
          error: "Bad Request",
          message: "Request body must contain 'name', 'mode', and 'path'."
        });
      }

      // Validate path: reject directory traversal attempts
      const normalizedPath = path.posix.normalize(profile.path);
      if (normalizedPath.includes("..")) {
        return res.status(400).json({
          success: false,
          error: "Bad Request",
          message: "Invalid path: directory traversal (..) is not allowed."
        });
      }

      const item = await prometheusService.saveConfigProfile(profile);
      await logActivity("Prometheus Settings", "Save Profile", `Saved/updated Prometheus profile "${profile.name}" (Mode: ${profile.mode}, Path: ${profile.path})`, "SUCCESS");
      return res.status(200).json({
        success: true,
        message: "Prometheus connection profile saved successfully.",
        config: item
      });
    } catch (err: any) {
      console.error("[PrometheusController] Error saving config profile:", err);
      return res.status(500).json({
        success: false,
        error: "Internal Server Error",
        message: "Failed to save configuration profile."
      });
    }
  }

  /**
   * DELETE /api/v1/prometheus/configs/:id
   * Delete a Prometheus connection profile.
   */
  public async deleteConfigProfile(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const list = await prometheusService.getConfigsList();
      const target = list.find(c => c.id === id);
      const name = target ? target.name : id;
      
      await prometheusService.deleteConfigProfile(id);
      await logActivity("Prometheus Settings", "Delete Profile", `Deleted Prometheus profile "${name}" (ID: ${id})`, "SUCCESS");
      return res.status(200).json({
        success: true,
        message: "Prometheus connection profile deleted successfully."
      });
    } catch (err: any) {
      console.error("[PrometheusController] Error deleting config profile:", err);
      return res.status(500).json({
        success: false,
        error: "Internal Server Error",
        message: "Failed to delete configuration profile."
      });
    }
  }

  /**
   * POST /api/v1/prometheus/configs/:id/activate
   * Activate a Prometheus connection profile.
   */
  public async activateConfigProfile(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const list = await prometheusService.getConfigsList();
      const target = list.find(c => c.id === id);
      const name = target ? target.name : id;

      await prometheusService.activateConfigProfile(id);
      await logActivity("Prometheus Settings", "Activate Profile", `Activated Prometheus profile "${name}" (ID: ${id})`, "SUCCESS");
      return res.status(200).json({
        success: true,
        message: "Prometheus connection profile activated successfully."
      });
    } catch (err: any) {
      console.error("[PrometheusController] Error activating config profile:", err);
      return res.status(500).json({
        success: false,
        error: "Internal Server Error",
        message: "Failed to activate configuration profile."
      });
    }
  }

  /**
   * POST /api/v1/prometheus/configs/test
   * Test connection credentials before saving.
   */
  /**
   * Helper to verify if the path or containing folder is writeable by the process.
   */
  private checkLocalWriteable(targetPath: string): { writeable: boolean; message: string } {
    try {
      const dir = path.dirname(targetPath);
      
      // If file exists, check if we can read and write to it
      if (fs.existsSync(targetPath)) {
        try {
          fs.accessSync(targetPath, fs.constants.R_OK | fs.constants.W_OK);
          return {
            writeable: true,
            message: "Local configuration file exists and is readable/writeable."
          };
        } catch (e: any) {
          return {
            writeable: false,
            message: `Local file exists but is not writeable: ${e.message || e}`
          };
        }
      }

      // If file doesn't exist, check if parent directory exists and is writeable
      if (!fs.existsSync(dir)) {
        // Find closest existing ancestor directory
        let parentDir = dir;
        while (parentDir && !fs.existsSync(parentDir)) {
          const nextParent = path.dirname(parentDir);
          if (nextParent === parentDir) break; // Root directory reached
          parentDir = nextParent;
        }
        
        if (parentDir && fs.existsSync(parentDir)) {
          try {
            fs.accessSync(parentDir, fs.constants.W_OK);
            return {
              writeable: true,
              message: `Configuration file does not exist yet, but containing folder will be created automatically under writeable directory: ${parentDir}`
            };
          } catch (e: any) {
            return {
              writeable: false,
              message: `Parent directory ${parentDir} is not writeable: ${e.message || e}`
            };
          }
        } else {
          return {
            writeable: false,
            message: `Containing path directory structure is invalid or inaccessible.`
          };
        }
      }

      // Directory exists, check if writeable
      try {
        fs.accessSync(dir, fs.constants.W_OK);
        return {
          writeable: true,
          message: "Configuration file does not exist yet, but containing directory is writeable (will be created automatically)."
        };
      } catch (e: any) {
        return {
          writeable: false,
          message: `Containing directory exists but is not writeable: ${e.message || e}`
        };
      }
    } catch (err: any) {
      return {
        writeable: false,
        message: `Error checking path: ${err.message || err}`
      };
    }
  }

  /**
   * POST /api/v1/prometheus/configs/test
   * Test connection credentials before saving.
   */
  public async testConnection(req: Request, res: Response) {
    try {
      const profile = req.body;
      if (!profile.mode || !profile.path) {
        return res.status(400).json({
          success: false,
          error: "Bad Request",
          message: "Request body must contain 'mode' and 'path'."
        });
      }

      // Validate path: reject directory traversal attempts
      const normalizedPath = path.posix.normalize(profile.path);
      if (normalizedPath.includes("..")) {
        return res.status(400).json({
          success: false,
          error: "Bad Request",
          message: "Invalid path: directory traversal (..) is not allowed."
        });
      }

      // Test HTTP connection to Prometheus if reloadUrl is provided
      let prometheusReachable = false;
      let prometheusMessage = "";
      if (profile.reloadUrl) {
        try {
          const baseUrl = profile.reloadUrl.replace(/\/-\/reload\/?$/, "");
          const testUrl = `${baseUrl}/api/v1/status/config`;
          const axios = (await import("axios")).default;
          const response = await axios.get(testUrl, { timeout: 5000 });
          prometheusReachable = response.status === 200;
          prometheusMessage = prometheusReachable
            ? `Prometheus is reachable at ${baseUrl}`
            : `Prometheus returned status ${response.status}`;
        } catch (httpErr: any) {
          prometheusReachable = false;
          prometheusMessage = `Prometheus is not reachable: ${httpErr.message}`;
        }
      }

      if (profile.mode === "local") {
        const check = this.checkLocalWriteable(profile.path);
        const success = check.writeable;
        let message = check.message;
        if (profile.reloadUrl) {
          message += ` | ${prometheusMessage}`;
        }
        return res.status(200).json({
          success,
          message,
          prometheusReachable
        });
      } else {
        const result = await prometheusService.testSSHConnection(profile);
        let message = result.message;
        if (profile.reloadUrl) {
          message += ` | ${prometheusMessage}`;
        }
        if (result.success) {
          return res.status(200).json({
            success: true,
            message,
            prometheusReachable
          });
        } else {
          return res.status(422).json({
            success: false,
            message,
            prometheusReachable
          });
        }
      }
    } catch (err: any) {
      console.error("[PrometheusController] Error testing connection:", err);
      return res.status(500).json({
        success: false,
        error: "Internal Server Error",
        message: "Failed to test connection."
      });
    }
  }

  /**
   * POST /api/v1/prometheus/configs/:id/test
   * Test connection profile by ID.
   */
  public async testConnectionById(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const target = await prometheusService.getConfigById(id);
      if (!target) {
        return res.status(404).json({
          success: false,
          error: "Not Found",
          message: "Profile not found."
        });
      }

      // Test HTTP connection to Prometheus if reloadUrl is provided
      let prometheusReachable = false;
      let prometheusMessage = "";
      if (target.reloadUrl) {
        try {
          const baseUrl = target.reloadUrl.replace(/\/-\/reload\/?$/, "");
          const testUrl = `${baseUrl}/api/v1/status/config`;
          const axios = (await import("axios")).default;
          const response = await axios.get(testUrl, { timeout: 5000 });
          prometheusReachable = response.status === 200;
          prometheusMessage = prometheusReachable
            ? `Prometheus is reachable at ${baseUrl}`
            : `Prometheus returned status ${response.status}`;
        } catch (httpErr: any) {
          prometheusReachable = false;
          prometheusMessage = `Prometheus is not reachable: ${httpErr.message}`;
        }
      }

      if (target.mode === "local") {
        const check = this.checkLocalWriteable(target.path);
        let message = check.message;
        if (target.reloadUrl) {
          message += ` | ${prometheusMessage}`;
        }
        return res.status(200).json({
          success: true,
          isConnected: check.writeable,
          message,
          prometheusReachable
        });
      } else {
        const result = await prometheusService.testSSHConnection(target);
        let message = result.message;
        if (target.reloadUrl) {
          message += ` | ${prometheusMessage}`;
        }
        return res.status(200).json({
          success: true,
          isConnected: result.success,
          message,
          prometheusReachable
        });
      }
    } catch (err: any) {
      console.error("[PrometheusController] Error testing connection by ID:", err);
      return res.status(500).json({
        success: false,
        error: "Internal Server Error",
        message: "Failed to test connection."
      });
    }
  }
}

export const prometheusController = new PrometheusController();
