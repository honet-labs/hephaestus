import { Request, Response } from "express";
import fs from "fs";
import path from "path";
import { dataprepperService } from "../services/dataprepper.service";
import { logActivity } from "../config/db";

export class DataPrepperController {
  private checkLocalWriteable(dirPath: string): { writeable: boolean; message: string } {
    try {
      fs.accessSync(dirPath, fs.constants.W_OK);
      return { writeable: true, message: `Local directory ${dirPath} is writeable.` };
    } catch (err: any) {
      return { writeable: false, message: `Local directory is not writeable: ${err.message}` };
    }
  }

  /**
   * GET /api/v1/dataprepper/pipelines — List pipeline files
   */
  public async listPipelines(req: Request, res: Response) {
    try {
      const configId = req.query.configId as string | undefined;
      const result = await dataprepperService.listPipelineFiles(configId);
      return res.status(200).json({ success: true, data: result });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  /**
   * GET /api/v1/dataprepper/pipeline — Read a pipeline file
   */
  public async readPipeline(req: Request, res: Response) {
    try {
      const filename = req.query.filename as string;
      const configId = req.query.configId as string | undefined;
      if (!filename) {
        return res.status(400).json({ success: false, error: "filename query parameter is required." });
      }
      const result = await dataprepperService.readPipelineFile(filename, configId);
      return res.status(200).json({ success: true, data: result });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  /**
   * POST /api/v1/dataprepper/pipeline — Save a pipeline file
   */
  public async savePipeline(req: Request, res: Response) {
    try {
      const { filename, content, configId } = req.body;
      if (!filename || content === undefined) {
        return res.status(400).json({ success: false, error: "filename and content are required." });
      }
      const result = await dataprepperService.savePipelineFile(filename, content, configId);
      if (result.success) {
        const reloadStatus = result.reloaded ? " | Reloaded" : " | Manual restart needed";
        await logActivity("DataPrepper Settings", "Save Pipeline", `Saved pipeline file "${filename}"${reloadStatus}`, result.reloaded ? "SUCCESS" : "WARNING");
      }
      return res.status(200).json(result);
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  /**
   * POST /api/v1/dataprepper/pipeline/validate — Validate a pipeline YAML
   */
  public async validatePipeline(req: Request, res: Response) {
    try {
      const { content } = req.body;
      if (!content) {
        return res.status(400).json({ success: false, error: "content is required." });
      }
      const result = dataprepperService.validatePipeline(content);
      return res.status(200).json({ success: true, data: result });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  /**
   * GET /api/v1/dataprepper/configs — List connection profiles
   */
  public async getConfigsList(req: Request, res: Response) {
    try {
      const configs = await dataprepperService.getConfigsList();
      return res.status(200).json({ success: true, data: configs });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  /**
   * POST /api/v1/dataprepper/configs — Save connection profile
   */
  public async saveConfigProfile(req: Request, res: Response) {
    try {
      const profile = req.body;
      if (!profile.name || !profile.mode) {
        return res.status(400).json({ success: false, error: "name and mode are required." });
      }

      if (profile.id) {
        const existing = await dataprepperService.getConfigById(profile.id);
        if (existing) {
          if (!profile.sshPassword || profile.sshPassword === "********") {
            profile.sshPassword = existing.sshPassword;
          }
          if (!profile.sshKey || profile.sshKey === "********") {
            profile.sshKey = existing.sshKey;
          }
        }
      }

      const item = await dataprepperService.saveConfigProfile(profile);
      await logActivity("DataPrepper Settings", "Save Profile", `Saved DataPrepper profile "${item.name}" (Mode: ${item.mode})`, "SUCCESS");
      return res.status(200).json({ success: true, message: "Profile saved.", config: item });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  /**
   * DELETE /api/v1/dataprepper/configs/:id — Delete a profile
   */
  public async deleteConfigProfile(req: Request, res: Response) {
    try {
      await dataprepperService.deleteConfigProfile(req.params.id);
      await logActivity("DataPrepper Settings", "Delete Profile", `Deleted DataPrepper profile "${req.params.id}"`, "SUCCESS");
      return res.status(200).json({ success: true, message: "Profile deleted." });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  /**
   * POST /api/v1/dataprepper/configs/:id/activate — Activate a profile
   */
  public async activateConfigProfile(req: Request, res: Response) {
    try {
      await dataprepperService.activateConfigProfile(req.params.id);
      await logActivity("DataPrepper Settings", "Activate Profile", `Activated DataPrepper profile "${req.params.id}"`, "SUCCESS");
      return res.status(200).json({ success: true, message: "Profile activated." });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  /**
   * POST /api/v1/dataprepper/configs/:id/test — Test SSH connection
   */
  public async testConnectionById(req: Request, res: Response) {
    try {
      const target = await dataprepperService.getConfigById(req.params.id);
      if (!target) {
        return res.status(404).json({ success: false, error: "Profile not found." });
      }
      if (target.mode === "local") {
        return res.status(200).json({ success: true, isConnected: true, message: "Local mode — using filesystem." });
      }
      const result = await dataprepperService.testSSHConnection(target);
      return res.status(200).json({ success: true, isConnected: result.success, message: result.message });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  /**
   * POST /api/v1/dataprepper/configs/test — Test connection parameters before saving
   */
  public async testConnection(req: Request, res: Response) {
    try {
      const profile = req.body;
      if (!profile.mode || !profile.pipelinesDir) {
        return res.status(400).json({
          success: false,
          error: "Bad Request",
          message: "Request body must contain 'mode' and 'pipelinesDir'."
        });
      }

      const normalizedPath = path.posix.normalize(profile.pipelinesDir);
      if (normalizedPath.includes("..")) {
        return res.status(400).json({
          success: false,
          error: "Bad Request",
          message: "Invalid path: directory traversal (..) is not allowed."
        });
      }

      if (profile.mode === "local") {
        const check = this.checkLocalWriteable(profile.pipelinesDir);
        return res.status(200).json({
          success: check.writeable,
          isConnected: check.writeable,
          message: check.message
        });
      } else {
        const result = await dataprepperService.testSSHConnection(profile);
        return res.status(200).json({
          success: result.success,
          isConnected: result.success,
          message: result.message
        });
      }
    } catch (err: any) {
      console.error("[DataPrepperController] Error testing connection:", err);
      return res.status(500).json({
        success: false,
        error: "Internal Server Error",
        message: err.message
      });
    }
  }
}

export const dataprepperController = new DataPrepperController();
