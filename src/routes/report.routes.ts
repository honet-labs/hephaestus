import { Router } from "express";
import { reportController } from "../controllers/report.controller";

const router = Router();

/**
 * @route   POST /api/v1/report/cpu
 * @desc    Get CPU utilization telemetry parsed from Grafana HTTP API
 * @access  Public / Authorized (Depending on UI auth integration)
 */
router.post("/cpu", (req, res) => reportController.getCpuReport(req, res));

export default router;
