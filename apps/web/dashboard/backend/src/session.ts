import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { Request, Response } from "express";
import { pool } from "./db.js";

const scryptAsync = promisify(scrypt);
const cookieName = "impulse_session";
const sessionDays = 14;

export function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function hashesMatch(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(a, b);
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${salt}:${hash.toString("hex")}`;
}

export async function passwordMatches(password: string, stored: string) {
  const [salt, key] = stored.split(":");
  if (!salt || !key) {
    return false;
  }
  const hash = (await scryptAsync(password, salt, 64)) as Buffer;
  const expected = Buffer.from(key, "hex");
  if (hash.length !== expected.length) {
    return false;
  }
  return timingSafeEqual(hash, expected);
}

export function readCookie(req: Request, name: string) {
  const header = req.headers.cookie;
  if (!header) {
    return undefined;
  }
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) {
      return decodeURIComponent(rest.join("="));
    }
  }
  return undefined;
}

export function setSessionCookie(res: Response, token: string) {
  res.cookie(cookieName, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: sessionDays * 24 * 60 * 60 * 1000,
  });
}

export function clearSessionCookie(res: Response) {
  res.clearCookie(cookieName, { path: "/" });
}

export async function createSession(userId: string) {
  const token = randomBytes(32).toString("hex");
  await pool.query(
    `INSERT INTO sessions (token_hash, user_id, expires_at)
     VALUES ($1, $2, now() + ($3 || ' days')::interval)`,
    [tokenHash(token), userId, String(sessionDays)],
  );
  return token;
}

export async function userFromRequest(req: Request) {
  const token = readCookie(req, cookieName);
  if (!token) {
    return undefined;
  }
  const result = await pool.query<{ id: string; email: string }>(
    `SELECT users.id, users.email
     FROM sessions
     JOIN users ON users.id = sessions.user_id
     WHERE sessions.token_hash = $1 AND sessions.expires_at > now()`,
    [tokenHash(token)],
  );
  return result.rows[0];
}

export const sessionCookieName = cookieName;
