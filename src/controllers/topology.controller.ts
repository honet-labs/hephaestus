import { Request, Response } from "express";
import { topologyService } from "../services/topology.service";
import { logActivity } from "../config/db";

export class TopologyController {
  /**
   * GET /api/v1/topology/graph — Load full topology from DB
   */
  public async getGraph(req: Request, res: Response) {
    try {
      const nodes = await topologyService.loadTopologyFromDb();
      const edges = await topologyService.loadEdges();
      return res.status(200).json({
        success: true,
        data: {
          nodes,
          edges,
          meta: {
            totalNodes: nodes.length,
            totalEdges: edges.length,
            sources: [...new Set(nodes.flatMap(n => n.sources))],
            lastScan: null
          }
        }
      });
    } catch (err: any) {
      console.error("[Topology] getGraph error:", err.message);
      return res.status(500).json({ success: false, error: "Failed to load topology graph." });
    }
  }

  /**
   * POST /api/v1/topology/scan — Run full aggregation scan
   * Body: { prometheusUrl?, ipRange?, snmpCommunity?, snmpVersion? }
   */
  public async scanTopology(req: Request, res: Response) {
    try {
      const { prometheusUrl, ipRange, snmpCommunity, snmpVersion } = req.body || {};
      const graph = await topologyService.buildTopology({
        prometheusUrl,
        ipRange,
        snmpCommunity: snmpCommunity || "public",
        snmpVersion: snmpVersion || "2c"
      });
      await logActivity("Network Topology", "Scan", `Scanned topology: ${graph.meta.totalNodes} nodes, ${graph.meta.totalEdges} edges`, "SUCCESS");
      return res.status(200).json({ success: true, data: graph });
    } catch (err: any) {
      console.error("[Topology] scanTopology error:", err.message);
      return res.status(500).json({ success: false, error: "Scan failed: " + err.message });
    }
  }

  /**
   * POST /api/v1/topology/device — Add a manual device
   * Body: { name, ip, deviceType?, x?, y? }
   */
  public async addDevice(req: Request, res: Response) {
    try {
      const { name, ip, deviceType, x, y } = req.body;
      if (!name || !ip) {
        return res.status(400).json({ success: false, error: "name and ip are required." });
      }
      const ipRegex = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;
      if (!ipRegex.test(ip)) {
        return res.status(400).json({ success: false, error: "Invalid IP address format." });
      }
      const node = await topologyService.addManualDevice({ name, ip, deviceType, x, y });
      await logActivity("Network Topology", "Add Device", `Added manual device "${name}" (${ip})`, "SUCCESS");
      return res.status(200).json({ success: true, data: node });
    } catch (err: any) {
      console.error("[Topology] addDevice error:", err.message);
      return res.status(500).json({ success: false, error: "Failed to add device." });
    }
  }

  /**
   * DELETE /api/v1/topology/device/:id — Delete a device
   */
  public async deleteDevice(req: Request, res: Response) {
    try {
      await topologyService.deleteDevice(req.params.id);
      await logActivity("Network Topology", "Delete Device", `Deleted device "${req.params.id}"`, "SUCCESS");
      return res.status(200).json({ success: true, message: "Device deleted." });
    } catch (err: any) {
      console.error("[Topology] deleteDevice error:", err.message);
      return res.status(500).json({ success: false, error: "Failed to delete device." });
    }
  }

  /**
   * PUT /api/v1/topology/device/position — Update device position
   * Body: { id, x, y }
   */
  public async updatePosition(req: Request, res: Response) {
    try {
      const { id, x, y } = req.body;
      if (!id || x === undefined || y === undefined) {
        return res.status(400).json({ success: false, error: "id, x, and y are required." });
      }
      await topologyService.updateDevicePosition(id, x, y);
      return res.status(200).json({ success: true });
    } catch (err: any) {
      console.error("[Topology] updatePosition error:", err.message);
      return res.status(500).json({ success: false, error: "Failed to update position." });
    }
  }

