import { Router } from "express";
import { vpsControlController } from "../controllers/vps-control.controller";
import { requireRole } from "../middleware/role.middleware";

const router = Router();

router.use(requireRole("ADMIN"));

router.post("/exec", vpsControlController.execCommand);
router.post("/metrics", vpsControlController.getMetrics);
router.post("/processes", vpsControlController.getProcesses);
router.post("/services", vpsControlController.getServices);
router.post("/service/control", vpsControlController.controlService);
router.post("/logs", vpsControlController.getSystemLogs);
router.post("/system-info", vpsControlController.getSystemInfo);
router.post("/network", vpsControlController.getNetwork);
router.post("/kill-process", vpsControlController.killProcess);

export default router;
