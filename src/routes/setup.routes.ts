import { Router, Request, Response } from "express";
import bcrypt from "bcrypt";
import { query, logActivity } from "../config/db";

const router = Router();

// Check if setup is needed (no users exist)
router.get("/status", async (req: Request, res: Response) => {
  try {
    const result = await query("SELECT COUNT(*) as count FROM users");
    const count = parseInt(result.rows[0].count, 10);
    res.status(200).json({ success: true, needsSetup: count === 0 });
  } catch (error: any) {
    res.status(500).json({ success: false, error: "Database not ready", message: error.message });
  }
});

// Create first admin user (only works when no users exist)
router.post("/create-admin", async (req: Request, res: Response) => {
  try {
    // Check no users exist
    const check = await query("SELECT COUNT(*) as count FROM users");
    if (parseInt(check.rows[0].count, 10) > 0) {
      res.status(400).json({ success: false, error: "Forbidden", message: "Admin user already exists. Use normal user management." });
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
    res.status(500).json({ success: false, error: "Internal Server Error", message: error.message });
  }
});

export default router;
