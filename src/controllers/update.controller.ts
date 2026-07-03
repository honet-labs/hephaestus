import { Request, Response } from "express";
import { exec } from "child_process";
import { promisify } from "util";
import { logActivity } from "../config/db";
import path from "path";

const execAsync = promisify(exec);

export class UpdateController {
  private isUpdating = false;

  public async checkForUpdates(req: Request, res: Response): Promise<void> {
    try {
      const { stdout } = await execAsync("git fetch origin && git status -uno", { cwd: path.resolve(__dirname, "../..") });
      const hasUpdates = !stdout.includes("Your branch is up to date");
      res.status(200).json({ success: true, hasUpdates, message: hasUpdates ? "Updates available" : "Already up to date" });
    } catch (error: any) {
      res.status(500).json({ success: false, error: "Failed to check updates", message: error.message });
    }
  }

  public async performUpdate(req: Request, res: Response): Promise<void> {
    if (this.isUpdating) {
      res.status(409).json({ success: false, error: "Conflict", message: "Update already in progress." });
      return;
    }

    this.isUpdating = true;
    const cwd = path.resolve(__dirname, "../..");

    try {
      await logActivity("System", "Update Started", "System update initiated from WebUI", "SUCCESS");

      // Step 1: Git pull
      res.status(200).json({ success: true, message: "Update started. The server will restart automatically.", step: "pulling" });

      const { stdout: pullOut } = await execAsync("git pull origin main", { cwd, timeout: 60000 });
      console.log("[Update] Git pull:", pullOut);

      // Step 2: Install dependencies
      await execAsync("npm install --omit=dev", { cwd, timeout: 120000 });
      console.log("[Update] Dependencies installed");

      // Step 3: Build TypeScript
      await execAsync("npm run build", { cwd, timeout: 120000 });
      console.log("[Update] Build completed");

      // Step 4: Restart the application
      await logActivity("System", "Update Completed", "System update completed successfully. Restarting...", "SUCCESS");

      // Give time for response to be sent
      setTimeout(() => {
        console.log("[Update] Restarting server...");
        process.exit(0); // Docker restart policy will bring it back
      }, 2000);

    } catch (error: any) {
      this.isUpdating = false;
      console.error("[Update] Failed:", error.message);
      await logActivity("System", "Update Failed", `Update failed: ${error.message}`, "ERROR");
      // Don't send response if headers already sent
    } finally {
      this.isUpdating = false;
    }
  }
}

export const updateController = new UpdateController();
