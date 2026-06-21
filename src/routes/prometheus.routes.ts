import { Router } from "express";
import { prometheusController } from "../controllers/prometheus.controller";

const router = Router();

/**
 * @route   GET /api/v1/prometheus/config
 * @desc    Get current Prometheus configuration file path and content
 * @access  Admin
 */
router.get("/config", (req, res) => prometheusController.getConfig(req, res));

/**
 * @route   POST /api/v1/prometheus/config/validate
 * @desc    Validate a Prometheus configuration YAML content without saving
 * @access  Admin
 */
router.post("/config/validate", (req, res) => prometheusController.validateConfig(req, res));

/**
 * @route   POST /api/v1/prometheus/config
 * @desc    Validate, save, and reload Prometheus configuration
 * @access  Admin
 */
router.post("/config", (req, res) => prometheusController.saveConfig(req, res));

// Config profile management
router.get("/configs", (req, res) => prometheusController.getConfigsList(req, res));
router.post("/configs", (req, res) => prometheusController.saveConfigProfile(req, res));
router.delete("/configs/:id", (req, res) => prometheusController.deleteConfigProfile(req, res));
router.post("/configs/:id/activate", (req, res) => prometheusController.activateConfigProfile(req, res));
router.post("/configs/:id/test", (req, res) => prometheusController.testConnectionById(req, res));
router.post("/configs/test", (req, res) => prometheusController.testConnection(req, res));

export default router;
