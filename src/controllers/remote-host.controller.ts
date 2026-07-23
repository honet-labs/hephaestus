import { Request, Response } from "express";
import { remoteHostService } from "../services/remote-host.service";
import { logActivity } from "../config/db";

class RemoteHostController {
  public async getConfigs(req: Request, res: Response) {
    try {
      const configs = await remoteHostService.getConfigs();
      return res.json({ success: true, data: configs });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: "Failed to load configs." });
    }
  }

  public async saveConfig(req: Request, res: Response) {
    try {
      const { id, name, host, port, username, authType, password, sshKey, groupName, tags } = req.body;
      if (!name || !host || !username) {
        return res.status(400).json({ success: false, error: "Missing required fields." });
      }
      const cfg = await remoteHostService.saveConfig({
        id, name, host, port: port ? parseInt(port, 10) : 22,
        username, authType: authType || "password", password, sshKey,
        groupName: groupName || "Default", tags: tags || [],
      });
      await logActivity("RemoteHost", "Save Config", `Saved host config "${name}" (${host})`, "SUCCESS");
      return res.json({ success: true, data: cfg, message: `Host "${name}" saved.` });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: "Failed to save config." });
    }
  }

  public async deleteConfig(req: Request, res: Response) {
    try {
      await remoteHostService.deleteConfig(req.params.id);
      await logActivity("RemoteHost", "Delete Config", `Deleted host config ${req.params.id}`, "SUCCESS");
      return res.json({ success: true, message: "Host config deleted." });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: "Failed to delete config." });
    }
  }

  public async testConnection(req: Request, res: Response) {
    try {
      const { host, port, username, authType, password, sshKey } = req.body;
      if (!host || !username) {
        return res.status(400).json({ success: false, error: "Host and username are required." });
      }
      const result = await remoteHostService.testConnection({
        host, port: port ? parseInt(port, 10) : 22,
        username, authType: authType || "password", password, sshKey,
      });
      return res.json({ success: result.success, message: result.message });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: "Connection test failed." });
    }
  }

  public async sftpListDir(req: Request, res: Response) {
    try {
      const { hostConfigId, path } = req.body;
      if (!hostConfigId) {
        return res.status(400).json({ success: false, error: "hostConfigId is required." });
      }
      const remotePath = path || "/";

      // Local file listing
      if (hostConfigId === "__local__") {
        const fs = require("fs");
        const pathMod = require("path");
        try {
          const items = fs.readdirSync(remotePath, { withFileTypes: true });
          const list = items.map((item: any) => {
            let size = 0;
            let modTime = "";
            try {
              const stat = fs.statSync(pathMod.join(remotePath, item.name));
              size = stat.size;
              modTime = stat.mtime.toISOString();
            } catch (_) { /* ignore stat errors for individual files */ }
            return { name: item.name, isDir: item.isDirectory(), size, modTime };
          });
          return res.json({ success: true, data: list, path: remotePath });
        } catch (err: any) {
          return res.status(500).json({ success: false, error: "Cannot read directory." });
        }
      }

      const list = await remoteHostService.sftpListDir(hostConfigId, remotePath);
      return res.json({ success: true, data: list, path: remotePath });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: "Failed to list directory." });
    }
  }

  public async sftpUpload(req: Request, res: Response) {
    try {
      const hostConfigId = req.body.hostConfigId;
      const remotePath = req.body.remotePath;
      if (!hostConfigId || !remotePath) {
        return res.status(400).json({ success: false, error: "hostConfigId and remotePath are required." });
      }
      if (!req.file) {
        return res.status(400).json({ success: false, error: "No file uploaded." });
      }
      const fs = require("fs");
      const fileBuffer = fs.readFileSync(req.file.path);
      const result = await remoteHostService.sftpUpload(hostConfigId, remotePath, fileBuffer, req.file.originalname);
      fs.unlinkSync(req.file.path);
      await logActivity("RemoteHost", "File Upload", `Uploaded "${req.file.originalname}" to ${remotePath}`, "SUCCESS");
      return res.json({ success: true, message: result.message });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: "Upload failed." });
    }
  }

  public async sftpDownload(req: Request, res: Response) {
    try {
      const { hostConfigId, remotePath } = req.body;
      if (!hostConfigId || !remotePath) {
        return res.status(400).json({ success: false, error: "hostConfigId and remotePath are required." });
      }
      const result = await remoteHostService.sftpDownload(hostConfigId, remotePath);
      res.setHeader("Content-Disposition", `attachment; filename="${result.fileName}"`);
      res.setHeader("Content-Length", result.size.toString());
      res.setHeader("Content-Type", "application/octet-stream");
      return res.send(result.buffer);
    } catch (err: any) {
      return res.status(500).json({ success: false, error: "Download failed." });
    }
  }

  public async localToRemote(req: Request, res: Response) {
    try {
      const { localPath, hostConfigId, remotePath } = req.body;
      if (!hostConfigId || !remotePath || !localPath) {
        return res.status(400).json({ success: false, error: "localPath, hostConfigId, and remotePath are required." });
      }
      const fs = require("fs");
      if (!fs.existsSync(localPath)) {
        return res.status(404).json({ success: false, error: "Local file not found." });
      }
      const stat = fs.statSync(localPath);
      if (stat.isDirectory()) {
        return res.status(400).json({ success: false, error: "Cannot transfer a directory." });
      }
      const fileBuffer = fs.readFileSync(localPath);
      const fileName = localPath.split(/[/\\]/).pop() || "file";
      const result = await remoteHostService.sftpUpload(hostConfigId, remotePath, fileBuffer, fileName);
      await logActivity("RemoteHost", "Local→Remote", `Transferred "${fileName}" to ${remotePath}`, "SUCCESS");
      return res.json({ success: true, message: result.message });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: "Transfer failed." });
    }
  }

  public async remoteToLocal(req: Request, res: Response) {
    try {
      const { hostConfigId, remotePath, localPath } = req.body;
      if (!hostConfigId || !remotePath || !localPath) {
        return res.status(400).json({ success: false, error: "hostConfigId, remotePath, and localPath are required." });
      }
      const result = await remoteHostService.sftpDownload(hostConfigId, remotePath);
      const fs = require("fs");
      const dir = require("path").dirname(localPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(localPath, result.buffer);
      await logActivity("RemoteHost", "Remote→Local", `Transferred "${result.fileName}" to ${localPath}`, "SUCCESS");
      return res.json({ success: true, message: `Downloaded to ${localPath}` });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: "Transfer failed." });
    }
  }

  public async remoteToRemote(req: Request, res: Response) {
    try {
      const { fromHostConfigId, fromPath, toHostConfigId, toPath } = req.body;
      if (!fromHostConfigId || !fromPath || !toHostConfigId || !toPath) {
        return res.status(400).json({ success: false, error: "fromHostConfigId, fromPath, toHostConfigId, and toPath are required." });
      }
      const result = await remoteHostService.sftpRemoteToRemote(fromHostConfigId, fromPath, toHostConfigId, toPath);
      await logActivity("RemoteHost", "Remote→Remote", `Transferred ${fromPath} → ${toPath}`, "SUCCESS");
      return res.json({ success: true, message: result.message });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message || "Transfer failed." });
    }
  }
}

export const remoteHostController = new RemoteHostController();
