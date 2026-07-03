import { Router } from "express";
import { monitoringViewController } from "../controllers/monitoring-view.controller";
import { requireRole } from "../middleware/role.middleware";

const router = Router();

/**
 * @route   GET /api/v1/monitoring-views
 * @desc    Get all registered monitoring views
 * @access  Authenticated
 */
router.get("/", monitoringViewController.getViews);

/**
 * @route   POST /api/v1/monitoring-views
 * @desc    Create a new monitoring view
 * @access  Admin
 */
router.post("/", requireRole("ADMIN"), monitoringViewController.createView);

/**
 * @route   PUT /api/v1/monitoring-views/:id
 * @desc    Update an existing monitoring view
 * @access  Admin
 */
router.put("/:id", requireRole("ADMIN"), monitoringViewController.updateView);

/**
 * @route   DELETE /api/v1/monitoring-views/:id
 * @desc    Delete a monitoring view
 * @access  Admin
 */
router.delete("/:id", requireRole("ADMIN"), monitoringViewController.deleteView);

export default router;
