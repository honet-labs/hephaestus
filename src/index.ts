import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import path from "path";
import config from "./config/env";
import { initDb, isDbConnected } from "./config/db";
import settingsRoutes from "./routes/settings.routes";
import prometheusRoutes from "./routes/prometheus.routes";
import monitoringViewRoutes from "./routes/monitoring-view.routes";
import snmpRoutes from "./routes/snmp.routes";
import systemRoutes from "./routes/system.routes";
import userRoutes from "./routes/user.routes";
import activityLogRoutes from "./routes/activity-log.routes";
import queryExplorerRoutes from "./routes/query-explorer.routes";

const app = express();

// 1. CORS Configuration
const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    // Allow all origins dynamically to prevent CORS issues on different ports or IP addresses
    callback(null, true);
  },
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true
};

app.use(cors(corsOptions));

// 2. Request parsing middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Simple logger middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} - Origin: ${req.get("origin") || "N/A"}`);
  next();
});

// Serve static web UI files
app.use(express.static(path.join(__dirname, "../public")));

// Root route serves the Web UI index.html
app.get("/", (req: Request, res: Response) => {
  res.sendFile(path.join(__dirname, "../public/index.html"));
});

// 3. Healthcheck route
app.get("/health", (req: Request, res: Response) => {
  res.status(200).json({
    status: "UP",
    timestamp: new Date().toISOString(),
    service: "Hephaestus Grafana Integration API"
  });
});

// 4. API Routes registration
app.use("/api/v1/settings", settingsRoutes);
app.use("/api/v1/prometheus", prometheusRoutes);
app.use("/api/v1/monitoring-views", monitoringViewRoutes);
app.use("/api/v1/snmp", snmpRoutes);
app.use("/api/v1/system", systemRoutes);
app.use("/api/v1/users", userRoutes);
app.use("/api/v1/activity-logs", activityLogRoutes);
app.use("/api/v1/query-explorer", queryExplorerRoutes);

// 5. 404 Route handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: "Not Found",
    message: `The endpoint ${req.method} ${req.path} does not exist.`
  });
});

// 6. Global Error Handling Middleware
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error("Unhandled global server error:", err);
  
  res.status(500).json({
    success: false,
    error: "Internal Server Error",
    message: err.message || "An unexpected error occurred on the server."
  });
});

// Start listening
let server: any;
initDb()
  .then(async () => {
    if (isDbConnected) {
      try {
        const { SnmpService } = require("./services/snmp.service");
        const snmpService = new SnmpService();
        console.log("⚙️  [SNMP] Synchronizing MIB files from persistent storage...");
        await snmpService.syncMibsFromDisk();
      } catch (err: any) {
        console.error("⚠️  [SNMP] Error during MIB auto-sync:", err.message);
      }
    } else {
      console.warn("⚠️  [SNMP] Database is not connected. Skipping MIB auto-sync.");
    }
  })
  .catch((err) => {
    console.error("⚠️ [DB] Warning: Database schema initialization threw an error:", err);
  })
  .finally(() => {
    server = app.listen(config.port, () => {
      const activeGrafana = config.getGrafanaConfig();
      console.log(`🚀 Hephaestus backend service version 2.0.0 started successfully.`);
      console.log(`📡 Listening on http://localhost:${config.port}`);
      console.log(`🔒 Allowed CORS origins: ${config.allowedOrigins.join(", ")}`);
      console.log(`📊 Target Grafana: ${activeGrafana.host}`);
    });
  });

export default server;
