// backend/src/middleware/optionalAuth.ts
// Attaches req.user when a valid token is present, but never rejects.
// Used by endpoints that work for guests and personalise for signed-in users.

import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import User from "../models/User";
import { getEnv } from "../config/env";

export async function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const { AUTH_COOKIE_NAME, JWT_SECRET } = getEnv();
    const header = String(req.headers["authorization"] || "");
    const bearer = header.startsWith("Bearer ") ? header.slice(7).trim() : null;
    const cookieTok = (req as any).cookies?.[AUTH_COOKIE_NAME] || null;
    const alt = (req.headers["x-access-token"] as string) || null;
    const token = bearer || cookieTok || alt;
    if (!token) return next();

    const decoded: any = jwt.verify(token, JWT_SECRET);
    const id = String(decoded?.sub || decoded?.id || "");
    if (!id) return next();
    const u: any = await User.findById(id).select({ _id: 1, email: 1, name: 1, role: 1 }).lean();
    if (u) req.user = { id: String(u._id), email: u.email, name: u.name, role: u.role || "user" };
  } catch {
    /* invalid / expired token => treat as guest */
  }
  return next();
}
