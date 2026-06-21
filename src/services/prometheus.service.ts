import fs from "fs";
import path from "path";
import os from "os";
import { exec } from "child_process";
import axios from "axios";
import yaml from "js-yaml";
import config from "../config/env";

export class PrometheusService {
  /**
   * Reads the current prometheus.yml file.
   * If it doesn't exist, creates a starter config.
   */
  public async readConfig(): Promise<{ path: string; content: string }> {
    const configPath = config.prometheusConfigPath;
    const dir = path.dirname(configPath);

    // Ensure containing directory exists
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Write default starter template if file does not exist
    if (!fs.existsSync(configPath)) {
      const defaultYaml = `global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'prometheus'
    static_configs:
      - targets: ['localhost:9090']
`;
      fs.writeFileSync(configPath, defaultYaml, "utf-8");
    }

    const content = fs.readFileSync(configPath, "utf-8");
    return {
      path: configPath,
      content
    };
  }

  /**
   * Validates YAML configuration using js-yaml parser.
   * Optionally executes 'promtool check config' if the command is installed on the host.
   */
  public async validateConfig(content: string): Promise<{ valid: boolean; error?: string }> {
    // 1. Basic JS-YAML syntax check
    try {
      yaml.load(content);
    } catch (err: any) {
      return {
        valid: false,
        error: `YAML Syntax Error: ${err.message || err}`
      };
    }

    // 2. Advanced promtool semantic validation
    const tempFilePath = path.join(os.tmpdir(), `prometheus-validate-${Date.now()}.yml`);
    try {
      fs.writeFileSync(tempFilePath, content, "utf-8");
    } catch (e: any) {
      return { valid: true }; // Fallback to basic syntax validity if temp write fails
    }

    return new Promise((resolve) => {
      exec(`promtool check config "${tempFilePath}"`, (err, stdout, stderr) => {
        // Cleanup temp file
        try {
          fs.unlinkSync(tempFilePath);
        } catch (_) {}

        if (err) {
          // If command not found, skip promtool and treat JS-YAML as sufficient
          if (stderr.toLowerCase().includes("not found") || stderr.toLowerCase().includes("not recognized")) {
            return resolve({ valid: true });
          }
          return resolve({
            valid: false,
            error: `Prometheus Semantic Error: ${stderr.trim() || stdout.trim() || err.message}`
          });
        }
        resolve({ valid: true });
      });
    });
  }

  /**
   * Validates and saves the Prometheus configuration, then triggers a hot reload.
   */
  public async saveConfig(content: string): Promise<{ success: boolean; message: string; reloaded: boolean }> {
    // Validate first
    const validation = await this.validateConfig(content);
    if (!validation.valid) {
      return {
        success: false,
        message: validation.error || "Invalid Prometheus configuration.",
        reloaded: false
      };
    }

    // Write to file
    const configPath = config.prometheusConfigPath;
    fs.writeFileSync(configPath, content, "utf-8");

    // Trigger configuration reload via API endpoint
    try {
      await axios.post(config.prometheusReloadUrl, {}, { timeout: 3000 });
      return {
        success: true,
        message: "Configuration saved and Prometheus reloaded successfully.",
        reloaded: true
      };
    } catch (err: any) {
      console.warn(`[Prometheus] Saved config but failed to hot-reload: ${err.message}`);
      return {
        success: true,
        message: `Configuration saved successfully, but hot-reload failed: ${err.message || err}. (Ensure Prometheus has --web.enable-lifecycle flag enabled)`,
        reloaded: false
      };
    }
  }
}

export const prometheusService = new PrometheusService();
