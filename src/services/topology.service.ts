import axios from "axios";
import { execFile } from "child_process";
import { promisify } from "util";
import { query, pool } from "../config/db";
import { config } from "../config/env";

const execFileAsync = promisify(execFile);

// ==================== TYPES ====================

export interface TopologyNode {
  id: string;
  name: string;
  ip: string;
  deviceType: string;
  status: "online" | "offline" | "unknown";
  sources: string[];
  labels: Record<string, any>;
  x?: number;
  y?: number;
}

export interface TopologyEdge {
  id?: number;
  source: string;
  target: string;
  label?: string;
  edgeType: string;
}

export interface TopologyGraph {
  nodes: TopologyNode[];
  edges: TopologyEdge[];
  meta: {
    totalNodes: number;
    totalEdges: number;
    sources: string[];
    lastScan: string | null;
  };
}

interface PrometheusTarget {
  labels: Record<string, string>;
  health: string; // "up" or "down"
  scrapeUrl: string;
}

interface UptimeKumaMonitor {
  id: number;
  name: string;
  hostname: string;
  port: number;
  status: number; // 0=down, 1=up, 2=pending, 3=degraded
  type: string;
}

// ==================== SERVICE ====================

export class TopologyService {
  // Default OID for sysName and sysDescr
  private static readonly SYS_NAME_OID = "1.3.6.1.2.1.1.5.0";
  private static readonly SYS_DESCR_OID = "1.3.6.1.2.1.1.1.0";

  // ==================== SOURCE A: PROMETHEUS ====================

  /**
   * Fetch targets from Prometheus /api/v1/targets endpoint.
   * Extracts instance IP, labels, and health status.
   */
  async fetchFromPrometheus(prometheusUrl?: string): Promise<TopologyNode[]> {
    const nodes: TopologyNode[] = [];
    let url = prometheusUrl;
    let authToken = "";

    if (!url) {
      // Try to get from active Prometheus config
      const configRes = await query(
        `SELECT host, token FROM grafana_configs WHERE is_active = true LIMIT 1`
      );
      if (configRes.rows.length === 0) {
        console.log("[Topology] No active Prometheus/Grafana config found, skipping Prometheus source.");
        return nodes;
      }
      // Use Grafana datasource proxy to query Prometheus targets
      const grafana = configRes.rows[0];
      url = `${grafana.host}/api/datasources/proxy/uid/prometheus/api/v1/targets`;
      authToken = grafana.token || "";
    }

    try {
      const response = await axios.get(url, {
        timeout: 10000,
        headers: authToken ? { Authorization: `Bearer ${authToken}` } : {}
      });

      const data = response.data;
      if (data.status !== "success" || !data.data?.activeTargets) {
        console.log("[Topology] Prometheus targets response was not successful.");
        return nodes;
      }

      for (const target of data.data.activeTargets as PrometheusTarget[]) {
        const ip = this.extractIpFromTarget(target);
        if (!ip) continue;

        nodes.push({
          id: `prom-${ip}`,
          name: target.labels?.hostname || target.labels?.instance || ip,
          ip,
          deviceType: this.inferDeviceType(target.labels),
          status: target.health === "up" ? "online" : "offline",
          sources: ["PROM"],
          labels: target.labels || {}
        });
      }

      console.log(`[Topology] Fetched ${nodes.length} targets from Prometheus.`);
    } catch (err: any) {
      console.error(`[Topology] Prometheus fetch error: ${err.message}`);
    }

    return nodes;
  }

