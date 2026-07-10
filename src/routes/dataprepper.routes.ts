import { Router } from "express";
import { dataprepperController } from "../controllers/dataprepper.controller";
import { requireRole } from "../middleware/role.middleware";

const router = Router();

// Pipeline files
router.get("/pipelines", requireRole("ADMIN"), (req, res) => dataprepperController.listPipelines(req, res));
router.get("/pipeline", requireRole("ADMIN"), (req, res) => dataprepperController.readPipeline(req, res));
router.post("/pipeline", requireRole("ADMIN"), (req, res) => dataprepperController.savePipeline(req, res));
router.post("/pipeline/validate", requireRole("ADMIN"), (req, res) => dataprepperController.validatePipeline(req, res));

// Connection profiles
router.get("/configs", requireRole("ADMIN"), (req, res) => dataprepperController.getConfigsList(req, res));
router.post("/configs", requireRole("ADMIN"), (req, res) => dataprepperController.saveConfigProfile(req, res));
router.delete("/configs/:id", requireRole("ADMIN"), (req, res) => dataprepperController.deleteConfigProfile(req, res));
router.post("/configs/:id/activate", requireRole("ADMIN"), (req, res) => dataprepperController.activateConfigProfile(req, res));
router.post("/configs/:id/test", requireRole("ADMIN"), (req, res) => dataprepperController.testConnectionById(req, res));
router.post("/configs/test", requireRole("ADMIN"), (req, res) => dataprepperController.testConnection(req, res));

export default router;
