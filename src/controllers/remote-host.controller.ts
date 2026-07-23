import { Request, Response } from "express";
import { remoteHostService } from "../services/remote-host.service";
import { logActivity } from "../config/db";
import path from "path";

const LOCAL_ALLOWED_ROOTS = ["/app/data", "/home", "/tmp", "/var/tmp"];
const PRIVATE_IP_PATTERNS = [
  /^127\./, /^10\./, /^172\.(1[6-9]|2\d|3[01])\./, /^192\.168\./,
  /^169\.254\./, /^0\./, /^::1$/, /^fc00:/, /^fe80:/,
  /^100\.(6[4-9]|[7-9]\d|1[0-2][0-7])\./,
];
const DANGEROUS_PATH_CHARS = /\.\.|~/;

function validateLocalPath(localPath: string): string | null {
  const resolved = path.resolve(localPath);
  for (const root of LOCAL_ALLOWED_ROOTS) {
    if (resolved.startsWith(root + "/") || resolved === root) return resolved;
  }
  return null;
}

function validateRemotePath(remotePath: string): string {
  if (DANGEROUS_PATH_CHARS.test(remotePath)) throw new Error("Invalid characters in remote path");
  for (let i = 0; i < remotePath.length; i++) {
    const code = remotePath.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) throw new Error("Invalid characters in remote path");
  }
  if (remotePath.length > 4096) throw new Error("Invalid remote path");
  return remotePath;
}

function isPrivateOrReservedIP(host: string): boolean {
  const h = host.trim().toLowerCase();
  if (["localhost", "127.0.0.1", "::1", "0.0.0.0", "169.254.169.254", "metadata.google.internal"].includes(h)) return true;
  return PRIVATE_IP_PATTERNS.some(p => p.test(h));
}

function validatePort(port: any): number {
  const p = parseInt(port, 10);
  if (isNaN(p) || p < 1 || p > 65535) throw new Error("Port must be 1-65535");
  return p;
}

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
      if (isPrivateOrReservedIP(host)) {
        return res.status(400).json({ success: false, error: "Connecting to private/reserved IPs is not allowed." });
      }
      const validPort = validatePort(port || 22);
      const cfg = await remoteHostService.saveConfig({
        id, name, host, port: validPort,
        username, authType: authType || "password", password, sshKey,
        groupName: groupName || "Default", tags: tags || [],
      });
      await logActivity("RemoteHost", "Save Config", `Saved host config "${name}" (${host})`, "SUCCESS");
      return res.json({ success: true, data: cfg, message: `Host "${name}" saved.` });
    } catch (err: any) {
      return res.status(err.message?.includes("Port") ? 400 : 500).json({ success: false, error: err.message || "Failed to save config." });
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
      if (isPrivateOrReservedIP(host)) {
        return res.status(400).json({ success: false, error: "Connecting to private/reserved IPs is not allowed." });
      }
      const validPort = validatePort(port || 22);
      const result = await remoteHostService.testConnection({
        host, port: validPort,
        username, authType: authType || "password", password, sshKey,
      });
      return res.json({ success: result.success, message: result.message });
    } catch (err: any) {
      return res.status(err.message?.includes("Port") ? 400 : 500).json({ success: false, error: "Connection test failed." });
    }
  }

  public async sftpListDir(req: Request, res: Response) {
    try {
      const { hostConfigId, path: reqPath } = req.body;
      if (!hostConfigId) {
        return res.status(400).json({ success: false, error: "hostConfigId is required." });
      }
      const remotePath = reqPath || "/";

      // Local file listing — validate path stays within allowed directories
      if (hostConfigId === "__local__") {
        const fs = require("fs");
        const pathMod = require("path");
        const resolvedPath = validateLocalPath(remotePath);
        if (!resolvedPath) {
          return res.status(400).json({ success: false, error: "Path not allowed." });
        }
        try {
          const items = fs.readdirSync(resolvedPath, { withFileTypes: true });
          const list = items.map((item: any) => {
            let size = 0;
            let modTime = "";
            try {
              const stat = fs.statSync(pathMod.join(resolvedPath, item.name));
              size = stat.size;
              modTime = stat.mtime.toISOString();
            } catch (_) { /* ignore stat errors for individual files */ }
            return { name: item.name, isDir: item.isDirectory(), size, modTime };
          });
          return res.json({ success: true, data: list, path: resolvedPath });
        } catch (err: any) {
          return res.status(500).json({ success: false, error: "Cannot read directory." });
        }
      }

      validateRemotePath(remotePath);
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
      if (req.file.size > 100 * 1024 * 1024) {
        return res.status(400).json({ success: false, error: "File too large (max 100MB)." });
      }
      validateRemotePath(remotePath);
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
      validateRemotePath(remotePath);
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
      validateRemotePath(remotePath);
      const fs = require("fs");
      const resolvedLocal = validateLocalPath(localPath);
      if (!resolvedLocal) {
        return res.status(400).json({ success: false, error: "Local path not allowed." });
      }
      if (!fs.existsSync(resolvedLocal)) {
        return res.status(404).json({ success: false, error: "Local file not found." });
      }
      const stat = fs.statSync(resolvedLocal);
      if (stat.isDirectory()) {
        return res.status(400).json({ success: false, error: "Cannot transfer a directory." });
      }
      if (stat.size > 100 * 1024 * 1024) {
        return res.status(400).json({ success: false, error: "File too large (max 100MB)." });
      }
      const fileBuffer = fs.readFileSync(resolvedLocal);
      const fileName = path.basename(resolvedLocal) || "file";
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
      validateRemotePath(remotePath);
      const resolvedLocal = validateLocalPath(localPath);
      if (!resolvedLocal) {
        return res.status(400).json({ success: false, error: "Local path not allowed." });
      }
      const result = await remoteHostService.sftpDownload(hostConfigId, remotePath);
      const fs = require("fs");
      const dir = require("path").dirname(resolvedLocal);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(resolvedLocal, result.buffer);
      await logActivity("RemoteHost", "Remote→Local", `Transferred "${result.fileName}" to ${resolvedLocal}`, "SUCCESS");
      return res.json({ success: true, message: `Downloaded to ${resolvedLocal}` });
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
      validateRemotePath(fromPath);
      validateRemotePath(toPath);
      const result = await remoteHostService.sftpRemoteToRemote(fromHostConfigId, fromPath, toHostConfigId, toPath);
      await logActivity("RemoteHost", "Remote→Remote", `Transferred ${fromPath} → ${toPath}`, "SUCCESS");
      return res.json({ success: true, message: result.message });
    } catch (err: any) {
      console.error(`[RemoteHost] remoteToRemote failed:`, err.message);
      return res.status(500).json({ success: false, error: "Transfer failed. Check logs for details." });
    }
  }
}

export const remoteHostController = new RemoteHostController();
