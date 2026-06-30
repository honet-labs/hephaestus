import axios from "axios";
import fs from "fs";
import config, { updateActiveGrafanaCache } from "../config/env";
import pool, { query } from "../config/db";

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
   * Retrieves all saved Grafana configurations.
   */
  public async getConfigsList(): Promise<any[]> {
    const res = await query(
      `SELECT id, name, host, token, datasource_uid AS "datasourceUid", is_active AS "isActive" 
       FROM grafana_configs 
       ORDER BY name ASC`
    );
    return res.rows;
  }

  /**
   * Writes the configurations list to database.
   */
  public async saveConfigsList(list: any[]): Promise<void> {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      // Keep ids of incoming items
      const incomingIds = list.map(item => item.id);
      if (incomingIds.length > 0) {
        await client.query("DELETE FROM grafana_configs WHERE id NOT IN (" + incomingIds.map((_, i) => `$${i + 1}`).join(", ") + ")", incomingIds);
      } else {
        await client.query("DELETE FROM grafana_configs");
      }
      for (const item of list) {
        await client.query(
          `INSERT INTO grafana_configs (id, name, host, token, datasource_uid, is_active)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (id) DO UPDATE SET
             name = EXCLUDED.name,
             host = EXCLUDED.host,
             token = EXCLUDED.token,
             datasource_uid = EXCLUDED.datasource_uid,
             is_active = EXCLUDED.is_active`,
          [item.id, item.name, item.host, item.token, item.datasourceUid, !!item.isActive]
        );
      }
      await client.query("COMMIT");

      // Update memory cache for the active configuration
      const active = list.find(c => c.isActive);
      if (active) {
        updateActiveGrafanaCache({
          id: active.id,
          name: active.name,
          host: active.host.replace(/\/$/, ""),
          token: active.token,
          datasourceUid: active.datasourceUid || "bf5jy3ppyomwwd",
          isConfigured: true
        });
      } else {
        // Fallback to env defaults
        updateActiveGrafanaCache({
          id: "cfg-env",
          name: "Environment Defaults",
          host: (process.env.GRAFANA_HOST || "").replace(/\/$/, ""),
          token: process.env.GRAFANA_TOKEN || "",
          datasourceUid: process.env.GRAFANA_DATASOURCE_UID || "bf5jy3ppyomwwd",
          isConfigured: !!(process.env.GRAFANA_HOST && process.env.GRAFANA_TOKEN)
        });
      }
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Saves the Grafana integration configuration to database.
   */
  public async saveConfig(host: string, token: string, datasourceUid: string): Promise<void> {
    try {
      const list = await this.getConfigsList();
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

      await this.saveConfigsList(list);
    } catch (error: any) {
      throw new Error(`Gagal menyimpan konfigurasi Grafana: ${error.message}`);
    }
  }

  /**
   * Resets the dynamic Grafana configuration (reverts to env variables).
   */
  public async resetConfig(): Promise<void> {
    try {
      await query("DELETE FROM grafana_configs");
      updateActiveGrafanaCache({
        id: "cfg-env",
        name: "Environment Defaults",
        host: (process.env.GRAFANA_HOST || "").replace(/\/$/, ""),
        token: process.env.GRAFANA_TOKEN || "",
        datasourceUid: process.env.GRAFANA_DATASOURCE_UID || "bf5jy3ppyomwwd",
        isConfigured: !!(process.env.GRAFANA_HOST && process.env.GRAFANA_TOKEN)
      });
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
