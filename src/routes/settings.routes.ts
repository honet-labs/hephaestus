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

export default router;
