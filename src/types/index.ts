// Database Configuration Types
export interface DbConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  ssl?: boolean;
}

// Grafana Configuration
export interface GrafanaConfig {
  id: string;
  name: string;
  host: string;
  token: string;
  datasourceUid: string;
  isActive: boolean;
  createdAt?: Date;
}

// Prometheus Configuration
export interface PrometheusConfig {
  id: string;
  name: string;
  mode: "local" | "ssh";
  path: string;
  reloadUrl: string;
  sshHost?: string;
  sshPort?: number;
  sshUser?: string;
  sshAuth?: "password" | "key";
  sshPassword?: string;
  sshKey?: string;
  isActive: boolean;
  createdAt?: Date;
}

// Data Prepper Configuration
export interface DataprepperConfig {
  id: string;
  name: string;
  mode: "local" | "ssh";
  pipelinesDir: string;
  reloadUrl?: string;
  sshHost?: string;
  sshPort?: number;
  sshUser?: string;
  sshAuth?: "password" | "key";
  sshPassword?: string;
  sshKey?: string;
  isActive: boolean;
  createdAt?: Date;
}

// Uptime Kuma Configuration
export interface UptimeKumaConfig {
  id: string;
  name: string;
  url: string;
  username: string;
  password: string;
  isActive: boolean;
  createdAt?: Date;
}

// OpenSearch Configuration
export interface OpenSearchConfig {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  password: string;
  useSsl: boolean;
  verifySsl: boolean;
  isActive: boolean;
  createdAt?: Date;
}

// Remote Host Configuration
export interface RemoteHostConfig {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  authType: "password" | "key";
  password?: string;
  sshKey?: string;
  groupName: string;
  tags: string[];
  createdAt?: Date;
}

// Topology Types
export interface TopologyDevice {
  id: string;
  name: string;
  ipAddress: string;
  deviceType: DeviceType;
  status: DeviceStatus;
  sources: string[];
  labels: Record<string, any>;
  interfaces: NetworkInterface[];
  x?: number | null;
  y?: number | null;
  sheetId?: number;
  createdAt?: Date;
}

export interface TopologyNode {
  id: string;
  name: string;
  ip: string;
  deviceType: string;
  status: string;
  sources: string[];
  labels: Record<string, any>;
  interfaces?: NetworkInterface[];
  x?: number | null;
  y?: number | null;
  _added?: boolean;
  _saved?: boolean;
  _pendingId?: number;
}

export interface TopologyEdge {
  id: number;
  source: string;
  target: string;
  label?: string;
  edgeType: string;
  sourceLabel?: string;
  targetLabel?: string;
  sheetId?: number;
  createdAt?: Date;
}

export interface TopologySheet {
  id: number;
  name: string;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
  deviceCount?: number;
  edgeCount?: number;
}

export type DeviceType = "server" | "switch" | "router" | "firewall" | "network" | "web" | "container" | "unknown";
export type DeviceStatus = "online" | "offline" | "unknown";

export interface NetworkInterface {
  name: string;
  ip: string;
  mac: string;
  speed: number;
  speedStr: string;
  status: "up" | "down" | "unknown";
}

// User Types
export interface User {
  id: number;
  username: string;
  email: string;
  role: string;
  forcePasswordChange: boolean;
  createdAt: Date;
}

export interface UserSession {
  id: number;
  userId: number;
  token: string;
  expiresAt: Date;
  createdAt: Date;
}

// Activity Log Types
export interface ActivityLog {
  id: number;
  timestamp: Date;
  module: string;
  action: string;
  details?: string;
  status: string;
  userId?: number;
}

// Backup Types
export interface BackupDatabaseConfig {
  id: string;
  name: string;
  dbType: string;
  host: string;
  port: number;
  username: string;
  password: string;
  databaseName: string;
  sshHost?: string;
  sshPort?: number;
  sshUser?: string;
  sshAuth?: "password" | "key";
  sshPassword?: string;
  sshKey?: string;
  createdAt?: Date;
}

export interface BackupDestination {
  id: string;
  name: string;
  destType: string;
  config: Record<string, any>;
  isActive: boolean;
  createdAt?: Date;
}

export interface BackupHistory {
  id: string;
  dbConfigId?: string;
  destinationId?: string;
  dbName: string;
  dbType: string;
  destType: string;
  filename: string;
  fileSize: number;
  status: "running" | "success" | "failed";
  errorMessage?: string;
  startedAt: Date;
  completedAt?: Date;
}

export interface BackupSchedule {
  id: string;
  name: string;
  dbConfigId: string;
  destinationId: string;
  cronExpression: string;
  isActive: boolean;
  lastRun?: Date;
  nextRun?: Date;
  createdAt?: Date;
}

// Monitoring View Types
export interface MonitoringView {
  id: string;
  name: string;
  description?: string;
  interval: number;
  mode: string;
  panels: MonitoringPanel[];
  createdAt?: Date;
}

export interface MonitoringPanel {
  url: string;
  title?: string;
}

// SNMP Types
export interface ImportedMib {
  name: string;
  nodeCount: number;
  importedAt: Date;
}

export interface OidRegistry {
  oid: string;
  name: string;
  mibName: string;
  syntax?: string;
  access?: string;
  description?: string;
  createdAt?: Date;
}

// Query Panel Types
export interface QueryPanel {
  id: string;
  name: string;
  description?: string;
  datasourceType: string;
  datasourceUid: string;
  timeRangeFrom: string;
  timeRangeTo: string;
  step: string;
  columns: QueryColumn[];
  createdAt?: Date;
}

export interface QueryColumn {
  name: string;
  type: string;
  visible?: boolean;
}

// API Response Types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  total: number;
  page: number;
  limit: number;
}

// WebSocket Types
export interface WebSocketMessage {
  type: "auth" | "data" | "error" | "resize" | "close";
  token?: string;
  hostId?: string;
  hostConfigId?: string;
  data?: string;
  cols?: number;
  rows?: number;
  message?: string;
}

export interface WebSocketAuthPayload {
  type: "auth";
  token: string;
  hostId: string;
  hostConfigId?: string;
}

// System Types
export interface SystemRole {
  id: number;
  name: string;
  description?: string;
  isDefault: boolean;
  createdAt: Date;
}

export interface AppConfig {
  key: string;
  value: string;
  updatedAt: Date;
}
