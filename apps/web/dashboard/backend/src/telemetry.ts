import type { Express } from "express";
import { pool } from "./db.js";
import { userFromRequest } from "./session.js";

const uuidShape = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function registerTelemetry(app: Express) {
  app.get("/api/telemetry", async (req, res) => {
    const user = await userFromRequest(req);
    if (!user) {
      res.status(401).json({ error: "Not signed in." });
      return;
    }

    const requested = String(req.query.sessionId ?? "").trim();
    if (requested && !uuidShape.test(requested)) {
      res.status(400).json({ error: "Choose a session." });
      return;
    }

    const session = await pool.query<{ id: string }>(
      requested
        ? `SELECT id
           FROM practice_sessions
           WHERE id = $1 AND (athlete_id = $2 OR coach_id = $2)`
        : `SELECT practice_sessions.id
           FROM practice_sessions
           JOIN telemetry ON telemetry.session_id = practice_sessions.id
           WHERE practice_sessions.athlete_id = $1 OR practice_sessions.coach_id = $1
           GROUP BY practice_sessions.id, practice_sessions.created_at
           ORDER BY practice_sessions.created_at DESC
           LIMIT 1`,
      requested ? [requested, user.id] : [user.id],
    );
    const sessionId = session.rows[0]?.id;
    if (!sessionId) {
      res.json({ sessionId: null, points: [], metrics: null });
      return;
    }

    const [series, samples, metrics] = await Promise.all([
      pool.query<{ second: number; power: number }>(
        `SELECT
           FLOOR(EXTRACT(EPOCH FROM (telemetry.sampled_at - bounds.started)))::int AS second,
           ROUND(AVG(telemetry.power))::int AS power
         FROM telemetry
         CROSS JOIN (
           SELECT MIN(sampled_at) AS started
           FROM telemetry
           WHERE session_id = $1
         ) AS bounds
         WHERE telemetry.session_id = $1
         GROUP BY 1
         ORDER BY 1`,
        [sessionId],
      ),
      pool.query<{ t: number; force: number; angle: number; footboard: number }>(
        `SELECT
           ROUND(EXTRACT(EPOCH FROM (telemetry.sampled_at - bounds.started))::numeric, 1)::float8 AS t,
           ROUND(telemetry.force)::float8 AS force,
           ROUND(telemetry.oar_angle::numeric, 1)::float8 AS angle,
           ROUND(GREATEST(0, (raw_sensor_data.footboard_raw - 32768)::float8 / 8000000.0 * 180000.0))::float8 AS footboard
         FROM telemetry
         JOIN raw_sensor_data
           ON raw_sensor_data.session_id = telemetry.session_id
          AND raw_sensor_data.sampled_at = telemetry.sampled_at
         CROSS JOIN (
           SELECT MIN(sampled_at) AS started
           FROM telemetry
           WHERE session_id = $1
         ) AS bounds
         WHERE telemetry.session_id = $1
         ORDER BY telemetry.sampled_at`,
        [sessionId],
      ),
      pool.query<{
        sample_count: number;
        duration_s: number;
        avg_power_w: number;
        max_power_w: number;
        avg_force_n: number;
        max_force_n: number;
        avg_footboard_n: number;
        stroke_count: number;
        avg_stroke_rate: number;
      }>(
        `SELECT sample_count, duration_s, avg_power_w, max_power_w, avg_force_n, max_force_n,
                avg_footboard_n, stroke_count, avg_stroke_rate
         FROM session_metrics
         WHERE session_id = $1`,
        [sessionId],
      ),
    ]);

    const summary = metrics.rows[0];
    res.json({
      sessionId,
      points: series.rows.map((row) => [row.second, row.power]),
      samples: samples.rows.map((row) => [row.t, row.force, row.angle, row.footboard]),
      metrics: summary
        ? {
            sampleCount: summary.sample_count,
            durationS: summary.duration_s,
            avgPowerW: Math.round(summary.avg_power_w),
            maxPowerW: Math.round(summary.max_power_w),
            avgForceN: Math.round(summary.avg_force_n),
            maxForceN: Math.round(summary.max_force_n),
            avgFootboardN: Math.round(summary.avg_footboard_n),
            strokeCount: summary.stroke_count,
            avgStrokeRate: Math.round(summary.avg_stroke_rate * 10) / 10,
          }
        : null,
    });
  });
}
