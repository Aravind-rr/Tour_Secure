// backend/src/routes/auth.routes.ts

import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/User";
import { requireAuth, AuthedRequest } from "../middleware/requireAuth";
import { getEnv } from "../config/env";

const r = Router();
const env = getEnv();
const isProd = env.NODE_ENV === "production";

/** Sign a JWT with standard subject (sub) and minimal payload. */
function signJWTFor(
  userId: string,
  u: {
    email?: string;
    name?: string;
    role?: string;
  }
) {
  return jwt.sign(
    {
      email: u.email,
      name: u.name,
      role: u.role || "user",
    },
    env.JWT_SECRET,
    {
      subject: userId,
      expiresIn: `${env.JWT_EXPIRES_DAYS}d`,
    }
  );
}

/** Legacy-compatible signer. */
function signJWT(u: any) {
  const id = String(u._id || u.id);

  return jwt.sign(
    {
      id,
      email: u.email,
      name: u.name,
      role: u.role || "user",
    },
    env.JWT_SECRET,
    {
      subject: id,
      expiresIn: `${env.JWT_EXPIRES_DAYS}d`,
    }
  );
}

function setSessionCookie(res: any, token: string) {
  res.cookie(env.AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: isProd ? "none" : "lax",
    secure: isProd,
    maxAge:
      Number(env.JWT_EXPIRES_DAYS) *
      24 *
      60 *
      60 *
      1000,
    domain: process.env.COOKIE_DOMAIN || undefined,
    path: "/",
  });
}

function clearSessionCookie(res: any) {
  res.clearCookie(env.AUTH_COOKIE_NAME, {
    httpOnly: true,
    sameSite: isProd ? "none" : "lax",
    secure: isProd,
    domain: process.env.COOKIE_DOMAIN || undefined,
    path: "/",
  });
}

// REGISTER
r.post("/register", async (req, res) => {
  try {
    const { name, email, password } = req.body || {};

    if (!name || !email || !password) {
      return res.status(400).json({
        error: "Missing fields",
      });
    }

    const normEmail = String(email).toLowerCase().trim();

    const existing = await User.findOne({
      email: normEmail,
    });

    if (existing) {
      return res.status(409).json({
        error: "Email already registered",
      });
    }

    const hash = await bcrypt.hash(password, 10);

    const user = await User.create({
      name: String(name).trim(),
      email: normEmail,
      password: hash,
      role: "user",
    });

    const token = signJWT(user);

    setSessionCookie(res, token);

    return res.status(201).json({
      ok: true,
      user: {
        id: String(user._id),
        name: user.name,
        email: user.email,
        role: user.role || "user",
      },
      token,
    });
  } catch (e: any) {
    console.error("REGISTER error:", e?.message || e);

    return res.status(500).json({
      error: "register_failed",
    });
  }
});

// LOGIN
r.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({
        error: "Missing fields",
      });
    }

    const normEmail = String(email).toLowerCase().trim();

    // Explicit result type avoids the overly broad Mongoose
    // lean() inference that was causing the TypeScript build error.
    const user = (await User.findOne({
      email: normEmail,
    })
      .select("+password")
      .lean()) as {
      _id: unknown;
      name?: string;
      email?: string;
      password?: string;
      role?: "user" | "admin";
    } | null;

    if (!user) {
      return res.status(401).json({
        error: "Invalid credentials",
      });
    }

    if (!user.password) {
      return res.status(401).json({
        error:
          "Account not password-enabled. Please register again.",
      });
    }

    const ok = await bcrypt.compare(
      password,
      user.password
    );

    if (!ok) {
      return res.status(401).json({
        error: "Invalid credentials",
      });
    }

    const userId = String(user._id);

    const token = signJWTFor(userId, {
      email: user.email,
      name: user.name,
      role: user.role,
    });

    setSessionCookie(res, token);

    return res.json({
      ok: true,
      user: {
        id: userId,
        name: user.name,
        email: user.email,
        role: user.role || "user",
      },
      token,
    });
  } catch (e: any) {
    console.error("LOGIN error:", e?.message || e);

    return res.status(500).json({
      error: "login_failed",
    });
  }
});

// WHOAMI
r.get("/me", requireAuth, async (req: AuthedRequest, res) => {
  return res.json({
    ok: true,
    user: req.user,
  });
});

// LOGOUT
r.post("/logout", (_req, res) => {
  clearSessionCookie(res);

  return res.json({
    ok: true,
  });
});

export default r;