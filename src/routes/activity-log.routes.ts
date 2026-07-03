import { Router } from "express";
import { activityLogController } from "../controllers/activity-log.controller";
import { requireRole } from "../middleware/role.middleware";

const router = Router();

router.get("/", activityLogController.getLogs);
router.delete("/", requireRole("ADMIN"), activityLogController.clearLogs);

export default router;
