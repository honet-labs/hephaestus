import { Request, Response } from "express";
import fs from "fs";
import { prometheusService } from "../services/prometheus.service";

export class PrometheusController {
  /**
   * GET /api/v1/prometheus/config
   * Fetch current Prometheus configuration content.
   */
  public async getConfig(req: Request, res: Response) {
    try {
      const result = await prometheusService.readConfig();
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
        message: err.message || "Failed to read Prometheus configuration file."
      });
    }
  }

  /**
   * POST /api/v1/prometheus/config/validate
   * Dry-run validation of YAML configuration content.
   */
  public async validateConfig(req: Request, res: Response) {
    try {
      const { content } = req.body;
      if (typeof content !== "string") {
        return res.status(400).json({
          success: false,
          error: "Bad Request",
          message: "Request body must contain 'content' string."
        });
      }

      const validation = await prometheusService.validateConfig(content);
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
        message: err.message || "An error occurred during validation check."
      });
    }
  }

  /**
   * POST /api/v1/prometheus/config
   * Validate, save, and reload Prometheus configuration.
   */
  public async saveConfig(req: Request, res: Response) {
    try {
      const { content } = req.body;
      if (typeof content !== "string") {
        return res.status(400).json({
          success: false,
          error: "Bad Request",
          message: "Request body must contain 'content' string."
        });
      }

      const result = await prometheusService.saveConfig(content);
      if (result.success) {
        return res.status(200).json(result);
      } else {
        return res.status(422).json(result);
      }
    } catch (err: any) {
      console.error("[PrometheusController] Error saving config:", err);
      return res.status(500).json({
        success: false,
        error: "Internal Server Error",
        message: err.message || "Failed to save Prometheus configuration."
      });
    }
  }

  /**
   * GET /api/v1/prometheus/configs
   * List all registered Prometheus connection profiles.
   */
  public async getConfigsList(req: Request, res: Response) {
    try {
      const list = prometheusService.getConfigsList();
      return res.status(200).json({
        success: true,
        configs: list
      });
    } catch (err: any) {
      console.error("[PrometheusController] Error getting configs list:", err);
      return res.status(500).json({
        success: false,
        error: "Internal Server Error",
        message: err.message
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

      const item = prometheusService.saveConfigProfile(profile);
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
        message: err.message
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
      prometheusService.deleteConfigProfile(id);
      return res.status(200).json({
        success: true,
        message: "Prometheus connection profile deleted successfully."
      });
    } catch (err: any) {
      console.error("[PrometheusController] Error deleting config profile:", err);
      return res.status(500).json({
        success: false,
        error: "Internal Server Error",
        message: err.message
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
      prometheusService.activateConfigProfile(id);
      return res.status(200).json({
        success: true,
        message: "Prometheus connection profile activated successfully."
      });
    } catch (err: any) {
      console.error("[PrometheusController] Error activating config profile:", err);
      return res.status(500).json({
        success: false,
        error: "Internal Server Error",
        message: err.message
      });
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

      if (profile.mode === "local") {
        const pathExists = fs.existsSync(profile.path);
        return res.status(200).json({
          success: true,
          message: pathExists 
            ? "Local configuration path check: path exists." 
            : "Local configuration path check: file does not exist yet (will be created automatically on editor load/save)."
        });
      } else {
        const result = await prometheusService.testSSHConnection(profile);
        if (result.success) {
          return res.status(200).json(result);
        } else {
          return res.status(422).json(result);
        }
      }
    } catch (err: any) {
      console.error("[PrometheusController] Error testing connection:", err);
      return res.status(500).json({
        success: false,
        error: "Internal Server Error",
        message: err.message
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
      const list = prometheusService.getConfigsList();
      const target = list.find(c => c.id === id);
      if (!target) {
        return res.status(404).json({
          success: false,
          error: "Not Found",
          message: "Profile not found."
        });
      }

      if (target.mode === "local") {
        const pathExists = fs.existsSync(target.path);
        return res.status(200).json({
          success: true,
          isConnected: pathExists
        });
      } else {
        const result = await prometheusService.testSSHConnection(target);
        return res.status(200).json({
          success: true,
          isConnected: result.success
        });
      }
    } catch (err: any) {
      console.error("[PrometheusController] Error testing connection by ID:", err);
      return res.status(500).json({
        success: false,
        error: "Internal Server Error",
        message: err.message
      });
    }
  }
}

export const prometheusController = new PrometheusController();
