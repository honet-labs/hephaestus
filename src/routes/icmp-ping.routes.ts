import { Router } from "express";
import { icmpPingController } from "../controllers/icmp-ping.controller";
import { requireRole } from "../middleware/role.middleware";

const router = Router();

router.get("/status", requireRole("ADMIN"), (req, res) => icmpPingController.getStatus(req, res));
router.post("/start", requireRole("ADMIN"), (req, res) => icmpPingController.startService(req, res));
router.post("/stop", requireRole("ADMIN"), (req, res) => icmpPingController.stopService(req, res));
router.post("/run", requireRole("ADMIN"), (req, res) => icmpPingController.runOnce(req, res));
router.get("/devices", requireRole("ADMIN"), (req, res) => icmpPingController.getDeviceResults(req, res));

export default router;
