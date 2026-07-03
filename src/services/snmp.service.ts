import fs from "fs";
import path from "path";
import axios from "axios";
import { exec } from "child_process";
import { config } from "../config/env";
import { query } from "../config/db";

export interface MibNode {
  name: string;
  oid: string;
  parent?: string;
  index?: number;
  type?: string;
  syntax?: string;
  access?: string;
  status?: string;
  description?: string;
}

export interface ImportedMib {
  name: string;
  importedAt: string;
  nodeCount: number;
  sourceUrl?: string;
}

export interface OidInfo {
  name: string;
  mib: string;
  syntax?: string;
  access?: string;
  description?: string;
}

export interface SnmpQueryResult {
  oid: string;
  name: string;
  value: string;
  type: string;
}

const MIBS_DIR = path.join(config.dbDir, "mibs");

export class SnmpService {
  constructor() {
    this.ensureMibDirectories();
  }

  private ensureMibDirectories() {
    if (!fs.existsSync(config.dbDir)) {
      fs.mkdirSync(config.dbDir, { recursive: true });
    }
    if (!fs.existsSync(MIBS_DIR)) {
      fs.mkdirSync(MIBS_DIR, { recursive: true });
    }
  }

  // Predefined MIBs list from LibreNMS or standard list
  public getPresetMibs() {
    return [
      { name: "SNMPv2-MIB", desc: "Standard System and SNMP info MIB" },
      { name: "IF-MIB", desc: "Network Interfaces MIB" },
      { name: "HOST-RESOURCES-MIB", desc: "Host CPU, Memory, Disk and Processes MIB" },
      { name: "IP-MIB", desc: "IP traffic and routing MIB" },
      { name: "TCP-MIB", desc: "TCP connection status MIB" },
      { name: "UDP-MIB", desc: "UDP statistics MIB" },
      { name: "DISMAN-EVENT-MIB", desc: "Event and alarm management MIB" },
      { name: "UCD-SNMP-MIB", desc: "UCD (Net-SNMP) System Resources MIB" },
      { name: "CISCO-PROCESS-MIB", desc: "Cisco CPU and Process utilization MIB" },
      { name: "SNMP-FRAMEWORK-MIB", desc: "SNMP Engine architecture MIB" }
    ];
  }

  public async getImportedMibs(): Promise<ImportedMib[]> {
    const res = await query(
      `SELECT name, node_count AS "nodeCount", imported_at AS "importedAt" 
       FROM imported_mibs 
       ORDER BY name ASC`
    );
    return res.rows;
  }

  public async getOidRegistry(): Promise<Record<string, OidInfo>> {
    const res = await query(
      `SELECT oid, name, mib_name AS mib, syntax, access, description 
       FROM oid_registry 
       ORDER BY oid ASC`
    );
    const registry: Record<string, OidInfo> = {};
    for (const row of res.rows) {
      registry[row.oid] = {
        name: row.name,
        mib: row.mib,
        syntax: row.syntax || undefined,
        access: row.access || undefined,
        description: row.description || undefined
      };
    }
    return registry;
  }

  // Translate a numeric OID into human readable string using longest prefix match
  public async translateOid(numericOid: string, registry?: Record<string, OidInfo>): Promise<{ name: string; info?: OidInfo }> {
    // Normalize OID: remove leading/trailing dots
    let cleanOid = numericOid;
    if (cleanOid.startsWith(".")) cleanOid = cleanOid.substring(1);
    if (cleanOid.endsWith(".")) cleanOid = cleanOid.substring(0, cleanOid.length - 1);

    // If registry is provided, use memory lookup (fallback)
    if (registry) {
      const parts = cleanOid.split(".");
      for (let i = parts.length; i > 0; i--) {
        const prefix = parts.slice(0, i).join(".");
        if (registry[prefix]) {
          const info = registry[prefix];
          const suffix = parts.slice(i).join(".");
          const name = suffix ? `${info.name}.${suffix}` : info.name;
          return { name, info };
        }
      }
    } else {
      // Database optimized lookup using index prefix matching
      try {
        const res = await query(
          `SELECT oid, name, mib_name AS mib, syntax, access, description 
           FROM oid_registry 
           WHERE $1 LIKE oid || '%' 
           ORDER BY length(oid) DESC 
           LIMIT 1`,
          [cleanOid]
        );
        if (res.rows.length > 0) {
          const info = res.rows[0];
          const suffix = cleanOid.substring(info.oid.length);
          let displayName = info.name;
          if (suffix) {
            displayName = suffix.startsWith(".") ? `${info.name}${suffix}` : `${info.name}.${suffix}`;
          }
          return {
            name: displayName,
            info: {
              name: info.name,
              mib: info.mib,
              syntax: info.syntax || undefined,
              access: info.access || undefined,
              description: info.description || undefined
            }
          };
        }
      } catch (err) {
        console.error("[SnmpService] translateOid DB lookup error:", err);
      }
    }

    // Default system fallback
    const standardPrefixes: Record<string, string> = {
      "1.3.6.1.2.1.1": "system",
      "1.3.6.1.2.1.2": "interfaces",
      "1.3.6.1.2.1.4": "ip",
      "1.3.6.1.2.1.5": "icmp",
      "1.3.6.1.2.1.6": "tcp",
      "1.3.6.1.2.1.7": "udp",
      "1.3.6.1.2.1.25": "hostResources",
      "1.3.6.1.4.1": "enterprises"
    };

    for (const [prefix, name] of Object.entries(standardPrefixes)) {
      if (cleanOid.startsWith(prefix)) {
        const suffix = cleanOid.substring(prefix.length);
        return { name: name + suffix };
      }
    }

    return { name: cleanOid };
  }

