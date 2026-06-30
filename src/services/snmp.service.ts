import fs from "fs";
import path from "path";
import axios from "axios";
import snmp from "net-snmp";
import { config } from "../config/env";

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
const IMPORTED_MIBS_FILE = path.join(MIBS_DIR, "imported_mibs.json");
const OID_REGISTRY_FILE = path.join(MIBS_DIR, "oid_registry.json");

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
    if (!fs.existsSync(IMPORTED_MIBS_FILE)) {
      fs.writeFileSync(IMPORTED_MIBS_FILE, JSON.stringify([], null, 2));
    }
    if (!fs.existsSync(OID_REGISTRY_FILE)) {
      fs.writeFileSync(OID_REGISTRY_FILE, JSON.stringify({}, null, 2));
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

  public getImportedMibs(): ImportedMib[] {
    this.ensureMibDirectories();
    try {
      const data = fs.readFileSync(IMPORTED_MIBS_FILE, "utf-8");
      return JSON.parse(data);
    } catch (e) {
      return [];
    }
  }

  public getOidRegistry(): Record<string, OidInfo> {
    this.ensureMibDirectories();
    try {
      const data = fs.readFileSync(OID_REGISTRY_FILE, "utf-8");
      return JSON.parse(data);
    } catch (e) {
      return {};
    }
  }

  // Translate a numeric OID into human readable string using longest prefix match
  public translateOid(numericOid: string, registry?: Record<string, OidInfo>): { name: string; info?: OidInfo } {
    const reg = registry || this.getOidRegistry();
    
    // Normalize OID: remove leading/trailing dots
    let cleanOid = numericOid;
    if (cleanOid.startsWith(".")) cleanOid = cleanOid.substring(1);
    if (cleanOid.endsWith(".")) cleanOid = cleanOid.substring(0, cleanOid.length - 1);

    // Longest prefix match lookup
    const parts = cleanOid.split(".");
    for (let i = parts.length; i > 0; i--) {
      const prefix = parts.slice(0, i).join(".");
      if (reg[prefix]) {
        const info = reg[prefix];
        const suffix = parts.slice(i).join(".");
        const name = suffix ? `${info.name}.${suffix}` : info.name;
        return { name, info };
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
    const safeName = mibName.replace(/[^a-zA-Z0-9_\-]/g, "");
    const mibFilePath = path.join(MIBS_DIR, `${safeName}.mib`);
    fs.writeFileSync(mibFilePath, content, "utf-8");

    // Parse the MIB
    const nodes = this.parseMibText(content);
    
    // Resolve OIDs recursively
    const registry = this.getOidRegistry();
    
    // Build name -> OID map from existing registry to resolve cross-MIB dependencies
    const nameToOidMap: Record<string, string> = {};
    for (const [oid, info] of Object.entries(registry)) {
      nameToOidMap[info.name] = oid;
    }

    const resolvedNodes = this.resolveOids(nodes, nameToOidMap);

    // Merge into OID registry
    for (const node of resolvedNodes) {
      registry[node.oid] = {
        name: node.name,
        mib: safeName,
        syntax: node.syntax,
        access: node.access,
        description: node.description
      };
    }
    fs.writeFileSync(OID_REGISTRY_FILE, JSON.stringify(registry, null, 2), "utf-8");

    // Update imported list
    const imported = this.getImportedMibs();
    const existingIndex = imported.findIndex(m => m.name === safeName);
    const mibRecord: ImportedMib = {
      name: safeName,
      importedAt: new Date().toISOString(),
      nodeCount: resolvedNodes.length,
      sourceUrl: source.url
    };

    if (existingIndex >= 0) {
      imported[existingIndex] = mibRecord;
    } else {
      imported.push(mibRecord);
    }
    fs.writeFileSync(IMPORTED_MIBS_FILE, JSON.stringify(imported, null, 2), "utf-8");

    return mibRecord;
  }

  // Delete an imported MIB
  public deleteMib(name: string): boolean {
    this.ensureMibDirectories();
    const imported = this.getImportedMibs();
    const index = imported.findIndex(m => m.name === name);
    if (index === -1) {
      return false;
    }

    // Remove file
    const mibFilePath = path.join(MIBS_DIR, `${name}.mib`);
    if (fs.existsSync(mibFilePath)) {
      fs.unlinkSync(mibFilePath);
    }

    // Remove from imported list
    imported.splice(index, 1);
    fs.writeFileSync(IMPORTED_MIBS_FILE, JSON.stringify(imported, null, 2), "utf-8");

    // Rebuild OID registry from remaining MIBs
    const newRegistry: Record<string, OidInfo> = {};
    fs.writeFileSync(OID_REGISTRY_FILE, JSON.stringify(newRegistry, null, 2), "utf-8");

    // Re-import remaining MIBs to rebuild registry correctly
    for (const mib of imported) {
      const pathMib = path.join(MIBS_DIR, `${mib.name}.mib`);
      if (fs.existsSync(pathMib)) {
        try {
          const content = fs.readFileSync(pathMib, "utf-8");
          const nodes = this.parseMibText(content);
          
          const nameToOidMap: Record<string, string> = {};
          for (const [oid, info] of Object.entries(newRegistry)) {
            nameToOidMap[info.name] = oid;
          }
          
          const resolved = this.resolveOids(nodes, nameToOidMap);
          for (const node of resolved) {
            newRegistry[node.oid] = {
              name: node.name,
              mib: mib.name,
              syntax: node.syntax,
              access: node.access,
              description: node.description
            };
          }
        } catch (_) {}
      }
    }
    fs.writeFileSync(OID_REGISTRY_FILE, JSON.stringify(newRegistry, null, 2), "utf-8");
    return true;
  }

  // Regex-based MIB parser
  private parseMibText(mibText: string): MibNode[] {
    // Strip comments
    const cleanText = mibText.replace(/--.*$/gm, "");

    const nodes: MibNode[] = [];
    
    // Match standard ASN.1 SNMP structure definitions:
    // name OBJECT-TYPE | OBJECT IDENTIFIER | MODULE-IDENTITY ... ::= { parent index }
    const regex = /(\w+)\s+(OBJECT-TYPE|OBJECT\s+IDENTIFIER|MODULE-IDENTITY|NOTIFICATION-TYPE|TRAP-TYPE)\s+(.*?)::=\s*\{\s*([\w\-]+)\s+(\d+|\w+\(\d+\))\s*\}/gs;
    
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
      const versionStr = options.version || "v2c";
      const startOid = options.oid.trim();
      const operation = options.operation;

      let snmpVersion = snmp.Version2c;
      if (versionStr === "v1") {
        snmpVersion = snmp.Version1;
      }

      // Create session
      let session: any;
      try {
        session = snmp.createSession(host, community, {
          port: port,
          version: snmpVersion,
          timeout: 4000,
          retries: 1
        });
      } catch (err: any) {
        return reject(new Error(`Failed to create SNMP session: ${err.message}`));
      }

      const registry = this.getOidRegistry();

      if (operation === "get") {
        session.get([startOid], (error: any, varbinds: any[]) => {
          if (error) {
            session.close();
            return reject(error);
          }
          const results: SnmpQueryResult[] = [];
          for (const vb of varbinds) {
            if (snmp.isVarbindError(vb)) {
              results.push({
                oid: vb.oid,
                name: "Error",
                value: snmp.varbindError(vb),
                type: "Error"
              });
            } else {
              const translation = this.translateOid(vb.oid, registry);
              results.push({
                oid: vb.oid,
                name: translation.name,
                value: this.formatVarbindValue(vb.type, vb.value),
                type: this.getTypeName(vb.type)
              });
            }
          }
          session.close();
          resolve(results);
        });
      } else {
        // WALK operation
        const results: SnmpQueryResult[] = [];
        session.walk(
          startOid,
          20, // maxRepetitions for bulk
          (varbinds: any[]) => {
            for (const vb of varbinds) {
              if (snmp.isVarbindError(vb)) {
                results.push({
                  oid: vb.oid,
                  name: "Error",
                  value: snmp.varbindError(vb),
                  type: "Error"
                });
              } else {
                const translation = this.translateOid(vb.oid, registry);
                results.push({
                  oid: vb.oid,
                  name: translation.name,
                  value: this.formatVarbindValue(vb.type, vb.value),
                  type: this.getTypeName(vb.type)
                });
              }
            }
          },
          (error: any) => {
            session.close();
            if (error) {
              // Return results gathered so far even if we hit end of MIB or error
              if (results.length > 0) {
                resolve(results);
              } else {
                reject(error);
              }
            } else {
              resolve(results);
            }
          }
        );
      }
    });
  }
}