  /**
   * POST /api/v1/topology/edge — Add a connection edge
   * Body: { source, target, label?, edgeType? }
   */
  public async addEdge(req: Request, res: Response) {
    try {
      const { source, target, label, edgeType } = req.body;
      if (!source || !target) {
        return res.status(400).json({ success: false, error: "source and target are required." });
      }
      if (source === target) {
        return res.status(400).json({ success: false, error: "Cannot connect a device to itself." });
      }
      // Verify both devices exist
      const srcCheck = await (await import("../config/db")).query("SELECT id FROM topology_devices WHERE id = $1", [source]);
      const tgtCheck = await (await import("../config/db")).query("SELECT id FROM topology_devices WHERE id = $1", [target]);
      if (srcCheck.rows.length === 0) {
        return res.status(400).json({ success: false, error: `Source device "${source}" not found. Try refreshing the page.` });
      }
      if (tgtCheck.rows.length === 0) {
        return res.status(400).json({ success: false, error: `Target device "${target}" not found. Try refreshing the page.` });
      }
      const edge = await topologyService.addEdge(source, target, label, edgeType);
      await logActivity("Network Topology", "Add Edge", `Added connection "${source}" -> "${target}"`, "SUCCESS");
      return res.status(200).json({ success: true, data: edge });
    } catch (err: any) {
      console.error("[Topology] addEdge error:", err.message);
      return res.status(500).json({ success: false, error: "Failed to add edge: " + err.message });
    }
  }

  /**
   * DELETE /api/v1/topology/edge/:id — Delete a connection edge
   */
  public async deleteEdge(req: Request, res: Response) {
    try {
      await topologyService.deleteEdge(parseInt(req.params.id));
      await logActivity("Network Topology", "Delete Edge", `Deleted edge #${req.params.id}`, "SUCCESS");
      return res.status(200).json({ success: true, message: "Edge deleted." });
    } catch (err: any) {
      console.error("[Topology] deleteEdge error:", err.message);
      return res.status(500).json({ success: false, error: "Failed to delete edge." });
    }
  }

  /**
   * POST /api/v1/topology/scan/snmp — Quick SNMP scan for a single IP or small range
   * Body: { ipRange, community?, version? }
   */
  public async scanSnmp(req: Request, res: Response) {
    try {
      const { ipRange, community, version } = req.body;
      if (!ipRange) {
        return res.status(400).json({ success: false, error: "ipRange is required." });
      }
      const nodes = await topologyService.scanNetwork(
        ipRange,
        community || "public",
        version || "2c"
      );
      return res.status(200).json({ success: true, data: nodes });
    } catch (err: any) {
      console.error("[Topology] scanSnmp error:", err.message);
      return res.status(500).json({ success: false, error: "SNMP scan failed: " + err.message });
    }
  }

  /**
   * GET /api/v1/topology/device/:id/ping — Ping a device
   */
  public async pingDevice(req: Request, res: Response) {
    try {
      const { execSync } = require("child_process");
      const deviceId = req.params.id;
      const result = await (await import("../config/db")).query("SELECT ip_address FROM topology_devices WHERE id = $1", [deviceId]);
      if (result.rows.length === 0) {
        return res.status(404).json({ success: false, error: "Device not found." });
      }
      const ip = result.rows[0].ip_address;
      const output = execSync(`ping -n 4 ${ip}`, { timeout: 10000, encoding: "utf-8" });
      return res.status(200).json({ success: true, output });
    } catch (err: any) {
      return res.status(200).json({ success: true, output: err.stdout || err.message });
    }
  }

  /**
   * GET /api/v1/topology/device/:id/snmp-walk — SNMP walk a device
   */
  public async snmpWalkDevice(req: Request, res: Response) {
    try {
      const { execSync } = require("child_process");
      const deviceId = req.params.id;
      const result = await (await import("../config/db")).query(
        "SELECT ip_address, labels FROM topology_devices WHERE id = $1", [deviceId]
      );
      if (result.rows.length === 0) {
        return res.status(404).json({ success: false, error: "Device not found." });
      }
      const ip = result.rows[0].ip_address;
      const labels = result.rows[0].labels || {};
      const community = labels.snmp_community || "public";
      const version = labels.snmp_version || "2c";
      const verFlag = version === "1" ? "-v1" : "-v2c";
      const output = execSync(`snmpwalk ${verFlag} -c ${community} ${ip} .1`, { timeout: 15000, encoding: "utf-8" });
      return res.status(200).json({ success: true, output });
    } catch (err: any) {
      return res.status(200).json({ success: true, output: err.stdout || err.message });
    }
  }
}

export const topologyController = new TopologyController();
