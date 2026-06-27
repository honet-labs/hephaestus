import { Request, Response } from "express";
import fs from "fs";
import { config } from "../config/env";

export interface MonitoringViewItem {
  id: string;
  title: string;
  description: string;
  urls: string[];
  slideDuration: number; // in seconds
  createdAt: string;
}

export class MonitoringViewController {
  private getViewsList(): MonitoringViewItem[] {
    if (!fs.existsSync(config.monitoringViewsFile)) {
      return [];
    }
    try {
      const content = fs.readFileSync(config.monitoringViewsFile, "utf-8");
      return JSON.parse(content);
    } catch (error) {
      console.error("[MonitoringViewController] Error reading views list file:", error);
      return [];
    }
  }

  private saveViewsList(list: MonitoringViewItem[]): void {
    try {
      if (!fs.existsSync(config.dbDir)) {
        fs.mkdirSync(config.dbDir, { recursive: true });
      }
      fs.writeFileSync(config.monitoringViewsFile, JSON.stringify(list, null, 2), "utf-8");
    } catch (error: any) {
      throw new Error(`Gagal menyimpan data monitoring view: ${error.message}`);
    }
  }

  public getViews = (req: Request, res: Response): void => {
    try {
      const views = this.getViewsList();
      res.status(200).json({ success: true, data: views });
    } catch (error: any) {
      res.status(500).json({ success: false, error: "Internal Server Error", message: error.message });
    }
  };

  public createView = (req: Request, res: Response): void => {
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

      // Filter empty urls
      const cleanedUrls = urls.map(u => typeof u === "string" ? u.trim() : "").filter(u => u !== "");

      const newItem: MonitoringViewItem = {
        id: `view-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        title: title.trim(),
        description: (description || "").trim(),
        urls: cleanedUrls,
        slideDuration: typeof slideDuration === "number" && slideDuration > 0 ? slideDuration : 10,
        createdAt: new Date().toISOString()
      };

      const list = this.getViewsList();
      list.push(newItem);
      this.saveViewsList(list);

      res.status(201).json({ success: true, data: newItem });
    } catch (error: any) {
      res.status(500).json({ success: false, error: "Internal Server Error", message: error.message });
    }
  };

  public updateView = (req: Request, res: Response): void => {
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

      const list = this.getViewsList();
      const index = list.findIndex(v => v.id === id);

      if (index === -1) {
        res.status(404).json({ success: false, error: "Not Found", message: "Monitoring view tidak ditemukan." });
        return;
      }

      const cleanedUrls = urls.map(u => typeof u === "string" ? u.trim() : "").filter(u => u !== "");

      list[index] = {
        ...list[index],
        title: title.trim(),
        description: (description || "").trim(),
        urls: cleanedUrls,
        slideDuration: typeof slideDuration === "number" && slideDuration > 0 ? slideDuration : 10
      };

      this.saveViewsList(list);
      res.status(200).json({ success: true, data: list[index] });
    } catch (error: any) {
      res.status(500).json({ success: false, error: "Internal Server Error", message: error.message });
    }
  };

  public deleteView = (req: Request, res: Response): void => {
    try {
      const { id } = req.params;
      const list = this.getViewsList();
      const index = list.findIndex(v => v.id === id);

      if (index === -1) {
        res.status(404).json({ success: false, error: "Not Found", message: "Monitoring view tidak ditemukan." });
        return;
      }

      list.splice(index, 1);
      this.saveViewsList(list);

      res.status(200).json({ success: true, message: "Monitoring view berhasil dihapus." });
    } catch (error: any) {
      res.status(500).json({ success: false, error: "Internal Server Error", message: error.message });
    }
  };
}

export const monitoringViewController = new MonitoringViewController();
