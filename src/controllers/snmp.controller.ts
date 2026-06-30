import { Request, Response } from "express";
import { SnmpService } from "../services/snmp.service";

const snmpService = new SnmpService();

export class SnmpController {
  
  public static getPresets(req: Request, res: Response) {
    try {
      const presets = snmpService.getPresetMibs();
      res.status(200).json({ success: true, presets });
    } catch (error: any) {
      res.status(500).json({ success: false, error: "Internal Server Error", message: error.message });
    }
  }

  public static getImportedMibs(req: Request, res: Response) {
    try {
      const mibs = snmpService.getImportedMibs();
      res.status(200).json({ success: true, mibs });
    } catch (error: any) {
      res.status(500).json({ success: false, error: "Internal Server Error", message: error.message });
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
      res.status(201).json({ success: true, message: `MIB '${mibName}' imported successfully.`, data: result });
    } catch (error: any) {
      res.status(500).json({ success: false, error: "Internal Server Error", message: error.message });
    }
  }

  public static deleteMib(req: Request, res: Response) {
    const { name } = req.params;
    try {
      const success = snmpService.deleteMib(name);
      if (success) {
        res.status(200).json({ success: true, message: `MIB '${name}' deleted successfully.` });
      } else {
        res.status(404).json({ success: false, error: "Not Found", message: `MIB '${name}' not found in imported list.` });
      }
    } catch (error: any) {
      res.status(500).json({ success: false, error: "Internal Server Error", message: error.message });
    }
  }

  public static getRegistry(req: Request, res: Response) {
    try {
      const registry = snmpService.getOidRegistry();
      res.status(200).json({ success: true, registry });
    } catch (error: any) {
      res.status(500).json({ success: false, error: "Internal Server Error", message: error.message });
    }
  }

  public static async querySnmp(req: Request, res: Response) {
    const { host, port, version, community, oid, operation } = req.body;

    if (!host || !oid || !operation) {
      return res.status(400).json({ 
        success: false, 
        error: "Bad Request", 
        message: "Parameters host, oid, and operation are required." 
      });
    }

    if (operation !== "get" && operation !== "walk") {
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
        oid,
        operation
      });
      res.status(200).json({ success: true, results });
    } catch (error: any) {
      res.status(500).json({ success: false, error: "SNMP Query Failed", message: error.message });
    }
  }
}
