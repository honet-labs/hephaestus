import { query } from "../config/db";
import { TopologyNode, TopologyEdge } from "../types";
import logger from "../config/logger";

// ==================== TOPOLOGY DATABASE SERVICE ====================

export class TopologyDbService {
  // ==================== NODE OPERATIONS ====================

  async loadTopologyFromDb(sheetId?: number): Promise<TopologyNode[]> {
    let sql = `SELECT id, name, ip_address AS ip, device_type, status, sources, labels, interfaces, x, y
       FROM topology_devices`;
    const params: any[] = [];
    if (sheetId) {
      sql += ` WHERE (sheet_id = $1 OR sheet_id IS NULL)`;
      params.push(sheetId);
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
      x: row.x,
      y: row.y
    }));
  }

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

  async addManualDevice(device: {
    name: string;
    ip: string;
    deviceType?: string;
    x?: number;
    y?: number;
    sheetId?: number;
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
      `INSERT INTO topology_devices (id, name, ip_address, device_type, status, sources, labels, x, y, sheet_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [node.id, node.name, node.ip, node.deviceType, node.status, node.sources, JSON.stringify(node.labels), node.x, node.y, device.sheetId || null]
    );

    return node;
  }

  async deleteDevice(deviceId: string): Promise<void> {
    await query(`DELETE FROM topology_devices WHERE id = $1`, [deviceId]);
  }

  async updateDevicePosition(deviceId: string, x: number, y: number): Promise<void> {
    await query(
      `UPDATE topology_devices SET x = $1, y = $2 WHERE id = $3`,
      [x, y, deviceId]
    );
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
      await query(`UPDATE topology_edges SET sheet_id = $1 WHERE sheet_id IS NULL`, [sheetId]).catch(() => {});
    }
    sql += ` ORDER BY id ASC`;
    const res = await query(sql, params);
    return res.rows;
  }

  // ==================== PENDING NODES ====================

  async getPendingNodes(userId: number): Promise<any[]> {
    const res = await query(
      `SELECT id, device_data, created_at FROM topology_pending WHERE user_id = $1 ORDER BY created_at ASC`,
      [userId]
    );
    return res.rows.map((row: any) => ({ ...row.device_data, _pendingId: row.id }));
  }

  async savePendingNodes(userId: number, devices: any[]): Promise<void> {
    // Batch insert for better performance
    if (devices.length === 0) return;
    const values: any[] = [];
    const placeholders: string[] = [];
    devices.forEach((d, i) => {
      placeholders.push(`($${i * 2 + 1}, $${i * 2 + 2})`);
      values.push(userId, JSON.stringify(d));
    });
    await query(
      `INSERT INTO topology_pending (user_id, device_data) VALUES ${placeholders.join(", ")}`,
      values
    );
  }

  async deletePendingNode(userId: number, pendingId: number): Promise<void> {
    await query(`DELETE FROM topology_pending WHERE id = $1 AND user_id = $2`, [pendingId, userId]);
  }

  async clearPendingNodes(userId: number): Promise<void> {
    await query(`DELETE FROM topology_pending WHERE user_id = $1`, [userId]);
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
}

export const topologyDbService = new TopologyDbService();
