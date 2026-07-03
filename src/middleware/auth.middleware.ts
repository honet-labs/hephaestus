import { Request, Response, NextFunction } from "express";
import { query } from "../config/db";

export async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  // Bypass validation for authentication endpoints
  const path = req.path;
  if (path === "/users/login" || path === "/users/session") {
    return next();
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({
      success: false,
      error: "Unauthorized",
      message: "Authentication token is missing or invalid."
    });
    return;
  }

  const token = authHeader.split(" ")[1];

  try {
    const sessionRes = await query(
      `SELECT s.user_id, u.username, u.role 
       FROM user_sessions s
       JOIN users u ON s.user_id = u.id
       WHERE s.token = $1 AND s.expires_at > NOW()`,
      [token]
    );

    if (sessionRes.rowCount === 0) {
      res.status(401).json({
        success: false,
        error: "Unauthorized",
        message: "Session is invalid or expired."
      });
      return;
    }

    // Attach user context to request object
    (req as any).user = {
      id: sessionRes.rows[0].user_id,
      username: sessionRes.rows[0].username,
      role: sessionRes.rows[0].role
    };

    next();
  } catch (error: any) {
    console.error("[AuthMiddleware] Session verification error:", error);
    res.status(500).json({
      success: false,
      error: "Internal Server Error",
      message: "Failed to verify session."
    });
  }
}
