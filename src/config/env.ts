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
  allowedOrigins: (process.env.ALLOWED_ORIGINS || "http://localhost:3000,http://localhost:5173,http://localhost:16754,http://127.0.0.1:3000,http://127.0.0.1:5173,https://hephaestus-tools.honet.web.id")
    .split(",")
    .map(origin => origin.trim()),
  
  dbDir: DB_DIR,
  grafanaConfigFile: GRAFANA_CONFIG_FILE,
  grafanaConfigsFile: GRAFANA_CONFIGS_FILE,
  prometheusConfigsFile: PROMETHEUS_CONFIGS_FILE,
  monitoringViewsFile: MONITORING_VIEWS_FILE,
  dbConfigFile: path.join(DB_DIR, "db_config.json"),
  prometheusConfigPath: process.env.PROMETHEUS_CONFIG_PATH || (process.env.NODE_ENV === "production" ? "/app/data/prometheus.yml" : path.join(DB_DIR, "prometheus.yml")),
  prometheusReloadUrl: process.env.PROMETHEUS_RELOAD_URL || "http://localhost:9090/-/reload",
  
  /**
   * Retrieves active Grafana credentials from memory cache.
   */
  getGrafanaConfig(): GrafanaConfig {
    return activeGrafanaCache;
  },

  /**
   * Retrieves active Prometheus credentials/modes from memory cache.
   */
  getActivePrometheusConfig(): PrometheusConfigItem {
    return activePrometheusCache;
  }
};

export let activeGrafanaCache: GrafanaConfig = {
  id: "cfg-env",
  name: "Environment Defaults",
  host: (process.env.GRAFANA_HOST || "").replace(/\/$/, ""),
  token: process.env.GRAFANA_TOKEN || "",
  datasourceUid: process.env.GRAFANA_DATASOURCE_UID || "bf5jy3ppyomwwd",
  isConfigured: !!(process.env.GRAFANA_HOST && process.env.GRAFANA_TOKEN)
};

export let activePrometheusCache: PrometheusConfigItem = {
  id: "prom-cfg-env",
  name: "Environment Defaults",
  mode: "local",
  path: process.env.PROMETHEUS_CONFIG_PATH || "/etc/prometheus/prometheus.yml",
  reloadUrl: process.env.PROMETHEUS_RELOAD_URL || "http://localhost:9090/-/reload",
  isActive: true
};

export function updateActiveGrafanaCache(newConfig: GrafanaConfig) {
  activeGrafanaCache = newConfig;
}

export function updateActivePrometheusCache(newConfig: PrometheusConfigItem) {
  activePrometheusCache = newConfig;
}

export default config;