  // Import MIB from URL or text
  public async importMib(mibName: string, source: { url?: string; text?: string }): Promise<ImportedMib> {
    this.ensureMibDirectories();
    let content = "";
    
    if (source.url) {
      const response = await axios.get(source.url, { timeout: 10000 });
      content = response.data;
    } else if (source.text) {
      content = source.text;
    } else {
      throw new Error("No URL or text content provided for importing MIB");
    }

    // Save MIB raw file
    const safeName = mibName.replace(/[^a-zA-Z0-9_-]/g, "");
    const mibFilePath = path.join(MIBS_DIR, `${safeName}.mib`);
    fs.writeFileSync(mibFilePath, content, "utf-8");

    // Parse the MIB
    const nodes = this.parseMibText(content);
    
    // Build name -> OID map from existing registry in DB to resolve cross-MIB dependencies
    const nameToOidMap: Record<string, string> = {};
    const regRes = await query("SELECT oid, name FROM oid_registry");
    for (const row of regRes.rows) {
      nameToOidMap[row.name] = row.oid;
    }

    const resolvedNodes = this.resolveOids(nodes, nameToOidMap);

    // Deduplicate resolvedNodes by OID to prevent ON CONFLICT DO UPDATE database errors
    const uniqueNodesMap = new Map<string, typeof resolvedNodes[0]>();
    for (const node of resolvedNodes) {
      if (node.oid) {
        uniqueNodesMap.set(node.oid, node);
      }
    }
    const uniqueResolvedNodes = Array.from(uniqueNodesMap.values());

    // Save MIB module definition
    await query(
      `INSERT INTO imported_mibs (name, node_count, imported_at) 
       VALUES ($1, $2, NOW()) 
       ON CONFLICT (name) DO UPDATE SET 
         node_count = EXCLUDED.node_count, 
         imported_at = NOW()`,
      [safeName, uniqueResolvedNodes.length]
    );

    // Clear old OIDs for this MIB
    await query("DELETE FROM oid_registry WHERE mib_name = $1", [safeName]);

    // Bulk insert new OIDs in chunks
    const batchSize = 100;
    for (let i = 0; i < uniqueResolvedNodes.length; i += batchSize) {
      const chunk = uniqueResolvedNodes.slice(i, i + batchSize);
      
      const valuePlaceholders = chunk.map((_, idx) => 
        `($${idx * 6 + 1}, $${idx * 6 + 2}, $${idx * 6 + 3}, $${idx * 6 + 4}, $${idx * 6 + 5}, $${idx * 6 + 6})`
      ).join(", ");
      
      const values: any[] = [];
      chunk.forEach(node => {
        values.push(node.oid, node.name, safeName, node.syntax || null, node.access || null, node.description || null);
      });
      
      await query(
        `INSERT INTO oid_registry (oid, name, mib_name, syntax, access, description) 
         VALUES ${valuePlaceholders} 
         ON CONFLICT (oid) DO UPDATE SET 
           name = EXCLUDED.name, 
           mib_name = EXCLUDED.mib_name, 
           syntax = EXCLUDED.syntax, 
           access = EXCLUDED.access, 
           description = EXCLUDED.description`,
         values
       );
    }

    const mibRecord: ImportedMib = {
      name: safeName,
      importedAt: new Date().toISOString(),
      nodeCount: resolvedNodes.length
    };

    return mibRecord;
  }

