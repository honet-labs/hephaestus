import dotenv from "dotenv";
import path from "path";
import fs from "fs";

// Load environment variables from .env file
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

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
  allowedOrigins: (process.env.ALLOWED_ORIGINS || "http://localhost:3000,http://localhost:5173")
    .split(",")
    .map(origin => origin.trim()),
  
  dbDir: DB_DIR,
  grafanaConfigFile: GRAFANA_CONFIG_FILE,
  
  /**
   * Retrieves active Grafana credentials.
   * Priority: 1. dynamic JSON file config, 2. environment variables.
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
    
    // Fallback to environment variables
    const envHost = process.env.GRAFANA_HOST || "http://localhost:3000";
    const envToken = process.env.GRAFANA_TOKEN || "";
    const envUid = process.env.GRAFANA_DATASOURCE_UID || "bf5jy3ppyomwwd";
    
    return {
      host: envHost.replace(/\/$/, ""),
      token: envToken,
      datasourceUid: envUid,
      isConfigured: !!(process.env.GRAFANA_TOKEN && process.env.GRAFANA_TOKEN !== "your_grafana_service_account_token_here")
    };
  }
};

// Log warning on startup if environment config is missing and no file is set
const activeConfig = config.getGrafanaConfig();
if (!activeConfig.isConfigured) {
  console.warn("⚠️  WARNING: Grafana integrations are not configured yet. Grafana API queries will fail.");
}

export default config;
