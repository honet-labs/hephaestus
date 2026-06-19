import dotenv from "dotenv";
import path from "path";

// Load environment variables from .env file
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

export const config = {
  port: parseInt(process.env.PORT || "5000", 10),
  allowedOrigins: (process.env.ALLOWED_ORIGINS || "http://localhost:3000,http://localhost:5173")
    .split(",")
    .map(origin => origin.trim()),
  
  grafana: {
    host: (process.env.GRAFANA_HOST || "http://localhost:3000").replace(/\/$/, ""),
    token: process.env.GRAFANA_TOKEN || "",
    datasourceUid: process.env.GRAFANA_DATASOURCE_UID || "bf5jy3ppyomwwd"
  }
};

// Validate critical configurations
if (!config.grafana.token || config.grafana.token === "your_grafana_service_account_token_here") {
  console.warn("⚠️  WARNING: GRAFANA_TOKEN is not configured or still set to default placeholder. Grafana integration queries will fail with 401 Unauthorized.");
}

if (!config.grafana.host) {
  console.error("❌ ERROR: GRAFANA_HOST is not defined in environment variables.");
}
export default config;
