import { Router } from "express";
import { remoteHostController } from "../controllers/remote-host.controller";
import { requireRole } from "../middleware/role.middleware";
import multer from "multer";
import path from "path";
import fs from "fs";

const router = Router();

// Multer config for temp file uploads
const uploadDir = path.join(__dirname, "../../data/uploads");
fs.mkdirSync(uploadDir, { recursive: true });
const upload = multer({
  dest: uploadDir,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB max
});

router.get("/configs", requireRole("ADMIN"), (req, res) => remoteHostController.getConfigs(req, res));
router.post("/configs", requireRole("ADMIN"), (req, res) => remoteHostController.saveConfig(req, res));
router.delete("/configs/:id", requireRole("ADMIN"), (req, res) => remoteHostController.deleteConfig(req, res));
router.post("/test-connection", requireRole("ADMIN"), (req, res) => remoteHostController.testConnection(req, res));
router.post("/sftp/list", requireRole("ADMIN"), (req, res) => remoteHostController.sftpListDir(req, res));
router.post("/sftp/upload", requireRole("ADMIN"), upload.single("file"), (req, res) => remoteHostController.sftpUpload(req, res));

export default router;
