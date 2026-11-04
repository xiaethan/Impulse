import { randomInt } from "node:crypto";
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
    const login = String(req.body?.email ?? "").trim().toLowerCase();
    const password = String(req.body?.password ?? "");
    if (!login || !password) {
      res.status(400).json({ error: "Enter your email or username and password." });
      return;
    }

    const result = await pool.query<UserRecord>(
      `SELECT id, email, password_hash, email_verified FROM users WHERE email = $1 OR username = $1`,
      [login],
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
    res.json(await accountPayload(user.id));
  });

  app.post("/api/auth/role", async (req, res) => {
    const user = await userFromRequest(req);
    if (!user) {
      res.status(401).json({ error: "Not signed in." });
      return;
    }
    const role = req.body?.role === "coach" ? "coach" : req.body?.role === "athlete" ? "athlete" : "";
    if (!role) {
      res.status(400).json({ error: "Choose athlete or coach." });
      return;
    }
    if (!user.role) {
      await pool.query(`UPDATE users SET role = $2 WHERE id = $1`, [user.id, role]);
    }
    res.json(await accountPayload(user.id));
  });

  app.post("/api/teams/join", async (req, res) => {
    const user = await userFromRequest(req);
    if (!user) {
      res.status(401).json({ error: "Not signed in." });
      return;
    }
    if (user.role !== "athlete") {
      res.status(403).json({ error: "Only athletes can join a team with a code." });
      return;
    }
    const code = String(req.body?.code ?? "").trim().toUpperCase();
    if (!code) {
      res.status(400).json({ error: "Enter a team code." });
      return;
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const team = await client.query<{ id: string }>(
        `SELECT id FROM teams WHERE code = $1 FOR UPDATE`,
        [code],
      );
      if (!team.rows[0]) {
        await client.query("ROLLBACK");
        res.status(404).json({ error: "That code doesn't match a team." });
        return;
      }
      const teamId = team.rows[0].id;
      const current = await client.query<{ team_id: string }>(
        `SELECT team_id FROM team_members WHERE user_id = $1`,
        [user.id],
      );
      const previousId = current.rows[0]?.team_id;
      if (previousId && previousId !== teamId) {
        await client.query(`DELETE FROM team_members WHERE user_id = $1`, [user.id]);
        await client.query(
          `UPDATE teams SET member_count = (SELECT count(*) FROM team_members WHERE team_id = $1) WHERE id = $1`,
          [previousId],
        );
      }
      await client.query(
        `INSERT INTO team_members (team_id, user_id) VALUES ($1, $2) ON CONFLICT (user_id) DO NOTHING`,
        [teamId, user.id],
      );
      await client.query(`UPDATE users SET team_id = $1 WHERE id = $2`, [teamId, user.id]);
      await client.query(
        `UPDATE teams SET member_count = (SELECT count(*) FROM team_members WHERE team_id = $1) WHERE id = $1`,
        [teamId],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    res.json(await accountPayload(user.id));
  });

  app.post("/api/teams", async (req, res) => {
    const user = await userFromRequest(req);
    if (!user) {
      res.status(401).json({ error: "Not signed in." });
      return;
    }
    if (user.role !== "coach") {
      res.status(403).json({ error: "Only coaches can create a team." });
      return;
    }
    const name = String(req.body?.name ?? "").trim();
    const location = String(req.body?.location ?? "").trim();
    if (!name) {
      res.status(400).json({ error: "Enter a team name." });
      return;
    }
    if (name.length > 80 || location.length > 80) {
      res.status(400).json({ error: "Keep the team name and location under 80 characters." });
      return;
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const current = await client.query<{ team_id: string | null }>(
        `SELECT team_id FROM users WHERE id = $1 FOR UPDATE`,
        [user.id],
      );
      if (current.rows[0]?.team_id) {
        await client.query("ROLLBACK");
        res.status(409).json({ error: "You already have a team." });
        return;
      }

      let teamId = "";
      for (let attempt = 0; attempt < 12; attempt += 1) {
        const code = randomTeamCode();
        const taken = await client.query(`SELECT id FROM teams WHERE code = $1`, [code]);
        if (taken.rows[0]) {
          continue;
        }
        try {
          const inserted = await client.query<{ id: string }>(
            `INSERT INTO teams (code, name, location, member_count)
             VALUES ($1, $2, $3, 1)
             RETURNING id`,
            [code, name, location || null],
          );
          teamId = inserted.rows[0].id;
          break;
        } catch (error) {
          if (!isUniqueViolation(error)) {
            throw error;
          }
        }
      }
      if (!teamId) {
        await client.query("ROLLBACK");
        res.status(500).json({ error: "Could not assign a team code. Try again." });
        return;
      }

      await client.query(`INSERT INTO team_members (team_id, user_id) VALUES ($1, $2)`, [teamId, user.id]);
      await client.query(`UPDATE users SET team_id = $1 WHERE id = $2`, [teamId, user.id]);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    res.json(await accountPayload(user.id));
  });

  app.get("/api/boats", async (req, res) => {
    const user = await userFromRequest(req);
    if (!user) {
      res.status(401).json({ error: "Not signed in." });
      return;
    }
    const teamId = await teamIdFor(user.id);
    if (!teamId) {
      res.json({ boats: [] });
      return;
    }
    const result = await pool.query<BoatRow>(
      `SELECT id, name, coach_id, shell_type, notes FROM boats WHERE team_id = $1 ORDER BY created_at ASC`,
      [teamId],
    );
    const seats = await seatsByBoat(result.rows.map((boat) => boat.id));
    res.json({ boats: result.rows.map((boat) => presentBoat(boat, seats.get(boat.id) ?? [])) });
  });

  app.post("/api/boats", async (req, res) => {
    const user = await userFromRequest(req);
    if (!user) {
      res.status(401).json({ error: "Not signed in." });
      return;
    }
    if (user.role !== "coach") {
      res.status(403).json({ error: "Only coaches can add a boat." });
      return;
    }
    const input = readBoatInput(req.body);
    if (!input.ok) {
      res.status(input.status).json({ error: input.error });
      return;
    }
    const teamId = await teamIdFor(user.id);
    if (!teamId) {
      res.status(409).json({ error: "Create a team before adding a boat." });
      return;
    }
    const inserted = await pool.query<BoatRow>(
      `INSERT INTO boats (team_id, coach_id, name, shell_type, notes)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, coach_id, shell_type, notes`,
      [teamId, user.id, input.name, input.shellType, input.notes],
    );
    res.status(201).json(await savedBoat(inserted.rows[0]));
  });

  app.patch("/api/boats/:id", async (req, res) => {
    const user = await userFromRequest(req);
    if (!user) {
      res.status(401).json({ error: "Not signed in." });
      return;
    }
    if (user.role !== "coach") {
      res.status(403).json({ error: "Only coaches can edit a boat." });
      return;
    }
    const input = readBoatInput(req.body);
    if (!input.ok) {
      res.status(input.status).json({ error: input.error });
      return;
    }
    const teamId = await teamIdFor(user.id);
    if (!teamId) {
      res.status(409).json({ error: "Create a team before editing a boat." });
      return;
    }
    const updated = await pool.query<BoatRow>(
      `UPDATE boats
       SET name = $3, shell_type = $4, notes = $5
       WHERE id = $1 AND team_id = $2
       RETURNING id, name, coach_id, shell_type, notes`,
      [req.params.id, teamId, input.name, input.shellType, input.notes],
    );
    const boat = updated.rows[0];
    if (!boat) {
      res.status(404).json({ error: "That boat was not found." });
      return;
    }
    res.json(await savedBoat(boat));
  });

  app.patch("/api/boats/:id/seats", async (req, res) => {
    const user = await userFromRequest(req);
    if (!user) {
      res.status(401).json({ error: "Not signed in." });
      return;
    }
    if (user.role !== "coach") {
      res.status(403).json({ error: "Only coaches can edit a boat." });
      return;
    }
    const seat = Number(req.body?.seat);
    const name = String(req.body?.name ?? "").trim();
    if (!Number.isInteger(seat)) {
      res.status(400).json({ error: "Choose a seat." });
      return;
    }
    if (name.length > 80) {
      res.status(400).json({ error: "Keep the rower name under 80 characters." });
      return;
    }
    const teamId = await teamIdFor(user.id);
    if (!teamId) {
      res.status(409).json({ error: "Create a team before editing a boat." });
      return;
    }
    const updated = await pool.query(
      `UPDATE boat_seats
       SET rower_name = $3
       WHERE boat_id = $1
         AND seat_number = $2
         AND EXISTS (SELECT 1 FROM boats WHERE boats.id = $1 AND boats.team_id = $4)
       RETURNING seat_number`,
      [req.params.id, seat, name, teamId],
    );
    if (!updated.rows[0]) {
      res.status(404).json({ error: "That seat was not found." });
      return;
    }
    const seats = await seatsByBoat([req.params.id]);
    res.json({ seats: seats.get(req.params.id) ?? [] });
  });

  app.delete("/api/boats/:id", async (req, res) => {
    const user = await userFromRequest(req);
    if (!user) {
      res.status(401).json({ error: "Not signed in." });
      return;
    }
    if (user.role !== "coach") {
      res.status(403).json({ error: "Only coaches can delete a boat." });
      return;
    }
    const teamId = await teamIdFor(user.id);
    if (!teamId) {
      res.status(409).json({ error: "Create a team before deleting a boat." });
      return;
    }
    const removed = await pool.query(`DELETE FROM boats WHERE id = $1 AND team_id = $2 RETURNING id`, [
      req.params.id,
      teamId,
    ]);
    if (!removed.rows[0]) {
      res.status(404).json({ error: "That boat was not found." });
      return;
    }
    res.json({ ok: true });
  });

  app.get("/api/team/athletes", async (req, res) => {
    const user = await userFromRequest(req);
    if (!user) {
      res.status(401).json({ error: "Not signed in." });
      return;
    }
    if (user.role !== "coach") {
      res.status(403).json({ error: "Only coaches can view the team roster." });
      return;
    }
    const teamId = await teamIdFor(user.id);
    if (!teamId) {
      res.json({ athletes: [] });
      return;
    }
    const result = await pool.query<{ id: string; email: string; username: string | null }>(
      `SELECT users.id, users.email, users.username
       FROM users
       JOIN team_members ON team_members.user_id = users.id
       WHERE team_members.team_id = $1 AND users.role = 'athlete'
       ORDER BY COALESCE(users.username, users.email)`,
      [teamId],
    );
    res.json({
      athletes: result.rows.map((athlete) => ({
        id: athlete.id,
        email: athlete.email,
        username: athlete.username,
      })),
    });
  });

  app.get("/api/practice-sessions", async (req, res) => {
    const user = await userFromRequest(req);
    if (!user) {
      res.status(401).json({ error: "Not signed in." });
      return;
    }
    const result = await pool.query<{ id: string; mock_id: string; athlete_id: string | null; coach_id: string | null }>(
      `SELECT DISTINCT ON (mock_id) id, mock_id, athlete_id, coach_id
       FROM practice_sessions
       WHERE athlete_id = $1 OR coach_id = $1
       ORDER BY mock_id, created_at`,
      [user.id],
    );
    res.json({
      sessions: result.rows.map((row) => ({
        id: row.id,
        mockId: row.mock_id,
        athleteId: row.athlete_id,
        coachId: row.coach_id,
      })),
    });
  });

  app.get("/api/profile", async (req, res) => {
    const user = await userFromRequest(req);
    if (!user) {
      res.status(401).json({ error: "Not signed in." });
      return;
    }
    const [account, stats] = await Promise.all([
      pool.query<{ username: string | null; provider: string; has_password: boolean; created_at: Date }>(
        `SELECT username, provider, password_hash IS NOT NULL AS has_password, created_at
         FROM users WHERE id = $1`,
        [user.id],
      ),
      pool.query<{
        sessions: number;
        meters: number;
        duration_s: number;
        strokes: number;
        avg_power: number;
        max_power: number;
      }>(
        `SELECT
           COUNT(*)::int AS sessions,
           COALESCE(SUM(practice_sessions.distance_m), 0)::int AS meters,
           COALESCE(SUM(practice_sessions.duration_s), 0)::int AS duration_s,
           COALESCE(SUM(session_metrics.stroke_count), 0)::int AS strokes,
           COALESCE(
             SUM(session_metrics.avg_power_w * session_metrics.duration_s)
               / NULLIF(SUM(session_metrics.duration_s), 0),
             0
           ) AS avg_power,
           COALESCE(MAX(session_metrics.max_power_w), 0) AS max_power
         FROM practice_sessions
         LEFT JOIN session_metrics
           ON session_metrics.session_id = practice_sessions.id
          AND session_metrics.user_id = practice_sessions.athlete_id
         WHERE practice_sessions.athlete_id = $1 OR practice_sessions.coach_id = $1`,
        [user.id],
      ),
    ]);
    const row = account.rows[0];
    const summary = stats.rows[0];
    res.json({
      ...(await accountPayload(user.id)),
      username: row?.username ?? null,
      provider: row?.provider ?? "password",
      hasPassword: row?.has_password ?? false,
      memberSince: row?.created_at ?? null,
      stats: {
        sessions: summary?.sessions ?? 0,
        meters: summary?.meters ?? 0,
        durationS: summary?.duration_s ?? 0,
        strokes: summary?.strokes ?? 0,
        avgPowerW: Math.round(summary?.avg_power ?? 0),
        maxPowerW: Math.round(summary?.max_power ?? 0),
      },
    });
  });

  app.patch("/api/profile", async (req, res) => {
    const user = await userFromRequest(req);
    if (!user) {
      res.status(401).json({ error: "Not signed in." });
      return;
    }
    const username = String(req.body?.username ?? "").trim().toLowerCase();
    if (!/^[a-z0-9_]{3,24}$/.test(username)) {
      res.status(400).json({ error: "Use 3–24 letters, numbers, or underscores." });
      return;
    }
    try {
      await pool.query(`UPDATE users SET username = $2 WHERE id = $1`, [user.id, username]);
    } catch (error) {
      if (isUniqueViolation(error)) {
        res.status(409).json({ error: "That username is already taken." });
        return;
      }
      throw error;
    }
    res.json(await accountPayload(user.id));
  });

  app.patch("/api/profile/password", async (req, res) => {
    const user = await userFromRequest(req);
    if (!user) {
      res.status(401).json({ error: "Not signed in." });
      return;
    }
    const current = String(req.body?.current ?? "");
    const next = String(req.body?.next ?? "");
    const stored = await pool.query<{ password_hash: string | null }>(
      `SELECT password_hash FROM users WHERE id = $1`,
      [user.id],
    );
    const hash = stored.rows[0]?.password_hash;
    if (!hash) {
      res.status(400).json({ error: "This account signs in with Google." });
      return;
    }
    if (!(await passwordMatches(current, hash))) {
      res.status(401).json({ error: "Current password is incorrect." });
      return;
    }
    const problems = passwordProblems(next);
    if (problems.length > 0) {
      res.status(400).json({ error: problems[0] });
      return;
    }
    await pool.query(`UPDATE users SET password_hash = $2 WHERE id = $1`, [user.id, await hashPassword(next)]);
    res.json({ ok: true });
  });

  app.get("/api/settings", async (req, res) => {
    const user = await userFromRequest(req);
    if (!user) {
      res.status(401).json({ error: "Not signed in." });
      return;
    }
    await pool.query(
      `INSERT INTO user_settings (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`,
      [user.id],
    );
    const result = await pool.query<{ distance_unit: string; session_email: boolean; weekly_summary: boolean }>(
      `SELECT distance_unit, session_email, weekly_summary FROM user_settings WHERE user_id = $1`,
      [user.id],
    );
    const row = result.rows[0];
    res.json({
      distanceUnit: row?.distance_unit === "kilometers" ? "kilometers" : "meters",
      sessionEmail: row?.session_email ?? true,
      weeklySummary: row?.weekly_summary ?? false,
    });
  });

  app.patch("/api/settings", async (req, res) => {
    const user = await userFromRequest(req);
    if (!user) {
      res.status(401).json({ error: "Not signed in." });
      return;
    }
    const distanceUnit = String(req.body?.distanceUnit ?? "");
    const sessionEmail = req.body?.sessionEmail;
    const weeklySummary = req.body?.weeklySummary;
    if (distanceUnit !== "meters" && distanceUnit !== "kilometers") {
      res.status(400).json({ error: "Choose meters or kilometers." });
      return;
    }
    if (typeof sessionEmail !== "boolean" || typeof weeklySummary !== "boolean") {
      res.status(400).json({ error: "Choose the email settings." });
      return;
    }
    await pool.query(
      `INSERT INTO user_settings (user_id, distance_unit, session_email, weekly_summary)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id) DO UPDATE
       SET distance_unit = EXCLUDED.distance_unit,
           session_email = EXCLUDED.session_email,
           weekly_summary = EXCLUDED.weekly_summary`,
      [user.id, distanceUnit, sessionEmail, weeklySummary],
    );
    res.json({ distanceUnit, sessionEmail, weeklySummary });
  });

  app.post("/api/support", async (req, res) => {
    const user = await userFromRequest(req);
    if (!user) {
      res.status(401).json({ error: "Not signed in." });
      return;
    }
    const header = String(req.body?.header ?? "").trim();
    const text = String(req.body?.text ?? "").trim();
    if (!header || header.length > 160) {
      res.status(400).json({ error: "Add a header of 160 characters or fewer." });
      return;
    }
    if (!text || text.length > 4000) {
      res.status(400).json({ error: "Write the inquiry in 4,000 characters or fewer." });
      return;
    }
    await pool.query(`INSERT INTO customer_service (user_id, header, text) VALUES ($1, $2, $3)`, [user.id, header, text]);
    res.json({ ok: true });
  });
}

async function teamIdFor(userId: string) {
  const result = await pool.query<{ team_id: string | null }>(`SELECT team_id FROM users WHERE id = $1`, [userId]);
  return result.rows[0]?.team_id ?? null;
}

const teamCodeAlphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

function randomTeamCode() {
  return Array.from({ length: 4 }, () => teamCodeAlphabet[randomInt(teamCodeAlphabet.length)]).join("");
}

function isUniqueViolation(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}

export async function seedMockAccounts() {
  const password = await hashPassword("Password123");
  const accounts = [
    { username: "testathlete", email: "testathlete@impulse.local", role: "athlete" },
    { username: "testcoach", email: "testcoach@impulse.local", role: "coach" },
  ];
  for (const account of accounts) {
    await pool.query(
      `INSERT INTO users (email, username, password_hash, email_verified, provider, role)
       VALUES ($1, $2, $3, true, 'password', $4)
       ON CONFLICT (email) DO UPDATE
       SET username = EXCLUDED.username,
           password_hash = EXCLUDED.password_hash,
           email_verified = true,
           role = EXCLUDED.role`,
      [account.email, account.username, password, account.role],
    );
  }

  const ids = await pool.query<{ id: string; username: string }>(
    `SELECT id, username FROM users WHERE username IN ('testathlete', 'testcoach')`,
  );
  const athleteId = ids.rows.find((row) => row.username === "testathlete")?.id;
  const coachId = ids.rows.find((row) => row.username === "testcoach")?.id;
  if (!athleteId) {
    return;
  }
  const links = [
    { mockId: "now", coachId: coachId ?? null, distanceM: 1624, durationS: 42 * 60 },
    { mockId: "ut1", coachId: null, distanceM: 12400, durationS: 58 * 60 },
  ];
  for (const link of links) {
    await pool.query(
      `INSERT INTO practice_sessions (mock_id, athlete_id, coach_id, distance_m, duration_s)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (mock_id, athlete_id) WHERE athlete_id IS NOT NULL
       DO UPDATE SET coach_id = EXCLUDED.coach_id,
                     distance_m = EXCLUDED.distance_m,
                     duration_s = EXCLUDED.duration_s`,
      [link.mockId, athleteId, link.coachId, link.distanceM, link.durationS],
    );
  }
}

const SHELL_TYPES = ["8+", "4+", "4-", "2-"] as const;
type ShellType = (typeof SHELL_TYPES)[number];

type BoatRow = {
  id: string;
  name: string;
  coach_id: string;
  shell_type: string;
  notes: string | null;
};

function seatsForShell(shell: string) {
  if (shell === "4+" || shell === "4-") {
    return 4;
  }
  if (shell === "2-") {
    return 2;
  }
  return 8;
}

function presentBoat(boat: BoatRow, seats: Array<{ number: number; name: string }>) {
  return {
    id: boat.id,
    name: boat.name,
    coachId: boat.coach_id,
    shellType: boat.shell_type,
    notes: boat.notes ?? "",
    seats,
  };
}

async function seatsByBoat(boatIds: string[]) {
  const grouped = new Map<string, Array<{ number: number; name: string }>>();
  if (boatIds.length === 0) {
    return grouped;
  }
  const result = await pool.query<{ boat_id: string; seat_number: number; rower_name: string }>(
    `SELECT boat_id, seat_number, rower_name
     FROM boat_seats
     WHERE boat_id = ANY($1::uuid[])
     ORDER BY seat_number ASC`,
    [boatIds],
  );
  for (const row of result.rows) {
    const seats = grouped.get(row.boat_id) ?? [];
    seats.push({ number: row.seat_number, name: row.rower_name });
    grouped.set(row.boat_id, seats);
  }
  return grouped;
}

async function syncBoatSeats(boatId: string, shell: string) {
  const count = seatsForShell(shell);
  await pool.query(`DELETE FROM boat_seats WHERE boat_id = $1 AND seat_number > $2`, [boatId, count]);
  await pool.query(
    `INSERT INTO boat_seats (boat_id, seat_number, rower_name)
     SELECT $1, seat.n, ''
     FROM generate_series(1, $2) AS seat(n)
     ON CONFLICT (boat_id, seat_number) DO NOTHING`,
    [boatId, count],
  );
}

async function savedBoat(boat: BoatRow) {
  await syncBoatSeats(boat.id, boat.shell_type);
  const seats = await seatsByBoat([boat.id]);
  return presentBoat(boat, seats.get(boat.id) ?? []);
}

function readBoatInput(body: { name?: unknown; shellType?: unknown; notes?: unknown }) {
  const name = String(body?.name ?? "").trim();
  const shellType = String(body?.shellType ?? "").trim();
  const notes = String(body?.notes ?? "").trim();
  if (!name) {
    return { ok: false as const, status: 400, error: "Enter a boat name." };
  }
  if (name.length > 80) {
    return { ok: false as const, status: 400, error: "Keep the boat name under 80 characters." };
  }
  if (!SHELL_TYPES.includes(shellType as ShellType)) {
    return { ok: false as const, status: 400, error: "Choose a boat type: 8+, 4+, 4-, or 2-." };
  }
  if (notes.length > 500) {
    return { ok: false as const, status: 400, error: "Keep notes under 500 characters." };
  }
  return { ok: true as const, name, shellType, notes: notes || null };
}

async function accountPayload(userId: string) {
  const result = await pool.query<{
    id: string;
    email: string;
    username: string | null;
    role: "athlete" | "coach" | null;
    team_id: string | null;
    code: string | null;
    name: string | null;
    location: string | null;
    member_count: number | null;
  }>(
    `SELECT users.id, users.email, users.username, users.role, users.team_id, teams.code, teams.name, teams.location, teams.member_count
     FROM users
     LEFT JOIN teams ON teams.id = users.team_id
     WHERE users.id = $1`,
    [userId],
  );
  const row = result.rows[0];
  return {
    userId: row.id,
    email: row.email,
    username: row.username,
    role: row.role,
    team: row.team_id
      ? {
          id: row.team_id,
          code: row.code,
          name: row.name,
          location: row.location,
          memberCount: row.member_count,
        }
      : null,
  };
}
