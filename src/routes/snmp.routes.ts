import { Router } from "express";
import { SnmpController } from "../controllers/snmp.controller";

const router = Router();

// Presets list of MIBs
router.get("/presets", SnmpController.getPresets);

// Imported MIBs list
router.get("/mibs", SnmpController.getImportedMibs);

// Import a new MIB
router.post("/mibs/import", SnmpController.importMib);

// Delete an imported MIB
router.delete("/mibs/:name", SnmpController.deleteMib);

// Global OID registry list
router.get("/registry", SnmpController.getRegistry);

// Query an SNMP host (GET or WALK)
router.post("/query", SnmpController.querySnmp);

export default router;
