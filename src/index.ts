import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import path from "path";
import config from "./config/env";
import { initDb, isDbConnected } from "./config/db";
import { globalLimiter } from "./middleware/rate-limit.middleware";
import settingsRoutes from "./routes/settings.routes";
import monitoringViewRoutes from "./routes/monitoring-view.routes";
import snmpRoutes from "./routes/snmp.routes";
import systemRoutes from "./routes/system.routes";
import userRoutes from "./routes/user.routes";
import activityLogRoutes from "./routes/activity-log.routes";
import queryExplorerRoutes from "./routes/query-explorer.routes";
import updateRoutes from "./routes/update.routes";
import grokDebuggerRoutes from "./routes/grok-debugger.routes";
import uptimeKumaRoutes from "./routes/uptime-kuma.routes";

const app = express();

// 1. CORS Configuration
const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    if (!origin || config.allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`Origin ${origin} not allowed by CORS`));
    }
  },
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true
};

app.use(cors(corsOptions));

// 1b. Security Headers — configure Helmet to work with frontend inline scripts
// Only enable HSTS and upgradeInsecureRequests when running behind HTTPS reverse proxy
const isHttps = process.env.HTTPS === "true" || process.env.NODE_ENV === "production";

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://cdn.jsdelivr.net", "https://static.cloudflareinsights.com"],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdn.jsdelivr.net"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdn.jsdelivr.net"],
      imgSrc: ["'self'", "data:", "blob:"],
      connectSrc: ["'self'"],
      frameSrc: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      ...(isHttps ? { upgradeInsecureRequests: [] } : {})
    }
  },
  strictTransportSecurity: isHttps ? { maxAge: 15552000, includeSubDomains: true } : false,
  crossOriginEmbedderPolicy: false,
  crossOriginOpenerPolicy: false,
  crossOriginResourcePolicy: false,
  originAgentCluster: false
}));

// 1b. Trust proxy (required for rate limiting behind reverse proxy / Cloudflare Tunnel)
app.set("trust proxy", 1);

// 1c. Rate Limiting
app.use("/api/v1", globalLimiter);

// 2. Request parsing middlewares
app.use(express.json({ limit: "10kb" }));
app.use(express.urlencoded({ extended: false }));

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

import { authMiddleware } from "./middleware/auth.middleware";
import setupRoutes from "./routes/setup.routes";

// Setup routes (accessible without authentication)
app.use("/api/v1/setup", setupRoutes);

// 4. API Routes registration
app.use("/api/v1", authMiddleware);
app.use("/api/v1/settings", settingsRoutes);
app.use("/api/v1/monitoring-views", monitoringViewRoutes);
app.use("/api/v1/snmp", snmpRoutes);
app.use("/api/v1/system", systemRoutes);
app.use("/api/v1/users", userRoutes);
app.use("/api/v1/activity-logs", activityLogRoutes);
app.use("/api/v1/query-explorer", queryExplorerRoutes);
app.use("/api/v1/update", updateRoutes);
app.use("/api/v1/grok-debugger", grokDebuggerRoutes);
app.use("/api/v1/uptime-kuma", uptimeKumaRoutes);

// 5. 404 Route handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: "Not Found",
    message: `The endpoint ${req.method} ${req.path} does not exist.`
  });
});

// 6. Global Error Handling Middleware
app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
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

      try {
        const { uptimeKumaService } = require("./services/uptime-kuma.service");
        console.log("⚙️  [Uptime Kuma] Loading configs...");
        await uptimeKumaService.loadConfigs();
        const configs = await uptimeKumaService.getConfigs();
        const active = configs.find((c: any) => c.is_active);
        if (active) {
          await uptimeKumaService.setActiveConfig(active.id);
          console.log(`⚙️  [Uptime Kuma] Active config: ${active.name}`);
        } else {
          console.log("⚙️  [Uptime Kuma] No active config found.");
        }
      } catch (err: any) {
        console.error("⚠️  [Uptime Kuma] Error loading configs:", err.message);
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
