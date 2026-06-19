import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import config from "./config/env";
import reportRoutes from "./routes/report.routes";

const app = express();

// 1. CORS Configuration
const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps, curl, postman, or same-origin)
    if (!origin) {
      return callback(null, true);
    }
    
    // Check if the request origin is in the allowed list, or if wildcard is enabled
    if (config.allowedOrigins.includes("*") || config.allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    
    return callback(new Error(`Origin ${origin} is not allowed by CORS`));
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

// 3. Healthcheck route
app.get("/health", (req: Request, res: Response) => {
  res.status(200).json({
    status: "UP",
    timestamp: new Date().toISOString(),
    service: "Hephaestus Grafana Integration API"
  });
});

// 4. API Routes registration
app.use("/api/v1/report", reportRoutes);

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
const server = app.listen(config.port, () => {
  console.log(`🚀 Hephaestus backend service version 2.0.0 started successfully.`);
  console.log(`📡 Listening on http://localhost:${config.port}`);
  console.log(`🔒 Allowed CORS origins: ${config.allowedOrigins.join(", ")}`);
  console.log(`📊 Target Grafana: ${config.grafana.host}`);
});

export default server;
