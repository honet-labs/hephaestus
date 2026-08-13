import axios from "axios";
import { query } from "../config/db";
import logger from "../config/logger";

// ==================== TYPES ====================

export interface OpenSearchConnection {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  password: string;
  is_active: boolean;
  use_ssl?: boolean;
  verify_ssl?: boolean;
}

export interface ClusterHealth {
  cluster_name: string;
  status: string; // green, yellow, red
  timed_out: boolean;
  number_of_nodes: number;
  number_of_data_nodes: number;
  discovered_cluster_manager: boolean;
  active_primary_shards: number;
  active_shards: number;
  relocating_shards: number;
  initializing_shards: number;
  unassigned_shards: number;
  delayed_unassigned_shards: number;
  number_of_pending_tasks: number;
  number_of_in_flight_fetch: number;
  task_max_waiting_in_queue_millis: number;
  active_shards_percent_as_number: number;
}

export interface OpenSearchNode {
  name: string;
  ip: string;
  role: string;
  roles: string[];
  heap_percent: number;
  ram_percent: number;
  cpu: number;
  load_1m: number;
  load_5m: number;
  load_15m: number;
  disk_used_percent: number;
  disk_total: number;
  disk_free: number;
  jvm_heap_used: number;
  jvm_heap_max: number;
  jvm_mem_not_heap_used: number;
  fs_total: number;
  fs_free: number;
  open_file_descriptors: number;
  max_file_descriptors: number;
  uptime: number;
  node_version: string;
}

export interface OpenSearchIndex {
  health: string;
  status: string; // open, close
  index: string;
  uuid: string;
  pri: number;
  rep: number;
  docs_count: number;
  docs_deleted: number;
  store_size: string;
  pri_store_size: string;
}

export interface OpenSearchShard {
  index: string;
  shard: number;
  prirep: string; // p or r
  state: string; // STARTED, RELOCATING, INITIALIZING, UNASSIGNED
  docs: number;
  store: string;
  ip: string;
  node: string;
}

export interface NodeStats {
  nodes: Record<string, {
    name: string;
    host: string;
    ip: string;
    roles: string[];
    indices: {
      docs: { count: number; deleted: number };
      store: { size_in_bytes: number };
    };
    os: {
      cpu: { percent: number; load_average: { "1m": number; "5m": number; "15m": number } };
      mem: { used_percent: number; used_in_bytes: number; total_in_bytes: number };
    };
    jvm: {
      mem: { heap_used_in_bytes: number; heap_max_in_bytes: number; non_heap_used_in_bytes: number };
      uptime_in_millis: number;
    };
    fs: {
      total: { total_in_bytes: number; free_in_bytes: number; available_in_bytes: number };
    };
    process: {
      open_file_descriptors: number;
      max_file_descriptors: number;
      cpu: { percent: number };
    };
  }>;
}

// ==================== SERVICE ====================

export class OpenSearchClusterService {
  private activeConfig: OpenSearchConnection | null = null;

  async getActiveConfig(): Promise<OpenSearchConnection | null> {
    if (this.activeConfig) return this.activeConfig;
    const res = await query(
      `SELECT * FROM opensearch_configs WHERE is_active = true LIMIT 1`
    );
    if (res.rows.length > 0) {
      this.activeConfig = res.rows[0];
      return this.activeConfig;
    }
    return null;
  }

  async getConfigs(): Promise<OpenSearchConnection[]> {
    const res = await query(`SELECT * FROM opensearch_configs ORDER BY created_at DESC`);
    return res.rows;
  }

  async getConfigById(id: string): Promise<OpenSearchConnection | null> {
    const res = await query(`SELECT * FROM opensearch_configs WHERE id = $1`, [id]);
    return res.rows[0] || null;
  }

