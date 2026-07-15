import { Router, Request, Response } from "express";
import bcrypt from "bcrypt";
import { query, logActivity } from "../config/db";
import { loginLimiter } from "../middleware/rate-limit.middleware";

const router = Router();

// Check if setup is needed (setup_completed flag)
router.get("/status", async (req: Request, res: Response) => {
  try {
    const result = await query("SELECT value FROM app_config WHERE key = 'setup_completed'");
    const isCompleted = result.rows.length > 0 && result.rows[0].value === "true";
    res.status(200).json({ success: true, needsSetup: !isCompleted });
  } catch (error: any) {
    // Fallback: if app_config table doesn't exist yet, check user count
    try {
      const countResult = await query("SELECT COUNT(*) as count FROM users");
      const count = parseInt(countResult.rows[0].count, 10);
      res.status(200).json({ success: true, needsSetup: count === 0 });
    } catch {
      res.status(500).json({ success: false, error: "Database not ready", message: "Database not ready" });
    }
  }
});

// Create first admin user (only works when setup not completed)
router.post("/create-admin", loginLimiter, async (req: Request, res: Response) => {
  try {
    // Check setup not already completed
    const configCheck = await query("SELECT value FROM app_config WHERE key = 'setup_completed'");
    if (configCheck.rows.length > 0 && configCheck.rows[0].value === "true") {
      res.status(400).json({ success: false, error: "Forbidden", message: "Setup already completed. Use normal login." });
      return;
    }

    const { username, email, password } = req.body;
    if (!username || !email || !password) {
      res.status(400).json({ success: false, error: "Validation Error", message: "Username, email, and password are required." });
      return;
    }

    if (password.length < 8) {
      res.status(400).json({ success: false, error: "Validation Error", message: "Password must be at least 8 characters." });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);
    await query(
      `INSERT INTO users (username, email, password, role, force_password_change) VALUES ($1, $2, $3, $4, $5)`,
      [username.trim(), email.trim(), passwordHash, "ADMIN", false]
    );

    // Mark setup as completed
    await query(
      `UPDATE app_config SET value = 'true', updated_at = CURRENT_TIMESTAMP WHERE key = 'setup_completed'`
    );

    // Seed roles if not exist
    const roleCheck = await query("SELECT 1 FROM system_roles LIMIT 1");
    if (roleCheck.rowCount === 0) {
      await query(
        `INSERT INTO system_roles (name, description, is_default) VALUES 
         ('ADMIN', 'Full system administrator with unrestricted access', true),
         ('operator', 'Standard operator with read and execute permissions', true)`
      );
    }

    await logActivity("System", "Initial Setup", `Admin user "${username}" created during initial setup`, "SUCCESS");
    res.status(201).json({ success: true, message: "Admin user created successfully. You can now login." });
  } catch (error: any) {
    console.error("[SetupController] Error creating admin:", error);
    res.status(500).json({ success: false, error: "Internal Server Error", message: "Failed to create admin user" });
  }
});

export default router;