  // Automatically scan the MIBs directory and synchronize files with the database
  public async syncMibsFromDisk(): Promise<void> {
    this.ensureMibDirectories();
    try {
      const files = fs.readdirSync(MIBS_DIR);
      const mibFiles = files.filter(f => f.endsWith(".mib"));
      if (mibFiles.length === 0) return;

      // Get list of already imported MIBs from DB
      const dbMibs = await this.getImportedMibs();
      const dbMibNames = new Set(dbMibs.map(m => m.name));

      const mibsToSync = mibFiles.map(f => path.basename(f, ".mib")).filter(name => !dbMibNames.has(name));
      if (mibsToSync.length === 0) return;

      console.log(`[SnmpService] Found ${mibsToSync.length} MIBs on disk that are not in the database. Syncing...`);

      for (const mibName of mibsToSync) {
        console.log(`[SnmpService] Auto-syncing MIB "${mibName}"...`);
        const mibFilePath = path.join(MIBS_DIR, `${mibName}.mib`);
        const content = fs.readFileSync(mibFilePath, "utf-8");
        try {
          await this.importMib(mibName, { text: content });
          console.log(`[SnmpService] Successfully auto-synced MIB "${mibName}"`);
        } catch (err: any) {
          console.error(`[SnmpService] Failed to auto-sync MIB "${mibName}":`, err.message);
        }
      }
    } catch (err) {
      console.error("[SnmpService] Error syncing MIBs from disk:", err);
    }
  }

  // Delete an imported MIB (PostgreSQL cascade takes care of registry nodes automatically)
  public async deleteMib(name: string): Promise<boolean> {
    this.ensureMibDirectories();
    
    // Remove file from disk
    const safeName = name.replace(/[^a-zA-Z0-9_-]/g, "");
    const mibFilePath = path.join(MIBS_DIR, `${safeName}.mib`);
    if (fs.existsSync(mibFilePath)) {
      fs.unlinkSync(mibFilePath);
    }

    // Delete from PostgreSQL (ON DELETE CASCADE handles cleaning up the oid_registry records)
    const res = await query("DELETE FROM imported_mibs WHERE name = $1", [name]);
    return (res.rowCount || 0) > 0;
  }

  // Regex-based MIB parser
  private parseMibText(mibText: string): MibNode[] {
    const cleanText = mibText.replace(/--.*$/gm, "");
    const nodes: MibNode[] = [];
    
    const regex = /(\w+)\s+(OBJECT-TYPE|OBJECT\s+IDENTIFIER|MODULE-IDENTITY|NOTIFICATION-TYPE|TRAP-TYPE)\s+(.*?)::=\s*\{\s*([\w-]+)\s+(\d+|\w+\(\d+\))\s*\}/gs;
    
    let match;
    while ((match = regex.exec(cleanText)) !== null) {
      const name = match[1];
      const type = match[2].replace(/\s+/g, " ");
      const block = match[3];
      const parent = match[4];
      const indexStr = match[5];
      
      let index = 0;
      if (indexStr.includes("(")) {
        const idxMatch = indexStr.match(/\((\d+)\)/);
        if (idxMatch) {
          index = parseInt(idxMatch[1], 10);
        }
      } else {
        index = parseInt(indexStr, 10);
      }

      if (isNaN(index)) {
        continue;
      }

      const syntaxMatch = block.match(/SYNTAX\s+([^\r\n]+)/i);
      const syntax = syntaxMatch ? syntaxMatch[1].trim() : undefined;

      const accessMatch = block.match(/(?:MAX-ACCESS|ACCESS)\s+(\S+)/i);
      const access = accessMatch ? accessMatch[1].trim() : undefined;

      const statusMatch = block.match(/STATUS\s+(\S+)/i);
      const status = statusMatch ? statusMatch[1].trim() : undefined;

      const descMatch = block.match(/DESCRIPTION\s+"([^"]+)"/is);
      const description = descMatch ? descMatch[1].trim() : undefined;

      nodes.push({
        name,
        parent,
        index,
        type,
        syntax,
        access,
        status,
        description,
        oid: ""
      });
    }

