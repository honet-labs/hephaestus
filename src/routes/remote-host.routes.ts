import { Router } from "express";
import { remoteHostController } from "../controllers/remote-host.controller";
import { requireRole } from "../middleware/role.middleware";
import multer from "multer";
import path from "path";
import fs from "fs";

const router = Router();

// Multer config for temp file uploads (lazy init to avoid permission errors at module load)
let upload: multer.Multer;
function getUpload() {
  if (!upload) {
    const uploadDir = path.join(process.cwd(), "data/uploads");
    fs.mkdirSync(uploadDir, { recursive: true, mode: 0o700 });
    upload = multer({ dest: uploadDir, limits: { fileSize: 100 * 1024 * 1024 } });
  }
  return upload;
}

router.get("/configs", requireRole("ADMIN"), (req, res) => remoteHostController.getConfigs(req, res));
router.post("/configs", requireRole("ADMIN"), (req, res) => remoteHostController.saveConfig(req, res));
router.delete("/configs/:id", requireRole("ADMIN"), (req, res) => remoteHostController.deleteConfig(req, res));
router.post("/test-connection", requireRole("ADMIN"), (req, res) => remoteHostController.testConnection(req, res));
router.post("/sftp/list", requireRole("ADMIN"), (req, res) => remoteHostController.sftpListDir(req, res));
router.post("/sftp/upload", requireRole("ADMIN"), (req, res, next) => getUpload().single("file")(req, res, next), (req, res) => remoteHostController.sftpUpload(req, res));
router.post("/sftp/download", requireRole("ADMIN"), (req, res) => remoteHostController.sftpDownload(req, res));
router.post("/sftp/local-to-remote", requireRole("ADMIN"), (req, res) => remoteHostController.localToRemote(req, res));
router.post("/sftp/remote-to-local", requireRole("ADMIN"), (req, res) => remoteHostController.remoteToLocal(req, res));
router.post("/sftp/remote-to-remote", requireRole("ADMIN"), (req, res) => remoteHostController.remoteToRemote(req, res));

export default router;
