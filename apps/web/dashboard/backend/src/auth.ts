import type { Express } from "express";
import { pool } from "./db.js";
import { sendConfirmationCode, type Delivery } from "./mail.js";
import { hashConfirmationCode, newConfirmationCode, registerOAuth } from "./oauth.js";
import {
  clearSessionCookie,
  createSession,
  hashPassword,
  hashesMatch,
  passwordMatches,
  readCookie,
  sessionCookieName,
  setSessionCookie,
  tokenHash,
  userFromRequest,
} from "./session.js";

const specialCharacter = /[^A-Za-z0-9]/;
const emailShape = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const uppercase = /[A-Z]/;
const digit = /[0-9]/;

type UserRecord = {
  id: string;
  email: string;
  password_hash: string | null;
  email_verified: boolean;
};

function emailProblems(email: string) {
  const problems: string[] = [];
  if (email.length <= 8) {
    problems.push("Email must be more than 8 characters.");
  }
  if (!specialCharacter.test(email)) {
    problems.push("Email must include at least 1 special character.");
  }
  if (!emailShape.test(email)) {
    problems.push("Enter a valid email address.");
  }
  return problems;
}

function passwordProblems(password: string) {
  const problems: string[] = [];
  if (password.length < 8) {
    problems.push("Password must be at least 8 characters.");
  }
  if (!uppercase.test(password)) {
    problems.push("Password must include an uppercase letter.");
  }
  if (!digit.test(password)) {
    problems.push("Password must include a number.");
  }
  return problems;
}

async function issueCode(email: string): Promise<Delivery> {
  const recent = await pool.query<{ created_at: Date }>(
    `SELECT created_at FROM email_codes WHERE email = $1`,
    [email],
  );
  const createdAt = recent.rows[0]?.created_at;
  if (createdAt && Date.now() - new Date(createdAt).getTime() < 30_000) {
    throw new Error("WAIT");
  }
  const code = newConfirmationCode();
  await pool.query(
    `INSERT INTO email_codes (email, code_hash, expires_at, attempts, created_at)
     VALUES ($1, $2, now() + interval '10 minutes', 0, now())
     ON CONFLICT (email) DO UPDATE
     SET code_hash = EXCLUDED.code_hash,
         expires_at = EXCLUDED.expires_at,
         attempts = 0,
         created_at = now()`,
    [email, hashConfirmationCode(code)],
  );
  return sendConfirmationCode(email, code);
}

function verifyPayload(email: string, delivery: Delivery) {
  return { status: "verify" as const, email, delivery };
}

