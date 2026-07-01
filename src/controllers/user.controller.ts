import { Request, Response } from "express";
import crypto from "crypto";
import { query, logActivity } from "../config/db";

export class UserController {
  // List Users
  public async listUsers(req: Request, res: Response): Promise<void> {
    try {
      const result = await query(
        `SELECT id, username, email, role, created_at AS "createdAt" FROM users ORDER BY id ASC`
      );
      res.status(200).json({
        success: true,
        data: result.rows
      });
    } catch (error: any) {
      console.error("[UserController] List users error:", error);
      res.status(500).json({
        success: false,
        error: "Internal Server Error",
        message: error.message
      });
    }
  }

  // Add User
  public async addUser(req: Request, res: Response): Promise<void> {
    try {
      const { username, email, password, role } = req.body;

      if (!username || !email || !password) {
        res.status(400).json({
          success: false,
          error: "Validation Error",
          message: "Username, email, and password are required."
        });
        return;
      }

      // Check if username or email already exists
      const checkExists = await query(
        "SELECT 1 FROM users WHERE username = $1 OR email = $2",
        [username.trim(), email.trim()]
      );

      if (checkExists.rowCount && checkExists.rowCount > 0) {
        res.status(400).json({
          success: false,
          error: "Conflict",
          message: "Username or email already exists."
        });
        return;
      }

      const passwordHash = crypto.createHash("sha256").update(password).digest("hex");
      const targetRole = role || "operator";

      const insertResult = await query(
        `INSERT INTO users (username, email, password, role) VALUES ($1, $2, $3, $4) RETURNING id`,
        [username.trim(), email.trim(), passwordHash, targetRole]
      );

      const newUserId = insertResult.rows[0].id;
      
      await logActivity(
        "User Management", 
        "Create User", 
        `Created user "${username}" with role "${targetRole}" (ID: ${newUserId})`,
        "SUCCESS"
      );

      res.status(201).json({
        success: true,
        message: "User created successfully.",
        userId: newUserId
      });
    } catch (error: any) {
      console.error("[UserController] Add user error:", error);
      res.status(500).json({
        success: false,
        error: "Internal Server Error",
        message: error.message
      });
    }
  }

  // Delete User
  public async deleteUser(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      // Get user details first for logging
      const userRes = await query("SELECT username FROM users WHERE id = $1", [id]);
      if (userRes.rowCount === 0) {
        res.status(404).json({
          success: false,
          error: "Not Found",
          message: "User not found."
        });
        return;
      }

      const username = userRes.rows[0].username;

      // Prevent self-deletion of sysadmin
      if (username === "sysadmin") {
        res.status(400).json({
          success: false,
          error: "Forbidden",
          message: "The default system admin 'sysadmin' cannot be deleted."
        });
        return;
      }

      await query("DELETE FROM users WHERE id = $1", [id]);

      await logActivity(
        "User Management", 
        "Delete User", 
        `Deleted user "${username}" (ID: ${id})`, 
        "SUCCESS"
      );

      res.status(200).json({
        success: true,
        message: "User deleted successfully."
      });
    } catch (error: any) {
      console.error("[UserController] Delete user error:", error);
      res.status(500).json({
        success: false,
        error: "Internal Server Error",
        message: error.message
      });
    }
  }

  // Reset Password
  public async resetPassword(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { password } = req.body;

      if (!password || password.trim() === "") {
        res.status(400).json({
          success: false,
          error: "Validation Error",
          message: "New password is required."
        });
        return;
      }

      const userRes = await query("SELECT username FROM users WHERE id = $1", [id]);
      if (userRes.rowCount === 0) {
        res.status(404).json({
          success: false,
          error: "Not Found",
          message: "User not found."
        });
        return;
      }

      const username = userRes.rows[0].username;
      const passwordHash = crypto.createHash("sha256").update(password).digest("hex");

      await query("UPDATE users SET password = $1 WHERE id = $2", [passwordHash, id]);

      await logActivity(
        "User Management", 
        "Reset Password", 
        `Reset password for user "${username}" (ID: ${id})`, 
        "SUCCESS"
      );

      res.status(200).json({
        success: true,
        message: "User password reset successfully."
      });
    } catch (error: any) {
      console.error("[UserController] Reset password error:", error);
      res.status(500).json({
        success: false,
        error: "Internal Server Error",
        message: error.message
      });
    }
  }
}

export const userController = new UserController();
