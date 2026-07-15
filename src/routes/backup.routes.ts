import { Router } from "express";
import { backupController } from "../controllers/backup.controller";
import { requireRole } from "../middleware/role.middleware";

const router = Router();

// Database configs
router.get("/db-configs", requireRole("ADMIN"), (req, res) => backupController.getDbConfigs(req, res));
router.post("/db-configs", requireRole("ADMIN"), (req, res) => backupController.saveDbConfig(req, res));
router.delete("/db-configs/:id", requireRole("ADMIN"), (req, res) => backupController.deleteDbConfig(req, res));
router.post("/db-configs/test", requireRole("ADMIN"), (req, res) => backupController.testDbConnection(req, res));

// Destinations
router.get("/destinations", requireRole("ADMIN"), (req, res) => backupController.getDestinations(req, res));
router.post("/destinations", requireRole("ADMIN"), (req, res) => backupController.saveDestination(req, res));
router.delete("/destinations/:id", requireRole("ADMIN"), (req, res) => backupController.deleteDestination(req, res));

// Backup execution
router.post("/run", requireRole("ADMIN"), (req, res) => backupController.runBackup(req, res));

// History
router.get("/history", requireRole("ADMIN"), (req, res) => backupController.getHistory(req, res));
router.delete("/history/:id", requireRole("ADMIN"), (req, res) => backupController.deleteHistory(req, res));

// Schedules
router.get("/schedules", requireRole("ADMIN"), (req, res) => backupController.getSchedules(req, res));
router.post("/schedules", requireRole("ADMIN"), (req, res) => backupController.saveSchedule(req, res));
router.delete("/schedules/:id", requireRole("ADMIN"), (req, res) => backupController.deleteSchedule(req, res));
router.post("/schedules/:id/toggle", requireRole("ADMIN"), (req, res) => backupController.toggleSchedule(req, res));
router.post("/schedules/:id/run", requireRole("ADMIN"), (req, res) => backupController.runScheduleNow(req, res));

export default router;
