import { Request, Response } from "express";
import { SnmpService } from "../services/snmp.service";
import { logActivity } from "../config/db";

const snmpService = new SnmpService();

const PRIVATE_IP_PATTERNS = [
  /^127\./, /^10\./, /^172\.(1[6-9]|2\d|3[01])\./, /^192\.168\./,
  /^169\.254\./, /^0\./, /^::1$/, /^fc00:/, /^fe80:/,
  /^100\.(6[4-9]|[7-9]\d|1[0-2][0-7])\./,
];

function isPrivateOrReservedIP(host: string): boolean {
  const h = host.trim().toLowerCase();
  if (["localhost", "127.0.0.1", "::1", "0.0.0.0", "169.254.169.254", "metadata.google.internal"].includes(h)) return true;
  return PRIVATE_IP_PATTERNS.some(p => p.test(h));
}

export class SnmpController {
  
  public static getPresets(req: Request, res: Response) {
    try {
      const presets = snmpService.getPresetMibs();
      res.status(200).json({ success: true, presets });
    } catch (error: any) {
      res.status(500).json({ success: false, error: "Internal Server Error", message: "Failed to fetch SNMP presets" });
    }
  }

  public static async getImportedMibs(req: Request, res: Response) {
    try {
      const mibs = await snmpService.getImportedMibs();
      res.status(200).json({ success: true, mibs });
    } catch (error: any) {
      res.status(500).json({ success: false, error: "Internal Server Error", message: "Failed to fetch imported MIBs" });
    }
  }

  public static async importMib(req: Request, res: Response) {
    const { mibName, sourceUrl, mibText } = req.body;

    if (!mibName) {
      return res.status(400).json({ success: false, error: "Bad Request", message: "mibName is required." });
    }

    if (!sourceUrl && !mibText) {
      return res.status(400).json({ success: false, error: "Bad Request", message: "Either sourceUrl or mibText must be provided." });
    }

    try {
      const result = await snmpService.importMib(mibName, {
        url: sourceUrl || undefined,
        text: mibText || undefined
      });
      await logActivity("SNMP", "Import MIB", `Successfully imported MIB "${mibName}"`, "SUCCESS");
      res.status(201).json({ success: true, message: `MIB '${mibName}' imported successfully.`, data: result });
    } catch (error: any) {
      await logActivity("SNMP", "Import MIB", `Failed to import MIB "${mibName}": ${error.message}`, "ERROR");
      res.status(500).json({ success: false, error: "Internal Server Error", message: "Failed to import MIB" });
    }
  }

  public static async deleteMib(req: Request, res: Response) {
    const { name } = req.params;
    try {
      const success = await snmpService.deleteMib(name);
      if (success) {
        await logActivity("SNMP", "Delete MIB", `Deleted MIB "${name}"`, "SUCCESS");
        res.status(200).json({ success: true, message: `MIB '${name}' deleted successfully.` });
      } else {
        await logActivity("SNMP", "Delete MIB", `Failed to delete MIB "${name}": MIB not found`, "ERROR");
        res.status(404).json({ success: false, error: "Not Found", message: `MIB '${name}' not found in imported list.` });
      }
    } catch (error: any) {
      await logActivity("SNMP", "Delete MIB", `Error deleting MIB "${name}": ${error.message}`, "ERROR");
      res.status(500).json({ success: false, error: "Internal Server Error", message: "Failed to delete MIB" });
    }
  }

  public static async getRegistry(req: Request, res: Response) {
    try {
      const registry = await snmpService.getOidRegistry();
      res.status(200).json({ success: true, registry });
    } catch (error: any) {
      res.status(500).json({ success: false, error: "Internal Server Error", message: "Failed to fetch OID registry" });
    }
  }

  public static async querySnmp(req: Request, res: Response) {
    const { host, port, version, community, oid, operation } = req.body;

    if (!host || !operation) {
      return res.status(400).json({ 
        success: false, 
        error: "Bad Request", 
        message: "Parameters host and operation are required." 
      });
    }

    if (isPrivateOrReservedIP(host)) {
      return res.status(400).json({ 
        success: false, 
        error: "Bad Request", 
        message: "SNMP queries to private/reserved IPs are not allowed." 
      });
    }

    let targetOid = oid ? oid.trim() : "";
    let targetOperation = operation;

    // If OID is empty, default to "1.3.6.1" and perform a WALK operation to get everything
    if (!targetOid) {
      targetOid = "1.3.6.1";
      targetOperation = "walk";
    }

    if (targetOperation !== "get" && targetOperation !== "walk") {
      return res.status(400).json({ 
        success: false, 
        error: "Bad Request", 
        message: "Operation must be 'get' or 'walk'." 
      });
    }

    try {
      const results = await snmpService.query({
        host,
        port: port ? parseInt(port, 10) : 161,
        version: version || "v2c",
        community: community || "public",
        oid: targetOid,
        operation: targetOperation
      });
      res.status(200).json({ 
        success: true, 
        results,
        queriedOid: targetOid,
        queriedOperation: targetOperation
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: "SNMP Query Failed", message: "SNMP query failed" });
    }
  }
}
