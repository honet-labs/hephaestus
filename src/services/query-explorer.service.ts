import crypto from "crypto";
import axios from "axios";
import config from "../config/env";
import { query } from "../config/db";

export interface QueryColumn {
  name: string;
  query: string;
}

export interface QueryPanelItem {
  id: string;
  name: string;
  description?: string;
  datasourceType: string;
  datasourceUid: string;
  timeRangeFrom: string;
  timeRangeTo: string;
  step: string;
  columns: QueryColumn[];
  createdAt?: Date;
}

function parseRelativeTime(timeStr: string): number {
  const now = Math.floor(Date.now() / 1000);
  const cleanStr = timeStr.trim();
  if (cleanStr === "now") return now;
  
  const match = cleanStr.match(/^now-(\d+)([smhdwy])$/);
  if (!match) {
    // Try parsing DD/MM/YYYY HH:mm:ss format
    const ddmmyyyyRegex = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/;
    const matchDd = cleanStr.match(ddmmyyyyRegex);
    if (matchDd) {
      const day = parseInt(matchDd[1], 10);
      const month = parseInt(matchDd[2], 10) - 1;
      const year = parseInt(matchDd[3], 10);
      const hour = matchDd[4] ? parseInt(matchDd[4], 10) : 0;
      const minute = matchDd[5] ? parseInt(matchDd[5], 10) : 0;
      const second = matchDd[6] ? parseInt(matchDd[6], 10) : 0;
      const dateObj = new Date(year, month, day, hour, minute, second);
      if (!isNaN(dateObj.getTime())) {
        return Math.floor(dateObj.getTime() / 1000);
      }
    }

    // Fallback to standard JavaScript date parsing
    const parsed = Date.parse(cleanStr);
    if (!isNaN(parsed)) {
      return Math.floor(parsed / 1000);
    }
    return now;
  }
  const value = parseInt(match[1], 10);
  const unit = match[2];
  let seconds = 0;
  switch (unit) {
    case "s": seconds = value; break;
    case "m": seconds = value * 60; break;
    case "h": seconds = value * 3600; break;
    case "d": seconds = value * 86400; break;
    case "w": seconds = value * 86400 * 7; break;
    case "y": seconds = value * 86400 * 365; break;
  }
  return now - seconds;
}

