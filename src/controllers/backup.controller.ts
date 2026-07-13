import { Request, Response } from "express";
import { backupService } from "../services/backup.service";
import { logActivity } from "../config/db";

class BackupController {
  // ---- Database Config ----
  public async getDbConfigs(req: Request, res: Response) {
    try {
      const configs = await backupService.getDbConfigs();
      return res.json({ success: true, data: configs });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  public async saveDbConfig(req: Request, res: Response) {
    try {
      const { id, name, dbType, host, port, username, password, databaseName, sshHost, sshPort, sshUser, sshAuth, sshPassword, sshKey } = req.body;
      if (!name || !dbType || !host || !port || !username || !password || !databaseName) {
        return res.status(400).json({ success: false, error: "Missing required fields." });
      }
      const cfg = await backupService.saveDbConfig({ id, name, dbType, host, port: parseInt(port, 10), username, password, databaseName, sshHost, sshPort: sshPort ? parseInt(sshPort, 10) : undefined, sshUser, sshAuth, sshPassword, sshKey });
      await logActivity("Backup", "Save DB Config", `Saved database config "${name}" (${dbType})`, "SUCCESS");
      return res.json({ success: true, data: cfg, message: `Database config "${name}" saved.` });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  public async deleteDbConfig(req: Request, res: Response) {
    try {
      await backupService.deleteDbConfig(req.params.id);
      await logActivity("Backup", "Delete DB Config", `Deleted database config ${req.params.id}`, "SUCCESS");
      return res.json({ success: true, message: "Database config deleted." });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  public async testDbConnection(req: Request, res: Response) {
    try {
      const { name, dbType, host, port, username, password, databaseName, sshHost, sshPort, sshUser, sshAuth, sshPassword, sshKey } = req.body;
      const result = await backupService.testDbConnection({ id: "test", name: name || "Test", dbType, host, port: parseInt(port, 10), username, password, databaseName, sshHost, sshPort: sshPort ? parseInt(sshPort, 10) : undefined, sshUser, sshAuth, sshPassword, sshKey } as any);
      return res.json(result);
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  // ---- Destinations ----
  public async getDestinations(req: Request, res: Response) {
    try {
      const dests = await backupService.getDestinations();
      return res.json({ success: true, data: dests });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  public async saveDestination(req: Request, res: Response) {
    try {
      const { id, name, destType, config } = req.body;
      if (!name || !destType) {
        return res.status(400).json({ success: false, error: "Missing required fields." });
      }
      const dest = await backupService.saveDestination({ id, name, destType, config: config || {} });
      await logActivity("Backup", "Save Destination", `Saved backup destination "${name}" (${destType})`, "SUCCESS");
      return res.json({ success: true, data: dest, message: `Destination "${name}" saved.` });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  public async deleteDestination(req: Request, res: Response) {
    try {
      await backupService.deleteDestination(req.params.id);
      await logActivity("Backup", "Delete Destination", `Deleted backup destination ${req.params.id}`, "SUCCESS");
      return res.json({ success: true, message: "Destination deleted." });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  // ---- Backup Execution ----
  public async runBackup(req: Request, res: Response) {
    try {
      const { dbConfigId, destinationId } = req.body;
      if (!dbConfigId || !destinationId) {
        return res.status(400).json({ success: false, error: "dbConfigId and destinationId are required." });
      }
      const result = await backupService.executeBackup(dbConfigId, destinationId);
      await logActivity("Backup", "Run Backup", `Backup completed: ${result.filename} (${result.status})`, result.status === "success" ? "SUCCESS" : "ERROR");
      return res.json({ success: true, data: result, message: `Backup ${result.status}: ${result.filename}` });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  // ---- History ----
  public async getHistory(req: Request, res: Response) {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;
      const history = await backupService.getHistory(limit, offset);
      const total = await backupService.getHistoryCount();
      return res.json({ success: true, data: history, total });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  public async deleteHistory(req: Request, res: Response) {
    try {
      await backupService.deleteHistory(req.params.id);
      return res.json({ success: true, message: "History entry deleted." });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }
}

export const backupController = new BackupController();