  async createConfig(config: Omit<OpenSearchConnection, "is_active">): Promise<OpenSearchConnection> {
    const res = await query(
      `INSERT INTO opensearch_configs (id, name, host, port, username, password, use_ssl, verify_ssl)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [config.id, config.name, config.host, config.port, config.username, config.password, config.use_ssl || false, config.verify_ssl !== false]
    );
    return res.rows[0];
  }

  async updateConfig(id: string, updates: Partial<OpenSearchConnection>): Promise<OpenSearchConnection | null> {
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (updates.name !== undefined) { fields.push(`name = $${idx++}`); values.push(updates.name); }
    if (updates.host !== undefined) { fields.push(`host = $${idx++}`); values.push(updates.host); }
    if (updates.port !== undefined) { fields.push(`port = $${idx++}`); values.push(updates.port); }
    if (updates.username !== undefined) { fields.push(`username = $${idx++}`); values.push(updates.username); }
    if (updates.password !== undefined) { fields.push(`password = $${idx++}`); values.push(updates.password); }
    if (updates.use_ssl !== undefined) { fields.push(`use_ssl = $${idx++}`); values.push(updates.use_ssl); }
    if (updates.verify_ssl !== undefined) { fields.push(`verify_ssl = $${idx++}`); values.push(updates.verify_ssl); }
    if (updates.is_active !== undefined) {
      fields.push(`is_active = $${idx++}`); values.push(updates.is_active);
      if (updates.is_active) {
        await query(`UPDATE opensearch_configs SET is_active = false`);
      }
    }

    if (fields.length === 0) return this.getConfigById(id);
    values.push(id);
    const res = await query(`UPDATE opensearch_configs SET ${fields.join(", ")} WHERE id = $${idx} RETURNING *`, values);
    if (updates.is_active) this.activeConfig = res.rows[0] || null;
    return res.rows[0] || null;
  }

  async deleteConfig(id: string): Promise<boolean> {
    const res = await query(`DELETE FROM opensearch_configs WHERE id = $1`, [id]);
    if ((res.rowCount ?? 0) > 0) {
      if (this.activeConfig?.id === id) this.activeConfig = null;
      return true;
    }
    return false;
  }

  async setActiveConfig(id: string): Promise<boolean> {
    await query(`UPDATE opensearch_configs SET is_active = false`);
    const res = await query(`UPDATE opensearch_configs SET is_active = true WHERE id = $1 RETURNING *`, [id]);
    if (res.rows.length > 0) {
      this.activeConfig = res.rows[0];
      return true;
    }
    return false;
  }

  private getBaseUrl(config: OpenSearchConnection): string {
    const protocol = config.use_ssl ? "https" : "http";
    return `${protocol}://${config.host}:${config.port}`;
  }

  private getAuth(config: OpenSearchConnection): { username: string; password: string } {
    return { username: config.username, password: config.password };
  }

  private getAxiosConfig(config: OpenSearchConnection): any {
    const axiosConfig: any = {
      timeout: 15000,
      headers: {} as Record<string, string>
    };

    // Add Basic Auth header like Cerebro does (explicit Authorization header)
    if (config.username) {
      const credentials = Buffer.from(`${config.username}:${config.password || ""}`).toString("base64");
      axiosConfig.headers["Authorization"] = `Basic ${credentials}`;
      logger.opensearch(`Using Basic Auth for user: ${config.username}`);
    }

    // Add SSL handling - default to false for self-signed certs
    if (config.use_ssl) {
      const https = require("https");
      // Only verify SSL if explicitly set to true (most OpenSearch use self-signed certs)
      const shouldVerify = config.verify_ssl === true;
      axiosConfig.httpsAgent = new https.Agent({
        rejectUnauthorized: shouldVerify,
        secureProtocol: "TLSv1_2_method"
      });
      logger.opensearch(`SSL enabled, verify: ${shouldVerify}`);
    }

    return axiosConfig;
  }

  async testConnection(configId?: string, configData?: Partial<OpenSearchConnection>): Promise<{ success: boolean; message: string; data?: any }> {
    try {
      let config: OpenSearchConnection | null = null;

      if (configId) {
        config = await this.getConfigById(configId);
      } else if (configData) {
        config = {
          id: "test",
          name: configData.name || "Test",
          host: configData.host || "",
          port: configData.port || 9200,
          username: configData.username || "",
          password: configData.password || "",
          is_active: false,
          use_ssl: configData.use_ssl,
          verify_ssl: false
        };
      } else {
        config = await this.getActiveConfig();
      }

      if (!config) return { success: false, message: "No OpenSearch configuration found." };
      if (!config.host) return { success: false, message: "Host is required." };

      const baseUrl = this.getBaseUrl(config);
      const url = `${baseUrl}/_cluster/health`;

      logger.opensearch(`========== TEST CONNECTION ==========`);
      logger.opensearch(`URL: ${url}`);
      logger.opensearch(`Host: ${config.host}, Port: ${config.port}, SSL: ${config.use_ssl}`);
      logger.opensearch(`Username: ${config.username || "(empty)"}`);
      logger.opensearch(`Password: ${config.password ? "***" : "(empty)"}`);

      const axiosConfig = this.getAxiosConfig(config);
      logger.opensearch(`Headers: ${JSON.stringify(axiosConfig.headers)}`);

      const response = await axios.get(url, axiosConfig);
      logger.opensearch(`SUCCESS: ${response.data?.status}`);
      return { success: true, message: `Connection successful. Cluster: ${response.data?.cluster_name}, Status: ${response.data?.status}`, data: response.data };
    } catch (err: any) {
      const status = err.response?.status;
      const statusText = err.response?.statusText;
      const osError = err.response?.data?.error?.reason || err.response?.data?.error;
      const msg = osError || err.message || "Connection failed";
      const detail = status ? ` (HTTP ${status}: ${statusText})` : "";

      logger.opensearchError(`========== FAILED ==========`);
      logger.opensearchError(`Error: ${msg}${detail}`);
      logger.opensearchError(`Response: ${JSON.stringify(err.response?.data)}`);
      logger.opensearchError(`Request URL: ${err.config?.url}`);
      logger.opensearchError(`Request Headers: ${JSON.stringify(err.config?.headers)}`);

      return { success: false, message: `Connection failed: ${msg}${detail}` };
    }
  }

  async getClusterHealth(configId?: string): Promise<ClusterHealth> {
    const config = configId ? await this.getConfigById(configId) : await this.getActiveConfig();
    if (!config) throw new Error("No active OpenSearch configuration found.");

    const url = `${this.getBaseUrl(config)}/_cluster/health`;
    try {
      const response = await axios.get<ClusterHealth>(url, this.getAxiosConfig(config));
      return response.data;
    } catch (err: any) {
      const status = err.response?.status;
      const msg = err.response?.data?.error?.reason || err.message;
      throw new Error(`Failed to get cluster health: ${msg}${status ? ` (HTTP ${status})` : ""}`);
    }
  }

  async getClusterStats(configId?: string): Promise<any> {
    const config = configId ? await this.getConfigById(configId) : await this.getActiveConfig();
    if (!config) throw new Error("No active OpenSearch configuration found.");

    const url = `${this.getBaseUrl(config)}/_cluster/stats`;
    const response = await axios.get(url, this.getAxiosConfig(config));
    return response.data;
  }

  async getNodes(configId?: string): Promise<OpenSearchNode[]> {
    const config = configId ? await this.getConfigById(configId) : await this.getActiveConfig();
    if (!config) throw new Error("No active OpenSearch configuration found.");

    const baseUrl = this.getBaseUrl(config);
    const axiosConfig = this.getAxiosConfig(config);

    const [nodesInfoRes, nodesStatsRes] = await Promise.all([
      axios.get(`${baseUrl}/_cat/nodes?format=json&h=name,ip,role,roles,heap.percent,ram.percent,cpu,load_1m,load_5m,load_15m,disk.used_percent,disk.total,disk.free,node.version`, axiosConfig),
      axios.get(`${baseUrl}/_nodes/stats/os,jvm,fs,process,indices`, axiosConfig)
    ]);

    const nodesInfo = nodesInfoRes.data;
    const nodesStats: NodeStats = nodesStatsRes.data;

    return nodesInfo.map((node: any) => {
      const stats = Object.values(nodesStats.nodes).find((s: any) => s.name === node.name) as any;
      return {
        name: node.name,
        ip: node.ip,
        role: node.role,
        roles: (node.roles || node.role || "").split(",").map((r: string) => r.trim()),
        heap_percent: parseFloat(node["heap.percent"]) || 0,
        ram_percent: parseFloat(node["ram.percent"]) || 0,
        cpu: parseFloat(node.cpu) || 0,
        load_1m: parseFloat(node["load_1m"]) || 0,
        load_5m: parseFloat(node["load_5m"]) || 0,
        load_15m: parseFloat(node["load_15m"]) || 0,
        disk_used_percent: parseFloat(node["disk.used_percent"]) || 0,
        disk_total: this.parseBytes(node["disk.total"]),
        disk_free: this.parseBytes(node["disk.free"]),
        jvm_heap_used: stats?.jvm?.mem?.heap_used_in_bytes || 0,
        jvm_heap_max: stats?.jvm?.mem?.heap_max_in_bytes || 0,
        jvm_mem_not_heap_used: stats?.jvm?.mem?.non_heap_used_in_bytes || 0,
        fs_total: stats?.fs?.total?.total_in_bytes || 0,
        fs_free: stats?.fs?.total?.free_in_bytes || 0,
        open_file_descriptors: stats?.process?.open_file_descriptors || 0,
        max_file_descriptors: stats?.process?.max_file_descriptors || 0,
        uptime: stats?.jvm?.uptime_in_millis || 0,
        node_version: node["node.version"] || ""
      };
    });
  }

  async getNodeStats(nodeName: string, configId?: string): Promise<any> {
    const config = configId ? await this.getConfigById(configId) : await this.getActiveConfig();
    if (!config) throw new Error("No active OpenSearch configuration found.");

    const url = `${this.getBaseUrl(config)}/_nodes/${encodeURIComponent(nodeName)}/stats`;
    const response = await axios.get(url, this.getAxiosConfig(config));
    return response.data;
  }

  async getIndices(configId?: string): Promise<OpenSearchIndex[]> {
    const config = configId ? await this.getConfigById(configId) : await this.getActiveConfig();
    if (!config) throw new Error("No active OpenSearch configuration found.");

    const url = `${this.getBaseUrl(config)}/_cat/indices?format=json&h=health,status,index,uuid,pri,rep,docs.count,docs.deleted,store.size,pri.store.size&s=index`;
    const response = await axios.get(url, this.getAxiosConfig(config));
    // Map dotted field names to underscored names
    return (response.data || []).map((idx: any) => ({
      health: idx.health,
      status: idx.status,
      index: idx.index,
      uuid: idx.uuid,
      pri: parseInt(idx.pri) || 0,
      rep: parseInt(idx.rep) || 0,
      docs_count: parseInt(idx["docs.count"]) || 0,
      docs_deleted: parseInt(idx["docs.deleted"]) || 0,
      store_size: idx["store.size"] || "-",
      pri_store_size: idx["pri.store.size"] || "-"
    }));
  }

  async getIndexHealth(indexName: string, configId?: string): Promise<any> {
    const config = configId ? await this.getConfigById(configId) : await this.getActiveConfig();
    if (!config) throw new Error("No active OpenSearch configuration found.");

    const url = `${this.getBaseUrl(config)}/_cluster/health/${encodeURIComponent(indexName)}?level=indices`;
    const response = await axios.get(url, this.getAxiosConfig(config));
    return response.data;
  }

  async getShards(configId?: string): Promise<OpenSearchShard[]> {
    const config = configId ? await this.getConfigById(configId) : await this.getActiveConfig();
    if (!config) throw new Error("No active OpenSearch configuration found.");

    const url = `${this.getBaseUrl(config)}/_cat/shards?format=json&h=index,shard,prirep,state,docs,store,ip,node&s=index,shard,prirep`;
    const response = await axios.get<OpenSearchShard[]>(url, this.getAxiosConfig(config));
    return response.data;
  }

  async getShardsByIndex(indexName: string, configId?: string): Promise<OpenSearchShard[]> {
    const config = configId ? await this.getConfigById(configId) : await this.getActiveConfig();
    if (!config) throw new Error("No active OpenSearch configuration found.");

    const url = `${this.getBaseUrl(config)}/_cat/shards/${encodeURIComponent(indexName)}?format=json`;
    const response = await axios.get<OpenSearchShard[]>(url, this.getAxiosConfig(config));
    return response.data;
  }

  async getCatApis(configId?: string): Promise<Record<string, string>> {
    const config = configId ? await this.getConfigById(configId) : await this.getActiveConfig();
    if (!config) throw new Error("No active OpenSearch configuration found.");

    const url = `${this.getBaseUrl(config)}/_cat`;
    const response = await axios.get(url, { ...this.getAxiosConfig(config), headers: { ...this.getAxiosConfig(config).headers, Accept: "text/plain" } });
    return { raw: response.data };
  }

  async getPlugins(configId?: string): Promise<any[]> {
    const config = configId ? await this.getConfigById(configId) : await this.getActiveConfig();
    if (!config) throw new Error("No active OpenSearch configuration found.");

    const url = `${this.getBaseUrl(config)}/_cat/plugins?format=json`;
    const response = await axios.get(url, this.getAxiosConfig(config));
    return response.data;
  }

  async getIndicesStats(configId?: string): Promise<any> {
    const config = configId ? await this.getConfigById(configId) : await this.getActiveConfig();
    if (!config) throw new Error("No active OpenSearch configuration found.");

    const url = `${this.getBaseUrl(config)}/_stats`;
    const response = await axios.get(url, this.getAxiosConfig(config));
    return response.data;
  }

  private parseBytes(value: string): number {
    if (!value) return 0;
    const str = String(value).trim();
    const match = str.match(/^([\d.]+)\s*(b|kb|mb|gb|tb|pb)?$/i);
    if (!match) return parseInt(str) || 0;
    const num = parseFloat(match[1]);
    const unit = (match[2] || "b").toLowerCase();
    const multipliers: Record<string, number> = { b: 1, kb: 1024, mb: 1024 ** 2, gb: 1024 ** 3, tb: 1024 ** 4, pb: 1024 ** 5 };
    return Math.round(num * (multipliers[unit] || 1));
  }
}

export const opensearchClusterService = new OpenSearchClusterService();
