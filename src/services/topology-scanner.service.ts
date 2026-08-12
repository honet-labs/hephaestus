import { execFile } from "child_process";
import { promisify } from "util";
import { TopologyNode, NetworkInterface } from "../types";
import logger from "../config/logger";

const execFileAsync = promisify(execFile);

// ==================== SCANNER SERVICE ====================

export class TopologyScannerService {
  // ==================== SOURCE C: SNMP SCANNER ====================

  private static readonly SYS_NAME_OID = "1.3.6.1.2.1.1.5.0";
  private static readonly SYS_DESCR_OID = "1.3.6.1.2.1.1.1.0";
  private static readonly IF_DESCR_OID = "1.3.6.1.2.1.2.2.1.2";
  private static readonly IF_SPEED_OID = "1.3.6.1.2.1.2.2.1.5";
  private static readonly IF_PHYS_ADDR_OID = "1.3.6.1.2.1.2.2.1.6";
  private static readonly IF_OPER_STATUS_OID = "1.3.6.1.2.1.2.2.1.8";
  private static readonly IP_AD_ENT_ADDR_OID = "1.3.6.1.2.1.4.20.1.1";
  private static readonly IP_AD_ENT_IF_INDEX_OID = "1.3.6.1.2.1.4.20.1.2";

  private static readonly MAX_IP_COUNT = 1024;

  /**
   * Scan an IP range using ICMP ping + SNMP GET for sysName/sysDescr,
   * then SNMP WALK IF-MIB to get interface details.
   */
  async scanNetwork(
    ipRange: string,
    community: string = "public",
    snmpVersion: string = "2c",
    timeout: number = 2000
  ): Promise<TopologyNode[]> {
    const nodes: TopologyNode[] = [];
    const ips = this.expandIpRange(ipRange);

    // Safety limit
    if (ips.length > TopologyScannerService.MAX_IP_COUNT) {
      logger.warn("Topology", `IP range too large (${ips.length} IPs), limiting to ${TopologyScannerService.MAX_IP_COUNT}`);
      ips.length = TopologyScannerService.MAX_IP_COUNT;
    }

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
   * Discover live hosts using nmap ping scan (-sn).
   */
  async discoverWithNmap(ipRange: string): Promise<TopologyNode[]> {
    const nodes: TopologyNode[] = [];
    try {
      // Sanitize IP range to prevent command injection
      const sanitizedRange = ipRange.replace(/[^0-9a-fA-F.,\/\-:]/g, '');
      if (!sanitizedRange || sanitizedRange !== ipRange) {
        logger.error("Topology", "Nmap: invalid characters in IP range");
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

  // ==================== PRIVATE HELPERS ====================

  private async snmpWalkInterfaces(
    ip: string,
    community: string,
    version: string,
    timeout: number
  ): Promise<NetworkInterface[]> {
    const interfaces: NetworkInterface[] = [];
    const versionFlag = version === "v1" ? "1" : "2c";

    const [descrResult, speedResult, macResult, statusResult, ipAddrResult, ipIfIndexResult] = await Promise.all([
      this.snmpWalkOid(ip, TopologyScannerService.IF_DESCR_OID, community, versionFlag, timeout).catch(() => ""),
      this.snmpWalkOid(ip, TopologyScannerService.IF_SPEED_OID, community, versionFlag, timeout).catch(() => ""),
      this.snmpWalkOid(ip, TopologyScannerService.IF_PHYS_ADDR_OID, community, versionFlag, timeout).catch(() => ""),
      this.snmpWalkOid(ip, TopologyScannerService.IF_OPER_STATUS_OID, community, versionFlag, timeout).catch(() => ""),
      this.snmpWalkOid(ip, TopologyScannerService.IP_AD_ENT_ADDR_OID, community, versionFlag, timeout).catch(() => ""),
      this.snmpWalkOid(ip, TopologyScannerService.IP_AD_ENT_IF_INDEX_OID, community, versionFlag, timeout).catch(() => "")
    ]);

    const descrMap = this.parseWalkResult(descrResult);
    const speedMap = this.parseWalkResult(speedResult);
    const macMap = this.parseWalkResult(macResult);
    const statusMap = this.parseWalkResult(statusResult);
    const ipAddrMap = this.parseWalkResult(ipAddrResult);
    const ipIfIndexMap = this.parseWalkResult(ipIfIndexResult);

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
      const match = line.match(/^\.([\d.]+)\s*=\s*(.*)$/);
      if (match) {
        const oidParts = match[1].split(".");
        const idx = oidParts[oidParts.length - 1];
        let rawValue = match[2].trim();
        const colonMatch = rawValue.match(/^(\w+):\s*(.*)/);
        if (colonMatch) {
          rawValue = colonMatch[2].trim();
        }
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
   */
  expandIpRange(range: string): string[] {
    const ips: string[] = [];

    // CIDR notation
    const cidrMatch = range.match(/^(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\/(\d{1,2})$/);
    if (cidrMatch) {
      const baseIp = cidrMatch[1];
      const prefix = parseInt(cidrMatch[2]);
      const baseParts = baseIp.split(".").map(Number);
      const baseNum = (baseParts[0] << 24) | (baseParts[1] << 16) | (baseParts[2] << 8) | baseParts[3];
      const hostBits = 32 - prefix;
      const numHosts = Math.min((1 << hostBits) - 2, TopologyScannerService.MAX_IP_COUNT);

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

    // Dash notation
    const dashMatch = range.match(/^(\d{1,3}\.\d{1,3}\.\d{1,3}\.)(\d{1,3})-(\d{1,3})$/);
    if (dashMatch) {
      const prefix = dashMatch[1];
      const start = parseInt(dashMatch[2]);
      const end = Math.min(parseInt(dashMatch[3]), start + TopologyScannerService.MAX_IP_COUNT - 1);
      for (let i = start; i <= end; i++) {
        ips.push(`${prefix}${i}`);
      }
      return ips;
    }

    // Comma-separated
    const parts = range.split(",").map(s => s.trim()).filter(Boolean);
    for (const part of parts.slice(0, TopologyScannerService.MAX_IP_COUNT)) {
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
      const pingArgs = process.platform === "win32"
        ? ["-n", "1", "-w", String(timeout), ip]
        : ["-c", "1", "-W", String(Math.ceil(timeout / 1000)), ip];
      await execFileAsync("ping", pingArgs, { timeout: timeout + 2000 });
      result.alive = true;
    } catch {
      return result;
    }

    const versionFlag = version === "v1" ? "1" : "2c";
    const snmpArgs = [
      "-v", versionFlag,
      "-c", community,
      "-On",
      "-t", "2",
      "-r", "1",
      ip,
      TopologyScannerService.SYS_NAME_OID,
      TopologyScannerService.SYS_DESCR_OID
    ];

    try {
      const { stdout } = await execFileAsync("snmpget", snmpArgs, { timeout: timeout + 2000 });
      const lines = stdout.split(/\r?\n/);
      for (const line of lines) {
        if (line.includes(TopologyScannerService.SYS_NAME_OID)) {
          const match = line.match(/STRING:\s*"?([^"\n]+)"?\s*$/);
          if (match) result.sysName = match[1].trim();
        }
        if (line.includes(TopologyScannerService.SYS_DESCR_OID)) {
          const match = line.match(/STRING:\s*"?([^"\n]+)"?\s*$/);
          if (match) result.sysDescr = match[1].trim();
        }
      }
    } catch {
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
    return "network";
  }
}

export const topologyScannerService = new TopologyScannerService();
