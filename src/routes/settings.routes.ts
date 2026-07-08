import { Router } from "express";
import { settingsController } from "../controllers/settings.controller";
import { requireRole } from "../middleware/role.middleware";
import { query } from "../config/db";

const router = Router();

/**
 * @route   GET /api/v1/settings/overview
 * @desc    Get dashboard overview stats (connection counts, storage status, recent activity)
 * @access  Admin
 */
router.get("/overview", requireRole("ADMIN"), async (req, res) => {
  try {
    const [grafanaCount, prometheusCount, uptimeCount, dbCheck, recentActivity] = await Promise.all([
      query("SELECT COUNT(*) AS count FROM grafana_configs"),
      query("SELECT COUNT(*) AS count FROM prometheus_configs"),
      query("SELECT COUNT(*) AS count FROM uptime_kuma_configs"),
      query("SELECT 1 AS ok"),
      query("SELECT module, action, status, TO_CHAR(timestamp, 'HH24:MI:SS') AS time FROM activity_logs ORDER BY timestamp DESC LIMIT 10")
    ]);

    const gCount = grafanaCount.rows[0] ? parseInt(grafanaCount.rows[0].count) : 0;
    const pCount = prometheusCount.rows[0] ? parseInt(prometheusCount.rows[0].count) : 0;
    const uCount = uptimeCount.rows[0] ? parseInt(uptimeCount.rows[0].count) : 0;

    // Fetch actual connection lists
    const [resG, resP, resU] = await Promise.all([
      query("SELECT id, name, host, is_active FROM grafana_configs ORDER BY name"),
      query("SELECT id, name, ssh_host AS \"sshHost\", path, is_active FROM prometheus_configs ORDER BY name"),
      query("SELECT id, name, url, is_active FROM uptime_kuma_configs ORDER BY name")
    ]);

    return res.status(200).json({
      success: true,
      data: {
        totalConnections: gCount + pCount + uCount,
        grafanaCount: gCount,
        prometheusCount: pCount,
        uptimeCount: uCount,
        storage: { connected: dbCheck.rows.length > 0, engine: "PostgreSQL" },
        recentActivity: recentActivity.rows,
        connections: [
          ...resG.rows.map((r: any) => ({ name: r.name, type: "Grafana", endpoint: r.host, isActive: r.is_active })),
          ...resP.rows.map((r: any) => ({ name: r.name, type: "Prometheus", endpoint: r.sshHost || r.path || "-", isActive: r.is_active })),
          ...resU.rows.map((r: any) => ({ name: r.name, type: "Uptime Kuma", endpoint: r.url, isActive: r.is_active }))
        ]
      }
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * @route   GET /api/v1/settings/grafana
 * @desc    Get current Grafana integration configuration
 * @access  Admin
 */
router.get("/grafana", requireRole("ADMIN"), (req, res) => settingsController.getGrafanaSettings(req, res));

/**
 * @route   GET /api/v1/settings/grafana/datasources
 * @desc    Get all datasources available on Grafana server
 * @access  Admin
 */
router.get("/grafana/datasources", requireRole("ADMIN"), (req, res) => settingsController.getGrafanaDatasources(req, res));

/**
 * @route   POST /api/v1/settings/grafana
 * @desc    Perform Grafana connection testing, saving, and resetting configurations
 * @access  Admin
 */
router.post("/grafana", requireRole("ADMIN"), (req, res) => settingsController.handleGrafanaSettingsAction(req, res));

/**
 * Multiple Grafana Configs management
 */
router.get("/grafana/configs", requireRole("ADMIN"), (req, res) => settingsController.getConfigsList(req, res));
router.post("/grafana/configs", requireRole("ADMIN"), (req, res) => settingsController.saveOrUpdateConfig(req, res));
router.delete("/grafana/configs/:id", requireRole("ADMIN"), (req, res) => settingsController.deleteConfig(req, res));
router.post("/grafana/configs/:id/activate", requireRole("ADMIN"), (req, res) => settingsController.activateConfig(req, res));
router.post("/grafana/configs/:id/test", requireRole("ADMIN"), (req, res) => settingsController.testConfigConnection(req, res));

export default router;
