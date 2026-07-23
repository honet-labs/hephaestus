import { Router } from "express";
import { vpsControlController } from "../controllers/vps-control.controller";
import { requireRole } from "../middleware/role.middleware";
import rateLimit from "express-rate-limit";

const router = Router();

router.use(requireRole("ADMIN"));

const execLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: { error: "Too many exec requests, please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

router.post("/exec", execLimiter, vpsControlController.execCommand);
router.post("/metrics", vpsControlController.getMetrics);
router.post("/processes", vpsControlController.getProcesses);
router.post("/services", vpsControlController.getServices);
router.post("/service/control", vpsControlController.controlService);
router.post("/logs", vpsControlController.getSystemLogs);
router.post("/system-info", vpsControlController.getSystemInfo);
router.post("/network", vpsControlController.getNetwork);
router.post("/kill-process", vpsControlController.killProcess);

export default router;