export function registerAuth(app: Express) {
  registerOAuth(app);

  app.post("/api/auth/signup", async (req, res) => {
    const email = String(req.body?.email ?? "").trim().toLowerCase();
    const password = String(req.body?.password ?? "");
    const problems = [...emailProblems(email), ...passwordProblems(password)];
    if (problems.length > 0) {
      res.status(400).json({ error: problems[0] });
      return;
    }

    const passwordHash = await hashPassword(password);
    const existing = await pool.query<UserRecord>(
      `SELECT id, email, password_hash, email_verified FROM users WHERE email = $1`,
      [email],
    );
    const current = existing.rows[0];
    if (current?.email_verified) {
      res.status(409).json({ error: "An account with that email already exists." });
      return;
    }
    if (current) {
      await pool.query(`UPDATE users SET password_hash = $2, provider = 'password' WHERE id = $1`, [
        current.id,
        passwordHash,
      ]);
    } else {
      await pool.query(
        `INSERT INTO users (email, password_hash, email_verified, provider) VALUES ($1, $2, false, 'password')`,
        [email, passwordHash],
      );
    }

    try {
      const delivery = await issueCode(email);
      res.status(202).json(verifyPayload(email, delivery));
    } catch (error) {
      if (error instanceof Error && error.message === "WAIT") {
        res.status(429).json({ error: "Wait a moment before requesting another code." });
        return;
      }
      res.status(502).json({ error: "The confirmation email could not be sent." });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    const email = String(req.body?.email ?? "").trim().toLowerCase();
    const password = String(req.body?.password ?? "");
    if (!email || !password) {
      res.status(400).json({ error: "Enter your email and password." });
      return;
    }

    const result = await pool.query<UserRecord>(
      `SELECT id, email, password_hash, email_verified FROM users WHERE email = $1`,
      [email],
    );
    const user = result.rows[0];
    if (!user?.password_hash || !(await passwordMatches(password, user.password_hash))) {
      res.status(401).json({ error: "Email or password is incorrect." });
      return;
    }
    if (!user.email_verified) {
      try {
        const delivery = await issueCode(user.email);
        res.json(verifyPayload(user.email, delivery));
      } catch (error) {
        if (error instanceof Error && error.message === "WAIT") {
          res.json(verifyPayload(user.email, process.env.SMTP_HOST ? "email" : "log"));
          return;
        }
        res.status(502).json({ error: "The confirmation email could not be sent." });
      }
      return;
    }

    setSessionCookie(res, await createSession(user.id));
    res.json({ email: user.email });
  });

  app.post("/api/auth/verify", async (req, res) => {
    const email = String(req.body?.email ?? "").trim().toLowerCase();
    const code = String(req.body?.code ?? "").trim();
    if (!email || !/^\d{6}$/.test(code)) {
      res.status(400).json({ error: "Enter the 6-digit code from your email." });
      return;
    }

    const result = await pool.query<{ code_hash: string; expires_at: Date; attempts: number }>(
      `SELECT code_hash, expires_at, attempts FROM email_codes WHERE email = $1`,
      [email],
    );
    const saved = result.rows[0];
    if (!saved || new Date(saved.expires_at).getTime() <= Date.now()) {
      res.status(400).json({ error: "That code has expired. Request a new one." });
      return;
    }
    if (saved.attempts >= 5) {
      res.status(400).json({ error: "Too many attempts. Request a new code." });
      return;
    }
    if (!hashesMatch(tokenHash(code), saved.code_hash)) {
      await pool.query(`UPDATE email_codes SET attempts = attempts + 1 WHERE email = $1`, [email]);
      res.status(400).json({ error: "That code is incorrect." });
      return;
    }

    const user = await pool.query<{ id: string; email: string }>(
      `UPDATE users SET email_verified = true WHERE email = $1 RETURNING id, email`,
      [email],
    );
    await pool.query(`DELETE FROM email_codes WHERE email = $1`, [email]);
    if (!user.rows[0]) {
      res.status(400).json({ error: "Create an account before confirming this code." });
      return;
    }
    setSessionCookie(res, await createSession(user.rows[0].id));
    res.json({ email: user.rows[0].email });
  });

  app.post("/api/auth/resend", async (req, res) => {
    const email = String(req.body?.email ?? "").trim().toLowerCase();
    const user = await pool.query<{ email: string; email_verified: boolean }>(
      `SELECT email, email_verified FROM users WHERE email = $1`,
      [email],
    );
    if (!user.rows[0] || user.rows[0].email_verified) {
      res.status(400).json({ error: "Request a code from the sign-up form." });
      return;
    }
    try {
      const delivery = await issueCode(email);
      res.json(verifyPayload(email, delivery));
    } catch (error) {
      if (error instanceof Error && error.message === "WAIT") {
        res.status(429).json({ error: "Wait a moment before requesting another code." });
        return;
      }
      res.status(502).json({ error: "The confirmation email could not be sent." });
    }
  });

  app.post("/api/auth/logout", async (req, res) => {
    const token = readCookie(req, sessionCookieName);
    if (token) {
      await pool.query(`DELETE FROM sessions WHERE token_hash = $1`, [tokenHash(token)]);
    }
    clearSessionCookie(res);
    res.json({ ok: true });
  });

  app.get("/api/auth/me", async (req, res) => {
    const user = await userFromRequest(req);
    if (!user) {
      res.status(401).json({ error: "Not signed in." });
      return;
    }
    res.json({ email: user.email });
  });
}
