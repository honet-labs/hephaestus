import { Request, Response } from "express";
import { icmpPingService } from "../services/icmp-ping.service";
import { logActivity } from "../config/db";
import logger from "../config/logger";

export class IcmpPingController {
  /**
   * GET /api/v1/icmp/status - Get service status
   */
  public async getStatus(req: Request, res: Response) {
    try {
      const status = icmpPingService.getStatus();
      const summary = await icmpPingService.getSummary();
      return res.status(200).json({
        success: true,
        data: {
          ...status,
          totalDevices: summary.total,
          onlineDevices: summary.online,
          offlineDevices: summary.offline
        }
      });
    } catch (err: any) {
      logger.error("ICMP", `getStatus error: ${err.message}`);
      return res.status(500).json({ success: false, error: "Failed to get status." });
    }
  }

  /**
   * POST /api/v1/icmp/start - Start the ping service
   */
  public async startService(req: Request, res: Response) {
    try {
      const { interval } = req.body;
      icmpPingService.start(interval ? interval * 1000 : undefined);
      await logActivity("ICMP Ping", "Start Service", `Started with ${interval || 60}s interval`, "SUCCESS");
      return res.status(200).json({ success: true, message: "Service started." });
    } catch (err: any) {
      logger.error("ICMP", `startService error: ${err.message}`);
      return res.status(500).json({ success: false, error: "Failed to start service." });
    }
  }

  /**
   * POST /api/v1/icmp/stop - Stop the ping service
   */
  public async stopService(req: Request, res: Response) {
    try {
      icmpPingService.stop();
      await logActivity("ICMP Ping", "Stop Service", "Service stopped", "SUCCESS");
      return res.status(200).json({ success: true, message: "Service stopped." });
    } catch (err: any) {
      logger.error("ICMP", `stopService error: ${err.message}`);
      return res.status(500).json({ success: false, error: "Failed to stop service." });
    }
  }

  /**
   * POST /api/v1/icmp/run - Run a single ping cycle
   */
  public async runOnce(req: Request, res: Response) {
    try {
      await icmpPingService.runPingCycle();
      const summary = await icmpPingService.getSummary();
      await logActivity("ICMP Ping", "Run Once", `Pinged ${summary.total} devices: ${summary.online} online, ${summary.offline} offline`, "SUCCESS");
      return res.status(200).json({ success: true, data: summary });
    } catch (err: any) {
      logger.error("ICMP", `runOnce error: ${err.message}`);
      return res.status(500).json({ success: false, error: "Failed to run ping cycle." });
    }
  }

  /**
   * GET /api/v1/icmp/devices - Get ping results for all devices
   */
  public async getDeviceResults(req: Request, res: Response) {
    try {
      const results = await icmpPingService.getDevicePingResults();
      return res.status(200).json({ success: true, data: results });
    } catch (err: any) {
      logger.error("ICMP", `getDeviceResults error: ${err.message}`);
      return res.status(500).json({ success: false, error: "Failed to get device results." });
    }
  }
}

export const icmpPingController = new IcmpPingController();
