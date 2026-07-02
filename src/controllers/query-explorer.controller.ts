import { Request, Response } from "express";
import { queryExplorerService } from "../services/query-explorer.service";
import { logActivity } from "../config/db";

export class QueryExplorerController {
  /**
   * GET /api/v1/query-explorer/panels
   * Retrieve all registered query panels
   */
  public async getQueryPanels(req: Request, res: Response): Promise<void> {
    try {
      const panels = await queryExplorerService.getQueryPanels();
      res.status(200).json({
        success: true,
        data: panels
      });
    } catch (error: any) {
      console.error("[QueryExplorerController] getQueryPanels error:", error);
      res.status(500).json({
        success: false,
        error: "Internal Server Error",
        message: error.message || "Failed to retrieve query panels."
      });
    }
  }

  /**
   * POST /api/v1/query-explorer/panels
   * Create a new query panel
   */
  public async createQueryPanel(req: Request, res: Response): Promise<void> {
    try {
      const { name, description, datasourceType, datasourceUid, timeRangeFrom, timeRangeTo, step, columns } = req.body;

      if (!name || typeof name !== "string" || name.trim() === "") {
        res.status(400).json({
          success: false,
          error: "Validation Error",
          message: "Panel name is required."
        });
        return;
      }

      if (!datasourceUid) {
        res.status(400).json({
          success: false,
          error: "Validation Error",
          message: "Datasource UID is required."
        });
        return;
      }

      if (!columns || !Array.isArray(columns) || columns.length === 0) {
        res.status(400).json({
          success: false,
          error: "Validation Error",
          message: "At least one query column is required."
        });
        return;
      }

      const created = await queryExplorerService.saveQueryPanel({
        name,
        description,
        datasourceType: datasourceType || "grafana",
        datasourceUid,
        timeRangeFrom,
        timeRangeTo,
        step,
        columns
      });

      await logActivity("Query Explorer", "Create Panel", `Created query panel "${name}"`, "SUCCESS");

      res.status(201).json({
        success: true,
        data: created
      });
    } catch (error: any) {
      console.error("[QueryExplorerController] createQueryPanel error:", error);
      res.status(500).json({
        success: false,
        error: "Internal Server Error",
        message: error.message || "Failed to create query panel."
      });
    }
  }

  /**
   * PUT /api/v1/query-explorer/panels/:id
   * Update an existing query panel
   */
  public async updateQueryPanel(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { name, description, datasourceType, datasourceUid, timeRangeFrom, timeRangeTo, step, columns } = req.body;

      if (!name || typeof name !== "string" || name.trim() === "") {
        res.status(400).json({
          success: false,
          error: "Validation Error",
          message: "Panel name is required."
        });
        return;
      }

      const existing = await queryExplorerService.getQueryPanelById(id);
      if (!existing) {
        res.status(404).json({
          success: false,
          error: "Not Found",
          message: `Query panel with ID ${id} not found.`
        });
        return;
      }

      const updated = await queryExplorerService.saveQueryPanel({
        id,
        name,
        description,
        datasourceType: datasourceType || "grafana",
        datasourceUid,
        timeRangeFrom,
        timeRangeTo,
        step,
        columns
      });

      await logActivity("Query Explorer", "Update Panel", `Updated query panel "${name}"`, "SUCCESS");

      res.status(200).json({
        success: true,
        data: updated
      });
    } catch (error: any) {
      console.error("[QueryExplorerController] updateQueryPanel error:", error);
      res.status(500).json({
        success: false,
        error: "Internal Server Error",
        message: error.message || "Failed to update query panel."
      });
    }
  }

  /**
   * DELETE /api/v1/query-explorer/panels/:id
   * Delete a query panel
   */
  public async deleteQueryPanel(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const existing = await queryExplorerService.getQueryPanelById(id);
      
      if (!existing) {
        res.status(404).json({
          success: false,
          error: "Not Found",
          message: `Query panel with ID ${id} not found.`
        });
        return;
      }

      await queryExplorerService.deleteQueryPanel(id);
      await logActivity("Query Explorer", "Delete Panel", `Deleted query panel "${existing.name}"`, "SUCCESS");

      res.status(200).json({
        success: true,
        message: "Query panel deleted successfully."
      });
    } catch (error: any) {
      console.error("[QueryExplorerController] deleteQueryPanel error:", error);
      res.status(500).json({
        success: false,
        error: "Internal Server Error",
        message: error.message || "Failed to delete query panel."
      });
    }
  }

  /**
   * POST /api/v1/query-explorer/panels/:id/query
   * Execute query for a saved panel
   */
  public async executeQueryForPanel(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const panel = await queryExplorerService.getQueryPanelById(id);

      if (!panel) {
        res.status(404).json({
          success: false,
          error: "Not Found",
          message: `Query panel with ID ${id} not found.`
        });
        return;
      }

      // Allow overriding parameters from request body for testing/customizing time range
      const timeRangeFrom = req.body.timeRangeFrom || panel.timeRangeFrom;
      const timeRangeTo = req.body.timeRangeTo || panel.timeRangeTo;
      const step = req.body.step || panel.step;

      const data = await queryExplorerService.executeQuery(
        panel.datasourceUid,
        timeRangeFrom,
        timeRangeTo,
        step,
        panel.columns
      );

      res.status(200).json({
        success: true,
        data
      });
    } catch (error: any) {
      console.error("[QueryExplorerController] executeQueryForPanel error:", error);
      res.status(500).json({
        success: false,
        error: "Query Execution Error",
        message: error.message || "Failed to execute query for panel."
      });
    }
  }

  /**
   * POST /api/v1/query-explorer/query-test
   * Dry run execution to test query before saving
   */
  public async testQuery(req: Request, res: Response): Promise<void> {
    try {
      const { datasourceUid, timeRangeFrom, timeRangeTo, step, columns } = req.body;

      if (!datasourceUid) {
        res.status(400).json({
          success: false,
          error: "Validation Error",
          message: "Datasource UID is required."
        });
        return;
      }

      if (!columns || !Array.isArray(columns) || columns.length === 0) {
        res.status(400).json({
          success: false,
          error: "Validation Error",
          message: "Columns config is required."
        });
        return;
      }

      const data = await queryExplorerService.executeQuery(
        datasourceUid,
        timeRangeFrom || "now-1h",
        timeRangeTo || "now",
        step || "1m",
        columns
      );

      res.status(200).json({
        success: true,
        data
      });
    } catch (error: any) {
      console.error("[QueryExplorerController] testQuery error:", error);
      res.status(500).json({
        success: false,
        error: "Query Test Error",
        message: error.message || "Failed to test query config."
      });
    }
  }
}

export const queryExplorerController = new QueryExplorerController();
