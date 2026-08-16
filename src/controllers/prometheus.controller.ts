import { Request, Response } from "express";
import fs from "fs";
import path from "path";
import axios from "axios";
import { prometheusService } from "../services/prometheus.service";
import { logActivity } from "../config/db";
import logger from "../config/logger";

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
    const isDocker = fs.existsSync("/.dockerenv") || !!process.env.DOCKER_CONTAINER;
    const dockerHint = isDocker ? " (Note: Hephaestus runs inside a Docker container. This path must exist INSIDE the container, not on the host. For remote servers, use 'Remote Server via SSH' mode instead.)" : "";
    try {
      const dir = path.dirname(targetPath);
      if (fs.existsSync(targetPath)) {
        try {
          fs.accessSync(targetPath, fs.constants.R_OK | fs.constants.W_OK);
          return { writeable: true, message: `File exists and is readable/writeable.${dockerHint}` };
        } catch (e: any) {
          return { writeable: false, message: `File exists but is not writeable: ${e.message || e}${dockerHint}` };
        }
      }

      if (!fs.existsSync(dir)) {
        let parentDir = dir;
        while (parentDir && !fs.existsSync(parentDir)) {
          const nextParent = path.dirname(parentDir);
          if (nextParent === parentDir) break;
          parentDir = nextParent;
        }
        if (parentDir && fs.existsSync(parentDir)) {
          try {
            fs.accessSync(parentDir, fs.constants.W_OK);
            return { writeable: true, message: `File does not exist yet, but parent directory ${parentDir} is writeable (file will be created).${dockerHint}` };
          } catch (e: any) {
            return { writeable: false, message: `Parent directory ${parentDir} is not writeable: ${e.message || e}${dockerHint}` };
          }
        } else {
          return { writeable: false, message: `Path directory structure is invalid or inaccessible: ${targetPath}${dockerHint}` };
        }
      }

      try {
        fs.accessSync(dir, fs.constants.W_OK);
        return { writeable: true, message: `File does not exist yet, but directory ${dir} is writeable (file will be created).${dockerHint}` };
      } catch (e: any) {
        return { writeable: false, message: `Directory ${dir} exists but is not writeable: ${e.message || e}${dockerHint}` };
      }
    } catch (err: any) {
      return { writeable: false, message: `Error checking path: ${err.message || err}${dockerHint}` };
    }
  }

  /**
   * POST /api/v1/prometheus/configs/test
   * Test connection credentials before saving.
   */
  public async testConnection(req: Request, res: Response) {
    try {
      const profile = req.body;
      const requestId = (req as any)?.requestId;
      logger.prometheus("Connection test requested", {
        requestId,
        userId: (req as any)?.user?.id,
        mode: profile?.mode,
        path: profile?.path,
        hasReloadUrl: !!profile?.reloadUrl,
        hasPrometheusHost: !!profile?.prometheusHost
      });
      if (!profile.mode || !profile.path) {
        return res.status(400).json({
          success: false,
          error: "Bad Request",
          message: "Request body must contain 'mode' and 'path'."
        });
      }

      const normalizedPath = path.posix.normalize(profile.path);
      if (normalizedPath.includes("..")) {
        return res.status(400).json({
          success: false,
          error: "Bad Request",
          message: "Invalid path: directory traversal (..) is not allowed."
        });
      }

      const prometheusBaseCandidate = (profile.prometheusHost || profile.reloadUrl || "").replace(/\/-\/reload\/?$/, "").replace(/\/+$/, "");

      // Run HTTP probe and file/SSH test IN PARALLEL with strict timeouts
      const httpProbePromise = this.probePrometheusHttp(prometheusBaseCandidate, requestId);
      const fileTestPromise = profile.mode === "local"
        ? Promise.resolve(this.checkLocalWriteable(profile.path))
        : this.testSshWithTimeout(profile, requestId);

      const [httpResult, fileResult] = await Promise.allSettled([httpProbePromise, fileTestPromise]);

      const prometheusReachable = httpResult.status === "fulfilled" ? httpResult.value.reachable : false;
      const prometheusMessage = httpResult.status === "fulfilled" ? httpResult.value.message : `HTTP probe error: ${httpResult.reason?.message}`;

      let success: boolean;
      let message: string;
      let statusCode = 200;

      if (profile.mode === "local") {
        const localCheck = fileResult.status === "fulfilled"
          ? fileResult.value as { writeable: boolean; message: string }
          : { writeable: false, message: `Check failed: ${fileResult.reason?.message}` };
        success = localCheck.writeable;
        message = localCheck.message;
      } else {
        const sshCheck = fileResult.status === "fulfilled"
          ? fileResult.value as { success: boolean; message: string }
          : { success: false, message: `SSH test failed: ${fileResult.reason?.message}` };
        success = sshCheck.success;
        message = sshCheck.message;
        if (!success) statusCode = 422;
      }

      if (prometheusBaseCandidate) {
        message += ` | ${prometheusMessage}`;
      }

      logger.prometheus("Connection test completed", {
        requestId,
        mode: profile.mode,
        success,
        prometheusReachable,
        message
      });

      return res.status(statusCode).json({ success, message, prometheusReachable, requestId });
    } catch (err: any) {
      logger.prometheusError("Connection test failed", {
        requestId: (req as any)?.requestId,
        message: err?.message,
        stack: err?.stack
      });
      return res.status(500).json({
        success: false,
        error: "Internal Server Error",
        message: "Failed to test connection.",
        requestId: (req as any)?.requestId
      });
    }
  }

  private async probePrometheusHttp(baseUrl: string, requestId?: string): Promise<{ reachable: boolean; message: string }> {
    if (!baseUrl) return { reachable: false, message: "Prometheus host not provided; skipped HTTP probe" };
    const testUrl = `${baseUrl}/api/v1/status/config`;
    const start = Date.now();
    try {
      const response = await axios.get(testUrl, { timeout: 3500 });
      const ms = Date.now() - start;
      logger.prometheus("HTTP probe succeeded", { requestId, testUrl, status: response.status, ms });
      return { reachable: response.status === 200, message: `Prometheus reachable at ${baseUrl}` };
    } catch (err: any) {
      const ms = Date.now() - start;
      logger.prometheusError("HTTP probe failed", { requestId, testUrl, code: err?.code, status: err?.response?.status, ms, message: err?.message });
      const hint = err?.code === "ECONNREFUSED" ? " (connection refused - Prometheus not running or firewall blocking)"
        : err?.code === "ECONNABORTED" ? " (timeout - host unreachable)"
        : "";
      return { reachable: false, message: `Prometheus not reachable: ${err.message}${hint}` };
    }
  }

  private async testSshWithTimeout(profile: any, _requestId?: string): Promise<{ success: boolean; message: string }> {
    const timeoutMs = 8000;
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        resolve({ success: false, message: `SSH test timed out after ${timeoutMs / 1000}s` });
      }, timeoutMs);
      prometheusService.testSSHConnection(profile).then((result) => {
        clearTimeout(timer);
        resolve(result);
      }).catch((err) => {
        clearTimeout(timer);
        resolve({ success: false, message: `SSH error: ${err.message}` });
      });
    });
  }

  /**
   * POST /api/v1/prometheus/configs/:id/test
   * Test connection profile by ID.
   */
  public async testConnectionById(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const requestId = (req as any)?.requestId;
      const target = await prometheusService.getConfigById(id);
      if (!target) {
        return res.status(404).json({ success: false, error: "Not Found", message: "Profile not found." });
      }

      const prometheusBaseCandidate = ((target as any).prometheusHost || target.reloadUrl || "").replace(/\/-\/reload\/?$/, "").replace(/\/+$/, "");

      const httpProbePromise = this.probePrometheusHttp(prometheusBaseCandidate, requestId);
      const fileTestPromise = target.mode === "local"
        ? Promise.resolve(this.checkLocalWriteable(target.path))
        : this.testSshWithTimeout(target, requestId);

      const [httpResult, fileResult] = await Promise.allSettled([httpProbePromise, fileTestPromise]);

      const prometheusReachable = httpResult.status === "fulfilled" ? httpResult.value.reachable : false;
      const prometheusMessage = httpResult.status === "fulfilled" ? httpResult.value.message : `HTTP probe error: ${httpResult.reason?.message}`;

      let isConnected: boolean;
      let message: string;

      if (target.mode === "local") {
        const localCheck = fileResult.status === "fulfilled"
          ? fileResult.value as { writeable: boolean; message: string }
          : { writeable: false, message: `Check failed: ${fileResult.reason?.message}` };
        isConnected = localCheck.writeable;
        message = localCheck.message;
      } else {
        const sshCheck = fileResult.status === "fulfilled"
          ? fileResult.value as { success: boolean; message: string }
          : { success: false, message: `SSH test failed: ${fileResult.reason?.message}` };
        isConnected = sshCheck.success;
        message = sshCheck.message;
      }

      if (prometheusBaseCandidate) {
        message += ` | ${prometheusMessage}`;
      }

      logger.prometheus("Saved profile test completed", { requestId, profileId: id, isConnected, prometheusReachable });

      return res.status(200).json({ success: true, isConnected, message, prometheusReachable, requestId });
    } catch (err: any) {
      logger.prometheusError("Saved profile connection test failed", { requestId: (req as any)?.requestId, message: err?.message });
      return res.status(500).json({
        success: false, error: "Internal Server Error", message: "Failed to test connection.",
        requestId: (req as any)?.requestId
      });
    }
  }
}

export const prometheusController = new PrometheusController();
