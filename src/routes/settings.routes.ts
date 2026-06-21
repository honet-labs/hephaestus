import { Router } from "express";
import { settingsController } from "../controllers/settings.controller";

const router = Router();

/**
 * @route   GET /api/v1/settings/grafana
 * @desc    Get current Grafana integration configuration
 * @access  Admin
 */
router.get("/grafana", (req, res) => settingsController.getGrafanaSettings(req, res));

/**
 * @route   GET /api/v1/settings/grafana/datasources
 * @desc    Get all datasources available on Grafana server
 * @access  Admin
 */
router.get("/grafana/datasources", (req, res) => settingsController.getGrafanaDatasources(req, res));

/**
 * @route   POST /api/v1/settings/grafana
 * @desc    Perform Grafana connection testing, saving, and resetting configurations
 * @access  Admin
 */
router.post("/grafana", (req, res) => settingsController.handleGrafanaSettingsAction(req, res));

/**
 * Multiple Grafana Configs management
 */
router.get("/grafana/configs", (req, res) => settingsController.getConfigsList(req, res));
router.post("/grafana/configs", (req, res) => settingsController.saveOrUpdateConfig(req, res));
router.delete("/grafana/configs/:id", (req, res) => settingsController.deleteConfig(req, res));
router.post("/grafana/configs/:id/activate", (req, res) => settingsController.activateConfig(req, res));
router.post("/grafana/configs/:id/test", (req, res) => settingsController.testConfigConnection(req, res));

export default router;
