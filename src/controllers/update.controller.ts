import { Request, Response } from "express";
import { exec } from "child_process";
import { promisify } from "util";
import { logActivity, query } from "../config/db";
import path from "path";

const execAsync = promisify(exec);

export class UpdateController {
  private isUpdating = false;

  /**
   * Get the GitHub token from app_config if configured.
   * Returns empty string if not set.
   */
  private async getGithubToken(): Promise<string> {
    try {
      const result = await query("SELECT value FROM app_config WHERE key = $1", ["github_token"]);
      return result.rows.length > 0 ? result.rows[0].value : "";
    } catch {
      return "";
    }
  }

  /**
   * Validate GitHub token format to prevent command injection.
   * GitHub tokens have specific prefixes: ghp_, github_pat_, gho_, ghu_, ghs_, ghr_
   */
  private validateGithubToken(token: string): boolean {
    return /^[a-zA-Z0-9_]+$/.test(token) && /^gh[pousr]_|^github_pat_/.test(token);
  }

  /**
   * Build a git command that uses the GitHub token for authentication.
   * Uses http.extraHeader to avoid leaking token in remote URL or logs.
   */
  private gitAuth_cmd(token: string, cmd: string): string {
    if (!token) return cmd;
    // Token is validated before calling this, safe to interpolate
    return `git -c http.extraHeader="Authorization: token ${token}" ${cmd}`;
  }

  /**
   * Get the remote URL to check which repo we're connected to.
   */
  private async getRemoteUrl(): Promise<string> {
    try {
      const { stdout } = await execAsync("git remote get-url origin", { cwd: path.resolve(__dirname, "../..") });
      return stdout.trim();
    } catch {
      return "unknown";
    }
  }

  public async checkForUpdates(req: Request, res: Response): Promise<void> {
    try {
      let token = await this.getGithubToken();
      if (token && !this.validateGithubToken(token)) {
        token = "";
      }
      const remoteUrl = await this.getRemoteUrl();

      if (remoteUrl === "unknown") {
        res.status(200).json({
          success: true,
          hasUpdates: false,
          message: "Update check not available in this environment",
          remote: "unknown",
          authConfigured: !!token
        });
        return;
      }

      const fetchCmd = this.gitAuth_cmd(token, "fetch origin");
      const statusCmd = this.gitAuth_cmd(token, "status -uno");

      const { stdout } = await execAsync(`${fetchCmd} && ${statusCmd}`, { cwd: path.resolve(__dirname, "../..") });
      const hasUpdates = !stdout.includes("Your branch is up to date");
      res.status(200).json({
        success: true,
        hasUpdates,
        message: hasUpdates ? "Updates available" : "Already up to date",
        remote: remoteUrl,
        authConfigured: !!token
      });
    } catch (error: any) {
      res.status(200).json({ success: true, hasUpdates: false, message: "Update check not available in this environment", remote: "unknown", authConfigured: false });
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
      let token = await this.getGithubToken();
      // Validate token format to prevent command injection
      if (token && !this.validateGithubToken(token)) {
        token = ""; // Ignore invalid token
      }
      const pullCmd = this.gitAuth_cmd(token, "pull origin main");

      await logActivity("System", "Update Started", "System update initiated from WebUI", "SUCCESS");

      // Step 1: Git pull
      res.status(200).json({ success: true, message: "Update started. The server will restart automatically.", step: "pulling" });

      const { stdout: pullOut } = await execAsync(pullCmd, { cwd, timeout: 60000 });
      console.log("[Update] Git pull:", pullOut);

      // Step 2: Install dependencies
      await execAsync("npm install --omit=dev", { cwd, timeout: 120000 });
      console.log("[Update] Dependencies installed");

      // Step 3: Build TypeScript
      await execAsync("npm run build", { cwd, timeout: 120000 });
      console.log("[Update] Build completed");

      // Step 4: Restart the application
      await logActivity("System", "Update Completed", "System update completed successfully. Restarting...", "SUCCESS");

      setTimeout(() => {
        console.log("[Update] Restarting server...");
        process.exit(0);
      }, 2000);

    } catch (error: any) {
      this.isUpdating = false;
      console.error("[Update] Failed:", error.message);
      await logActivity("System", "Update Failed", `Update failed: ${error.message}`, "ERROR");
    } finally {
      this.isUpdating = false;
    }
  }
}

export const updateController = new UpdateController();