  private extractIpFromTarget(target: PrometheusTarget): string | null {
    // Try instance label first (format: "ip:port")
    const instance = target.labels?.instance || target.scrapeUrl || "";
    const match = instance.match(/^(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/);
    return match ? match[1] : null;
  }

  private inferDeviceType(labels: Record<string, string>): string {
    const job = (labels.job || "").toLowerCase();
    if (job.includes("node") || job.includes("linux") || job.includes("host")) return "server";
    if (job.includes("switch") || job.includes("cisco")) return "switch";
    if (job.includes("router")) return "router";
    if (job.includes("firewall") || job.includes("fortigate") || job.includes("pfsense")) return "firewall";
    if (job.includes("snmp")) return "network";
    if (job.includes("docker") || job.includes("container")) return "container";
    return "server";
  }

  // ==================== SOURCE B: UPTIME KUMA ====================

  /**
   * Fetch monitor data from Uptime Kuma API.
   * Uses the existing Uptime Kuma client pattern.
   */
  async fetchFromUptimeKuma(): Promise<TopologyNode[]> {
    const nodes: TopologyNode[] = [];

    try {
      // Get active Uptime Kuma config
      const configRes = await pool.query(
        `SELECT * FROM uptime_kuma_configs WHERE is_active = true LIMIT 1`
      );
      if (configRes.rows.length === 0) {
        console.log("[Topology] No active Uptime Kuma config, skipping.");
        return nodes;
      }

      const ukConfig = configRes.rows[0];
      const baseUrl = ukConfig.url.replace(/\/$/, "");
      const token = this.generateUptimeKumaToken(ukConfig.username, ukConfig.password);

      // Fetch monitors list
      const monitorsRes = await axios.get(`${baseUrl}/api/monitor`, {
        timeout: 10000,
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!monitorsRes.data?.ok) {
        console.log("[Topology] Uptime Kuma monitor list request was not successful.");
        return nodes;
      }

      const monitors = monitorsRes.data.monitors || [];
      for (const monitor of monitors) {
        if (!monitor.hostname && !monitor.url) continue;

        const hostname = monitor.hostname || this.extractHostnameFromUrl(monitor.url);
        if (!hostname) continue;

        // Only include IP-based monitors (skip domain-only monitors for topology)
        const ipMatch = hostname.match(/^(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
        const ip = ipMatch ? hostname : monitor.hostname || null;
        if (!ip) continue;

        const statusMap: Record<number, "online" | "offline" | "unknown"> = {
          0: "offline",
          1: "online",
          2: "unknown",
          3: "unknown"
        };

        nodes.push({
          id: `kuma-${ip}`,
          name: monitor.name || ip,
          ip,
          deviceType: this.inferDeviceTypeFromMonitorType(monitor.type),
          status: statusMap[monitor.status] || "unknown",
          sources: ["KUMA"],
          labels: {
            monitorId: monitor.id,
            monitorType: monitor.type,
            port: monitor.port
          }
        });
      }

      console.log(`[Topology] Fetched ${nodes.length} monitors from Uptime Kuma.`);
    } catch (err: any) {
      console.error(`[Topology] Uptime Kuma fetch error: ${err.message}`);
    }

    return nodes;
  }

  private generateUptimeKumaToken(username: string, password: string): string {
    return Buffer.from(`${username}:${password}`).toString("base64");
  }

  private extractHostnameFromUrl(url: string): string | null {
    try {
      const parsed = new URL(url);
      return parsed.hostname;
    } catch {
      return null;
    }
  }

  private inferDeviceTypeFromMonitorType(type: string): string {
    const t = (type || "").toLowerCase();
    if (t === "http" || t === "https") return "web";
    if (t === "ping" || t === "icmp") return "server";
    if (t === "port") return "network";
    if (t === "dns") return "dns";
    if (t.includes("ssh") || t.includes("tcp")) return "server";
    return "server";
  }

  // ==================== SOURCE C: SNMP SCANNER ====================

  /**
   * Scan an IP range using ICMP ping + SNMP GET.
   * For alive hosts, fetch sysName and sysDescr.
   */
  async scanNetwork(
    ipRange: string,
    community: string = "public",
    snmpVersion: string = "2c",
    timeout: number = 2000
  ): Promise<TopologyNode[]> {
    const nodes: TopologyNode[] = [];
    const ips = this.expandIpRange(ipRange);

    console.log(`[Topology] Scanning ${ips.length} IPs in range ${ipRange}...`);

    // Ping sweep in batches of 20
    const batchSize = 20;
    for (let i = 0; i < ips.length; i += batchSize) {
      const batch = ips.slice(i, i + batchSize);
      const results = await Promise.all(
        batch.map(ip => this.pingAndSnmpGet(ip, community, snmpVersion, timeout))
      );

      for (const result of results) {
        if (result.alive) {
          nodes.push({
            id: `snmp-${result.ip}`,
            name: result.sysName || result.ip,
            ip: result.ip,
            deviceType: result.sysDescr ? this.inferDeviceTypeFromSysDescr(result.sysDescr) : "unknown",
            status: "online",
            sources: ["SNMP"],
            labels: {
              sysName: result.sysName,
              sysDescr: result.sysDescr,
              snmpCommunity: community,
              snmpVersion
            }
          });
        }
      }
    }

    console.log(`[Topology] SNMP scan complete. Found ${nodes.length} alive hosts.`);
    return nodes;
  }

  /**
   * Expand CIDR or dash-range notation into individual IPs.
   * Supports: "192.168.1.0/24", "10.0.0.1-10.0.0.254", "10.0.0.1,10.0.0.2,10.0.0.3"
   */
  private expandIpRange(range: string): string[] {
    const ips: string[] = [];

    // CIDR notation (e.g., 192.168.1.0/24)
    const cidrMatch = range.match(/^(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\/(\d{1,2})$/);
    if (cidrMatch) {
      const baseIp = cidrMatch[1];
      const prefix = parseInt(cidrMatch[2]);
      const baseParts = baseIp.split(".").map(Number);
      const baseNum = (baseParts[0] << 24) | (baseParts[1] << 16) | (baseParts[2] << 8) | baseParts[3];
      const hostBits = 32 - prefix;
      const numHosts = (1 << hostBits) - 2; // exclude network and broadcast

      for (let i = 1; i <= numHosts; i++) {
        const ipNum = baseNum + i;
        ips.push([
          (ipNum >>> 24) & 255,
          (ipNum >>> 16) & 255,
          (ipNum >>> 8) & 255,
          ipNum & 255
        ].join("."));
      }
      return ips;
    }

    // Dash notation (e.g., 10.0.0.1-10.0.0.254)
    const dashMatch = range.match(/^(\d{1,3}\.\d{1,3}\.\d{1,3}\.)(\d{1,3})-(\d{1,3})$/);
    if (dashMatch) {
      const prefix = dashMatch[1];
      const start = parseInt(dashMatch[2]);
      const end = parseInt(dashMatch[3]);
      for (let i = start; i <= end; i++) {
        ips.push(`${prefix}${i}`);
      }
      return ips;
    }

    // Comma-separated
    const parts = range.split(",").map(s => s.trim()).filter(Boolean);
    for (const part of parts) {
      if (part.match(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/)) {
        ips.push(part);
      }
    }

    return ips;
  }

  private async pingAndSnmpGet(
    ip: string,
    community: string,
    version: string,
    timeout: number
  ): Promise<{ ip: string; alive: boolean; sysName?: string; sysDescr?: string }> {
    const result = { ip, alive: false, sysName: undefined as string | undefined, sysDescr: undefined as string | undefined };

    try {
      // ICMP ping check
      const pingArgs = process.platform === "win32"
        ? ["-n", "1", "-w", String(timeout), ip]
        : ["-c", "1", "-W", String(Math.ceil(timeout / 1000)), ip];
      await execFileAsync("ping", pingArgs, { timeout: timeout + 2000 });
      result.alive = true;
    } catch {
      // Ping failed — host is down
      return result;
    }

    // SNMP GET for sysName and sysDescr
    const versionFlag = version === "v1" ? "1" : "2c";
    const snmpArgs = [
      "-v", versionFlag,
      "-c", community,
      "-On",
      "-t", "2",
      "-r", "1",
      ip,
      TopologyService.SYS_NAME_OID,
      TopologyService.SYS_DESCR_OID
    ];

    try {
      const { stdout } = await execFileAsync("snmpget", snmpArgs, { timeout: timeout + 2000 });
      const lines = stdout.split(/\r?\n/);
      for (const line of lines) {
        if (line.includes(TopologyService.SYS_NAME_OID)) {
          const match = line.match(/STRING:\s*"?([^"\n]+)"?\s*$/);
          if (match) result.sysName = match[1].trim();
        }
        if (line.includes(TopologyService.SYS_DESCR_OID)) {
          const match = line.match(/STRING:\s*"?([^"\n]+)"?\s*$/);
          if (match) result.sysDescr = match[1].trim();
        }
      }
    } catch {
      // SNMP not available — device is alive but not SNMP-enabled
      result.sysName = ip;
    }

    return result;
  }

  private inferDeviceTypeFromSysDescr(sysDescr: string): string {
    const desc = sysDescr.toLowerCase();
    if (desc.includes("cisco") || desc.includes("ios")) return "switch";
    if (desc.includes("juniper") || desc.includes("junos")) return "router";
    if (desc.includes("fortigate") || desc.includes("fortinet") || desc.includes("pfsense")) return "firewall";
    if (desc.includes("linux") || desc.includes("ubuntu") || desc.includes("debian") || desc.includes("centos")) return "server";
    if (desc.includes("windows") || desc.includes("microsoft")) return "server";
    if (desc.includes("vmware") || desc.includes("esxi")) return "server";
    if (desc.includes("mikrotik") || desc.includes("routeros")) return "router";
    if (desc.includes("mikrotik") || desc.includes("switch")) return "switch";
    return "network";
  }

  // ==================== DEDUPLICATION & MERGE ====================

  /**
   * Merge nodes from multiple sources by IP address.
   * If a device exists in both Prometheus and Uptime Kuma, combine sources.
   */
  mergeNodes(allNodes: TopologyNode[]): TopologyNode[] {
    const ipMap = new Map<string, TopologyNode>();

    for (const node of allNodes) {
      const existing = ipMap.get(node.ip);
      if (existing) {
        // Merge: combine sources, prefer "online" status, merge labels
        existing.sources = [...new Set([...existing.sources, ...node.sources])];
        if (node.status === "online" && existing.status !== "online") {
          existing.status = "online";
        }
        existing.labels = { ...existing.labels, ...node.labels };
        if (node.name !== node.ip && existing.name === existing.ip) {
          existing.name = node.name;
        }
        if (node.deviceType !== "unknown" && existing.deviceType === "unknown") {
          existing.deviceType = node.deviceType;
        }
      } else {
        ipMap.set(node.ip, { ...node });
      }
    }

    return Array.from(ipMap.values());
  }

  // ==================== DATABASE OPERATIONS ====================

  /**
   * Save merged topology nodes to database.
   * Preserves manual device positions.
   */
  async saveTopologyToDb(nodes: TopologyNode[]): Promise<void> {
    for (const node of nodes) {
      // Check if device exists by IP to preserve x/y position
      const existing = await query(
        `SELECT id, x, y FROM topology_devices WHERE ip_address = $1`,
        [node.ip]
      );

      if (existing.rows.length > 0) {
        // Update existing device
        await query(
          `UPDATE topology_devices
           SET name = $1, device_type = $2, status = $3, sources = $4, labels = $5
           WHERE ip_address = $6`,
          [node.name, node.deviceType, node.status, node.sources, JSON.stringify(node.labels), node.ip]
        );
      } else {
        // Insert new device
        await query(
          `INSERT INTO topology_devices (id, name, ip_address, device_type, status, sources, labels)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (id) DO UPDATE SET
             name = EXCLUDED.name, device_type = EXCLUDED.device_type,
             status = EXCLUDED.status, sources = EXCLUDED.sources, labels = EXCLUDED.labels`,
          [node.id, node.name, node.ip, node.deviceType, node.status, node.sources, JSON.stringify(node.labels)]
        );
      }
    }
  }

  /**
   * Load all topology nodes from database.
   */
  async loadTopologyFromDb(): Promise<TopologyNode[]> {
    const res = await query(
      `SELECT id, name, ip_address AS ip, device_type, status, sources, labels, x, y
       FROM topology_devices ORDER BY created_at ASC`
    );

    return res.rows.map((row: any) => ({
      id: row.id,
      name: row.name,
      ip: row.ip,
      deviceType: row.device_type,
      status: row.status,
      sources: row.sources || [],
      labels: row.labels || {},
      x: row.x,
      y: row.y
    }));
  }

  /**
   * Save a manually added device.
   */
  async addManualDevice(device: {
    name: string;
    ip: string;
    deviceType?: string;
    x?: number;
    y?: number;
  }): Promise<TopologyNode> {
    const id = `manual-${device.ip}-${Date.now()}`;
    const node: TopologyNode = {
      id,
      name: device.name,
      ip: device.ip,
      deviceType: device.deviceType || "unknown",
      status: "unknown",
      sources: ["MANUAL"],
      labels: {},
      x: device.x,
      y: device.y
    };

    await query(
      `INSERT INTO topology_devices (id, name, ip_address, device_type, status, sources, labels, x, y)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [node.id, node.name, node.ip, node.deviceType, node.status, node.sources, JSON.stringify(node.labels), node.x, node.y]
    );

    return node;
  }

  /**
   * Delete a topology device.
   */
  async deleteDevice(deviceId: string): Promise<void> {
    await query(`DELETE FROM topology_devices WHERE id = $1`, [deviceId]);
  }

  /**
   * Update device position (for drag-and-drop).
   */
  async updateDevicePosition(deviceId: string, x: number, y: number): Promise<void> {
    await query(
      `UPDATE topology_devices SET x = $1, y = $2 WHERE id = $3`,
      [x, y, deviceId]
    );
  }

  // ==================== EDGE OPERATIONS ====================

  async addEdge(source: string, target: string, label?: string, edgeType?: string): Promise<TopologyEdge> {
    const res = await query(
      `INSERT INTO topology_edges (source_id, target_id, label, edge_type)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (source_id, target_id) DO UPDATE SET label = EXCLUDED.label, edge_type = EXCLUDED.edge_type
       RETURNING id`,
      [source, target, label || null, edgeType || "ethernet"]
    );
    return { id: res.rows[0].id, source, target, label, edgeType: edgeType || "ethernet" };
  }

  async deleteEdge(edgeId: number): Promise<void> {
    await query(`DELETE FROM topology_edges WHERE id = $1`, [edgeId]);
  }

  async loadEdges(): Promise<TopologyEdge[]> {
    const res = await query(
      `SELECT id, source_id AS source, target_id AS target, label, edge_type AS edgeType
       FROM topology_edges ORDER BY id ASC`
    );
    return res.rows;
  }

  // ==================== FULL TOPOLOGY BUILD ====================

  /**
   * Build complete topology by aggregating all sources.
   */
  async buildTopology(options?: {
    prometheusUrl?: string;
    ipRange?: string;
    snmpCommunity?: string;
    snmpVersion?: string;
  }): Promise<TopologyGraph> {
    const allNodes: TopologyNode[] = [];

    // Fetch from all three sources in parallel
    const [promNodes, kumaNodes, manualNodes] = await Promise.all([
      this.fetchFromPrometheus(options?.prometheusUrl).catch(() => []),
      this.fetchFromUptimeKuma().catch(() => []),
      this.loadTopologyFromDb().then(nodes => nodes.filter(n => n.sources.includes("MANUAL")))
    ]);

    allNodes.push(...promNodes, ...kumaNodes, ...manualNodes);

    // SNMP scan if IP range provided
    if (options?.ipRange) {
      const snmpNodes = await this.scanNetwork(
        options.ipRange,
        options.snmpCommunity || "public",
        options.snmpVersion || "2c"
      );
      allNodes.push(...snmpNodes);
    }

    // Deduplicate and merge
    const mergedNodes = this.mergeNodes(allNodes);

    // Save to DB
    await this.saveTopologyToDb(mergedNodes);

    // Load final state (with positions) from DB
    const finalNodes = await this.loadTopologyFromDb();
    const edges = await this.loadEdges();

    // Auto-detect edges based on network proximity
    const autoEdges = this.autoDetectEdges(finalNodes);
    for (const edge of autoEdges) {
      // Only add if no existing edge between these nodes
      const exists = edges.some(e =>
        (e.source === edge.source && e.target === edge.target) ||
        (e.source === edge.target && e.target === edge.source)
      );
      if (!exists) {
        await this.addEdge(edge.source, edge.target, edge.label, edge.edgeType);
      }
    }

    const allEdges = await this.loadEdges();

    return {
      nodes: finalNodes,
      edges: allEdges,
      meta: {
        totalNodes: finalNodes.length,
        totalEdges: allEdges.length,
        sources: [...new Set(finalNodes.flatMap(n => n.sources))],
        lastScan: new Date().toISOString()
      }
    };
  }

  /**
   * Auto-detect edges between nodes based on subnet proximity.
   * Nodes in the same /24 subnet get connected.
   */
  private autoDetectEdges(nodes: TopologyNode[]): TopologyEdge[] {
    const edges: TopologyEdge[] = [];
    const subnetMap = new Map<string, string[]>();

    for (const node of nodes) {
      const parts = node.ip.split(".");
      if (parts.length !== 4) continue;
      const subnet = `${parts[0]}.${parts[1]}.${parts[2]}.0/24`;
      const existing = subnetMap.get(subnet) || [];
      existing.push(node.id);
      subnetMap.set(subnet, existing);
    }

    // Connect nodes within same subnet in a chain
    for (const [, nodeIds] of subnetMap) {
      if (nodeIds.length < 2) continue;
      for (let i = 0; i < nodeIds.length - 1; i++) {
        edges.push({
          source: nodeIds[i],
          target: nodeIds[i + 1],
          label: "local",
          edgeType: "ethernet"
        });
      }
    }

    return edges;
  }
}

export const topologyService = new TopologyService();
