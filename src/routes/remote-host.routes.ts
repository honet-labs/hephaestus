import { Router } from "express";
import { remoteHostController } from "../controllers/remote-host.controller";
import { requireRole } from "../middleware/role.middleware";

const router = Router();

router.get("/configs", requireRole("ADMIN"), (req, res) => remoteHostController.getConfigs(req, res));
router.post("/configs", requireRole("ADMIN"), (req, res) => remoteHostController.saveConfig(req, res));
router.delete("/configs/:id", requireRole("ADMIN"), (req, res) => remoteHostController.deleteConfig(req, res));

export default router;
