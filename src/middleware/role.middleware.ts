import { Request, Response, NextFunction } from "express";

export function requireRole(...allowedRoles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user;
    if (!user || !allowedRoles.includes(user.role)) {
      res.status(403).json({
        success: false,
        error: "Forbidden",
        message: "You do not have permission to perform this action."
      });
      return;
    }
    next();
  };
}
