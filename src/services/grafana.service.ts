import axios from "axios";
import fs from "fs";
import config from "../config/env";

export interface Datapoint {
  timestamp: number;
  value: number | null;
}

export interface GrafanaQueryRequest {
  from: string; // 13-digit epoch ms as string
  to: string;   // 13-digit epoch ms as string
  expr: string;
  format?: string;
  intervalMs?: number;
  maxDataPoints?: number;
}

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
   * Constructs the Grafana JSON request body dynamically based on parameters.
   */
  private buildQueryPayload(
    fromMs: string,
    toMs: string,
    expr: string,
    format: string = "time_series",
    intervalMs: number = 60000,
    maxDataPoints: number = 1000
  ) {
    const activeConfig = config.getGrafanaConfig();

    return {
      from: fromMs,
      to: toMs,
      queries: [
        {
          refId: "A",
          datasource: {
            type: "prometheus",
            uid: activeConfig.datasourceUid
          },
          expr: expr,
          format: format,
          intervalMs: intervalMs,
          maxDataPoints: maxDataPoints
        }
      ]
    };
  }

  /**
   * Fetches CPU utilization data from Grafana /api/ds/query, handles authentication,
   * parses the response, and sanitizes the output.
   */
  public async queryCpuLoad(params: GrafanaQueryRequest): Promise<Datapoint[]> {
    try {
      const activeConfig = config.getGrafanaConfig();
      if (!activeConfig.isConfigured || !activeConfig.token) {
        throw new Error("Grafana token is not configured. Please set the integration details in System Settings.");
      }

      // 1. Time conversion validation
      const fromEpoch = this.convertToEpochMs(params.from);
      const toEpoch = this.convertToEpochMs(params.to);

      // 2. Build Payload
      const payload = this.buildQueryPayload(
        fromEpoch,
        toEpoch,
        params.expr,
        params.format,
        params.intervalMs,
        params.maxDataPoints
      );
      const targetUrl = `${activeConfig.host}/api/ds/query`;

      // 3. Setup authentication headers
      const headers = {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${activeConfig.token}`
      };

      // 4. Send POST request to Grafana ds query endpoint
      console.log(`[GrafanaService] Fetching metrics from Grafana API: POST ${targetUrl} (expr: ${payload.queries[0].expr})`);
      const response = await axios.post(targetUrl, payload, { headers, timeout: 15000 });

      // 5. Parse and sanitize the response
      return this.parseAndSanitize(response.data);
    } catch (error: any) {
      this.handleHttpError(error);
      throw error;
    }
  }

  /**
   * Extract, map and sanitize data from the nested Grafana JSON response structure:
   * results.A.frames[0].data.values
   */
  private parseAndSanitize(responseData: any): Datapoint[] {
    const frame = responseData?.results?.A?.frames?.[0];
    if (!frame) {
      throw new Error("Invalid response schema: No series data (results.A.frames[0]) returned from Grafana.");
    }

    const values = frame.data?.values;
    if (!values || !Array.isArray(values) || values.length < 2) {
      console.log("[GrafanaService] Grafana returned empty values array. Returning empty dataset.");
      return [];
    }

    const timestamps: number[] = values[0];
    const metrics: (number | null)[] = values[1];

    if (!Array.isArray(timestamps) || !Array.isArray(metrics)) {
      throw new Error("Invalid response schema: Timestamps or metrics are not structured as arrays.");
    }

    const cleanData: Datapoint[] = [];
    const size = Math.min(timestamps.length, metrics.length);

    for (let i = 0; i < size; i++) {
      cleanData.push({
        timestamp: Number(timestamps[i]),
        value: metrics[i] !== null && metrics[i] !== undefined ? Number(metrics[i]) : null
      });
    }

    return cleanData;
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
   * Saves the Grafana integration configuration to disk.
   */
  public saveConfig(host: string, token: string, datasourceUid: string): void {
    try {
      if (!fs.existsSync(config.dbDir)) {
        fs.mkdirSync(config.dbDir, { recursive: true });
      }

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
      if (fs.existsSync(config.grafanaConfigFile)) {
        fs.unlinkSync(config.grafanaConfigFile);
        console.log(`[GrafanaService] Dynamic config file deleted. Reverting to environment variables.`);
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
