import { Request, Response } from "express";
import { query, logActivity } from "../config/db";

export class ActivityLogController {
  // Get activity logs with pagination and filters
  public async getLogs(req: Request, res: Response): Promise<void> {
    try {
      const page = parseInt(req.query.page as string || "1", 10);
      const limit = parseInt(req.query.limit as string || "20", 10);
      const search = req.query.search as string || "";
      const moduleFilter = req.query.module as string || "";
      const statusFilter = req.query.status as string || "";

      const offset = (page - 1) * limit;

      let whereClause = "";
      const params: any[] = [];
      let paramCount = 1;

      const conditions: string[] = [];

      if (search) {
        conditions.push(`(details ILIKE $${paramCount} OR action ILIKE $${paramCount} OR module ILIKE $${paramCount})`);
        params.push(`%${search}%`);
        paramCount++;
      }

      if (moduleFilter) {
        conditions.push(`module = $${paramCount}`);
        params.push(moduleFilter);
        paramCount++;
      }

      if (statusFilter) {
        conditions.push(`status = $${paramCount}`);
        params.push(statusFilter);
        paramCount++;
      }

      if (conditions.length > 0) {
        whereClause = "WHERE " + conditions.join(" AND ");
      }

      // Query total count
      const countRes = await query(
        `SELECT COUNT(*) as total FROM activity_logs ${whereClause}`,
        params
      );
      const total = parseInt(countRes.rows[0].total, 10);

      // Query logs
      const logsRes = await query(
        `SELECT al.id, al.timestamp, al.module, al.action, al.details, al.status, al.user_id, u.username
         FROM activity_logs al
         LEFT JOIN users u ON al.user_id = u.id
         ${whereClause}
         ORDER BY al.timestamp DESC
         LIMIT $${paramCount} OFFSET $${paramCount + 1}`,
        [...params, limit, offset]
      );

      res.status(200).json({
        success: true,
        data: logsRes.rows,
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit)
        }
      });
    } catch (error: any) {
      console.error("[ActivityLogController] Get logs error:", error);
      res.status(500).json({
        success: false,
        error: "Internal Server Error",
        message: "Failed to fetch activity logs"
      });
    }
  }

  // Clear all activity logs
  public async clearLogs(req: Request, res: Response): Promise<void> {
    try {
      await query("TRUNCATE TABLE activity_logs");
      await logActivity("System", "Clear Logs", "All activity logs have been cleared", "SUCCESS");

      res.status(200).json({
        success: true,
        message: "Activity logs cleared successfully."
      });
    } catch (error: any) {
      console.error("[ActivityLogController] Clear logs error:", error);
      res.status(500).json({
        success: false,
        error: "Internal Server Error",
        message: "Failed to clear activity logs"
      });
    }
  }
}

export const activityLogController = new ActivityLogController();
