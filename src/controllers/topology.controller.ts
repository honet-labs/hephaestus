import { Request, Response } from "express";
import { topologyService } from "../services/topology.service";
import { logActivity } from "../config/db";
import logger from "../config/logger";

export class TopologyController {
  /**
   * GET /api/v1/topology/graph — Load full topology from DB
   */
  public async getGraph(req: Request, res: Response) {
    try {
      const sheetId = req.query.sheetId ? parseInt(req.query.sheetId as string) : undefined;
      const nodes = await topologyService.loadTopologyFromDb(sheetId);
      const edges = await topologyService.loadEdges(sheetId);
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
      logger.error("Topology", "getGraph error:", err.message);
      return res.status(500).json({ success: false, error: "Failed to load topology graph." });
    }
  }

  /**
   * POST /api/v1/topology/scan — Run scan and return candidates (NOT saved to DB)
   * Body: { prometheusUrl?, ipRange?, snmpCommunity?, snmpVersion? }
   */
  public async scanCandidates(req: Request, res: Response) {
    try {
      const { prometheusUrl, ipRange, snmpCommunity, snmpVersion, useNmap } = req.body || {};
      const nodes = await topologyService.scanOnly({
        prometheusUrl,
        ipRange,
        snmpCommunity: snmpCommunity || "public",
        snmpVersion: snmpVersion || "2c",
        useNmap: !!useNmap
      });
      await logActivity("Network Topology", "Scan", `Scanned: ${nodes.length} candidates found`, "SUCCESS");
      return res.status(200).json({ success: true, data: { nodes, edges: [], meta: { totalNodes: nodes.length, totalEdges: 0 } } });
    } catch (err: any) {
      logger.error("Topology", "scanCandidates error:", err.message);
      return res.status(500).json({ success: false, error: "Scan failed: " + err.message });
    }
  }

  /**
   * POST /api/v1/topology/device/save — Save a single device to DB (from sidebar)
   * Body: TopologyNode
   */
  public async saveDevice(req: Request, res: Response) {
    try {
      const node = req.body;
      if (!node || !node.ip) {
        return res.status(400).json({ success: false, error: "ip is required." });
      }
      const sheetId = node.sheetId ? parseInt(node.sheetId) : undefined;
      logger.topology(`saveDevice: ${node.name} ${node.ip} sources: ${node.sources} sheet: ${sheetId}`);
      await topologyService.saveDeviceToDb(node, sheetId);
      await logActivity("Network Topology", "Save Device", `Saved device "${node.name}" (${node.ip}) to database`, "SUCCESS");
      return res.status(200).json({ success: true, data: node });
    } catch (err: any) {
      logger.error("Topology", "saveDevice error:", err.message);
      return res.status(500).json({ success: false, error: "Failed to save device: " + err.message });
    }
  }

  /**
   * POST /api/v1/topology/device/save-all — Save multiple devices to DB
   * Body: { nodes: TopologyNode[], sheetId?: number }
   */
  public async saveAllDevices(req: Request, res: Response) {
    try {
      const { nodes, sheetId } = req.body;
      if (!nodes || !Array.isArray(nodes)) {
        return res.status(400).json({ success: false, error: "nodes array is required." });
      }
      const sid = sheetId ? parseInt(sheetId) : undefined;
      for (const node of nodes) {
        await topologyService.saveDeviceToDb(node, sid);
      }
      await logActivity("Network Topology", "Save All", `Saved ${nodes.length} devices to database`, "SUCCESS");
      return res.status(200).json({ success: true, data: { saved: nodes.length } });
    } catch (err: any) {
      logger.error("Topology", "saveAllDevices error:", err.message);
      return res.status(500).json({ success: false, error: "Failed to save devices: " + err.message });
    }
  }

  /**
   * POST /api/v1/topology/device — Add a manual device
   * Body: { name, ip, deviceType?, tags?, x?, y? }
   */
  public async addDevice(req: Request, res: Response) {
    try {
      const { name, ip, deviceType, tags, x, y, sheetId } = req.body;
      if (!name || !ip) {
        return res.status(400).json({ success: false, error: "name and ip are required." });
      }
      const ipRegex = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;
      if (!ipRegex.test(ip)) {
        return res.status(400).json({ success: false, error: "Invalid IP address format." });
      }
      const node = await topologyService.addManualDevice({ name, ip, deviceType, tags, x, y, sheetId: sheetId ? parseInt(sheetId) : undefined });
      await logActivity("Network Topology", "Add Device", `Added manual device "${name}" (${ip})`, "SUCCESS");
      return res.status(200).json({ success: true, data: node });
    } catch (err: any) {
      logger.error("Topology", "addDevice error:", err.message);
      return res.status(500).json({ success: false, error: "Failed to add device." });
    }
  }

