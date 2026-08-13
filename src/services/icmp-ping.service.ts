import { execFile } from "child_process";
import { promisify } from "util";
import { query } from "../config/db";
import logger from "../config/logger";

const execFileAsync = promisify(execFile);

// ==================== ICMP PING SERVICE ====================

export interface PingResult {
  deviceId: string;
  ip: string;
  reachable: boolean;
  latency: number | null;
  checkedAt: Date;
}

export interface PingServiceStatus {
  status: "running" | "stopped" | "error";
  lastRun: string | null;
  lastDuration: number | null;
  totalDevices: number;
  onlineDevices: number;
  offlineDevices: number;
  interval: number;
}

class IcmpPingService {
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning = false;
  private lastRun: Date | null = null;
  private lastDuration: number | null = null;
  private lastError: string | null = null;
  private intervalMs = 60000; // 1 minute default

  /**
   * Start the periodic ping service
   */
  start(intervalMs?: number): void {
    if (this.intervalId) {
      this.stop();
    }
    if (intervalMs) this.intervalMs = intervalMs;
    this.isRunning = true;
    this.lastError = null;

    // Run immediately
    this.runPingCycle();

    // Then run periodically
    this.intervalId = setInterval(() => {
      this.runPingCycle();
    }, this.intervalMs);

    logger.info("ICMP", `Service started with ${this.intervalMs / 1000}s interval`);
  }

  /**
   * Stop the periodic ping service
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    logger.info("ICMP", "Service stopped");
  }

  /**
   * Get current service status
   */
  getStatus(): PingServiceStatus {
    return {
      status: this.isRunning ? (this.lastError ? "error" : "running") : "stopped",
      lastRun: this.lastRun?.toISOString() || null,
      lastDuration: this.lastDuration,
      totalDevices: 0, // Will be filled by controller
      onlineDevices: 0,
      offlineDevices: 0,
      interval: this.intervalMs / 1000
    };
  }

  /**
   * Run a single ping cycle for all devices
   */
  async runPingCycle(): Promise<void> {
    if (!this.isRunning) return;

    const startTime = Date.now();
    logger.info("ICMP", "Starting ping cycle...");

    try {
      // Get all devices from topology
      const devicesRes = await query(
        `SELECT id, ip_address FROM topology_devices WHERE ip_address IS NOT NULL`
      );
      const devices = devicesRes.rows;

      if (devices.length === 0) {
        logger.info("ICMP", "No devices to ping");
        this.lastRun = new Date();
        this.lastDuration = Date.now() - startTime;
        return;
      }

      // Ping all devices in parallel (batch of 20)
      const batchSize = 20;
      const results: PingResult[] = [];

      for (let i = 0; i < devices.length; i += batchSize) {
        const batch = devices.slice(i, i + batchSize);
        const batchResults = await Promise.all(
          batch.map(d => this.pingDevice(d.id, d.ip_address))
        );
        results.push(...batchResults);
      }

      // Save results to database
      await this.saveResults(results);

      // Update device status based on ping results
      await this.updateDeviceStatus(results);

      this.lastRun = new Date();
      this.lastDuration = Date.now() - startTime;
      this.lastError = null;

      const online = results.filter(r => r.reachable).length;
      const offline = results.filter(r => !r.reachable).length;
      logger.info("ICMP", `Ping cycle complete: ${online} online, ${offline} offline (${this.lastDuration}ms)`);
    } catch (err: any) {
      this.lastError = err.message;
      this.lastDuration = Date.now() - startTime;
      logger.error("ICMP", `Ping cycle failed: ${err.message}`);
    }
  }

  /**
   * Ping a single device
   */
  private async pingDevice(deviceId: string, ip: string): Promise<PingResult> {
    const result: PingResult = {
      deviceId,
      ip,
      reachable: false,
      latency: null,
      checkedAt: new Date()
    };

    try {
      // Validate IP
      const ipRegex = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;
      if (!ipRegex.test(ip)) {
        return result;
      }

      const pingArgs = process.platform === "win32"
        ? ["-n", "1", "-w", "2000", ip]
        : ["-c", "1", "-W", "2", ip];

      const { stdout } = await execFileAsync("ping", pingArgs, { timeout: 5000 });

      // Parse latency from output
      const latencyMatch = stdout.match(/time[=<](\d+\.?\d*)\s*ms/i);
      if (latencyMatch) {
        result.reachable = true;
        result.latency = parseFloat(latencyMatch[1]);
      } else if (stdout.includes("TTL=") || stdout.includes("ttl=")) {
        result.reachable = true;
        result.latency = 0;
      }
    } catch {
      // Ping failed - device unreachable
    }

    return result;
  }

  /**
   * Save ping results to database
   */
  private async saveResults(results: PingResult[]): Promise<void> {
    if (results.length === 0) return;

    // Batch upsert
    const values: any[] = [];
    const placeholders: string[] = [];

    results.forEach((r, i) => {
      const idx = i * 5;
      placeholders.push(`($${idx + 1}, $${idx + 2}, $${idx + 3}, $${idx + 4}, $${idx + 5})`);
      values.push(r.deviceId, r.ip, r.reachable, r.latency, r.checkedAt);
    });

    await query(
      `INSERT INTO device_ping_results (device_id, ip, reachable, latency_ms, checked_at)
       VALUES ${placeholders.join(", ")}
       ON CONFLICT (device_id) DO UPDATE SET
         ip = EXCLUDED.ip,
         reachable = EXCLUDED.reachable,
         latency_ms = EXCLUDED.latency_ms,
         checked_at = EXCLUDED.checked_at`,
      values
    );
  }

  /**
   * Update device status based on ping results
   */
  private async updateDeviceStatus(results: PingResult[]): Promise<void> {
    for (const r of results) {
      await query(
        `UPDATE topology_devices SET status = $1 WHERE id = $2`,
        [r.reachable ? "online" : "offline", r.deviceId]
      );
    }
  }

  /**
   * Get ping results for all devices
   */
  async getDevicePingResults(): Promise<any[]> {
    const res = await query(
      `SELECT d.id, d.name, d.ip_address, d.device_type,
              p.reachable, p.latency_ms, p.checked_at
       FROM topology_devices d
       LEFT JOIN device_ping_results p ON d.id = p.device_id
       ORDER BY d.name`
    );
    return res.rows;
  }

  /**
   * Get summary statistics
   */
  async getSummary(): Promise<{ total: number; online: number; offline: number }> {
    const res = await query(
      `SELECT 
         COUNT(*) as total,
         COUNT(CASE WHEN status = 'online' THEN 1 END) as online,
         COUNT(CASE WHEN status = 'offline' THEN 1 END) as offline
       FROM topology_devices`
    );
    return {
      total: parseInt(res.rows[0].total) || 0,
      online: parseInt(res.rows[0].online) || 0,
      offline: parseInt(res.rows[0].offline) || 0
    };
  }
}

export const icmpPingService = new IcmpPingService();
