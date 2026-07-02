import { Router } from "express";
import { queryExplorerController } from "../controllers/query-explorer.controller";

const router = Router();

/**
   * @route   GET /api/v1/query-explorer/panels
   * @desc    Retrieve all query panels
   */
router.get("/panels", (req, res) => queryExplorerController.getQueryPanels(req, res));

/**
   * @route   POST /api/v1/query-explorer/panels
   * @desc    Create a new query panel
   */
router.post("/panels", (req, res) => queryExplorerController.createQueryPanel(req, res));

/**
   * @route   PUT /api/v1/query-explorer/panels/:id
   * @desc    Update an existing query panel
   */
router.put("/panels/:id", (req, res) => queryExplorerController.updateQueryPanel(req, res));

/**
   * @route   DELETE /api/v1/query-explorer/panels/:id
   * @desc    Delete a query panel
   */
router.delete("/panels/:id", (req, res) => queryExplorerController.deleteQueryPanel(req, res));

/**
   * @route   POST /api/v1/query-explorer/panels/:id/query
   * @desc    Execute query for a saved panel
   */
router.post("/panels/:id/query", (req, res) => queryExplorerController.executeQueryForPanel(req, res));

/**
   * @route   POST /api/v1/query-explorer/query-test
   * @desc    Test query configuration
   */
router.post("/query-test", (req, res) => queryExplorerController.testQuery(req, res));

export default router;
