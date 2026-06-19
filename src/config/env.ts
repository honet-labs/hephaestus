import dotenv from "dotenv";
import path from "path";
import fs from "fs";

// Load environment variables if .env file exists, but do not require it
const envPath = path.resolve(__dirname, "../../.env");
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

const DB_DIR = process.env.DB_DIR || (process.env.NODE_ENV === "production" ? "/app/data" : path.join(process.cwd(), "data"));
const GRAFANA_CONFIG_FILE = path.join(DB_DIR, "grafana_config.json");

export interface GrafanaConfig {
  host: string;
  token: string;
  datasourceUid: string;
  isConfigured: boolean;
}

export const config = {
  port: parseInt(process.env.PORT || "5000", 10),
  allowedOrigins: (process.env.ALLOWED_ORIGINS || "http://localhost:3000,http://localhost:5173,http://localhost:16754,http://127.0.0.1:3000,http://127.0.0.1:5173")
    .split(",")
    .map(origin => origin.trim()),
  
  dbDir: DB_DIR,
  grafanaConfigFile: GRAFANA_CONFIG_FILE,
  
  /**
   * Retrieves active Grafana credentials.
   * Priority: 1. dynamic JSON file config, 2. environment variables, 3. empty defaults.
   */
  getGrafanaConfig(): GrafanaConfig {
    if (fs.existsSync(GRAFANA_CONFIG_FILE)) {
      try {
        const fileContent = fs.readFileSync(GRAFANA_CONFIG_FILE, "utf-8");
        const parsed = JSON.parse(fileContent);
        if (parsed.host && parsed.token) {
          return {
            host: parsed.host.replace(/\/$/, ""),
            token: parsed.token,
            datasourceUid: parsed.datasourceUid || "bf5jy3ppyomwwd",
            isConfigured: true
          };
        }
      } catch (e) {
        console.error("[Config] Error reading dynamic grafana_config.json:", e);
      }
    }
    
    // Fallback to environment variables or empty placeholders
    const envHost = process.env.GRAFANA_HOST || "";
    const envToken = process.env.GRAFANA_TOKEN || "";
    const envUid = process.env.GRAFANA_DATASOURCE_UID || "bf5jy3ppyomwwd";
    
    return {
      host: envHost ? envHost.replace(/\/$/, "") : "",
      token: envToken,
      datasourceUid: envUid,
      isConfigured: !!(envHost && envToken)
    };
  }
};

export default config;
