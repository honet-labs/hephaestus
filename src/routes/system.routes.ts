import { Router } from "express";
import { systemController } from "../controllers/system.controller";

const router = Router();

router.get("/db-config", systemController.getDbConfig);
router.post("/db-config", systemController.saveDbConfig);

export default router;
