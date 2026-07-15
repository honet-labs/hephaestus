import { Request, Response } from "express";
import { remoteHostService } from "../services/remote-host.service";
import { logActivity } from "../config/db";

class RemoteHostController {
  public async getConfigs(req: Request, res: Response) {
    try {
      const configs = await remoteHostService.getConfigs();
      return res.json({ success: true, data: configs });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  public async saveConfig(req: Request, res: Response) {
    try {
      const { id, name, host, port, username, authType, password, sshKey } = req.body;
      if (!name || !host || !username) {
        return res.status(400).json({ success: false, error: "Missing required fields." });
      }
      const cfg = await remoteHostService.saveConfig({
        id, name, host, port: port ? parseInt(port, 10) : 22,
        username, authType: authType || "password", password, sshKey,
      });
      await logActivity("RemoteHost", "Save Config", `Saved host config "${name}" (${host})`, "SUCCESS");
      return res.json({ success: true, data: cfg, message: `Host "${name}" saved.` });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  public async deleteConfig(req: Request, res: Response) {
    try {
      await remoteHostService.deleteConfig(req.params.id);
      await logActivity("RemoteHost", "Delete Config", `Deleted host config ${req.params.id}`, "SUCCESS");
      return res.json({ success: true, message: "Host config deleted." });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }
}

export const remoteHostController = new RemoteHostController();
