import { Request, Response, NextFunction } from "express";
import {
  requireAuth as requireSessionAuth,
  type AuthedUser,
} from "./requireAuth";

export type AuthUser = AuthedUser;

export const requireAuth = requireSessionAuth;

export function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction
) {
  if (!req.user) {
    return res.status(401).json({
      error: "Unauthorized",
    });
  }

  if (req.user.role !== "admin") {
    return res.status(403).json({
      error: "Forbidden",
    });
  }

  return next();
}
