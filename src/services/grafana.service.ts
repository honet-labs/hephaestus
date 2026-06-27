import axios from "axios";
import fs from "fs";
import config from "../config/env";

export class GrafanaService {
  /**
   * Helper function to convert dynamic dates or timestamps into 13-digit Unix Epoch Milliseconds.
   * Handles ISO strings, standard timestamp numbers (10-digit/13-digit), and relative dates.
   */
  public convertToEpochMs(input: string | number): string {
    if (typeof input === "number") {
      // 10-digit Unix timestamp (seconds) -> convert to 13-digit (ms)
      if (input.toString().length === 10) {
        return (input * 1000).toString();
      }
      return input.toString();
    }

    if (typeof input === "string") {
      const trimmed = input.trim();
      
      // If it is already a pure digit string
      if (/^\d+$/.test(trimmed)) {
        if (trimmed.length === 10) {
          return (parseInt(trimmed, 10) * 1000).toString();
        }
        return trimmed;
      }

      // Handle standard date format parsing (ISO strings, YYYY-MM-DD, etc.)
      const parsedDate = new Date(trimmed);
      if (!isNaN(parsedDate.getTime())) {
        return parsedDate.getTime().toString();
      }
    }

    throw new Error(`Invalid date/time format received: "${input}". Could not convert to Epoch Milliseconds.`);
  }

  /**
   * Tests connection to a Grafana Host using the provided Token.
   * Calls /api/health to confirm host accessibility and credentials validity.
   */
  public async testConnection(host: string, token: string): Promise<boolean> {
    try {
      const cleanedHost = host.trim().replace(/\/$/, "");
      const targetUrl = `${cleanedHost}/api/health`;

      console.log(`[GrafanaService] Testing Grafana API connection: GET ${targetUrl}`);
      const response = await axios.get(targetUrl, {
        headers: {
          "Authorization": `Bearer ${token}`
        },
        timeout: 5000
      });

      return response.status === 200;
    } catch (error: any) {
      console.error("[GrafanaService] Grafana connection test failed:", error.message);
      
      if (error.response) {
        const status = error.response.status;
        if (status === 401) {
          throw new Error("Otorisasi gagal: Token Grafana tidak valid atau tidak memiliki akses (401 Unauthorized).");
        }
        if (status === 403) {
          throw new Error("Akses dilarang (403 Forbidden).");
        }
        throw new Error(`Grafana merespons dengan status ${status}: ${error.response.data?.message || error.message}`);
      }
      
      throw new Error(`Gagal menghubungi server Grafana: ${error.message}`);
    }
  }

  /**
   * Retrieves all saved Grafana configurations from the list file.
   */
  public getConfigsList(): any[] {
    if (!fs.existsSync(config.grafanaConfigsFile)) {
      // Migrate legacy config if it exists
      if (fs.existsSync(config.grafanaConfigFile)) {
        try {
          const fileContent = fs.readFileSync(config.grafanaConfigFile, "utf-8");
          const parsed = JSON.parse(fileContent);
          if (parsed.host && parsed.token) {
            const legacyItem = {
              id: "cfg-legacy",
              name: "Default Grafana Integration",
              host: parsed.host.trim(),
              token: parsed.token.trim(),
              datasourceUid: (parsed.datasourceUid || "bf5jy3ppyomwwd").trim(),
              isActive: true
            };
            this.saveConfigsList([legacyItem]);
            return [legacyItem];
          }
        } catch (e) {
          console.error("[GrafanaService] Error migrating legacy config:", e);
        }
      }
      return [];
    }

    try {
      const fileContent = fs.readFileSync(config.grafanaConfigsFile, "utf-8");
      return JSON.parse(fileContent);
    } catch (e) {
      console.error("[GrafanaService] Error reading configs list:", e);
      return [];
    }
  }

  /**
   * Writes the configurations list to disk.
   */
  public saveConfigsList(list: any[]): void {
    try {
      if (!fs.existsSync(config.dbDir)) {
        fs.mkdirSync(config.dbDir, { recursive: true });
      }
      fs.writeFileSync(config.grafanaConfigsFile, JSON.stringify(list, null, 2), "utf-8");
      console.log(`[GrafanaService] Successfully saved Grafana configs list file to ${config.grafanaConfigsFile}`);
    } catch (error: any) {
      throw new Error(`Gagal menulis file daftar konfigurasi Grafana: ${error.message}`);
    }
  }

