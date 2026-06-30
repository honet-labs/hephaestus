import { Request, Response } from "express";
import { query } from "../config/db";

export interface MonitoringViewItem {
  id: string;
  title: string;
  description: string;
  urls: string[];
  slideDuration: number; // in seconds
  createdAt: string;
}

export class MonitoringViewController {
  private async getViewsList(): Promise<MonitoringViewItem[]> {
    try {
      const res = await query(
        `SELECT id, name AS title, description, interval AS "slideDuration", panels AS urls 
         FROM monitoring_views
         ORDER BY id DESC`
      );
      return res.rows.map(row => ({
        id: row.id,
        title: row.title,
        description: row.description || "",
        urls: Array.isArray(row.urls) ? row.urls : (typeof row.urls === "string" ? JSON.parse(row.urls) : []),
        slideDuration: row.slideDuration || 10,
        createdAt: new Date().toISOString()
      }));
    } catch (error) {
      console.error("[MonitoringViewController] Error reading views list from database:", error);
      return [];
    }
  }

  public getViews = async (req: Request, res: Response): Promise<void> => {
    try {
      const views = await this.getViewsList();
      res.status(200).json({ success: true, data: views });
    } catch (error: any) {
      res.status(500).json({ success: false, error: "Internal Server Error", message: error.message });
    }
  };

  public createView = async (req: Request, res: Response): Promise<void> => {
    try {
      const { title, description, urls, slideDuration } = req.body;

      if (!title || typeof title !== "string" || !title.trim()) {
        res.status(400).json({ success: false, error: "Validation Error", message: "Judul monitoring view wajib diisi." });
        return;
      }

      if (!urls || !Array.isArray(urls)) {
        res.status(400).json({ success: false, error: "Validation Error", message: "URLs dashboard harus berupa array." });
        return;
      }

      const cleanedUrls = urls.map(u => typeof u === "string" ? u.trim() : "").filter(u => u !== "");

      const id = `view-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const finalTitle = title.trim();
      const finalDesc = (description || "").trim();
      const finalDuration = typeof slideDuration === "number" && slideDuration > 0 ? slideDuration : 10;

      await query(
        `INSERT INTO monitoring_views (id, name, description, interval, mode, panels)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [id, finalTitle, finalDesc, finalDuration, "slideshow", JSON.stringify(cleanedUrls)]
      );

      const newItem: MonitoringViewItem = {
        id,
        title: finalTitle,
        description: finalDesc,
        urls: cleanedUrls,
        slideDuration: finalDuration,
        createdAt: new Date().toISOString()
      };

      res.status(201).json({ success: true, data: newItem });
    } catch (error: any) {
      res.status(500).json({ success: false, error: "Internal Server Error", message: error.message });
    }
  };

  public updateView = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const { title, description, urls, slideDuration } = req.body;

      if (!title || typeof title !== "string" || !title.trim()) {
        res.status(400).json({ success: false, error: "Validation Error", message: "Judul monitoring view wajib diisi." });
        return;
      }

      if (!urls || !Array.isArray(urls)) {
        res.status(400).json({ success: false, error: "Validation Error", message: "URLs dashboard harus berupa array." });
        return;
      }

      const check = await query("SELECT 1 FROM monitoring_views WHERE id = $1", [id]);
      if (check.rows.length === 0) {
        res.status(404).json({ success: false, error: "Not Found", message: "Monitoring view tidak ditemukan." });
        return;
      }

      const cleanedUrls = urls.map(u => typeof u === "string" ? u.trim() : "").filter(u => u !== "");
      const finalTitle = title.trim();
      const finalDesc = (description || "").trim();
      const finalDuration = typeof slideDuration === "number" && slideDuration > 0 ? slideDuration : 10;

      await query(
        `UPDATE monitoring_views
         SET name = $1, description = $2, interval = $3, panels = $4
         WHERE id = $5`,
        [finalTitle, finalDesc, finalDuration, JSON.stringify(cleanedUrls), id]
      );

      const updatedItem: MonitoringViewItem = {
        id,
        title: finalTitle,
        description: finalDesc,
        urls: cleanedUrls,
        slideDuration: finalDuration,
        createdAt: new Date().toISOString()
      };

      res.status(200).json({ success: true, data: updatedItem });
    } catch (error: any) {
      res.status(500).json({ success: false, error: "Internal Server Error", message: error.message });
    }
  };

  public deleteView = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;

      const check = await query("SELECT 1 FROM monitoring_views WHERE id = $1", [id]);
      if (check.rows.length === 0) {
        res.status(404).json({ success: false, error: "Not Found", message: "Monitoring view tidak ditemukan." });
        return;
      }

      await query("DELETE FROM monitoring_views WHERE id = $1", [id]);

      res.status(200).json({ success: true, message: "Monitoring view berhasil dihapus." });
    } catch (error: any) {
      res.status(500).json({ success: false, error: "Internal Server Error", message: error.message });
    }
  };
}

export const monitoringViewController = new MonitoringViewController();
