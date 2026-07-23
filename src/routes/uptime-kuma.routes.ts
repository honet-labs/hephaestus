import { Router, Request, Response } from "express";
import { uptimeKumaService } from "../services/uptime-kuma.service";
import { query, logActivity } from "../config/db";
import { requireRole } from "../middleware/role.middleware";

const router = Router();

// Get all configs
router.get("/configs", requireRole("ADMIN"), async (req: Request, res: Response) => {
  try {
    const configs = await uptimeKumaService.getConfigs();
    const sanitized = configs.map(c => ({ ...c, password: "••••••••" }));
    res.status(200).json({ success: true, data: sanitized });
  } catch (error: any) {
    res.status(500).json({ success: false, error: "Failed to retrieve configurations." });
  }
});

// Save config
router.post("/configs", requireRole("ADMIN"), async (req: Request, res: Response) => {
  try {
    const { name, url, username, password } = req.body;
    if (!name || !url || !username || !password) {
      res.status(400).json({ success: false, error: "All fields are required" });
      return;
    }

    const id = `uk-${Date.now()}`;
    await query(
      `INSERT INTO uptime_kuma_configs (id, name, url, username, password, is_active) VALUES ($1, $2, $3, $4, $5, true)`,
      [id, name, url, username, password]
    );

    // Deactivate others
    await query(`UPDATE uptime_kuma_configs SET is_active = false WHERE id != $1`, [id]);

    await uptimeKumaService.loadConfigs();
    await uptimeKumaService.setActiveConfig(id);
    await logActivity("Uptime Kuma", "Save Config", `Saved Uptime Kuma config "${name}"`, "SUCCESS");

    res.status(201).json({ success: true, id, message: "Config saved and activated" });
  } catch (error: any) {
    res.status(500).json({ success: false, error: "Failed to save configuration." });
  }
});

// Test connection
router.post("/test", requireRole("ADMIN"), async (req: Request, res: Response) => {
  try {
    const { url, username, password } = req.body;
    const result = await uptimeKumaService.testConnection(url, username, password);
    res.status(200).json({ success: true, ...result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: "Failed to test connection." });
  }
});

// Test config by ID
router.post("/configs/:id/test", requireRole("ADMIN"), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const configs = await uptimeKumaService.getConfigs();
    const config = configs.find(c => c.id === id);
    if (!config) {
      res.status(404).json({ success: false, error: "Config not found" });
      return;
    }
    const result = await uptimeKumaService.testConnection(config.url, config.username, config.password);
    res.status(200).json({ success: true, ...result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: "Failed to test connection." });
  }
});

// Delete config
router.delete("/configs/:id", requireRole("ADMIN"), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await query(`DELETE FROM uptime_kuma_configs WHERE id = $1`, [id]);
    await uptimeKumaService.loadConfigs();
    await logActivity("Uptime Kuma", "Delete Config", `Deleted Uptime Kuma config`, "SUCCESS");
    res.status(200).json({ success: true, message: "Config deleted" });
  } catch (error: any) {
    res.status(500).json({ success: false, error: "Failed to delete configuration." });
  }
});

// List monitors (used by Query Explorer)
router.get("/monitors", requireRole("ADMIN"), async (req: Request, res: Response) => {
  try {
    const { group, type, status } = req.query;
    const monitors = await uptimeKumaService.getMonitors({
      group: group as string,
      type: type as string,
      status: status ? parseInt(status as string, 10) : undefined
    });
    res.status(200).json({ success: true, data: monitors });
  } catch (error: any) {
    res.status(500).json({ success: false, error: "Failed to retrieve monitors." });
  }
});

// Get single monitor (used by Query Explorer)
router.get("/monitors/:id", requireRole("ADMIN"), async (req: Request, res: Response) => {
  try {
    const monitor = await uptimeKumaService.getMonitorById(parseInt(req.params.id, 10));
    res.status(200).json({ success: true, data: monitor });
  } catch (error: any) {
    res.status(500).json({ success: false, error: "Failed to retrieve monitor." });
  }
});

// Query endpoint for Query Explorer integration
router.post("/query", requireRole("ADMIN"), async (req: Request, res: Response) => {
  try {
    const { monitorId } = req.body;

    const monitors = await uptimeKumaService.getMonitors();

    let data: any[] = [];

    if (monitorId) {
      const monitor = monitors.find(m => m.id === monitorId);
      if (monitor) {
        data = [{
          timestamp: new Date().toISOString(),
          monitor_name: monitor.name,
          status: monitor.status === 1 ? "UP" : monitor.status === 0 ? "DOWN" : "PENDING",
          uptime_pct: monitor.uptime || 0,
          response_ms: monitor.avgResponse || 0
        }];
      }
    } else {
      data = monitors.map(m => ({
        timestamp: new Date().toISOString(),
        monitor_name: m.name,
        status: m.status === 1 ? "UP" : m.status === 0 ? "DOWN" : "PENDING",
        uptime_pct: m.uptime || 0,
        response_ms: m.avgResponse || 0
      }));
    }

    res.status(200).json({ success: true, data });
  } catch (error: any) {
    res.status(500).json({ success: false, error: "Failed to execute query." });
  }
});

export default router;