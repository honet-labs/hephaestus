import axios from "axios";
import config from "../config/env";

export interface Datapoint {
  timestamp: number;
  value: number | null;
}

export interface GrafanaQueryRequest {
  from: string; // 13-digit epoch ms as string
  to: string;   // 13-digit epoch ms as string
  targetRouter: string;
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
  private buildQueryPayload(fromMs: string, toMs: string, targetRouter: string) {
    // Generate PromQL expression using dynamic node/router name
    const expr = `mktxp_system_cpu_load{routerboard_name="${targetRouter}"}`;

    return {
      from: fromMs,
      to: toMs,
      queries: [
        {
          refId: "A",
          datasource: {
            type: "prometheus",
            uid: config.grafana.datasourceUid
          },
          expr: expr,
          format: "time_series",
          intervalMs: 60000,
          maxDataPoints: 1000
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
      // 1. Time conversion validation
      const fromEpoch = this.convertToEpochMs(params.from);
      const toEpoch = this.convertToEpochMs(params.to);

      // 2. Build Payload
      const payload = this.buildQueryPayload(fromEpoch, toEpoch, params.targetRouter);
      const targetUrl = `${config.grafana.host}/api/ds/query`;

      // 3. Setup authentication headers
      const headers = {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${config.grafana.token}`
      };

      // 4. Send POST request to Grafana ds query endpoint
      console.log(`[GrafanaService] Fetching metrics from Grafana API: POST ${targetUrl}`);
      const response = await axios.post(targetUrl, payload, { headers, timeout: 15000 });

      // 5. Parse and sanitize the response
      return this.parseAndSanitize(response.data);
    } catch (error: any) {
      this.handleHttpError(error);
      throw error; // Re-throw if handleHttpError didn't throw (fallback)
    }
  }

  /**
   * Extract, map and sanitize data from the nested Grafana JSON response structure:
   * results.A.frames[0].data.values
   */
  private parseAndSanitize(responseData: any): Datapoint[] {
    // Navigate nested properties safely using optional chaining
    const frame = responseData?.results?.A?.frames?.[0];
    if (!frame) {
      throw new Error("Invalid response schema: No series data (results.A.frames[0]) returned from Grafana.");
    }

    const values = frame.data?.values;
    if (!values || !Array.isArray(values) || values.length < 2) {
      // Could mean the query executed successfully but returned empty result sets (no datapoints)
      console.log("[GrafanaService] Grafana returned empty values array. Returning empty dataset.");
      return [];
    }

    const timestamps: number[] = values[0];
    const metrics: (number | null)[] = values[1];

    if (!Array.isArray(timestamps) || !Array.isArray(metrics)) {
      throw new Error("Invalid response schema: Timestamps or metrics are not structured as arrays.");
    }

    // Map the two independent parallel arrays into a single clean list of objects
    const cleanData: Datapoint[] = [];
    const size = Math.min(timestamps.length, metrics.length);

    for (let i = 0; i < size; i++) {
      cleanData.push({
        timestamp: Number(timestamps[i]),
        // Round values or preserve precision depending on requirements. Standard number formatting is sufficient here.
        value: metrics[i] !== null && metrics[i] !== undefined ? Number(metrics[i]) : null
      });
    }

    return cleanData;
  }

  /**
   * Helper method to map and log HTTP request errors contextually
   */
  private handleHttpError(error: any): void {
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
        throw new Error(`Grafana endpoint not found (404): Verify that your GRAFANA_HOST ("${config.grafana.host}") is correct.`);
      }
      
      throw new Error(`Failed to query Grafana API (HTTP ${status}): ${error.message}`);
    }

    // Non-axios/Network connection errors
    console.error("[GrafanaService] Unexpected error occurred:", error);
    throw new Error(error.message || "An unexpected error occurred while communicating with the Grafana service.");
  }
}

// Export a singleton instance
export const grafanaService = new GrafanaService();
