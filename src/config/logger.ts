import fs from "fs";
import path from "path";
import type { Request } from "express";

const LOG_DIR = process.env.LOG_DIR || "/var/log/hephaestus";
const MAX_LOG_SIZE = 10 * 1024 * 1024; // 10MB per file
const MAX_LOG_FILES = 5; // Keep 5 rotated files

// Ensure log directory exists
function ensureLogDir() {
  try {
    if (!fs.existsSync(LOG_DIR)) {
      fs.mkdirSync(LOG_DIR, { recursive: true });
      console.log(`[Logger] Created log directory: ${LOG_DIR}`);
    }
  } catch (err: any) {
    // If /var/log not writable, fallback to data directory
    console.warn(`[Logger] Cannot create ${LOG_DIR}: ${err.message}, using fallback`);
  }
}

// Rotate log file if too large
function rotateLog(filename: string) {
  const filePath = path.join(LOG_DIR, filename);
  try {
    if (!fs.existsSync(filePath)) return;
    const stats = fs.statSync(filePath);
    if (stats.size < MAX_LOG_SIZE) return;

    // Rotate: .5 -> delete, .4 -> .5, ..., .1 -> .2, current -> .1
    for (let i = MAX_LOG_FILES - 1; i >= 1; i--) {
      const from = `${filePath}.${i}`;
      const to = `${filePath}.${i + 1}`;
      if (fs.existsSync(from)) {
        if (i === MAX_LOG_FILES - 1) fs.unlinkSync(from);
        else fs.renameSync(from, to);
      }
    }
    fs.renameSync(filePath, `${filePath}.1`);
  } catch {
    // Ignore rotation errors
  }
}

// Write log entry
function writeLog(filename: string, level: string, module: string, message: string, data?: any) {
  try {
    ensureLogDir();
    rotateLog(filename);

    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      module,
      message,
      ...(data ? { data } : {})
    };

    const line = JSON.stringify(logEntry) + "\n";
    const filePath = path.join(LOG_DIR, filename);
    fs.appendFileSync(filePath, line, "utf-8");
  } catch {
    // Silently fail if can't write logs
  }
}

// Also write to console with color
function consoleLog(level: string, module: string, message: string, data?: any) {
  const timestamp = new Date().toISOString();
  const prefix = `[${timestamp}] [${level}] [${module}]`;
  if (level === "ERROR") {
    console.error(`${prefix} ${message}`, data || "");
  } else if (level === "WARN") {
    console.warn(`${prefix} ${message}`, data || "");
  } else {
    console.log(`${prefix} ${message}`, data || "");
  }
}

// Public API
export const logger = {
  info(module: string, message: string, data?: any) {
    writeLog("app.log", "INFO", module, message, data);
    consoleLog("INFO", module, message, data);
  },

  warn(module: string, message: string, data?: any) {
    writeLog("app.log", "WARN", module, message, data);
    writeLog("error.log", "WARN", module, message, data);
    consoleLog("WARN", module, message, data);
  },

  error(module: string, message: string, data?: any) {
    writeLog("app.log", "ERROR", module, message, data);
    writeLog("error.log", "ERROR", module, message, data);
    consoleLog("ERROR", module, message, data);
  },

  // Special loggers for specific modules
  opensearch(message: string, data?: any) {
    this.info("OpenSearch", message, data);
  },

  opensearchError(message: string, data?: any) {
    this.error("OpenSearch", message, data);
  },

  topology(message: string, data?: any) {
    this.info("Topology", message, data);
  },

  remoteHost(message: string, data?: any) {
    this.info("RemoteHost", message, data);
  },

  prometheus(message: string, data?: any) {
    writeLog("prometheus.log", "INFO", "Prometheus", message, data);
    this.info("Prometheus", message, data);
  },

  prometheusError(message: string, data?: any) {
    writeLog("prometheus.log", "ERROR", "Prometheus", message, data);
    this.error("Prometheus", message, data);
  },

  grafana(message: string, data?: any) {
    writeLog("grafana.log", "INFO", "Grafana", message, data);
    this.info("Grafana", message, data);
  },

  grafanaError(message: string, data?: any) {
    writeLog("grafana.log", "ERROR", "Grafana", message, data);
    this.error("Grafana", message, data);
  },

  apiRequest(req: Request, requestId: string) {
    this.info("API", `${req.method} ${req.originalUrl}`, {
      requestId,
      ip: req.ip,
      userId: (req as any)?.user?.id
    });
  },

  apiError(req: Request, requestId: string, error: unknown) {
    this.error("API", `${req.method} ${req.originalUrl} failed`, {
      requestId,
      ip: req.ip,
      userId: (req as any)?.user?.id,
      error: error instanceof Error ? { message: error.message, stack: error.stack } : error
    });
  },

  db(message: string, data?: any) {
    this.info("Database", message, data);
  },

  dbError(message: string, data?: any) {
    this.error("Database", message, data);
  },

  // Get log directory path
  getLogDir(): string {
    return LOG_DIR;
  },

  // Read recent logs
  async getRecentLogs(filename: string, lines: number = 100): Promise<string[]> {
    const filePath = path.join(LOG_DIR, filename);
    try {
      if (!fs.existsSync(filePath)) return [];
      const content = fs.readFileSync(filePath, "utf-8");
      const allLines = content.split("\n").filter(Boolean);
      return allLines.slice(-lines);
    } catch {
      return [];
    }
  }
};

export default logger;
