import { Router } from "express";
import { opensearchClusterController } from "../controllers/opensearch-cluster.controller";
import { requireRole } from "../middleware/role.middleware";

const router = Router();

// Config management
router.get("/configs", requireRole("ADMIN"), (req, res) => opensearchClusterController.getConfigs(req, res));
router.post("/configs", requireRole("ADMIN"), (req, res) => opensearchClusterController.createConfig(req, res));
router.put("/configs/:id", requireRole("ADMIN"), (req, res) => opensearchClusterController.updateConfig(req, res));
router.delete("/configs/:id", requireRole("ADMIN"), (req, res) => opensearchClusterController.deleteConfig(req, res));
router.post("/configs/:id/activate", requireRole("ADMIN"), (req, res) => opensearchClusterController.setActiveConfig(req, res));
router.post("/test-connection", requireRole("ADMIN"), (req, res) => opensearchClusterController.testConnection(req, res));

// Cluster data
router.get("/health", requireRole("ADMIN"), (req, res) => opensearchClusterController.getClusterHealth(req, res));
router.get("/stats", requireRole("ADMIN"), (req, res) => opensearchClusterController.getClusterStats(req, res));
router.get("/nodes", requireRole("ADMIN"), (req, res) => opensearchClusterController.getNodes(req, res));
router.get("/nodes/:nodeName/stats", requireRole("ADMIN"), (req, res) => opensearchClusterController.getNodeStats(req, res));

// Indices
router.get("/indices", requireRole("ADMIN"), (req, res) => opensearchClusterController.getIndices(req, res));
router.get("/indices/stats", requireRole("ADMIN"), (req, res) => opensearchClusterController.getIndicesStats(req, res));
router.get("/indices/:indexName/health", requireRole("ADMIN"), (req, res) => opensearchClusterController.getIndexHealth(req, res));

// Shards
router.get("/shards", requireRole("ADMIN"), (req, res) => opensearchClusterController.getShards(req, res));
router.get("/shards/:indexName", requireRole("ADMIN"), (req, res) => opensearchClusterController.getShardsByIndex(req, res));

// Plugins
router.get("/plugins", requireRole("ADMIN"), (req, res) => opensearchClusterController.getPlugins(req, res));

export default router;
