import axios from "axios";
import { execFile } from "child_process";
import { promisify } from "util";
import pool, { query } from "../config/db";
import logger from "../config/logger";

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
  interfaces?: NetworkInterface[];
  x?: number | null;
  y?: number | null;
}

export interface NetworkInterface {
  name: string;
  ip: string;
  mac: string;
  speed: number;
  speedStr: string;
  status: "up" | "down" | "unknown";
}

export interface TopologyEdge {
  id?: number;
  source: string;
  target: string;
  label?: string;
  edgeType: string;
  sourceLabel?: string;
  targetLabel?: string;
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
      // Try to get from active Grafana config
      const configRes = await query(
        `SELECT host, token, datasource_uid FROM grafana_configs WHERE is_active = true LIMIT 1`
      );
      if (configRes.rows.length === 0) {
        // Fallback: try prometheus_configs for a direct Prometheus URL
        const promRes = await query(
          `SELECT reload_url FROM prometheus_configs WHERE is_active = true LIMIT 1`
        );
        if (promRes.rows.length === 0) {
          logger.topology("No active Prometheus/Grafana config found, skipping Prometheus source.");
          return nodes;
        }
        // Derive base URL from reload_url (e.g. http://prometheus:9090/-/reload → http://prometheus:9090)
        const reloadUrl = promRes.rows[0].reload_url as string;
        url = reloadUrl.replace(/\/-\/reload\/?$/, "");
      } else {
        // Use Grafana datasource proxy to query Prometheus targets
        const grafana = configRes.rows[0];
        const dsUid = grafana.datasource_uid || "prometheus";
        url = `${grafana.host}/api/datasources/proxy/uid/${dsUid}/api/v1/targets`;
        authToken = grafana.token || "";
      }
    }

    // Auto-append /api/v1/targets if user gave a bare base URL
    if (url && !url.includes("/api/v1/")) {
      url = url.replace(/\/+$/, "") + "/api/v1/targets";
    }

    try {
      const response = await axios.get(url, {
        timeout: 10000,
        headers: authToken ? { Authorization: `Bearer ${authToken}` } : {}
      });

      const data = response.data;
      if (data.status !== "success" || !data.data?.activeTargets) {
        logger.topology("Prometheus targets response was not successful.");
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

      logger.topology(`Fetched ${nodes.length} targets from Prometheus.`);
    } catch (err: any) {
      logger.error("Topology", `Prometheus fetch error: ${err.message}`);
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
        logger.topology("No active Uptime Kuma config, skipping.");
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
        logger.topology("Uptime Kuma monitor list request was not successful.");
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

      logger.topology(`Fetched ${nodes.length} monitors from Uptime Kuma.`);
    } catch (err: any) {
      logger.error("Topology", `Uptime Kuma fetch error: ${err.message}`);
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

  private static readonly IF_DESCR_OID = "1.3.6.1.2.1.2.2.1.2";
  private static readonly IF_SPEED_OID = "1.3.6.1.2.1.2.2.1.5";
  private static readonly IF_PHYS_ADDR_OID = "1.3.6.1.2.1.2.2.1.6";
  private static readonly IF_OPER_STATUS_OID = "1.3.6.1.2.1.2.2.1.8";
  private static readonly IP_AD_ENT_ADDR_OID = "1.3.6.1.2.1.4.20.1.1";
  private static readonly IP_AD_ENT_IF_INDEX_OID = "1.3.6.1.2.1.4.20.1.2";

  /**
   * Scan an IP range using ICMP ping + SNMP GET for sysName/sysDescr,
   * then SNMP WALK IF-MIB to get interface details (ifDescr, ifSpeed, ifPhysAddress, ifOperStatus).
   * Also walks ipAddrTable to map interface IPs.
   */
  async scanNetwork(
    ipRange: string,
    community: string = "public",
    snmpVersion: string = "2c",
    timeout: number = 2000
  ): Promise<TopologyNode[]> {
    const nodes: TopologyNode[] = [];
    const ips = this.expandIpRange(ipRange);

    logger.topology(`Scanning ${ips.length} IPs in range ${ipRange}...`);

    const batchSize = 20;
    for (let i = 0; i < ips.length; i += batchSize) {
      const batch = ips.slice(i, i + batchSize);
      const results = await Promise.all(
        batch.map(ip => this.pingAndSnmpGet(ip, community, snmpVersion, timeout))
      );

      for (const result of results) {
        if (result.alive) {
          const interfaces = await this.snmpWalkInterfaces(result.ip, community, snmpVersion, timeout);

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
              snmpVersion,
              interfaceCount: interfaces.length
            },
            interfaces
          });
        }
      }
    }

    logger.topology(`SNMP scan complete. Found ${nodes.length} alive hosts.`);
    return nodes;
  }

  /**
   * SNMP WALK IF-MIB and ipAddrTable to get interface details for a host.
   */
  private async snmpWalkInterfaces(
    ip: string,
    community: string,
    version: string,
    timeout: number
  ): Promise<NetworkInterface[]> {
    const interfaces: NetworkInterface[] = [];
    const versionFlag = version === "v1" ? "1" : "2c";

    const [descrResult, speedResult, macResult, statusResult, ipAddrResult, ipIfIndexResult] = await Promise.all([
      this.snmpWalkOid(ip, TopologyService.IF_DESCR_OID, community, versionFlag, timeout).catch(() => ""),
      this.snmpWalkOid(ip, TopologyService.IF_SPEED_OID, community, versionFlag, timeout).catch(() => ""),
      this.snmpWalkOid(ip, TopologyService.IF_PHYS_ADDR_OID, community, versionFlag, timeout).catch(() => ""),
      this.snmpWalkOid(ip, TopologyService.IF_OPER_STATUS_OID, community, versionFlag, timeout).catch(() => ""),
      this.snmpWalkOid(ip, TopologyService.IP_AD_ENT_ADDR_OID, community, versionFlag, timeout).catch(() => ""),
      this.snmpWalkOid(ip, TopologyService.IP_AD_ENT_IF_INDEX_OID, community, versionFlag, timeout).catch(() => "")
    ]);

    const descrMap = this.parseWalkResult(descrResult);
    const speedMap = this.parseWalkResult(speedResult);
    const macMap = this.parseWalkResult(macResult);
    const statusMap = this.parseWalkResult(statusResult);
    const _ipAddrMap = this.parseWalkResult(ipAddrResult); // eslint-disable-line @typescript-eslint/no-unused-vars
    const ipIfIndexMap = this.parseWalkResult(ipIfIndexResult);

    // Build ipAddrMap keyed by interface index using ipAdEntIfIndex
    const ifaceIpMap = new Map<string, string>();
    for (const [ip, ifIdx] of ipIfIndexMap) {
      const existingIp = ifaceIpMap.get(ifIdx);
      if (!existingIp) ifaceIpMap.set(ifIdx, ip);
    }

    for (const [idx, name] of descrMap) {
      const speedRaw = parseInt(speedMap.get(idx) || "0") || 0;
      const macRaw = macMap.get(idx) || "";
      const operStatus = parseInt(statusMap.get(idx) || "0");
      const ipAddr = ifaceIpMap.get(idx) || "";

      interfaces.push({
        name: name || `if${idx}`,
        ip: ipAddr,
        mac: this.formatMac(macRaw),
        speed: speedRaw,
        speedStr: this.formatSpeed(speedRaw),
        status: operStatus === 1 ? "up" : operStatus === 2 ? "down" : "unknown"
      });
    }

    if (interfaces.length === 0 && ipIfIndexMap.size > 0) {
      for (const [ip, ifIdx] of ipIfIndexMap) {
        interfaces.push({
          name: `ip${ifIdx}`,
          ip: ip,
          mac: "",
          speed: 0,
          speedStr: "-",
          status: "up"
        });
      }
    }

    return interfaces;
  }

  private async snmpWalkOid(ip: string, oid: string, community: string, versionFlag: string, timeout: number): Promise<string> {
    const args = ["-v", versionFlag, "-c", community, "-On", "-t", "2", "-r", "1", ip, oid];
    try {
      const { stdout } = await execFileAsync("snmpwalk", args, { timeout: timeout + 5000 });
      return stdout;
    } catch {
      return "";
    }
  }

  private parseWalkResult(output: string): Map<string, string> {
    const map = new Map<string, string>();
    const lines = output.split(/\r?\n/);
    for (const line of lines) {
      if (!line.trim()) continue;
      // Format: .1.3.6.1.2.1.2.2.1.8.1 = INTEGER: 1
      // or:     .1.3.6.1.2.1.2.2.1.2.1 = STRING: "eth0"
      const match = line.match(/^\.([\d.]+)\s*=\s*(.*)$/);
      if (match) {
        const oidParts = match[1].split(".");
        const idx = oidParts[oidParts.length - 1];
        let rawValue = match[2].trim();
        // Strip type prefix: "INTEGER: 1" -> "1", "STRING: eth0" -> "eth0"
        const colonMatch = rawValue.match(/^(\w+):\s*(.*)/);
        if (colonMatch) {
          rawValue = colonMatch[2].trim();
        }
        // Strip surrounding quotes
        if (rawValue.startsWith('"') && rawValue.endsWith('"')) {
          rawValue = rawValue.substring(1, rawValue.length - 1);
        }
        map.set(idx, rawValue);
      }
    }
    return map;
  }

  private formatMac(hexStr: string): string {
    if (!hexStr) return "";
    const cleaned = hexStr.replace(/[^0-9a-fA-F]/g, "");
    if (cleaned.length === 12) {
      return cleaned.match(/.{2}/g)?.join(":") || hexStr;
    }
    return hexStr;
  }

  private formatSpeed(bps: number): string {
    if (!bps || bps === 0) return "-";
    if (bps >= 1e9) return (bps / 1e9) + " Gbps";
    if (bps >= 1e6) return (bps / 1e6) + " Mbps";
    if (bps >= 1e3) return (bps / 1e3) + " Kbps";
    return bps + " bps";
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
        if (node.interfaces && node.interfaces.length > 0) {
          existing.interfaces = node.interfaces;
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
      const existing = await query(
        `SELECT id, x, y FROM topology_devices WHERE ip_address = $1`,
        [node.ip]
      );

      if (existing.rows.length > 0) {
        await query(
          `UPDATE topology_devices
           SET name = $1, device_type = $2, status = $3, sources = $4, labels = $5, interfaces = $6
           WHERE ip_address = $7`,
          [node.name, node.deviceType, node.status, node.sources, JSON.stringify(node.labels), JSON.stringify(node.interfaces || []), node.ip]
        );
      } else {
        await query(
          `INSERT INTO topology_devices (id, name, ip_address, device_type, status, sources, labels, interfaces)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (id) DO UPDATE SET
             name = EXCLUDED.name, device_type = EXCLUDED.device_type,
             status = EXCLUDED.status, sources = EXCLUDED.sources, labels = EXCLUDED.labels, interfaces = EXCLUDED.interfaces`,
          [node.id, node.name, node.ip, node.deviceType, node.status, node.sources, JSON.stringify(node.labels), JSON.stringify(node.interfaces || [])]
        );
      }
    }
  }

  /**
   * Load all topology nodes from database.
   */
  async loadTopologyFromDb(sheetId?: number): Promise<TopologyNode[]> {
    let sql = `SELECT id, name, ip_address AS ip, device_type, status, sources, labels, interfaces, x, y
       FROM topology_devices`;
    const params: any[] = [];
    if (sheetId) {
      // Include devices with NULL sheet_id (orphaned) and backfill them to this sheet
      sql += ` WHERE (sheet_id = $1 OR sheet_id IS NULL)`;
      params.push(sheetId);
      // Backfill orphaned devices to this sheet
      await query(`UPDATE topology_devices SET sheet_id = $1 WHERE sheet_id IS NULL`, [sheetId]).catch(() => {});
    }
    sql += ` ORDER BY created_at ASC`;
    const res = await query(sql, params);

    return res.rows.map((row: any) => ({
      id: row.id,
      name: row.name,
      ip: row.ip,
      deviceType: row.device_type,
      status: row.status,
      sources: row.sources || [],
      labels: row.labels || {},
      interfaces: row.interfaces || [],
      x: row.x !== null && row.x !== undefined ? parseFloat(row.x) : null,
      y: row.y !== null && row.y !== undefined ? parseFloat(row.y) : null
    }));
  }

  /**
   * Save a manually added device.
   */
  async addManualDevice(device: {
    name: string;
    ip: string;
    deviceType?: string;
    tags?: string;
    labels?: Record<string, any>;
    x?: number | null;
    y?: number | null;
    sheetId?: number;
  }): Promise<TopologyNode> {
    const id = `manual-${device.ip}-${Date.now()}`;
    const labels: Record<string, any> = { ...(device.labels || {}) };
    if (device.tags) {
      labels.tags = device.tags;
    }

    const node: TopologyNode = {
      id,
      name: device.name,
      ip: device.ip,
      deviceType: device.deviceType || "unknown",
      status: "unknown",
      sources: ["MANUAL"],
      labels,
      x: device.x,
      y: device.y
    };

    await query(
      `INSERT INTO topology_devices (id, name, ip_address, device_type, status, sources, labels, x, y, sheet_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [node.id, node.name, node.ip, node.deviceType, node.status, node.sources, JSON.stringify(node.labels), node.x, node.y, device.sheetId || null]
    );

    return node;
  }

  /**
   * Delete a topology device.
   */
  async deleteDevice(deviceId: string): Promise<void> {
    await query(`DELETE FROM topology_devices WHERE id = $1`, [deviceId]);
  }

  async updateDevice(deviceId: string, updates: { name?: string; ip?: string; deviceType?: string; tags?: string; labels?: Record<string, any> }): Promise<void> {
    const fields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (updates.name !== undefined) {
      fields.push(`name = $${paramIndex++}`);
      values.push(updates.name);
    }
    if (updates.ip !== undefined) {
      fields.push(`ip_address = $${paramIndex++}`);
      values.push(updates.ip);
    }
    if (updates.deviceType !== undefined) {
      fields.push(`device_type = $${paramIndex++}`);
      values.push(updates.deviceType);
    }
    if (updates.tags !== undefined || updates.labels !== undefined) {
      // Get existing labels first to merge
      const cur = await query(`SELECT labels FROM topology_devices WHERE id = $1`, [deviceId]);
      const curLabels = cur.rows.length > 0 && cur.rows[0].labels ? cur.rows[0].labels : {};
      const newLabels = { ...curLabels, ...(updates.labels || {}) };
      if (updates.tags !== undefined) {
        newLabels.tags = updates.tags;
      }
      fields.push(`labels = $${paramIndex++}`);
      values.push(JSON.stringify(newLabels));
    }

    if (fields.length === 0) return;

    values.push(deviceId);
    await query(
      `UPDATE topology_devices SET ${fields.join(', ')} WHERE id = $${paramIndex}`,
      values
    );
  }

  /**
   * Save a single device to DB (called when user clicks "Add" from sidebar).
   * Preserves position if device already exists.
   */
  async saveDeviceToDb(node: TopologyNode, sheetId?: number): Promise<void> {
    try {
      const existing = await query(
        `SELECT id, x, y FROM topology_devices WHERE ip_address = $1 AND (sheet_id = $2 OR ($2 IS NULL AND sheet_id IS NULL))`,
        [node.ip, sheetId || null]
      );

      if (existing.rows.length > 0) {
        await query(
          `UPDATE topology_devices
           SET name = $1, device_type = $2, status = $3, sources = $4, labels = $5, interfaces = $6
           WHERE ip_address = $7 AND (sheet_id = $8 OR ($8 IS NULL AND sheet_id IS NULL))`,
          [node.name, node.deviceType, node.status, node.sources || [], JSON.stringify(node.labels || {}), JSON.stringify(node.interfaces || []), node.ip, sheetId || null]
        );
      } else {
        const id = node.id || `device-${node.ip}-${Date.now()}`;
        await query(
          `INSERT INTO topology_devices (id, name, ip_address, device_type, status, sources, labels, interfaces, x, y, sheet_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
           ON CONFLICT (id) DO UPDATE SET
             name = EXCLUDED.name, device_type = EXCLUDED.device_type, status = EXCLUDED.status,
             sources = EXCLUDED.sources, labels = EXCLUDED.labels, interfaces = EXCLUDED.interfaces`,
          [id, node.name, node.ip, node.deviceType || "unknown", node.status || "unknown", node.sources || [], JSON.stringify(node.labels || {}), JSON.stringify(node.interfaces || []), node.x || null, node.y || null, sheetId || null]
        );
      }
    } catch (err: any) {
      logger.error("Topology", `saveDeviceToDb error: ${err.message} node: ${node?.ip}`);
      throw err;
    }
  }

  /**
   * Update device position (for drag-and-drop).
   */
  async updateDevicePosition(deviceId: string, x: number, y: number): Promise<void> {
    const res = await query(
      `UPDATE topology_devices SET x = $1, y = $2 WHERE id = $3`,
      [x, y, deviceId]
    );
    if (res.rowCount === 0) {
      await query(
        `UPDATE topology_devices SET x = $1, y = $2 WHERE ip_address = $3`,
        [x, y, deviceId]
      );
    }
  }

  // ==================== EDGE OPERATIONS ====================

  async addEdge(source: string, target: string, label?: string, edgeType?: string, sourceLabel?: string, targetLabel?: string, sheetId?: number): Promise<TopologyEdge> {
    // Check if edge already exists
    const existing = await query(
      `SELECT id FROM topology_edges WHERE source_id = $1 AND target_id = $2 AND (sheet_id = $3 OR ($3 IS NULL AND sheet_id IS NULL))`,
      [source, target, sheetId || null]
    );

    if (existing.rows.length > 0) {
      // Update existing edge
      await query(
        `UPDATE topology_edges SET label = $1, edge_type = $2, source_label = $3, target_label = $4 WHERE id = $5`,
        [label || null, edgeType || "ethernet", sourceLabel || null, targetLabel || null, existing.rows[0].id]
      );
      return { id: existing.rows[0].id, source, target, label, edgeType: edgeType || "ethernet", sourceLabel, targetLabel };
    }

    // Insert new edge
    const res = await query(
      `INSERT INTO topology_edges (source_id, target_id, label, edge_type, source_label, target_label, sheet_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [source, target, label || null, edgeType || "ethernet", sourceLabel || null, targetLabel || null, sheetId || null]
    );
    return { id: res.rows[0].id, source, target, label, edgeType: edgeType || "ethernet", sourceLabel, targetLabel };
  }

  async deleteEdge(edgeId: number): Promise<void> {
    await query(`DELETE FROM topology_edges WHERE id = $1`, [edgeId]);
  }

  async updateEdge(edgeId: number, label?: string, sourceLabel?: string, targetLabel?: string): Promise<void> {
    await query(`UPDATE topology_edges SET label = $1, source_label = $2, target_label = $3 WHERE id = $4`, [label || null, sourceLabel || null, targetLabel || null, edgeId]);
  }

  async loadEdges(sheetId?: number): Promise<TopologyEdge[]> {
    let sql = `SELECT id, source_id AS source, target_id AS target, label, edge_type AS edgeType, source_label AS "sourceLabel", target_label AS "targetLabel"
       FROM topology_edges`;
    const params: any[] = [];
    if (sheetId) {
      sql += ` WHERE (sheet_id = $1 OR sheet_id IS NULL)`;
      params.push(sheetId);
      // Backfill orphaned edges to this sheet
      await query(`UPDATE topology_edges SET sheet_id = $1 WHERE sheet_id IS NULL`, [sheetId]).catch(() => {});
    }
    sql += ` ORDER BY id ASC`;
    const res = await query(sql, params);
    return res.rows;
  }

  // ==================== PENDING NODES (scan results) ====================

  async getPendingNodes(userId: number): Promise<any[]> {
    const res = await query(
      `SELECT id, device_data, created_at FROM topology_pending WHERE user_id = $1 ORDER BY created_at ASC`,
      [userId]
    );
    return res.rows.map((row: any) => ({ ...row.device_data, _pendingId: row.id }));
  }

  async savePendingNode(userId: number, deviceData: any): Promise<void> {
    await query(
      `INSERT INTO topology_pending (user_id, device_data) VALUES ($1, $2)`,
      [userId, JSON.stringify(deviceData)]
    );
  }

  async savePendingNodes(userId: number, devices: any[]): Promise<void> {
    for (const d of devices) {
      await query(
        `INSERT INTO topology_pending (user_id, device_data) VALUES ($1, $2)`,
        [userId, JSON.stringify(d)]
      );
    }
  }

  async deletePendingNode(userId: number, pendingId: number): Promise<void> {
    await query(`DELETE FROM topology_pending WHERE id = $1 AND user_id = $2`, [pendingId, userId]);
  }

  async updatePendingNode(userId: number, pendingId: number, deviceData: any): Promise<void> {
    await query(
      `UPDATE topology_pending SET device_data = $1 WHERE id = $2 AND user_id = $3`,
      [JSON.stringify(deviceData), pendingId, userId]
    );
  }

  async clearPendingNodes(userId: number): Promise<void> {
    await query(`DELETE FROM topology_pending WHERE user_id = $1`, [userId]);
  }

  // ==================== FULL TOPOLOGY BUILD ====================

  /**
   * Discover live hosts using nmap ping scan (-sn).
   * Returns IPs with latency info.
   */
  async discoverWithNmap(ipRange: string): Promise<TopologyNode[]> {
    const nodes: TopologyNode[] = [];
    try {
      // Sanitize IP range to prevent command injection
      const sanitizedRange = ipRange.replace(/[^0-9a-fA-F.,/-:]/g, '');
      if (!sanitizedRange || sanitizedRange !== ipRange) {
        logger.error("Topology", `Nmap: invalid characters in IP range`);
        return nodes;
      }
      const { stdout } = await execFileAsync("nmap", ["-sn", sanitizedRange], { timeout: 60000 });
      const lines = stdout.split("\n");
      let currentIp = "";
      let currentHostname = "";
      for (const line of lines) {
        const reportMatch = line.match(/Nmap scan report for (.+?)(?:\s+\((.+?)\))?$/);
        if (reportMatch) {
          const hostnameOrIp = reportMatch[1].trim();
          const ipMatch = hostnameOrIp.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/);
          if (ipMatch) {
            currentIp = ipMatch[1];
            currentHostname = hostnameOrIp !== currentIp ? hostnameOrIp : "";
          }
        }
        const latencyMatch = line.match(/Host is up \((.+?)s latency\)/);
        if (currentIp && latencyMatch) {
          nodes.push({
            id: `nmap-${currentIp}`,
            name: currentHostname || currentIp,
            ip: currentIp,
            deviceType: "unknown",
            status: "online",
            sources: ["NMAP"],
            labels: { latency: latencyMatch[1] + "s" }
          });
          currentIp = "";
          currentHostname = "";
        }
      }
      logger.topology(`Nmap discovered ${nodes.length} hosts in ${ipRange}`);
    } catch (err: any) {
      logger.error("Topology", `Nmap error: ${err.message}`);
    }
    return nodes;
  }

  // ==================== SHEET OPERATIONS ====================

  async getSheets(): Promise<any[]> {
    const res = await query(
      `SELECT s.*,
        (SELECT COUNT(*) FROM topology_devices WHERE sheet_id = s.id) AS device_count,
        (SELECT COUNT(*) FROM topology_edges WHERE sheet_id = s.id) AS edge_count
       FROM topology_sheets s ORDER BY s.sort_order, s.id`
    );
    return res.rows;
  }

  async createSheet(name: string): Promise<any> {
    const maxOrder = await query(`SELECT COALESCE(MAX(sort_order), 0) + 1 AS next FROM topology_sheets`);
    const res = await query(
      `INSERT INTO topology_sheets (name, sort_order) VALUES ($1, $2) RETURNING *`,
      [name, maxOrder.rows[0].next]
    );
    return res.rows[0];
  }

  async updateSheet(id: number, name: string): Promise<any> {
    const res = await query(
      `UPDATE topology_sheets SET name = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [name, id]
    );
    return res.rows[0] || null;
  }

  async deleteSheet(id: number): Promise<boolean> {
    const res = await query(`DELETE FROM topology_sheets WHERE id = $1`, [id]);
    return (res.rowCount ?? 0) > 0;
  }

  async reorderSheet(id: number, sortOrder: number): Promise<void> {
    await query(`UPDATE topology_sheets SET sort_order = $1, updated_at = NOW() WHERE id = $2`, [sortOrder, id]);
  }

  /**
   * Scan network and return candidates WITHOUT saving to DB.
   * Fetches from Prometheus targets, Uptime Kuma, SNMP, and Nmap.
   */
  async scanOnly(options: {
    prometheusUrl?: string;
    ipRange?: string;
    snmpCommunity?: string;
    snmpVersion?: string;
    useNmap?: boolean;
  }): Promise<TopologyNode[]> {
    const allNodes: TopologyNode[] = [];

    // Fetch from Prometheus and Uptime Kuma in parallel
    const basePromises: Promise<TopologyNode[]>[] = [
      this.fetchFromPrometheus(options.prometheusUrl).catch(() => []),
      this.fetchFromUptimeKuma().catch(() => []),
      this.loadTopologyFromDb().then(nodes => nodes.filter(n => n.sources.includes("MANUAL")))
    ];

    // Add nmap if requested and IP range provided
    if (options.useNmap && options.ipRange) {
      basePromises.push(this.discoverWithNmap(options.ipRange).catch(() => []));
    }

    const results = await Promise.all(basePromises);
    for (const r of results) allNodes.push(...r);

    // SNMP scan if IP range provided
    if (options.ipRange) {
      const snmpNodes = await this.scanNetwork(
        options.ipRange,
        options.snmpCommunity || "public",
        options.snmpVersion || "2c"
      );
      allNodes.push(...snmpNodes);
    }

    // Deduplicate and merge (but DO NOT save to DB)
    return this.mergeNodes(allNodes);
  }

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
   * Auto-detect edges between nodes based on SNMP interface IP data.
   * If device A has an interface with IP in same subnet as device B's IP, create edge.
   * Falls back to subnet proximity if no interface data available.
   */
  private autoDetectEdges(nodes: TopologyNode[]): TopologyEdge[] {
    const edges: TopologyEdge[] = [];
    const edgeSet = new Set<string>();

    const addEdge = (src: string, tgt: string, label: string) => {
      const key = [src, tgt].sort().join("|");
      if (edgeSet.has(key)) return;
      edgeSet.add(key);
      edges.push({ source: src, target: tgt, label, edgeType: "ethernet" });
    };

    // Build IP -> nodeId index
    const ipToNodeId = new Map<string, string>();
    for (const node of nodes) {
      ipToNodeId.set(node.ip, node.id);
    }

    // Pass 1: Connect based on interface IPs matching other devices
    for (const node of nodes) {
      if (!node.interfaces || node.interfaces.length === 0) continue;
      for (const iface of node.interfaces) {
        if (!iface.ip) continue;
        const targetId = ipToNodeId.get(iface.ip);
        if (targetId && targetId !== node.id) {
          const label = iface.speedStr && iface.speedStr !== "-" ? iface.speedStr : iface.name;
          addEdge(node.id, targetId, label);
        }
      }
    }

    // Pass 2: For nodes with no edges yet, fall back to same-subnet proximity
    const subnetMap = new Map<string, string[]>();
    const connectedNodes = new Set<string>();
    for (const edge of edges) {
      connectedNodes.add(edge.source);
      connectedNodes.add(edge.target);
    }

    for (const node of nodes) {
      if (connectedNodes.has(node.id)) continue;
      const parts = node.ip.split(".");
      if (parts.length !== 4) continue;
      const subnet = `${parts[0]}.${parts[1]}.${parts[2]}.0/24`;
      const existing = subnetMap.get(subnet) || [];
      existing.push(node.id);
      subnetMap.set(subnet, existing);
    }

    for (const [, nodeIds] of subnetMap) {
      if (nodeIds.length < 2) continue;
      for (let i = 0; i < nodeIds.length - 1; i++) {
        addEdge(nodeIds[i], nodeIds[i + 1], "");
      }
    }

    return edges;
  }
}

export const topologyService = new TopologyService();
