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
const GRAFANA_CONFIGS_FILE = path.join(DB_DIR, "grafana_configs.json");
const PROMETHEUS_CONFIGS_FILE = path.join(DB_DIR, "prometheus_configs.json");
const MONITORING_VIEWS_FILE = path.join(DB_DIR, "monitoring_views.json");

export interface PrometheusConfigItem {
  id: string;
  name: string;
  mode: "local" | "ssh";
  path: string;
  reloadUrl: string;
  sshHost?: string;
  sshPort?: number;
  sshUser?: string;
  sshAuth?: "password" | "key";
  sshPassword?: string;
  sshKey?: string;
  isActive: boolean;
}

export interface GrafanaConfig {
  id?: string;
  name?: string;
  host: string;
  token: string;
  datasourceUid: string;
  isConfigured: boolean;
}

export interface GrafanaConfigItem {
  id: string;
  name: string;
  host: string;
  token: string;
  datasourceUid: string;
  isActive: boolean;
}

export const config = {
  port: parseInt(process.env.PORT || "5000", 10),
  allowedOrigins: (process.env.ALLOWED_ORIGINS || "http://localhost:3000,http://localhost:5173,http://localhost:16754,http://127.0.0.1:3000,http://127.0.0.1:5173")
    .split(",")
    .map(origin => origin.trim()),
  
  dbDir: DB_DIR,
  grafanaConfigFile: GRAFANA_CONFIG_FILE,
  grafanaConfigsFile: GRAFANA_CONFIGS_FILE,
  prometheusConfigsFile: PROMETHEUS_CONFIGS_FILE,
  monitoringViewsFile: MONITORING_VIEWS_FILE,
  prometheusConfigPath: process.env.PROMETHEUS_CONFIG_PATH || (process.env.NODE_ENV === "production" ? "/app/data/prometheus.yml" : path.join(DB_DIR, "prometheus.yml")),
  prometheusReloadUrl: process.env.PROMETHEUS_RELOAD_URL || "http://localhost:9090/-/reload",
  
  /**
   * Retrieves active Grafana credentials.
   * Priority: 1. dynamic JSON file configs list, 2. legacy config file, 3. environment variables, 4. empty defaults.
   */
  getGrafanaConfig(): GrafanaConfig {
    if (fs.existsSync(GRAFANA_CONFIGS_FILE)) {
      try {
        const fileContent = fs.readFileSync(GRAFANA_CONFIGS_FILE, "utf-8");
        const list: GrafanaConfigItem[] = JSON.parse(fileContent);
        const active = list.find(c => c.isActive);
        if (active) {
          return {
            id: active.id,
            name: active.name,
            host: active.host.replace(/\/$/, ""),
            token: active.token,
            datasourceUid: active.datasourceUid || "bf5jy3ppyomwwd",
            isConfigured: true
          };
        }
      } catch (e) {
        console.error("[Config] Error reading dynamic grafana_configs.json:", e);
      }
    }

    if (fs.existsSync(GRAFANA_CONFIG_FILE)) {
      try {
        const fileContent = fs.readFileSync(GRAFANA_CONFIG_FILE, "utf-8");
        const parsed = JSON.parse(fileContent);
        if (parsed.host && parsed.token) {
          return {
            id: "cfg-legacy",
            name: "Default Grafana Integration",
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
      id: "cfg-env",
      name: "Environment Defaults",
      host: envHost ? envHost.replace(/\/$/, "") : "",
      token: envToken,
      datasourceUid: envUid,
      isConfigured: !!(envHost && envToken)
    };
  },

  /**
   * Retrieves active Prometheus credentials/modes.
   */
  getActivePrometheusConfig(): PrometheusConfigItem {
    if (fs.existsSync(PROMETHEUS_CONFIGS_FILE)) {
      try {
        const fileContent = fs.readFileSync(PROMETHEUS_CONFIGS_FILE, "utf-8");
        const list: PrometheusConfigItem[] = JSON.parse(fileContent);
        const active = list.find(c => c.isActive);
        if (active) {
          return active;
        }
      } catch (e) {
        console.error("[Config] Error reading dynamic prometheus_configs.json:", e);
      }
    }
    
    // Fallback to environment variables or defaults
    return {
      id: "prom-cfg-env",
      name: "Environment Defaults",
      mode: "local",
      path: process.env.PROMETHEUS_CONFIG_PATH || "/etc/prometheus/prometheus.yml",
      reloadUrl: process.env.PROMETHEUS_RELOAD_URL || "http://localhost:9090/-/reload",
      isActive: true
    };
  }
};

export default config;
