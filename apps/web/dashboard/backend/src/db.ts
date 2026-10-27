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
  `);
}
