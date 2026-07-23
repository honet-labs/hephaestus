import { Router } from "express";
import { queryExplorerController } from "../controllers/query-explorer.controller";
import { requireRole } from "../middleware/role.middleware";

const router = Router();

router.get("/panels", requireRole("ADMIN"), (req, res) => queryExplorerController.getQueryPanels(req, res));

/**
   * @route   GET /api/v1/query-explorer/metadata
   * @desc    Retrieve metrics metadata from target datasource
   */
router.get("/metadata", requireRole("ADMIN"), (req, res) => queryExplorerController.getMetricsMetadata(req, res));

/**
   * @route   POST /api/v1/query-explorer/panels
   * @desc    Create a new query panel
   */
router.post("/panels", requireRole("ADMIN"), (req, res) => queryExplorerController.createQueryPanel(req, res));

/**
   * @route   PUT /api/v1/query-explorer/panels/:id
   * @desc    Update an existing query panel
   */
router.put("/panels/:id", requireRole("ADMIN"), (req, res) => queryExplorerController.updateQueryPanel(req, res));

/**
   * @route   DELETE /api/v1/query-explorer/panels/:id
   * @desc    Delete a query panel
   */
router.delete("/panels/:id", requireRole("ADMIN"), (req, res) => queryExplorerController.deleteQueryPanel(req, res));

/**
   * @route   POST /api/v1/query-explorer/panels/:id/query
   * @desc    Execute query for a saved panel
   */
router.post("/panels/:id/query", requireRole("ADMIN"), (req, res) => queryExplorerController.executeQueryForPanel(req, res));

/**
   * @route   POST /api/v1/query-explorer/query-test
   * @desc    Test query configuration
   */
router.post("/query-test", requireRole("ADMIN"), (req, res) => queryExplorerController.testQuery(req, res));

export default router;
