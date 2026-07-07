import axios, { AxiosInstance } from "axios";
import pool from "../config/db";

interface UptimeKumaConfig {
  id: string;
  name: string;
  url: string;
  username: string;
  password: string;
  is_active: boolean;
}

interface Monitor {
  id: number;
  name: string;
  type: string;
  url: string;
  hostname: string;
  port: number;
  status: number;
  uptime: number;
  avgResponse: number;
  lastCheck: string;
  group: string;
  tags: string;
  notificationIDs: number[];
}

interface UptimeKumaHealth {
  connected: boolean;
  message: string;
}

export class UptimeKumaService {
  private configs: Map<string, UptimeKumaConfig> = new Map();
  private activeClient: AxiosInstance | null = null;
  private activeConfig: UptimeKumaConfig | null = null;

  async loadConfigs(): Promise<void> {
    try {
      const result = await pool.query(
        "SELECT * FROM uptime_kuma_configs ORDER BY created_at DESC"
      );
      this.configs.clear();
      for (const row of result.rows) {
        this.configs.set(row.id, row);
      }
      console.log(`[UptimeKuma] Loaded ${this.configs.size} config(s) from DB`);
    } catch (err: any) {
      console.error("[UptimeKuma] Failed to load configs:", err.message);
    }
  }

  async setActiveConfig(configId: string): Promise<void> {
    const config = this.configs.get(configId);
    if (!config) throw new Error("Config not found");

    this.activeConfig = config;
    this.activeClient = axios.create({
      baseURL: config.url.replace(/\/$/, ""),
      timeout: 15000,
    });
    console.log(`[UptimeKuma] Active config set: ${config.name} (${config.url})`);
  }

  async testConnection(url: string, _username: string, _password: string): Promise<UptimeKumaHealth> {
    try {
      const client = axios.create({
        baseURL: url.replace(/\/$/, ""),
        timeout: 10000,
      });

      const res = await client.get("/health");
      if (res.data && (res.data.status === "ok" || res.data.success || res.data.connected)) {
        return { connected: true, message: "Connected to Uptime Kuma REST API Wrapper" };
      }
      return { connected: false, message: "API responded but health check failed" };
    } catch (err: any) {
      return { connected: false, message: err.message || "Connection failed" };
    }
  }

  private async ensureClient(): Promise<AxiosInstance> {
    if (this.activeClient) return this.activeClient;

    console.log("[UptimeKuma] No active client, auto-loading from DB...");
    await this.loadConfigs();
    const configs = Array.from(this.configs.values());
    const active = configs.find(c => !!c.is_active);

    if (active) {
      await this.setActiveConfig(active.id);
      return this.activeClient!;
    }

    // Fallback: if configs exist but none marked active, use the first one
    if (configs.length > 0) {
      console.log(`[UptimeKuma] No config marked active, using first config: ${configs[0].name}`);
      await this.setActiveConfig(configs[0].id);
      return this.activeClient!;
    }

    throw new Error("No active Uptime Kuma configuration. Please configure one in Connections first.");
  }

  async getMonitors(filters?: { group?: string; type?: string; status?: number }): Promise<Monitor[]> {
    const client = await this.ensureClient();
    try {
      const res = await client.get("/monitors");
      let monitors: Monitor[] = Array.isArray(res.data) ? res.data : (res.data.monitors || res.data.data || []);

      if (filters?.group) {
        monitors = monitors.filter(m => m.group?.toLowerCase().includes(filters.group!.toLowerCase()));
      }
      if (filters?.type) {
        monitors = monitors.filter(m => m.type === filters.type);
      }
      if (filters?.status !== undefined) {
        monitors = monitors.filter(m => m.status === filters.status);
      }

      return monitors;
    } catch (err: any) {
      throw new Error(`Failed to fetch monitors: ${err.message}`);
    }
  }

  async getMonitorById(id: number): Promise<Monitor> {
    const client = await this.ensureClient();
    try {
      const res = await client.get(`/monitors`);
      const monitors: Monitor[] = Array.isArray(res.data) ? res.data : (res.data.monitors || res.data.data || []);
      const monitor = monitors.find((m: any) => m.id === id);
      if (!monitor) throw new Error(`Monitor ${id} not found`);
      return monitor;
    } catch (err: any) {
      throw new Error(`Failed to fetch monitor ${id}: ${err.message}`);
    }
  }

  async getMonitorStats(id: number): Promise<any> {
    const client = await this.ensureClient();
    try {
      const res = await client.get(`/monitors`);
      const monitors: Monitor[] = Array.isArray(res.data) ? res.data : (res.data.monitors || res.data.data || []);
      return monitors.find((m: any) => m.id === id) || {};
    } catch (err: any) {
      throw new Error(`Failed to fetch monitor stats: ${err.message}`);
    }
  }

  async getConfigs(): Promise<UptimeKumaConfig[]> {
    return Array.from(this.configs.values());
  }

  getActiveConfigId(): string | null {
    return this.activeConfig?.id || null;
  }
}

export const uptimeKumaService = new UptimeKumaService();