    return nodes;
  }

  // Resolve OID paths recursively
  private resolveOids(nodes: MibNode[], nameToOidMap: Record<string, string>): MibNode[] {
    const nodeMap = new Map<string, MibNode>();
    for (const node of nodes) {
      nodeMap.set(node.name, node);
    }

    // Default base OIDs structure
    const baseOids: Record<string, string> = {
      "iso": "1",
      "org": "1.3",
      "dod": "1.3.6",
      "internet": "1.3.6.1",
      "directory": "1.3.6.1.1",
      "mgmt": "1.3.6.1.2",
      "experimental": "1.3.6.1.3",
      "private": "1.3.6.1.4",
      "enterprises": "1.3.6.1.4.1",
      "security": "1.3.6.1.5",
      "snmpV2": "1.3.6.1.6",
      "mib-2": "1.3.6.1.2.1",
      "system": "1.3.6.1.2.1.1",
      "interfaces": "1.3.6.1.2.1.2",
      "at": "1.3.6.1.2.1.3",
      "ip": "1.3.6.1.2.1.4",
      "icmp": "1.3.6.1.2.1.5",
      "tcp": "1.3.6.1.2.1.6",
      "udp": "1.3.6.1.2.1.7",
      "egp": "1.3.6.1.2.1.8",
      "transmission": "1.3.6.1.2.1.10",
      "snmp": "1.3.6.1.2.1.11",
      "host": "1.3.6.1.2.1.25"
    };

    // Load cross-MIB parents OID if available
    for (const [name, oid] of Object.entries(nameToOidMap)) {
      if (!baseOids[name]) {
        baseOids[name] = oid;
      }
    }

    function getOid(name: string, visited: Set<string>): string | null {
      if (baseOids[name]) {
        return baseOids[name];
      }
      const node = nodeMap.get(name);
      if (!node || !node.parent) {
        return null;
      }
      if (visited.has(name)) {
        return null;
      }
      visited.add(name);

      const parentOid = getOid(node.parent, visited);
      if (!parentOid) {
        return null;
      }

      const oid = `${parentOid}.${node.index}`;
      baseOids[name] = oid; // Memoize
      return oid;
    }

    for (const node of nodes) {
      const oid = getOid(node.name, new Set());
      if (oid) {
        node.oid = oid;
      }
    }

    return nodes.filter(n => n.oid !== "");
  }

  // Format varbind value to string based on type
  private formatVarbindValue(type: number, value: any): string {
    if (value === null || value === undefined) {
      return "NULL";
    }

    if (Buffer.isBuffer(value)) {
      if (type === 64) { // IpAddress
        return Array.from(value).join(".");
      }

      // Treat as String if it is printable ASCII
      const str = value.toString("utf-8");
      const isPrintable = /^[\x20-\x7E\r\n\t]*$/.test(str);
      if (isPrintable) {
        return str;
      } else {
        return "0x" + value.toString("hex").toUpperCase();
      }
    }

    if (typeof value === "object") {
      return JSON.stringify(value);
    }

    return String(value);
  }

  // Map type ID to string representation
  private getTypeName(typeId: number): string {
    const types: Record<number, string> = {
      1: "Boolean",
      2: "Integer",
      4: "OctetString",
      5: "Null",
      6: "OID",
      64: "IpAddress",
      65: "Counter32",
      66: "Gauge32",
      67: "TimeTicks",
      68: "Opaque",
      70: "Counter64",
      128: "NoSuchObject",
      129: "NoSuchInstance",
      130: "EndOfMibView"
    };
    return types[typeId] || `Unknown (${typeId})`;
  }

  // Perform SNMP Query
  public query(options: {
    host: string;
    port?: number;
    version?: string;
    community?: string;
    oid: string;
    operation: "get" | "walk";
  }): Promise<SnmpQueryResult[]> {
    return new Promise((resolve, reject) => {
      const host = options.host;
      const port = options.port || 161;
      const community = options.community || "public";
      const versionStr = options.version === "v1" ? "1" : "2c";
      const startOid = options.oid.trim();
      const operation = options.operation;

      const binary = operation === "get" ? "snmpget" : "snmpwalk";
      const cmd = `${binary} -v ${versionStr} -c "${community}" -On -t 4 -r 1 "${host}:${port}" "${startOid}"`;

      exec(cmd, async (error, stdout, stderr) => {
        if (error && !stdout) {
          return reject(new Error(stderr || error.message));
        }

        const lines = stdout.split(/\r?\n/);
        const results: SnmpQueryResult[] = [];

        for (const line of lines) {
          if (!line.trim()) continue;
          const match = line.match(/^(\.?[0-9.]+)\s*=\s*(.*?)$/);
          if (match) {
            const rawOid = match[1];
            const rest = match[2];
            let type = "Unknown";
            let value = rest;

            const colonIndex = rest.indexOf(":");
            if (colonIndex !== -1) {
              const possibleType = rest.substring(0, colonIndex).trim();
              const commonTypes = ["STRING", "Hex-STRING", "OID", "IpAddress", "Counter32", "Gauge32", "Timeticks", "Counter64", "INTEGER"];
              if (commonTypes.includes(possibleType) || possibleType.toLowerCase().includes("string") || possibleType.toLowerCase().includes("int")) {
                type = possibleType;
                value = rest.substring(colonIndex + 1).trim();
              }
            }

            if (value.startsWith('"') && value.endsWith('"')) {
              value = value.substring(1, value.length - 1);
            }

            let cleanOid = rawOid;
            if (cleanOid.startsWith(".")) cleanOid = cleanOid.substring(1);

            const translation = await this.translateOid(cleanOid);
            results.push({
              oid: cleanOid,
              name: translation.name,
              value: value,
              type: type
            });
          }
        }

        resolve(results);
      });
    });
  }
}
