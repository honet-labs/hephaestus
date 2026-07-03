import { Router } from "express";
import { userController } from "../controllers/user.controller";
import { loginLimiter } from "../middleware/rate-limit.middleware";
import { requireRole } from "../middleware/role.middleware";

const router = Router();

router.post("/login", loginLimiter, userController.login);
router.post("/logout", userController.logout);
router.get("/session", userController.getSession);

router.get("/", userController.listUsers);
router.post("/", requireRole("ADMIN"), userController.addUser);
router.delete("/:id", requireRole("ADMIN"), userController.deleteUser);
router.post("/:id/reset-password", requireRole("ADMIN"), userController.resetPassword);
router.post("/change-password", userController.changePassword);

// System Roles
router.get("/roles/list", userController.listRoles);
router.post("/roles", requireRole("ADMIN"), userController.addRole);
router.delete("/roles/:id", requireRole("ADMIN"), userController.deleteRole);

export default router;
