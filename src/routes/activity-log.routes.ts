import { Router } from "express";
import { activityLogController } from "../controllers/activity-log.controller";

const router = Router();

router.get("/", activityLogController.getLogs);
router.delete("/", activityLogController.clearLogs);

export default router;
