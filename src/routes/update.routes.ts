import { Router } from "express";
import { updateController } from "../controllers/update.controller";
import { requireRole } from "../middleware/role.middleware";

const router = Router();

router.get("/check", requireRole("ADMIN"), updateController.checkForUpdates);
router.post("/apply", requireRole("ADMIN"), updateController.performUpdate);

export default router;
