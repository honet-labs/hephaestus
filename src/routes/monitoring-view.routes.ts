import { Router } from "express";
import { monitoringViewController } from "../controllers/monitoring-view.controller";

const router = Router();

/**
 * @route   GET /api/v1/monitoring-views
 * @desc    Get all registered monitoring views
 * @access  Public
 */
router.get("/", monitoringViewController.getViews);

/**
 * @route   POST /api/v1/monitoring-views
 * @desc    Create a new monitoring view
 * @access  Public
 */
router.post("/", monitoringViewController.createView);

/**
 * @route   PUT /api/v1/monitoring-views/:id
 * @desc    Update an existing monitoring view
 * @access  Public
 */
router.put("/:id", monitoringViewController.updateView);

/**
 * @route   DELETE /api/v1/monitoring-views/:id
 * @desc    Delete a monitoring view
 * @access  Public
 */
router.delete("/:id", monitoringViewController.deleteView);

export default router;
