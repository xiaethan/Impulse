import { randomBytes, randomInt } from "node:crypto";
import type { Express, Request, Response } from "express";
import { appUrl } from "./env.js";
import { pool } from "./db.js";
import { createSession, setSessionCookie, tokenHash } from "./session.js";

type Provider = "google";

function redirectError(res: Response, message: string) {
  const url = new URL(appUrl());
  url.searchParams.set("auth_error", message);
  res.redirect(url.toString());
}

async function rememberState(provider: Provider) {
  const state = randomBytes(16).toString("hex");
  await pool.query(
    `INSERT INTO oauth_states (state, provider, expires_at)
     VALUES ($1, $2, now() + interval '10 minutes')`,
    [state, provider],
  );
  return state;
}

async function consumeState(state: string, provider: Provider) {
  const result = await pool.query(
    `DELETE FROM oauth_states
     WHERE state = $1 AND provider = $2 AND expires_at > now()
     RETURNING state`,
    [state, provider],
  );
  return result.rowCount === 1;
}

async function loginWithVerifiedEmail(email: string, provider: Provider) {
  const existing = await pool.query<{ id: string; email: string }>(
    `SELECT id, email FROM users WHERE email = $1`,
    [email],
  );
  if (!existing.rows[0]) {
    const inserted = await pool.query<{ id: string; email: string }>(
      `INSERT INTO users (email, password_hash, email_verified, provider)
       VALUES ($1, NULL, true, $2)
       RETURNING id, email`,
      [email, provider],
    );
    return inserted.rows[0];
  }
  await pool.query(`UPDATE users SET email_verified = true WHERE id = $1`, [existing.rows[0].id]);
  return existing.rows[0];
}

async function finishLogin(res: Response, email: string, provider: Provider) {
  const user = await loginWithVerifiedEmail(email, provider);
  setSessionCookie(res, await createSession(user.id));
  res.redirect(appUrl());
}

function callbackUrl(provider: Provider) {
  return `${appUrl()}/api/auth/${provider}/callback`;
}

async function startGoogle(res: Response) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId || !process.env.GOOGLE_CLIENT_SECRET) {
    redirectError(res, "Google sign-in is not configured.");
    return;
  }
  const state = await rememberState("google");
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", callbackUrl("google"));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", state);
  url.searchParams.set("prompt", "select_account");
  res.redirect(url.toString());
}

async function finishGoogle(req: Request, res: Response) {
  const code = String(req.query.code ?? "");
  const state = String(req.query.state ?? "");
  if (req.query.error || !code || !(await consumeState(state, "google"))) {
    redirectError(res, "Google sign-in was cancelled or expired. Try again.");
    return;
  }

  const clientId = process.env.GOOGLE_CLIENT_ID ?? "";
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      redirect_uri: callbackUrl("google"),
      grant_type: "authorization_code",
    }),
  });
  if (!tokenResponse.ok) {
    redirectError(res, "Google sign-in failed.");
    return;
  }
  const token = (await tokenResponse.json()) as { access_token?: string };
  const profileResponse = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${token.access_token ?? ""}` },
  });
  if (!profileResponse.ok) {
    redirectError(res, "Google did not return an email address.");
    return;
  }
  const profile = (await profileResponse.json()) as { email?: string; email_verified?: boolean };
  if (!profile.email || profile.email_verified === false) {
    redirectError(res, "Google did not confirm that email address.");
    return;
  }
  await finishLogin(res, profile.email.toLowerCase(), "google");
}

export function registerOAuth(app: Express) {
  app.get("/api/auth/google", async (_req, res, next) => {
    try {
      await startGoogle(res);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/auth/google/callback", async (req, res, next) => {
    try {
      await finishGoogle(req, res);
    } catch (error) {
      next(error);
    }
  });
}

export function newConfirmationCode() {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

export { tokenHash as hashConfirmationCode };
