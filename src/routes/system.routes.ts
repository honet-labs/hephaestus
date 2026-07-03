import { Router } from "express";
import { systemController } from "../controllers/system.controller";
import { requireRole } from "../middleware/role.middleware";

const router = Router();

router.get("/db-config", requireRole("ADMIN"), systemController.getDbConfig);
router.post("/db-config", requireRole("ADMIN"), systemController.saveDbConfig);
router.post("/db-config/test", requireRole("ADMIN"), systemController.testDbConfig);

export default router;
