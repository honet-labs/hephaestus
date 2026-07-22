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
import prometheusRoutes from "./routes/prometheus.routes";
import dataprepperRoutes from "./routes/dataprepper.routes";
import backupRoutes from "./routes/backup.routes";
import remoteHostRoutes from "./routes/remote-host.routes";
import vpsControlRoutes from "./routes/vps-control.routes";

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
const isHttps = process.env.HTTPS !== "false";

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-eval'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com", "https://static.cloudflareinsights.com"],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com"],
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

// 1d. Prevent caching of API responses (critical for Cloudflare Tunnel)
app.use("/api/v1", (_req: Request, res: Response, next: NextFunction) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.setHeader("Surrogate-Control", "no-store");
  next();
});

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

// Grok Debugger page (no auth middleware - page verifies session via JS)
app.get("/grok-debugger", (req: Request, res: Response) => {
  res.sendFile("grok-debugger.html", { root: require("path").join(__dirname, "../views") });
});

// Remote Host Terminal page (no auth middleware - page verifies session via JS)
app.get("/remote-host", (req: Request, res: Response) => {
  res.sendFile("remote-host.html", { root: require("path").join(__dirname, "../views") });
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
app.use("/api/v1/prometheus", prometheusRoutes);
app.use("/api/v1/dataprepper", dataprepperRoutes);
app.use("/api/v1/backup", backupRoutes);
app.use("/api/v1/remote-host", remoteHostRoutes);
app.use("/api/v1/vps", vpsControlRoutes);

// 5. 404 Route handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: "Not Found",
    message: "The requested endpoint does not exist."
  });
});

// 6. Global Error Handling Middleware
app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
  console.error("Unhandled global server error:", err);
  
  res.status(500).json({
    success: false,
    error: "Internal Server Error",
    message: "An unexpected error occurred on the server."
  });
});

// Start listening
let server: any;
let wss: any;
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

      try {
        const { backupService } = require("./services/backup.service");
        await backupService.initScheduler();
      } catch (err: any) {
        console.error("⚠️  [Backup] Error initializing scheduler:", err.message);
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

      // WebSocket server for Remote Host terminal (attached to same HTTP server)
      const { WebSocketServer } = require("ws");
      const MAX_WS_CONNECTIONS = 10;
      const WS_PING_INTERVAL = 30000;
      let wsConnectionCount = 0;
      wss = new WebSocketServer({ server, path: "/ws/remote-host" });

      // Keepalive ping to prevent Cloudflare/proxy idle timeout
      const pingTimer = setInterval(() => {
        wss.clients.forEach((ws: any) => {
          if (ws.isAlive === false) return ws.terminate();
          ws.isAlive = false;
          ws.ping();
        });
      }, WS_PING_INTERVAL);
      wss.on("close", () => clearInterval(pingTimer));

      wss.on("connection", async (ws: any, req: any) => {
        ws.isAlive = true;
        ws.on("pong", () => { ws.isAlive = true; });
        // Origin validation — prevent Cross-Site WebSocket Hijacking
        const origin = req.headers.origin;
        if (!origin || !config.allowedOrigins.includes(origin)) {
          ws.send(JSON.stringify({ type: "error", message: "Origin not allowed." }));
          ws.close();
          return;
        }

        // Connection limit
        if (wsConnectionCount >= MAX_WS_CONNECTIONS) {
          ws.send(JSON.stringify({ type: "error", message: "Too many connections." }));
          ws.close();
          return;
        }
        wsConnectionCount++;
        ws.on("close", () => { wsConnectionCount--; });

        const url = new URL(req.url, `http://${req.headers.host}`);
        const token = url.searchParams.get("token");
        const hostConfigId = url.searchParams.get("hostId");
        const cols = parseInt(url.searchParams.get("cols") || "80", 10);
        const rows = parseInt(url.searchParams.get("rows") || "24", 10);

        if (!token || !hostConfigId) {
          ws.send(JSON.stringify({ type: "error", message: "Missing token or hostId." }));
          ws.close();
          return;
        }

        // Verify session token
        let userId = 0;
        try {
          const crypto = require("crypto");
          const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
          const dbModule = require("./config/db");
          const dbPool = dbModule.default || dbModule.pool;
          const sessionRes = await dbPool.query(
            "SELECT user_id FROM user_sessions WHERE token = $1 AND expires_at > NOW()",
            [tokenHash]
          );
          if (sessionRes.rows.length === 0) {
            ws.send(JSON.stringify({ type: "error", message: "Invalid session." }));
            ws.close();
            return;
          }
          userId = sessionRes.rows[0].user_id;
          // Extend session expiry on connect (sliding window)
          await dbPool.query(
            "UPDATE user_sessions SET expires_at = NOW() + INTERVAL '24 hours' WHERE token = $1",
            [tokenHash]
          );
        } catch {
          ws.send(JSON.stringify({ type: "error", message: "Authentication failed." }));
          ws.close();
          return;
        }

        const { remoteHostService } = require("./services/remote-host.service");
        remoteHostService.handleWebSocket(ws, hostConfigId, cols, rows, userId);
      });

      console.log(`🔌 WebSocket server for Remote Host terminal started on /ws/remote-host`);
    });
  });

export default server;
