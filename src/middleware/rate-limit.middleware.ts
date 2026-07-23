import rateLimit from "express-rate-limit";

// Use session token as key instead of IP (Cloudflare Tunnel makes all requests appear as one IP)
function getUserKey(req: any): string {
  const auth = req.headers.authorization;
  if (auth && auth.startsWith("Bearer ")) {
    return auth.slice(7); // use the token itself as key
  }
  return req.ip || "unknown";
}

export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 2000,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getUserKey,
  skip: (req: any) => {
    const url = req.originalUrl || req.url;
    if (url.startsWith("/api/v1/health") || url.startsWith("/vendor/") || url.endsWith(".woff2")) return true;
    return false;
  },
  message: { success: false, error: "Too Many Requests", message: "Too many requests, please try again later." }
});

export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: "Too Many Requests", message: "Too many login attempts, please try again later." }
});

export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: "Too Many Requests", message: "Too many login attempts, please try again later." }
});
