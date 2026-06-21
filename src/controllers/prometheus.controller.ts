import { Request, Response } from "express";
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
}

export const prometheusController = new PrometheusController();
