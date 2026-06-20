import { Request, Response } from "express";
import { grafanaService } from "../services/grafana.service";

export class ReportController {
  /**
   * Handler for querying CPU load metric report
   * POST /api/v1/report/cpu
   */
  public async getCpuReport(req: Request, res: Response): Promise<void> {
    try {
      const from_date_val = req.body.from_date || req.body.fromDate;
      const to_date_val = req.body.to_date || req.body.toDate;
      const target_router_val = req.body.target_router || req.body.target;
      const query_expression_val = req.body.query_expression || req.body.queryExpression || req.body.query;

      // 1. Build PromQL query expression
      let expr = query_expression_val && typeof query_expression_val === "string" ? query_expression_val.trim() : "";
      const targetRouter = target_router_val && typeof target_router_val === "string" ? target_router_val.trim() : "";

      if (!expr) {
        if (!targetRouter) {
          res.status(400).json({
            success: false,
            error: "Validation Error",
            message: "Parameter 'query' (PromQL expression) or 'target' (Router Label) is required."
          });
          return;
        }
        expr = `mktxp_system_cpu_load{routerboard_name="${targetRouter}"}`;
      }

      // Read optional Advanced Query parameters
      const format = req.body.format && typeof req.body.format === "string" ? req.body.format : "time_series";
      const intervalMs = req.body.intervalMs !== undefined 
        ? Number(req.body.intervalMs) 
        : (req.body.interval !== undefined ? Number(req.body.interval) : 60000);
      const maxDataPoints = req.body.maxDataPoints !== undefined ? Number(req.body.maxDataPoints) : 1000;

      // 2. Set default dates if not provided
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

      const fromVal = from_date_val !== undefined && from_date_val !== null ? from_date_val : oneHourAgo.toISOString();
      const toVal = to_date_val !== undefined && to_date_val !== null ? to_date_val : now.toISOString();

      console.log(`[ReportController] Request received. Query: "${expr}", Range: [${fromVal}] -> [${toVal}]`);

      // 3. Invoke service to fetch and sanitize Grafana data
      const dataPoints = await grafanaService.queryCpuLoad({
        from: fromVal,
        to: toVal,
        expr: expr,
        format: format,
        intervalMs: intervalMs,
        maxDataPoints: maxDataPoints,
        datasourceUid: req.body.datasourceUid && typeof req.body.datasourceUid === "string" ? req.body.datasourceUid : undefined,
        datasourceType: req.body.datasourceType && typeof req.body.datasourceType === "string" ? req.body.datasourceType : undefined
      });

      // 4. Return clean, formatted response
      res.status(200).json({
        success: true,
        meta: {
          query_expression: expr,
          format: format,
          interval_ms: intervalMs,
          max_datapoints: maxDataPoints,
          from_parsed: fromVal,
          to_parsed: toVal,
          datapoints_count: dataPoints.length
        },
        data: dataPoints
      });
    } catch (error: any) {
      console.error("[ReportController] Error in getCpuReport:", error.message);

      // Map service errors to appropriate HTTP status codes
      let statusCode = 500;
      const message = error.message || "An internal error occurred while generating the report.";

      if (message.includes("authentication failed") || message.includes("Unauthorized")) {
        statusCode = 401;
      } else if (message.includes("access forbidden") || message.includes("forbidden")) {
        statusCode = 403;
      } else if (message.includes("Invalid date") || message.includes("bad request") || message.includes("400")) {
        statusCode = 400;
      } else if (message.includes("endpoint not found") || message.includes("404")) {
        statusCode = 404;
      }

      res.status(statusCode).json({
        success: false,
        error: statusCode === 500 ? "Internal Server Error" : "Grafana Integration Error",
        message: message
      });
    }
  }
}

export const reportController = new ReportController();