  /**
   * Saves the Grafana integration configuration to disk.
   */
  public saveConfig(host: string, token: string, datasourceUid: string): void {
    try {
      const list = this.getConfigsList();
      const activeItem = list.find(c => c.isActive);

      if (activeItem) {
        activeItem.host = host.trim();
        activeItem.token = token.trim();
        activeItem.datasourceUid = (datasourceUid || "bf5jy3ppyomwwd").trim();
      } else {
        const newItem = {
          id: "cfg-" + Date.now(),
          name: "Grafana Integration",
          host: host.trim(),
          token: token.trim(),
          datasourceUid: (datasourceUid || "bf5jy3ppyomwwd").trim(),
          isActive: true
        };
        list.forEach(c => c.isActive = false);
        list.push(newItem);
      }

      this.saveConfigsList(list);

      // Keep legacy file in sync
      const payload = {
        host: host.trim(),
        token: token.trim(),
        datasourceUid: (datasourceUid || "bf5jy3ppyomwwd").trim()
      };
      fs.writeFileSync(config.grafanaConfigFile, JSON.stringify(payload, null, 2), "utf-8");
      console.log(`[GrafanaService] Successfully saved Grafana config file to ${config.grafanaConfigFile}`);
    } catch (error: any) {
      throw new Error(`Gagal menulis file konfigurasi Grafana: ${error.message}`);
    }
  }

  /**
   * Resets the dynamic Grafana configuration (reverts to env variables).
   */
  public resetConfig(): void {
    try {
      if (fs.existsSync(config.grafanaConfigsFile)) {
        fs.unlinkSync(config.grafanaConfigsFile);
        console.log(`[GrafanaService] Configs list file deleted.`);
      }
      if (fs.existsSync(config.grafanaConfigFile)) {
        fs.unlinkSync(config.grafanaConfigFile);
        console.log(`[GrafanaService] Legacy config file deleted.`);
      }
    } catch (error: any) {
      throw new Error(`Gagal mereset konfigurasi Grafana: ${error.message}`);
    }
  }

  /**
   * Fetches all datasources from the Grafana server.
   */
  public async getDatasources(overrideHost?: string, overrideToken?: string): Promise<any[]> {
    try {
      const activeConfig = config.getGrafanaConfig();
      const host = overrideHost || activeConfig.host;
      const token = overrideToken || activeConfig.token;

      if (!host || !token) {
        throw new Error("Grafana host and token must be configured before listing datasources.");
      }

      const cleanedHost = host.trim().replace(/\/$/, "");
      const targetUrl = `${cleanedHost}/api/datasources`;

      console.log(`[GrafanaService] Fetching datasources: GET ${targetUrl}`);
      const response = await axios.get(targetUrl, {
        headers: {
          "Authorization": `Bearer ${token}`
        },
        timeout: 10000
      });

      return Array.isArray(response.data) ? response.data : [];
    } catch (error: any) {
      console.error("[GrafanaService] Failed to fetch datasources:", error.message);
      if (error.response) {
        throw new Error(`Failed to fetch Grafana datasources (HTTP ${error.response.status}): ${error.response.data?.message || error.message}`);
      }
      throw new Error(`Failed to fetch Grafana datasources: ${error.message}`);
    }
  }

  /**
   * Helper method to map and log HTTP request errors contextually
   */
  private handleHttpError(error: any): void {
    const activeConfig = config.getGrafanaConfig();
    
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      const errorData = error.response?.data;

      console.error(`[GrafanaService] HTTP Request failed with status ${status}:`, errorData);

      if (status === 401) {
        throw new Error("Grafana authentication failed: Unauthorized. Please check your GRAFANA_TOKEN configuration.");
      }
      if (status === 400) {
        const detail = errorData?.message || JSON.stringify(errorData);
        throw new Error(`Grafana bad request (400): ${detail}`);
      }
      if (status === 403) {
        throw new Error("Grafana access forbidden (403): Your token may not have sufficient access to the data source.");
      }
      if (status === 404) {
        throw new Error(`Grafana endpoint not found (404): Verify that your GRAFANA_HOST ("${activeConfig.host}") is correct.`);
      }
      
      throw new Error(`Failed to query Grafana API (HTTP ${status}): ${error.message}`);
    }

    console.error("[GrafanaService] Unexpected error occurred:", error);
    throw new Error(error.message || "An unexpected error occurred while communicating with the Grafana service.");
  }
}

// Export a singleton instance
export const grafanaService = new GrafanaService();
