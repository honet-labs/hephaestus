import { Router } from "express";
import { userController } from "../controllers/user.controller";

const router = Router();

router.get("/", userController.listUsers);
router.post("/", userController.addUser);
router.delete("/:id", userController.deleteUser);
router.post("/:id/reset-password", userController.resetPassword);

// System Roles
router.get("/roles/list", userController.listRoles);
router.post("/roles", userController.addRole);
router.delete("/roles/:id", userController.deleteRole);

export default router;