function formatTimestamp(epochSecs: number): string {
  const date = new Date(epochSecs * 1000);
  const pad = (num: number) => num.toString().padStart(2, "0");
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  const seconds = pad(date.getSeconds());
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

function parseStepToSeconds(stepStr: string): number {
  const match = stepStr.trim().match(/^(\d+)([smhdw])$/);
  if (!match) return 60; // default 1m
  const value = parseInt(match[1], 10);
  const unit = match[2];
  switch (unit) {
    case "s": return value;
    case "m": return value * 60;
    case "h": return value * 3600;
    case "d": return value * 86400;
    case "w": return value * 86400 * 7;
    default: return value * 60;
  }
}

function formatSecondsToStep(secs: number): string {
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}


export class QueryExplorerService {
  /**
   * Retrieves all saved query panels.
   */
  public async getQueryPanels(): Promise<QueryPanelItem[]> {
    const res = await query(
      `SELECT id, name, description, datasource_type AS "datasourceType", datasource_uid AS "datasourceUid", 
              time_range_from AS "timeRangeFrom", time_range_to AS "timeRangeTo", step, columns, created_at AS "createdAt"
       FROM query_panels
       ORDER BY created_at DESC`
    );
    return res.rows;
  }

  /**
   * Retrieves a single query panel by ID.
   */
  public async getQueryPanelById(id: string): Promise<QueryPanelItem | null> {
    const res = await query(
      `SELECT id, name, description, datasource_type AS "datasourceType", datasource_uid AS "datasourceUid", 
              time_range_from AS "timeRangeFrom", time_range_to AS "timeRangeTo", step, columns, created_at AS "createdAt"
       FROM query_panels
       WHERE id = $1`,
      [id]
    );
    if (res.rows.length === 0) return null;
    return res.rows[0];
  }

  /**
   * Saves or updates a query panel.
   */
  public async saveQueryPanel(panel: Partial<QueryPanelItem>): Promise<QueryPanelItem> {
    const columnsJson = JSON.stringify(panel.columns || []);
    
    if (panel.id) {
      await query(
        `UPDATE query_panels
         SET name = $1, description = $2, datasource_type = $3, datasource_uid = $4, 
             time_range_from = $5, time_range_to = $6, step = $7, columns = $8
         WHERE id = $9`,
        [
          panel.name,
          panel.description || null,
          panel.datasourceType || "grafana",
          panel.datasourceUid,
          panel.timeRangeFrom || "now-1h",
          panel.timeRangeTo || "now",
          panel.step || "1m",
          columnsJson,
          panel.id
        ]
      );
      
      const updated = await this.getQueryPanelById(panel.id);
      if (!updated) throw new Error("Failed to retrieve updated query panel.");
      return updated;
    } else {
      const newId = "qp-" + crypto.randomUUID();
      await query(
        `INSERT INTO query_panels (id, name, description, datasource_type, datasource_uid, time_range_from, time_range_to, step, columns)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          newId,
          panel.name,
          panel.description || null,
          panel.datasourceType || "grafana",
          panel.datasourceUid,
          panel.timeRangeFrom || "now-1h",
          panel.timeRangeTo || "now",
          panel.step || "1m",
          columnsJson
        ]
      );
      
      const created = await this.getQueryPanelById(newId);
      if (!created) throw new Error("Failed to retrieve created query panel.");
      return created;
    }
  }

  /**
   * Deletes a query panel by ID.
   */
  public async deleteQueryPanel(id: string): Promise<void> {
    await query("DELETE FROM query_panels WHERE id = $1", [id]);
  }

  /**
   * Executes queries for all columns in a query panel and returns aligned tabular data.
   */
  public async executeQuery(
    datasourceUid: string,
    timeRangeFrom: string,
    timeRangeTo: string,
    step: string,
    columns: QueryColumn[]
  ): Promise<any> {
    // Handle Uptime Kuma datasource
    if (datasourceUid.startsWith("uk-")) {
      return this.executeUptimeKumaQuery(datasourceUid, timeRangeFrom, timeRangeTo, columns);
    }

    const grafanaConfig = config.getGrafanaConfig();
    if (!grafanaConfig.isConfigured) {
      throw new Error("Grafana Integration is not configured. Please configure it in Settings first.");
    }

    const start = parseRelativeTime(timeRangeFrom);
    const end = parseRelativeTime(timeRangeTo);
    const duration = end - start;

    // Enforce step safety to avoid loading excessive data points
    let stepInSeconds = parseStepToSeconds(step);
    const maxDataPoints = 1000;
    if (duration / stepInSeconds > maxDataPoints) {
      stepInSeconds = Math.ceil(duration / maxDataPoints);
      step = formatSecondsToStep(stepInSeconds);
      console.log(`[QueryExplorer] Step adjusted dynamically to "${step}" to limit data points to ~${maxDataPoints}`);
    }
    
    // Build Grafana Datasource Proxy Query URL
    const proxyUrl = `${grafanaConfig.host}/api/datasources/proxy/uid/${datasourceUid}/api/v1/query_range`;
    
    console.log(`[QueryExplorer] Target Proxy URL: ${proxyUrl}`);
    console.log(`[QueryExplorer] Range: ${start} to ${end} (step: ${step})`);


    // dataStore[ipAddress][timestampSecs][columnName] = value
    const dataStore: Record<string, Record<number, Record<string, any>>> = {};
    const allTimestamps = new Set<number>();
    const allIps = new Set<string>();

    // Run queries in parallel
    const queryPromises = columns.map(async (col) => {
      try {
        const response = await axios.get(proxyUrl, {
          params: {
            query: col.query,
            start,
            end,
            step
          },
          headers: {
            "Authorization": `Bearer ${grafanaConfig.token}`
          },
          timeout: 15000
        });

        if (response.data && response.data.status === "success" && response.data.data.result) {
          const results = response.data.data.result;
          
          for (const item of results) {
            const metric = item.metric || {};
            
            // Extract IP Address or instance from metrics
            let ipAddress = "Unknown";
            if (metric.instance) {
              ipAddress = metric.instance.split(":")[0];
            } else if (metric.node) {
              ipAddress = metric.node.split(":")[0];
            } else {
              // Find first key that looks like an ip address or has any label
              const keys = Object.keys(metric);
              if (keys.length > 0) {
                // If it's job, skip it if there's other info
                const valKey = keys.find(k => k !== "job") || keys[0];
                ipAddress = metric[valKey];
              }
            }

            allIps.add(ipAddress);

            // Populate timeseries values
            const values = item.values || []; // Array of [timestamp, value]
            for (const [ts, val] of values) {
              const tsSecs = Math.floor(parseFloat(ts));
              allTimestamps.add(tsSecs);

              if (!dataStore[ipAddress]) {
                dataStore[ipAddress] = {};
              }
              if (!dataStore[ipAddress][tsSecs]) {
                dataStore[ipAddress][tsSecs] = {};
              }

              const numVal = parseFloat(val);
              dataStore[ipAddress][tsSecs][col.name] = isNaN(numVal) ? val : numVal;
            }
          }
        }
      } catch (err: any) {
        console.error(`[QueryExplorer] Column query "${col.name}" failed:`, err.message);
        // We continue executing other queries even if one fails
      }
    });

    await Promise.all(queryPromises);

    // Sort IP Addresses and Timestamps
    const sortedIps = Array.from(allIps).sort();
    const sortedTimestamps = Array.from(allTimestamps).sort((a, b) => b - a); // descending by default for latest first in table

    // Format the response data for easy rendering
    // We will align data by timestamp
    const rows: any[] = [];
    
    for (const ts of sortedTimestamps) {
      const timestampStr = formatTimestamp(ts);
      
      // We return both flat rows and structured side-by-side cells
      const rowItem: Record<string, any> = {
        timestamp: ts,
        timestampStr: timestampStr
      };

      // Populate flat values for each IP
      sortedIps.forEach((ip) => {
        rowItem[ip] = {
          ipAddress: ip,
          timestampStr: timestampStr
        };
        
        columns.forEach((col) => {
          const val = (dataStore[ip] && dataStore[ip][ts]) ? dataStore[ip][ts][col.name] : null;
          rowItem[ip][col.name] = val;
        });
      });

      rows.push(rowItem);
    }

    return {
      ips: sortedIps,
      columns: columns.map(c => c.name),
      rows: rows
    };
  }

  /**
   * Fetches Prometheus metrics metadata via Grafana datasource proxy
   */
  public async getMetricsMetadata(datasourceUid: string, queryStr?: string): Promise<any> {
    const grafanaConfig = config.getGrafanaConfig();
    if (!grafanaConfig.isConfigured) {
      throw new Error("Grafana Integration is not configured. Please configure it in Settings first.");
    }
    
    const proxyUrl = `${grafanaConfig.host}/api/datasources/proxy/uid/${datasourceUid}/api/v1/metadata`;
    console.log(`[QueryExplorer] Fetching metadata from proxy: ${proxyUrl}`);
    
    try {
      const response = await axios.get(proxyUrl, {
        headers: {
          "Authorization": `Bearer ${grafanaConfig.token}`
        },
        timeout: 10000
      });

      if (response.data && response.data.status === "success") {
        const allMetadata = response.data.data;
        const result: any[] = [];
        const queryLower = queryStr ? queryStr.toLowerCase().trim() : "";
        
        let count = 0;
        for (const metricName of Object.keys(allMetadata)) {
          if (queryLower && !metricName.toLowerCase().includes(queryLower)) {
            continue;
          }
          
          const metaList = allMetadata[metricName];
          if (Array.isArray(metaList) && metaList.length > 0) {
            result.push({
              metric: metricName,
              type: metaList[0].type || "unknown",
              help: metaList[0].help || "No description provided."
            });
          } else {
            result.push({
              metric: metricName,
              type: "unknown",
              help: "No description provided."
            });
          }
          
          count++;
          if (count >= 200) {
            break;
          }
        }
        
        // Sort results alphabetically by metric name
        result.sort((a, b) => a.metric.localeCompare(b.metric));
        return result;
      }
      throw new Error("Prometheus returned non-success response status.");
    } catch (err: any) {
      console.error(`[QueryExplorer] Failed to fetch metrics metadata:`, err.message);
      throw new Error(`Failed to fetch metadata: ${err.message}`);
    }
  }

  private async executeUptimeKumaQuery(
    datasourceUid: string,
    timeRangeFrom: string,
    timeRangeTo: string,
    columns: QueryColumn[]
  ): Promise<any> {
    const monitorId = parseInt(datasourceUid.replace("uk-", ""), 10);
    const { uptimeKumaService } = require("./uptime-kuma.service");

    try {
      const monitor = await uptimeKumaService.getMonitorById(monitorId);
      const hostname = monitor.hostname || monitor.url || `monitor-${monitorId}`;

      const ts = Math.floor(Date.now() / 1000);
      const timestampStr = new Date(ts * 1000).toISOString();
      const colNames = columns.map(c => c.alias || c.name);

      const rowItem: Record<string, any> = {
        timestamp: ts,
        timestampStr: timestampStr
      };

      rowItem[hostname] = { ipAddress: hostname, timestampStr: timestampStr };

      for (const col of columns) {
        let value: any;
        switch (col.query.toLowerCase()) {
          case "status":
            value = monitor.status === 1 ? 1 : 0;
            break;
          case "uptime":
            value = monitor.uptime || 0;
            break;
          case "response_time":
          case "avg_response":
            value = monitor.avgResponse || 0;
            break;
          default:
            value = monitor[col.query] ?? null;
        }
        rowItem[hostname][col.name] = value;
      }

      return {
        ips: [hostname],
        columns: colNames,
        rows: [rowItem]
      };
    } catch (err: any) {
      console.error(`[QueryExplorer] Uptime Kuma query failed:`, err.message);
      throw new Error(`Uptime Kuma query failed: ${err.message}`);
    }
  }
}

export const queryExplorerService = new QueryExplorerService();
