import fs from "fs";
import path from "path";
import os from "os";
import { exec } from "child_process";
import axios from "axios";
import yaml from "js-yaml";
import { Client } from "ssh2";
import config, { PrometheusConfigItem } from "../config/env";

export class PrometheusService {
  /**
   * Helper to connect to SSH target and return the Client
   */
  private getSSHConnection(activeConfig: any): Promise<Client> {
    return new Promise((resolve, reject) => {
      const conn = new Client();
      conn.on("ready", () => resolve(conn))
          .on("error", (err) => reject(err))
          .connect({
            host: activeConfig.sshHost,
            port: activeConfig.sshPort || 22,
            username: activeConfig.sshUser,
            password: activeConfig.sshAuth === "password" ? activeConfig.sshPassword : undefined,
            privateKey: activeConfig.sshAuth === "key" ? activeConfig.sshKey : undefined,
            readyTimeout: 10000
          });
    });
  }

  /**
   * Helper to read file content over SFTP
   */
  private readRemoteFile(conn: Client, remotePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      conn.sftp((err, sftp) => {
        if (err) return reject(err);
        sftp.readFile(remotePath, "utf8", (err, data) => {
          if (err) return reject(err);
          resolve(data.toString());
        });
      });
    });
  }

  /**
   * Helper to write file content over SFTP
   */
  private writeRemoteFile(conn: Client, remotePath: string, content: string): Promise<void> {
    return new Promise((resolve, reject) => {
      conn.sftp((err, sftp) => {
        if (err) return reject(err);
        sftp.writeFile(remotePath, content, "utf8", (err) => {
          if (err) return reject(err);
          resolve();
        });
      });
    });
  }

  /**
   * Helper to execute remote command
   */
  private executeRemoteCommand(conn: Client, command: string): Promise<string> {
    return new Promise((resolve, reject) => {
      conn.exec(command, (err, stream) => {
        if (err) return reject(err);
        let stdout = "";
        let stderr = "";
        stream.on("close", (code: number) => {
          if (code !== 0) {
            reject(new Error(stderr.trim() || stdout.trim() || `Exit code ${code}`));
          } else {
            resolve(stdout.trim());
          }
        }).on("data", (data: any) => {
          stdout += data.toString();
        }).stderr.on("data", (data: any) => {
          stderr += data.toString();
        });
      });
    });
  }

  /**
   * Reads the current prometheus.yml file.
   * If it doesn't exist, creates a starter config.
   */
  public async readConfig(): Promise<{ path: string; content: string }> {
    const activeConfig = config.getActivePrometheusConfig();

    if (activeConfig.mode === "local") {
      const configPath = activeConfig.path;
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
    } else {
      // Remote SSH mode
      let conn;
      try {
        conn = await this.getSSHConnection(activeConfig);
        const content = await this.readRemoteFile(conn, activeConfig.path);
        return {
          path: activeConfig.path,
          content
        };
      } catch (err: any) {
        throw new Error(`SSH Read Failed: ${err.message || err}`);
      } finally {
        if (conn) conn.end();
      }
    }
  }

  /**
   * Validates YAML configuration using js-yaml parser.
   * Runs promtool locally or remotely depending on access mode.
   */
  public async validateConfig(content: string): Promise<{ valid: boolean; error?: string }> {
    // 1. Basic JS-YAML syntax check (always run locally first)
    try {
      yaml.load(content);
    } catch (err: any) {
      return {
        valid: false,
        error: `YAML Syntax Error: ${err.message || err}`
      };
    }

    const activeConfig = config.getActivePrometheusConfig();

    if (activeConfig.mode === "local") {
      const tempFilePath = path.join(os.tmpdir(), `prometheus-validate-${Date.now()}.yml`);
      try {
        fs.writeFileSync(tempFilePath, content, "utf-8");
      } catch (e: any) {
        return { valid: true };
      }

      return new Promise((resolve) => {
        exec(`promtool check config "${tempFilePath}"`, (err, stdout, stderr) => {
          try {
            fs.unlinkSync(tempFilePath);
          } catch (_) {}

          if (err) {
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
    } else {
      // Remote SSH validation
      let conn;
      try {
        conn = await this.getSSHConnection(activeConfig);
        
        // Write validation file to remote /tmp directory
        const tempPath = `/tmp/prometheus-validate-${Date.now()}.yml`;
        await this.writeRemoteFile(conn, tempPath, content);

        try {
          await this.executeRemoteCommand(conn, `promtool check config "${tempPath}"`);
          return { valid: true };
        } catch (execErr: any) {
          if (execErr.message.toLowerCase().includes("not found")) {
            return { valid: true }; // Skip if promtool not installed remotely
          }
          return {
            valid: false,
            error: `Remote Prometheus Semantic Error: ${execErr.message}`
          };
        } finally {
          try {
            await this.executeRemoteCommand(conn, `rm -f "${tempPath}"`);
          } catch (_) {}
        }
      } catch (err: any) {
        // If SSH connection fails during validate check, report it
        return {
          valid: false,
          error: `SSH Connection Validation Failed: ${err.message || err}`
        };
      } finally {
        if (conn) conn.end();
      }
    }
  }

  /**
   * Validates and saves the Prometheus configuration, then triggers a hot reload.
   */
  public async saveConfig(content: string): Promise<{ success: boolean; message: string; reloaded: boolean }> {
    const activeConfig = config.getActivePrometheusConfig();

    // Validate first
    const validation = await this.validateConfig(content);
    if (!validation.valid) {
      return {
        success: false,
        message: validation.error || "Invalid Prometheus configuration.",
        reloaded: false
      };
    }

    if (activeConfig.mode === "local") {
      const configPath = activeConfig.path;
      fs.writeFileSync(configPath, content, "utf-8");

      try {
        await axios.post(activeConfig.reloadUrl, {}, { timeout: 3000 });
        return {
          success: true,
          message: "Configuration saved and Prometheus reloaded successfully.",
          reloaded: true
        };
      } catch (err: any) {
        return {
          success: true,
          message: `Configuration saved successfully, but hot-reload failed: ${err.message || err}. (Ensure Prometheus has --web.enable-lifecycle flag enabled)`,
          reloaded: false
        };
      }
    } else {
      // Remote SSH Mode
      let conn;
      try {
        conn = await this.getSSHConnection(activeConfig);
        await this.writeRemoteFile(conn, activeConfig.path, content);
        
        let reloaded = false;
        let reloadMsg = "";
        try {
          let reloadCmd = `curl -s -X POST http://localhost:9090/-/reload`;
          if (activeConfig.reloadUrl) {
            reloadCmd = `curl -s -X POST "${activeConfig.reloadUrl}"`;
          }
          await this.executeRemoteCommand(conn, reloadCmd);
          reloaded = true;
          reloadMsg = "Configuration saved and Prometheus reloaded successfully via remote SSH.";
        } catch (e: any) {
          reloadMsg = `Configuration saved, but remote hot-reload failed: ${e.message || e}`;
        }
        
        return {
          success: true,
          message: reloadMsg,
          reloaded
        };
      } catch (err: any) {
        return {
          success: false,
          message: `SSH Save Failed: ${err.message || err}`,
          reloaded: false
        };
      } finally {
        if (conn) conn.end();
      }
    }
  }

  /**
   * Tests SSH connection to a remote Prometheus server.
   */
  public async testSSHConnection(activeConfig: any): Promise<{ success: boolean; message: string }> {
    let conn;
    try {
      conn = await this.getSSHConnection(activeConfig);
      
      // Try to read remote file path to check access
      try {
        await this.readRemoteFile(conn, activeConfig.path);
        return {
          success: true,
          message: "SSH Connection and file read check successful."
        };
      } catch (fileErr: any) {
        return {
          success: true,
          message: `SSH Connection successful, but configuration file could not be read: ${fileErr.message}`
        };
      }
    } catch (err: any) {
      return {
        success: false,
        message: `SSH Connection failed: ${err.message || err}`
      };
    } finally {
      if (conn) conn.end();
    }
  }
  /**
   * Retrieves all saved Prometheus configurations.
   */
  public getConfigsList(): PrometheusConfigItem[] {
    if (!fs.existsSync(config.prometheusConfigsFile)) {
      // Create default active environment profile
      const defaultItem: PrometheusConfigItem = {
        id: "prom-cfg-env",
        name: "Local Prometheus (Default)",
        mode: "local",
        path: process.env.PROMETHEUS_CONFIG_PATH || "/etc/prometheus/prometheus.yml",
        reloadUrl: process.env.PROMETHEUS_RELOAD_URL || "http://localhost:9090/-/reload",
        isActive: true
      };
      this.saveConfigsList([defaultItem]);
      return [defaultItem];
    }

    try {
      const fileContent = fs.readFileSync(config.prometheusConfigsFile, "utf-8");
      return JSON.parse(fileContent);
    } catch (e) {
      console.error("[PrometheusService] Error reading configs list:", e);
      return [];
    }
  }

  /**
   * Writes the configurations list to disk.
   */
  public saveConfigsList(list: PrometheusConfigItem[]): void {
    try {
      const dir = path.dirname(config.prometheusConfigsFile);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(config.prometheusConfigsFile, JSON.stringify(list, null, 2), "utf-8");
    } catch (error: any) {
      throw new Error(`Failed to write Prometheus configs file: ${error.message}`);
    }
  }

  /**
   * Saves or updates a Prometheus configuration profile.
   */
  public saveConfigProfile(profile: Partial<PrometheusConfigItem>): PrometheusConfigItem {
    const list = this.getConfigsList();
    let item: PrometheusConfigItem;

    if (profile.id) {
      const existing = list.find(c => c.id === profile.id);
      if (!existing) {
        throw new Error(`Profile with id ${profile.id} not found.`);
      }
      // Update existing
      existing.name = profile.name || existing.name;
      existing.mode = profile.mode || existing.mode;
      existing.path = profile.path || existing.path;
      existing.reloadUrl = profile.reloadUrl || existing.reloadUrl;
      existing.sshHost = profile.sshHost;
      existing.sshPort = profile.sshPort;
      existing.sshUser = profile.sshUser;
      existing.sshAuth = profile.sshAuth;
      existing.sshPassword = profile.sshPassword;
      existing.sshKey = profile.sshKey;
      item = existing;
    } else {
      // Create new
      item = {
        id: "prom-cfg-" + Date.now(),
        name: profile.name || "Remote Prometheus",
        mode: profile.mode || "local",
        path: profile.path || "/etc/prometheus/prometheus.yml",
        reloadUrl: profile.reloadUrl || "http://localhost:9090/-/reload",
        sshHost: profile.sshHost,
        sshPort: profile.sshPort,
        sshUser: profile.sshUser,
        sshAuth: profile.sshAuth,
        sshPassword: profile.sshPassword,
        sshKey: profile.sshKey,
        isActive: list.length === 0 // Active if first profile
      };
      
      if (item.isActive) {
        list.forEach(c => c.isActive = false);
      }
      list.push(item);
    }

    this.saveConfigsList(list);
    return item;
  }

  /**
   * Activates a configuration profile.
   */
  public activateConfigProfile(id: string): void {
    const list = this.getConfigsList();
    const target = list.find(c => c.id === id);
    if (!target) {
      throw new Error(`Profile with id ${id} not found.`);
    }

    list.forEach(c => c.isActive = (c.id === id));
    this.saveConfigsList(list);
  }

  /**
   * Deletes a configuration profile.
   */
  public deleteConfigProfile(id: string): void {
    const list = this.getConfigsList();
    const index = list.findIndex(c => c.id === id);
    if (index === -1) {
      throw new Error(`Profile with id ${id} not found.`);
    }

    const wasActive = list[index].isActive;
    list.splice(index, 1);

    // If active profile deleted, activate another one
    if (wasActive && list.length > 0) {
      list[0].isActive = true;
    }

    this.saveConfigsList(list);
  }
}

export const prometheusService = new PrometheusService();