  /**
   * PUT /api/v1/topology/device/:id — Update a device
   * Body: { name?, ip?, deviceType?, tags? }
   */
  public async updateDevice(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { name, ip, deviceType, tags } = req.body;
      if (!name && !ip && !deviceType && tags === undefined) {
        return res.status(400).json({ success: false, error: "At least one field (name, ip, deviceType, tags) is required." });
      }
      if (ip) {
        const ipRegex = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;
        if (!ipRegex.test(ip)) {
          return res.status(400).json({ success: false, error: "Invalid IP address format." });
        }
      }
      await topologyService.updateDevice(id, { name, ip, deviceType, tags });
      await logActivity("Network Topology", "Update Device", `Updated device "${id}"`, "SUCCESS");
      return res.status(200).json({ success: true, message: "Device updated." });
    } catch (err: any) {
      logger.error("Topology", "updateDevice error:", err.message);
      return res.status(500).json({ success: false, error: "Failed to update device." });
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
      logger.error("Topology", "deleteDevice error:", err.message);
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
      logger.error("Topology", "updatePosition error:", err.message);
      return res.status(500).json({ success: false, error: "Failed to update position." });
    }
  }

  /**
   * POST /api/v1/topology/edge — Add a connection edge
   * Body: { source, target, label?, edgeType? }
   */
  public async addEdge(req: Request, res: Response) {
    try {
      const { source, target, label, edgeType, sourceLabel, targetLabel, sheetId } = req.body;
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
      const edge = await topologyService.addEdge(source, target, label, edgeType, sourceLabel, targetLabel, sheetId ? parseInt(sheetId) : undefined);
      await logActivity("Network Topology", "Add Edge", `Added connection "${source}" -> "${target}"`, "SUCCESS");
      return res.status(200).json({ success: true, data: edge });
    } catch (err: any) {
      logger.error("Topology", "addEdge error:", err.message);
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
      logger.error("Topology", "deleteEdge error:", err.message);
      return res.status(500).json({ success: false, error: "Failed to delete edge." });
    }
  }

  public async updateEdge(req: Request, res: Response) {
    try {
      const { label, sourceLabel, targetLabel } = req.body;
      await topologyService.updateEdge(parseInt(req.params.id), label, sourceLabel, targetLabel);
      return res.status(200).json({ success: true, message: "Edge updated." });
    } catch (err: any) {
      logger.error("Topology", "updateEdge error:", err.message);
      return res.status(500).json({ success: false, error: "Failed to update edge." });
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
      logger.error("Topology", "scanSnmp error:", err.message);
      return res.status(500).json({ success: false, error: "SNMP scan failed: " + err.message });
    }
  }

  /**
   * GET /api/v1/topology/device/:id/ping — Ping a device
   */
  public async pingDevice(req: Request, res: Response) {
    try {
      const deviceId = req.params.id;
      const result = await (await import("../config/db")).query("SELECT ip_address FROM topology_devices WHERE id = $1", [deviceId]);
      if (result.rows.length === 0) {
        return res.status(404).json({ success: false, error: "Device not found." });
      }
      const ip = result.rows[0].ip_address;
      // Validate IP address to prevent command injection
      const ipRegex = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;
      if (!ipRegex.test(ip)) {
        return res.status(400).json({ success: false, error: "Invalid IP address format." });
      }
      const { execFile } = require("child_process");
      const { promisify } = require("util");
      const execFileAsync = promisify(execFile);
      const { stdout } = await execFileAsync("ping", ["-c", "4", "-W", "3", ip], { timeout: 15000 });
      return res.status(200).json({ success: true, output: stdout });
    } catch (err: any) {
      return res.status(200).json({ success: true, output: err.stdout || err.message });
    }
  }

  /**
   * GET /api/v1/topology/device/:id/snmp-walk — SNMP walk a device
   */
  public async snmpWalkDevice(req: Request, res: Response) {
    try {
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
      // Validate IP and community to prevent command injection
      const ipRegex = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;
      if (!ipRegex.test(ip)) {
        return res.status(400).json({ success: false, error: "Invalid IP address." });
      }
      const safeCommunity = community.replace(/[^a-zA-Z0-9_-]/g, '');
      const verFlag = version === "1" ? "-v1" : "-v2c";
      const { execFile } = require("child_process");
      const { promisify } = require("util");
      const execFileAsync = promisify(execFile);
      const { stdout } = await execFileAsync("snmpwalk", [verFlag, "-c", safeCommunity, ip, ".1"], { timeout: 15000 });
      return res.status(200).json({ success: true, output: stdout });
    } catch (err: any) {
      return res.status(200).json({ success: true, output: err.stdout || err.message });
    }
  }

  // ==================== PENDING NODES ====================

  public async getPendingNodes(req: Request, res: Response) {
    try {
      const userId = (req as any).user?.id;
      if (!userId) return res.status(401).json({ success: false, error: "Unauthorized." });
      const nodes = await topologyService.getPendingNodes(userId);
      return res.status(200).json({ success: true, data: nodes });
    } catch (err: any) {
      logger.error("Topology", "getPendingNodes error:", err.message);
      return res.status(500).json({ success: false, error: "Failed to load pending nodes." });
    }
  }

  public async savePendingNodes(req: Request, res: Response) {
    try {
      const userId = (req as any).user?.id;
      if (!userId) return res.status(401).json({ success: false, error: "Unauthorized." });
      const { nodes } = req.body;
      if (!nodes || !Array.isArray(nodes)) {
        return res.status(400).json({ success: false, error: "nodes array is required." });
      }
      await topologyService.savePendingNodes(userId, nodes);
      return res.status(200).json({ success: true, data: { saved: nodes.length } });
    } catch (err: any) {
      logger.error("Topology", "savePendingNodes error:", err.message);
      return res.status(500).json({ success: false, error: "Failed to save pending nodes." });
    }
  }

  public async clearPendingNodes(req: Request, res: Response) {
    try {
      const userId = (req as any).user?.id;
      if (!userId) return res.status(401).json({ success: false, error: "Unauthorized." });
      const { ids } = req.body;
      if (ids && Array.isArray(ids) && ids.length > 0) {
        for (const id of ids) {
          await topologyService.deletePendingNode(userId, id);
        }
      } else {
        await topologyService.clearPendingNodes(userId);
      }
      return res.status(200).json({ success: true });
    } catch (err: any) {
      logger.error("Topology", "clearPendingNodes error:", err.message);
      return res.status(500).json({ success: false, error: "Failed to clear pending nodes." });
    }
  }

  // ==================== SHEET OPERATIONS ====================

  public async getSheets(req: Request, res: Response) {
    try {
      const sheets = await topologyService.getSheets();
      return res.status(200).json({ success: true, data: sheets });
    } catch (err: any) {
      logger.error("Topology", "getSheets error:", err.message);
      return res.status(500).json({ success: false, error: "Failed to load sheets." });
    }
  }

  public async createSheet(req: Request, res: Response) {
    try {
      const { name } = req.body;
      if (!name || !name.trim()) {
        return res.status(400).json({ success: false, error: "Sheet name is required." });
      }
      const sheet = await topologyService.createSheet(name.trim());
      return res.status(201).json({ success: true, data: sheet });
    } catch (err: any) {
      logger.error("Topology", "createSheet error:", err.message);
      return res.status(500).json({ success: false, error: "Failed to create sheet." });
    }
  }

  public async updateSheet(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { name } = req.body;
      if (!name || !name.trim()) {
        return res.status(400).json({ success: false, error: "Sheet name is required." });
      }
      const sheet = await topologyService.updateSheet(parseInt(id), name.trim());
      if (!sheet) return res.status(404).json({ success: false, error: "Sheet not found." });
      return res.status(200).json({ success: true, data: sheet });
    } catch (err: any) {
      logger.error("Topology", "updateSheet error:", err.message);
      return res.status(500).json({ success: false, error: "Failed to update sheet." });
    }
  }

  public async deleteSheet(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const deleted = await topologyService.deleteSheet(parseInt(id));
      if (!deleted) return res.status(404).json({ success: false, error: "Sheet not found." });
      return res.status(200).json({ success: true });
    } catch (err: any) {
      logger.error("Topology", "deleteSheet error:", err.message);
      return res.status(500).json({ success: false, error: "Failed to delete sheet." });
    }
  }

  public async reorderSheet(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { sort_order } = req.body;
      if (sort_order === undefined) {
        return res.status(400).json({ success: false, error: "sort_order is required." });
      }
      await topologyService.reorderSheet(parseInt(id), sort_order);
      return res.status(200).json({ success: true });
    } catch (err: any) {
      logger.error("Topology", "reorderSheet error:", err.message);
      return res.status(500).json({ success: false, error: "Failed to reorder sheet." });
    }
  }
}

export const topologyController = new TopologyController();
