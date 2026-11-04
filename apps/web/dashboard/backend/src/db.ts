import pg from "pg";
import "./env.js";

// Local development: Postgres.app PostgreSQL 18.
// DATABASE_URL, when set, is the production or AWS connection and replaces these settings.
const localConfig: pg.PoolConfig = {
  host: "localhost",
  port: 5432,
  database: "impulse",
  user: "ethanxia",
};

if (process.env.PGPASSWORD) {
  localConfig.password = process.env.PGPASSWORD;
}

export const pool = new pg.Pool(
  process.env.DATABASE_URL ? { connectionString: process.env.DATABASE_URL } : localConfig,
);

export async function migrate() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      email text NOT NULL UNIQUE,
      password_hash text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token_hash text PRIMARY KEY,
      user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
      expires_at timestamptz NOT NULL
    );

    ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified boolean NOT NULL DEFAULT false;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'password';
    ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;

    CREATE TABLE IF NOT EXISTS email_codes (
      email text PRIMARY KEY,
      code_hash text NOT NULL,
      expires_at timestamptz NOT NULL,
      attempts integer NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS oauth_states (
      state text PRIMARY KEY,
      provider text NOT NULL,
      expires_at timestamptz NOT NULL
    );

    ALTER TABLE users ADD COLUMN IF NOT EXISTS username text;
    CREATE UNIQUE INDEX IF NOT EXISTS users_username_key ON users (username);

    ALTER TABLE users ADD COLUMN IF NOT EXISTS role text;
    ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
    ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IS NULL OR role IN ('athlete', 'coach'));

    CREATE TABLE IF NOT EXISTS teams (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      code text NOT NULL UNIQUE,
      member_count integer NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    ALTER TABLE teams ADD COLUMN IF NOT EXISTS name text;
    ALTER TABLE teams ADD COLUMN IF NOT EXISTS location text;

    ALTER TABLE users ADD COLUMN IF NOT EXISTS team_id uuid REFERENCES teams (id) ON DELETE SET NULL;

    CREATE TABLE IF NOT EXISTS team_members (
      team_id uuid NOT NULL REFERENCES teams (id) ON DELETE CASCADE,
      user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
      joined_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (team_id, user_id)
    );

    CREATE UNIQUE INDEX IF NOT EXISTS team_members_user_id_key ON team_members (user_id);

    CREATE TABLE IF NOT EXISTS boats (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      team_id uuid NOT NULL REFERENCES teams (id) ON DELETE CASCADE,
      coach_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
      name text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS boats_team_id_idx ON boats (team_id);

    ALTER TABLE boats ADD COLUMN IF NOT EXISTS shell_type text NOT NULL DEFAULT '8+';
    ALTER TABLE boats ADD COLUMN IF NOT EXISTS notes text;

    DO $$ BEGIN
      ALTER TABLE boats ADD CONSTRAINT boats_shell_type_check
        CHECK (shell_type IN ('8+', '4+', '4-', '2-'));
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$;

    CREATE TABLE IF NOT EXISTS boat_seats (
      boat_id uuid NOT NULL REFERENCES boats (id) ON DELETE CASCADE,
      seat_number integer NOT NULL CHECK (seat_number BETWEEN 1 AND 8),
      rower_name text NOT NULL DEFAULT '',
      PRIMARY KEY (boat_id, seat_number)
    );

    INSERT INTO boat_seats (boat_id, seat_number, rower_name)
    SELECT boats.id, seat.n, ''
    FROM boats
    CROSS JOIN LATERAL generate_series(
      1,
      CASE boats.shell_type
        WHEN '2-' THEN 2
        WHEN '4+' THEN 4
        WHEN '4-' THEN 4
        ELSE 8
      END
    ) AS seat(n)
    ON CONFLICT (boat_id, seat_number) DO NOTHING;

    CREATE TABLE IF NOT EXISTS practice_sessions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      mock_id text NOT NULL,
      athlete_id uuid REFERENCES users (id) ON DELETE CASCADE,
      coach_id uuid REFERENCES users (id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE UNIQUE INDEX IF NOT EXISTS practice_sessions_mock_athlete_key
      ON practice_sessions (mock_id, athlete_id)
      WHERE athlete_id IS NOT NULL;

    ALTER TABLE practice_sessions ADD COLUMN IF NOT EXISTS distance_m integer;
    ALTER TABLE practice_sessions ADD COLUMN IF NOT EXISTS duration_s integer;

    CREATE TABLE IF NOT EXISTS user_settings (
      user_id uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
      distance_unit text NOT NULL DEFAULT 'meters',
      session_email boolean NOT NULL DEFAULT true,
      weekly_summary boolean NOT NULL DEFAULT false
    );

    DO $$ BEGIN
      ALTER TABLE user_settings ADD CONSTRAINT user_settings_distance_unit_check
        CHECK (distance_unit IN ('meters', 'kilometers'));
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$;

    -- Append-only sensor stream. session_id + sampled_at is the lookup for a piece.
    CREATE TABLE IF NOT EXISTS raw_sensor_data (
      id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      session_id uuid NOT NULL REFERENCES practice_sessions (id) ON DELETE CASCADE,
      user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
      sampled_at timestamptz NOT NULL,
      strain_raw integer NOT NULL,
      footboard_raw integer NOT NULL,
      encoder_counts integer NOT NULL,
      UNIQUE (session_id, sampled_at)
    );

    CREATE INDEX IF NOT EXISTS raw_sensor_data_user_time_idx
      ON raw_sensor_data (user_id, sampled_at);

    CREATE TABLE IF NOT EXISTS telemetry (
      id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      session_id uuid NOT NULL REFERENCES practice_sessions (id) ON DELETE CASCADE,
      user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
      sampled_at timestamptz NOT NULL,
      power double precision NOT NULL,
      force double precision NOT NULL,
      oar_angle double precision NOT NULL,
      angular_velocity double precision NOT NULL,
      UNIQUE (session_id, sampled_at)
    );

    CREATE INDEX IF NOT EXISTS telemetry_user_time_idx
      ON telemetry (user_id, sampled_at);

    CREATE TABLE IF NOT EXISTS customer_service (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
      created_at timestamptz NOT NULL DEFAULT now(),
      header text NOT NULL,
      text text NOT NULL
    );

    CREATE INDEX IF NOT EXISTS customer_service_user_time_idx
      ON customer_service (user_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS session_metrics (
      session_id uuid NOT NULL REFERENCES practice_sessions (id) ON DELETE CASCADE,
      user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
      sample_count integer NOT NULL,
      duration_s integer NOT NULL,
      avg_power_w double precision NOT NULL,
      max_power_w double precision NOT NULL,
      avg_force_n double precision NOT NULL,
      max_force_n double precision NOT NULL,
      avg_footboard_n double precision NOT NULL,
      stroke_count integer NOT NULL,
      avg_stroke_rate double precision NOT NULL,
      PRIMARY KEY (session_id, user_id)
    );
  `);
}
