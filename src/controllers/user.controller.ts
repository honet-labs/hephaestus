import { Request, Response } from "express";
import crypto from "crypto";
import bcrypt from "bcrypt";
import { query, logActivity } from "../config/db";

const BCRYPT_ROUNDS = 12;

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
        message: "Failed to fetch users"
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

      const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
      const targetRole = role || "operator";

      // Validate role: only "ADMIN" or "operator" allowed
      const allowedRoles = ["ADMIN", "operator"];
      if (!allowedRoles.includes(targetRole)) {
        res.status(400).json({
          success: false,
          error: "Validation Error",
          message: `Invalid role. Allowed roles: ${allowedRoles.join(", ")}`
        });
        return;
      }

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
        message: "Failed to create user"
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
        message: "Failed to delete user"
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
      const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

      await query("UPDATE users SET password = $1 WHERE id = $2", [passwordHash, id]);

      // Invalidate all sessions for this user
      await query("DELETE FROM user_sessions WHERE user_id = $1", [id]);

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
        message: "Failed to reset password"
      });
    }
  }

  // List System Roles
  public async listRoles(req: Request, res: Response): Promise<void> {
    try {
      const result = await query(
        `SELECT id, name, description, is_default AS "isDefault", created_at AS "createdAt" FROM system_roles ORDER BY id ASC`
      );
      res.status(200).json({
        success: true,
        data: result.rows
      });
    } catch (error: any) {
      console.error("[UserController] List roles error:", error);
      res.status(500).json({
        success: false,
        error: "Internal Server Error",
        message: "Failed to fetch roles"
      });
    }
  }

  // Add System Role
  public async addRole(req: Request, res: Response): Promise<void> {
    try {
      const { name, description } = req.body;

      if (!name || name.trim() === "") {
        res.status(400).json({
          success: false,
          error: "Validation Error",
          message: "Role name is required."
        });
        return;
      }

      const checkExists = await query(
        "SELECT 1 FROM system_roles WHERE LOWER(name) = LOWER($1)",
        [name.trim()]
      );

      if (checkExists.rowCount && checkExists.rowCount > 0) {
        res.status(400).json({
          success: false,
          error: "Conflict",
          message: "A role with this name already exists."
        });
        return;
      }

      const insertResult = await query(
        `INSERT INTO system_roles (name, description) VALUES ($1, $2) RETURNING id`,
        [name.trim(), description || ""]
      );

      await logActivity(
        "User Management",
        "Create Role",
        `Created system role "${name.trim()}"`,
        "SUCCESS"
      );

      res.status(201).json({
        success: true,
        message: "Role created successfully.",
        roleId: insertResult.rows[0].id
      });
    } catch (error: any) {
      console.error("[UserController] Add role error:", error);
      res.status(500).json({
        success: false,
        error: "Internal Server Error",
        message: "Failed to create role"
      });
    }
  }

  // Delete System Role
  public async deleteRole(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      const roleRes = await query("SELECT name, is_default FROM system_roles WHERE id = $1", [id]);
      if (roleRes.rowCount === 0) {
        res.status(404).json({
          success: false,
          error: "Not Found",
          message: "Role not found."
        });
        return;
      }

      const role = roleRes.rows[0];
      if (role.is_default) {
        res.status(400).json({
          success: false,
          error: "Forbidden",
          message: `The default role "${role.name}" cannot be deleted.`
        });
        return;
      }

      // Check if any users are using this role
      const usersWithRole = await query("SELECT COUNT(*) as count FROM users WHERE LOWER(role) = LOWER($1)", [role.name]);
      const count = parseInt(usersWithRole.rows[0].count, 10);
      if (count > 0) {
        res.status(400).json({
          success: false,
          error: "Conflict",
          message: `Cannot delete role "${role.name}". ${count} user(s) are currently assigned to this role.`
        });
        return;
      }

      await query("DELETE FROM system_roles WHERE id = $1", [id]);

      await logActivity(
        "User Management",
        "Delete Role",
        `Deleted system role "${role.name}"`,
        "SUCCESS"
      );

      res.status(200).json({
        success: true,
        message: "Role deleted successfully."
      });
    } catch (error: any) {
      console.error("[UserController] Delete role error:", error);
      res.status(500).json({
        success: false,
        error: "Internal Server Error",
        message: "Failed to delete role"
      });
    }
  }

  // Login
  public async login(req: Request, res: Response): Promise<void> {
    try {
      const { username, password } = req.body;

      if (!username || !password) {
        res.status(400).json({
          success: false,
          error: "Validation Error",
          message: "Username and password are required."
        });
        return;
      }

      const userRes = await query(
        "SELECT id, username, email, role, password, force_password_change FROM users WHERE username = $1",
        [username.trim()]
      );

      if (userRes.rowCount === 0) {
        res.status(401).json({
          success: false,
          error: "Unauthorized",
          message: "Invalid username or password."
        });
        return;
      }

      const user = userRes.rows[0];
      const isValid = await bcrypt.compare(password, user.password);
      if (!isValid) {
        res.status(401).json({
          success: false,
          error: "Unauthorized",
          message: "Invalid username or password."
        });
        return;
      }
      const rawToken = crypto.randomBytes(32).toString("hex");
      const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

      await query(
        "INSERT INTO user_sessions (user_id, token, expires_at) VALUES ($1, $2, $3)",
        [user.id, tokenHash, expiresAt]
      );

      await logActivity(
        "Authentication",
        "Login",
        `User "${user.username}" logged in successfully`,
        "SUCCESS"
      );

      res.status(200).json({
        success: true,
        message: "Login successful.",
        token: rawToken,
        forcePasswordChange: !!user.force_password_change,
        user: {
          username: user.username,
          email: user.email,
          role: user.role
        }
      });
    } catch (error: any) {
      console.error("[UserController] Login error:", error);
      res.status(500).json({
        success: false,
        error: "Internal Server Error",
        message: "Failed to login"
      });
    }
  }

  // Logout
  public async logout(req: Request, res: Response): Promise<void> {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        res.status(400).json({
          success: false,
          error: "Validation Error",
          message: "Auth token is missing."
        });
        return;
      }

      const rawToken = authHeader.split(" ")[1];
      const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
      
      // Get user name before deleting session
      const sessionRes = await query(
        `SELECT u.username FROM user_sessions s
         JOIN users u ON s.user_id = u.id
         WHERE s.token = $1`,
        [tokenHash]
      );
      
      const username = sessionRes.rowCount && sessionRes.rowCount > 0 ? sessionRes.rows[0].username : "Unknown";

      await query("DELETE FROM user_sessions WHERE token = $1", [tokenHash]);

      await logActivity(
        "Authentication",
        "Logout",
        `User "${username}" logged out`,
        "SUCCESS"
      );

      res.status(200).json({
        success: true,
        message: "Logout successful."
      });
    } catch (error: any) {
      console.error("[UserController] Logout error:", error);
      res.status(500).json({
        success: false,
        error: "Internal Server Error",
        message: "Failed to logout"
      });
    }
  }

  // Change Password (force password change)
  public async changePassword(req: Request, res: Response): Promise<void> {
    try {
      const { oldPassword, newPassword } = req.body;

      if (!oldPassword || !newPassword) {
        res.status(400).json({
          success: false,
          error: "Validation Error",
          message: "Old password and new password are required."
        });
        return;
      }

      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        res.status(401).json({
          success: false,
          error: "Unauthorized",
          message: "Authentication token is missing."
        });
        return;
      }

      const rawToken = authHeader.split(" ")[1];
      const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

      const sessionRes = await query(
        `SELECT s.user_id, u.username, u.password FROM user_sessions s
         JOIN users u ON s.user_id = u.id
         WHERE s.token = $1 AND s.expires_at > NOW()`,
        [tokenHash]
      );

      if (sessionRes.rowCount === 0) {
        res.status(401).json({
          success: false,
          error: "Unauthorized",
          message: "Session is invalid or expired."
        });
        return;
      }

      const session = sessionRes.rows[0];
      const isValid = await bcrypt.compare(oldPassword, session.password);
      if (!isValid) {
        res.status(401).json({
          success: false,
          error: "Unauthorized",
          message: "Old password is incorrect."
        });
        return;
      }

      const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
      await query(
        "UPDATE users SET password = $1, force_password_change = false WHERE id = $2",
        [passwordHash, session.user_id]
      );

      // Invalidate all other sessions for this user (keep current session)
      await query(
        "DELETE FROM user_sessions WHERE user_id = $1 AND token != $2",
        [session.user_id, tokenHash]
      );

      await logActivity(
        "Authentication",
        "Change Password",
        `User "${session.username}" changed their password`,
        "SUCCESS"
      );

      res.status(200).json({
        success: true,
        message: "Password changed successfully."
      });
    } catch (error: any) {
      console.error("[UserController] Change password error:", error);
      res.status(500).json({
        success: false,
        error: "Internal Server Error",
        message: "Failed to change password"
      });
    }
  }

  // Get Session
  public async getSession(req: Request, res: Response): Promise<void> {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      console.log("[Session] No token provided");
      res.status(401).json({
        success: false,
        error: "Unauthorized",
        message: "Session check failed. Token is missing."
      });
      return;
    }

    const rawToken = authHeader.split(" ")[1];
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

    try {
      const sessionRes = await query(
        `SELECT u.username, u.email, u.role FROM user_sessions s
         JOIN users u ON s.user_id = u.id
         WHERE s.token = $1 AND s.expires_at > NOW()`,
        [tokenHash]
      );

      if (sessionRes.rowCount === 0) {
        const existsRes = await query(
          `SELECT user_id, expires_at FROM user_sessions WHERE token = $1`,
          [tokenHash]
        );
        if (existsRes.rowCount! > 0) {
          console.log(`[Session] Token found but expired. expires_at: ${existsRes.rows[0].expires_at}, now: ${new Date().toISOString()}`);
        } else {
          console.log(`[Session] Token not found in database (hash: ${tokenHash.substring(0, 8)}...)`);
        }
        res.status(401).json({
          success: false,
          error: "Unauthorized",
          message: "Session is invalid or expired."
        });
        return;
      }

      console.log(`[Session] Valid session for user: ${sessionRes.rows[0].username}`);
      res.status(200).json({
        success: true,
        user: sessionRes.rows[0]
      });
    } catch (error: any) {
      console.error("[UserController] Get session error:", error);
      res.status(500).json({
        success: false,
        error: "Internal Server Error",
        message: "Failed to get session"
      });
    }
  }
}

export const userController = new UserController();
