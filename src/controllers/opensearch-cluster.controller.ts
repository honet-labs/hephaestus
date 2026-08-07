import { Request, Response } from "express";
import { opensearchClusterService } from "../services/opensearch-cluster.service";
import { logActivity } from "../config/db";

export class OpenSearchClusterController {
  // ==================== CONFIG MANAGEMENT ====================

  public async getConfigs(req: Request, res: Response) {
    try {
      const configs = await opensearchClusterService.getConfigs();
      return res.status(200).json({ success: true, data: configs });
    } catch (err: any) {
      console.error("[OpenSearch] getConfigs error:", err.message);
      return res.status(500).json({ success: false, error: "Failed to load configs." });
    }
  }

  public async createConfig(req: Request, res: Response) {
    try {
      const { name, host, port, username, password, use_ssl, verify_ssl } = req.body;
      if (!name || !host || !port || !username) {
        return res.status(400).json({ success: false, error: "name, host, port, and username are required." });
      }
      const id = `os-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const config = await opensearchClusterService.createConfig({
        id, name, host, port: parseInt(port), username, password: password || "",
        use_ssl: !!use_ssl, verify_ssl: verify_ssl !== false
      });
      await logActivity("OpenSearch Cluster", "Create Config", `Created config "${name}" (${host}:${port})`, "SUCCESS");
      return res.status(201).json({ success: true, data: config });
    } catch (err: any) {
      console.error("[OpenSearch] createConfig error:", err.message);
      return res.status(500).json({ success: false, error: "Failed to create config: " + err.message });
    }
  }

  public async updateConfig(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const updates = req.body;
      const config = await opensearchClusterService.updateConfig(id, updates);
      if (!config) return res.status(404).json({ success: false, error: "Config not found." });
      await logActivity("OpenSearch Cluster", "Update Config", `Updated config "${config.name}"`, "SUCCESS");
      return res.status(200).json({ success: true, data: config });
    } catch (err: any) {
      console.error("[OpenSearch] updateConfig error:", err.message);
      return res.status(500).json({ success: false, error: "Failed to update config: " + err.message });
    }
  }

  public async deleteConfig(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const deleted = await opensearchClusterService.deleteConfig(id);
      if (!deleted) return res.status(404).json({ success: false, error: "Config not found." });
      await logActivity("OpenSearch Cluster", "Delete Config", `Deleted config "${id}"`, "SUCCESS");
      return res.status(200).json({ success: true });
    } catch (err: any) {
      console.error("[OpenSearch] deleteConfig error:", err.message);
      return res.status(500).json({ success: false, error: "Failed to delete config." });
    }
  }

  public async setActiveConfig(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const success = await opensearchClusterService.setActiveConfig(id);
      if (!success) return res.status(404).json({ success: false, error: "Config not found." });
      await logActivity("OpenSearch Cluster", "Set Active", `Set active config "${id}"`, "SUCCESS");
      return res.status(200).json({ success: true });
    } catch (err: any) {
      console.error("[OpenSearch] setActiveConfig error:", err.message);
      return res.status(500).json({ success: false, error: "Failed to set active config." });
    }
  }

  public async testConnection(req: Request, res: Response) {
    try {
      const { id } = req.body;
      const result = await opensearchClusterService.testConnection(id);
      return res.status(result.success ? 200 : 400).json(result);
    } catch (err: any) {
      console.error("[OpenSearch] testConnection error:", err.message);
      return res.status(500).json({ success: false, message: "Test failed: " + err.message });
    }
  }

  // ==================== CLUSTER DATA ====================

  public async getClusterHealth(req: Request, res: Response) {
    try {
      const { configId } = req.query;
      const health = await opensearchClusterService.getClusterHealth(configId as string);
      return res.status(200).json({ success: true, data: health });
    } catch (err: any) {
      console.error("[OpenSearch] getClusterHealth error:", err.message);
      return res.status(500).json({ success: false, error: "Failed to get cluster health: " + err.message });
    }
  }

  public async getClusterStats(req: Request, res: Response) {
    try {
      const { configId } = req.query;
      const stats = await opensearchClusterService.getClusterStats(configId as string);
      return res.status(200).json({ success: true, data: stats });
    } catch (err: any) {
      console.error("[OpenSearch] getClusterStats error:", err.message);
      return res.status(500).json({ success: false, error: "Failed to get cluster stats: " + err.message });
    }
  }

  public async getNodes(req: Request, res: Response) {
    try {
      const { configId } = req.query;
      const nodes = await opensearchClusterService.getNodes(configId as string);
      return res.status(200).json({ success: true, data: nodes });
    } catch (err: any) {
      console.error("[OpenSearch] getNodes error:", err.message);
      return res.status(500).json({ success: false, error: "Failed to get nodes: " + err.message });
    }
  }

  public async getNodeStats(req: Request, res: Response) {
    try {
      const { nodeName } = req.params;
      const { configId } = req.query;
      const stats = await opensearchClusterService.getNodeStats(nodeName, configId as string);
      return res.status(200).json({ success: true, data: stats });
    } catch (err: any) {
      console.error("[OpenSearch] getNodeStats error:", err.message);
      return res.status(500).json({ success: false, error: "Failed to get node stats: " + err.message });
    }
  }

  public async getIndices(req: Request, res: Response) {
    try {
      const { configId } = req.query;
      const indices = await opensearchClusterService.getIndices(configId as string);
      return res.status(200).json({ success: true, data: indices });
    } catch (err: any) {
      console.error("[OpenSearch] getIndices error:", err.message);
      return res.status(500).json({ success: false, error: "Failed to get indices: " + err.message });
    }
  }

  public async getIndexHealth(req: Request, res: Response) {
    try {
      const { indexName } = req.params;
      const { configId } = req.query;
      const health = await opensearchClusterService.getIndexHealth(indexName, configId as string);
      return res.status(200).json({ success: true, data: health });
    } catch (err: any) {
      console.error("[OpenSearch] getIndexHealth error:", err.message);
      return res.status(500).json({ success: false, error: "Failed to get index health: " + err.message });
    }
  }

  public async getShards(req: Request, res: Response) {
    try {
      const { configId } = req.query;
      const shards = await opensearchClusterService.getShards(configId as string);
      return res.status(200).json({ success: true, data: shards });
    } catch (err: any) {
      console.error("[OpenSearch] getShards error:", err.message);
      return res.status(500).json({ success: false, error: "Failed to get shards: " + err.message });
    }
  }

  public async getShardsByIndex(req: Request, res: Response) {
    try {
      const { indexName } = req.params;
      const { configId } = req.query;
      const shards = await opensearchClusterService.getShardsByIndex(indexName, configId as string);
      return res.status(200).json({ success: true, data: shards });
    } catch (err: any) {
      console.error("[OpenSearch] getShardsByIndex error:", err.message);
      return res.status(500).json({ success: false, error: "Failed to get index shards: " + err.message });
    }
  }

  public async getPlugins(req: Request, res: Response) {
    try {
      const { configId } = req.query;
      const plugins = await opensearchClusterService.getPlugins(configId as string);
      return res.status(200).json({ success: true, data: plugins });
    } catch (err: any) {
      console.error("[OpenSearch] getPlugins error:", err.message);
      return res.status(500).json({ success: false, error: "Failed to get plugins: " + err.message });
    }
  }

  public async getIndicesStats(req: Request, res: Response) {
    try {
      const { configId } = req.query;
      const stats = await opensearchClusterService.getIndicesStats(configId as string);
      return res.status(200).json({ success: true, data: stats });
    } catch (err: any) {
      console.error("[OpenSearch] getIndicesStats error:", err.message);
      return res.status(500).json({ success: false, error: "Failed to get indices stats: " + err.message });
    }
  }
}

export const opensearchClusterController = new OpenSearchClusterController();
