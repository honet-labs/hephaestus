import { UptimeKumaClient } from "uptime-kuma-rest-api";
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
  private activeClient: UptimeKumaClient | null = null;
  private activeConfig: UptimeKumaConfig | null = null;

  private parseUrl(configUrl: string): { host: string; slug: string } {
    let host = configUrl;
    let slug = "default";
    try {
      const urlObj = new URL(configUrl);
      const pathParts = urlObj.pathname.split("/").filter(Boolean);
      if (pathParts[0] === "status" && pathParts[1]) {
        slug = pathParts[1];
        host = urlObj.origin;
      } else {
        host = urlObj.origin;
      }
    } catch (e) {
      host = configUrl.replace(/\/$/, "");
    }
    return { host, slug };
  }

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
    const { host } = this.parseUrl(config.url);

    this.activeClient = new UptimeKumaClient({
      host: host.replace(/\/$/, ""),
      authentication: {
        username: config.username || "",
        password: config.password
      }
    });
    console.log(`[UptimeKuma] Active config set: ${config.name} (${config.url})`);
  }

  async testConnection(url: string, username: string, password: string): Promise<UptimeKumaHealth> {
    try {
      const { host, slug } = this.parseUrl(url);
      const client = new UptimeKumaClient({
        host: host.replace(/\/$/, ""),
        authentication: {
          username: username || "",
          password: password
        }
      });

      const res = await client.main.getStatus(slug);
      if (res) {
        return { connected: true, message: "Connected to Uptime Kuma REST API successfully" };
      }
      return { connected: false, message: "API responded but failed to retrieve status" };
    } catch (err: any) {
      return { connected: false, message: err.message || "Connection failed" };
    }
  }

  private async ensureClient(): Promise<UptimeKumaClient> {
    if (this.activeClient) return this.activeClient;

    console.log("[UptimeKuma] No active client, auto-loading from DB...");
    await this.loadConfigs();
    const configs = Array.from(this.configs.values());
    const active = configs.find(c => !!c.is_active);

    if (active) {
      await this.setActiveConfig(active.id);
      return this.activeClient!;
    }

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
      const { slug } = this.parseUrl(this.activeConfig!.url);

      const statusData: any = await client.main.getStatus(slug);
      const heartbeatData: any = await client.main.getHeartbeat(slug);

      const monitors: Monitor[] = [];
      const publicGroupList = statusData?.publicGroupList || [];
      const heartbeatList = heartbeatData?.heartbeatList || {};

      for (const group of publicGroupList) {
        const monitorList = group.monitorList || [];
        for (const m of monitorList) {
          const mHeartbeats = heartbeatList[m.id] || [];
          
          let uptimePct = 0;
          let avgResponse = 0;
          let lastCheck = "";

          if (mHeartbeats.length > 0) {
            const upCount = mHeartbeats.filter((hb: any) => hb.status === 1).length;
            uptimePct = parseFloat(((upCount / mHeartbeats.length) * 100).toFixed(2));

            const totalPing = mHeartbeats.reduce((sum: number, hb: any) => sum + (hb.ping || 0), 0);
            avgResponse = parseFloat((totalPing / mHeartbeats.length).toFixed(1));

            const lastHb = mHeartbeats[mHeartbeats.length - 1];
            if (lastHb && lastHb.time) {
              lastCheck = lastHb.time;
            }
          }

          monitors.push({
            id: m.id,
            name: m.name || "",
            type: m.type || "http",
            url: m.url || "",
            hostname: m.hostname || "",
            port: m.port || 0,
            status: m.status === "up" || m.status === 1 || m.status === true ? 1 : 0,
            uptime: uptimePct,
            avgResponse: avgResponse,
            lastCheck: lastCheck,
            group: group.name || "",
            tags: m.tags || "",
            notificationIDs: m.notificationIDs || []
          });
        }
      }

      let filteredMonitors = monitors;
      if (filters?.group) {
        filteredMonitors = filteredMonitors.filter(m => m.group?.toLowerCase().includes(filters.group!.toLowerCase()));
      }
      if (filters?.type) {
        filteredMonitors = filteredMonitors.filter(m => m.type === filters.type);
      }
      if (filters?.status !== undefined) {
        filteredMonitors = filteredMonitors.filter(m => m.status === filters.status);
      }

      return filteredMonitors;
    } catch (err: any) {
      throw new Error(`Failed to fetch monitors: ${err.message}`);
    }
  }

  async getMonitorById(id: number): Promise<Monitor> {
    const monitors = await this.getMonitors();
    const monitor = monitors.find(m => m.id === id);
    if (!monitor) throw new Error(`Monitor ${id} not found`);
    return monitor;
  }

  async getMonitorStats(id: number): Promise<any> {
    const monitors = await this.getMonitors();
    return monitors.find(m => m.id === id) || {};
  }

  async getConfigs(): Promise<UptimeKumaConfig[]> {
    return Array.from(this.configs.values());
  }

  getActiveConfigId(): string | null {
    return this.activeConfig?.id || null;
  }
}

export const uptimeKumaService = new UptimeKumaService();
