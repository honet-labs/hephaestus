import { Router } from "express";
import { topologyController } from "../controllers/topology.controller";
import { requireRole } from "../middleware/role.middleware";

const router = Router();

// Graph operations
router.get("/graph", requireRole("ADMIN"), (req, res) => topologyController.getGraph(req, res));
router.post("/scan", requireRole("ADMIN"), (req, res) => topologyController.scanCandidates(req, res));
router.post("/scan/snmp", requireRole("ADMIN"), (req, res) => topologyController.scanSnmp(req, res));

// Device operations
router.post("/device", requireRole("ADMIN"), (req, res) => topologyController.addDevice(req, res));
router.post("/device/save", requireRole("ADMIN"), (req, res) => topologyController.saveDevice(req, res));
router.post("/device/save-all", requireRole("ADMIN"), (req, res) => topologyController.saveAllDevices(req, res));
router.delete("/device/:id", requireRole("ADMIN"), (req, res) => topologyController.deleteDevice(req, res));
router.put("/device/position", requireRole("ADMIN"), (req, res) => topologyController.updatePosition(req, res));

// Edge operations
router.post("/edge", requireRole("ADMIN"), (req, res) => topologyController.addEdge(req, res));
router.delete("/edge/:id", requireRole("ADMIN"), (req, res) => topologyController.deleteEdge(req, res));

// Device actions
router.get("/device/:id/ping", requireRole("ADMIN"), (req, res) => topologyController.pingDevice(req, res));
router.get("/device/:id/snmp-walk", requireRole("ADMIN"), (req, res) => topologyController.snmpWalkDevice(req, res));

export default router;
