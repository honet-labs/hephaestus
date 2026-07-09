import { Router, Request, Response } from "express";
import { grokService } from "../services/grok.service";
import { requireRole } from "../middleware/role.middleware";

const router = Router();

router.post("/test", requireRole("ADMIN"), async (req: Request, res: Response) => {
  try {
    const { pattern, custom_patterns, log } = req.body;

    if (!pattern || !log) {
      res.status(400).json({ error: "Pattern and log data are required." });
      return;
    }

    const result = grokService.testGrok(pattern, custom_patterns || "", log);
    res.status(200).json(result);
  } catch (error: any) {
    res.status(500).json({ error: `Grok Parse Error: ${error.message}` });
  }
});

export default router;
