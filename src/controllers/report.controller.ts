import { Request, Response } from "express";
import { grafanaService } from "../services/grafana.service";

export class ReportController {
  /**
   * Handler for querying CPU load metric report
   * POST /api/v1/report/cpu
   */
  public async getCpuReport(req: Request, res: Response): Promise<void> {
    try {
      const { from_date, to_date, target_router } = req.body;

      // 1. Validate required fields
      if (!target_router || typeof target_router !== "string" || target_router.trim() === "") {
        res.status(400).json({
          success: false,
          error: "Validation Error",
          message: "The parameter 'target_router' is required and must be a non-empty string."
        });
        return;
      }

      // 2. Set default dates if not provided
      // Default from_date to 1 hour ago, to_date to current time
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

      const fromVal = from_date !== undefined && from_date !== null ? from_date : oneHourAgo.toISOString();
      const toVal = to_date !== undefined && to_date !== null ? to_date : now.toISOString();

      console.log(`[ReportController] Request received. Router: "${target_router}", Range: [${fromVal}] -> [${toVal}]`);

      // 3. Invoke service to fetch and sanitize Grafana data
      const dataPoints = await grafanaService.queryCpuLoad({
        from: fromVal,
        to: toVal,
        targetRouter: target_router.trim()
      });

      // 4. Return clean, formatted response
      res.status(200).json({
        success: true,
        meta: {
          target_router: target_router.trim(),
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
