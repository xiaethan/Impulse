"""Turn raw oar samples into telemetry and session metrics.

Raw rows are the sensor readings: strain-gauge ADC, footboard load-cell ADC,
and hall-effect encoder counts. process_sample converts one reading into
force, angular velocity, and power. Samples have to be processed in time
order because angular velocity is the change in oar angle.
"""

from __future__ import annotations

import math
import os
import random
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import psycopg

SAMPLE_HZ = 5
DURATION_S = 40 * 60
SAMPLE_COUNT = SAMPLE_HZ * DURATION_S
ADC_ZERO = 32768
COUNTS_PER_STRAIN = 8_000_000
COUNTS_PER_REV = 4096
INBOARD_M = 0.42
DRIVE_FORCE_N = 280
RECOVERY_FORCE_N = 70

CALIBRATION = {
    "n_per_strain": 300_000,
    "tare_n": 0.0,
}
FOOTBOARD_N_PER_STRAIN = 180_000


def convert_adc_to_strain(strain_raw: int) -> float:
    return (strain_raw - ADC_ZERO) / COUNTS_PER_STRAIN


def convert_strain_to_force(strain: float, calibration: dict) -> float:
    return max(0.0, strain * calibration["n_per_strain"] - calibration.get("tare_n", 0.0))


def calculate_angular_velocity(angle: float, timestamp: float) -> float:
    """Degrees per second since the previous sample. The first sample is 0."""
    previous = getattr(calculate_angular_velocity, "previous", None)
    calculate_angular_velocity.previous = (angle, timestamp)
    if previous is None:
        return 0.0
    previous_angle, previous_time = previous
    dt = timestamp - previous_time
    if dt <= 0:
        return 0.0
    delta = (angle - previous_angle + 180.0) % 360.0 - 180.0
    return delta / dt


def calculate_power(force: float, angular_velocity: float) -> float:
    """Watts from gate force and oar angular velocity (degrees per second)."""
    omega = angular_velocity * math.pi / 180.0
    return max(0.0, force * INBOARD_M * omega)


def process_sample(raw_sample: dict, calibration: dict) -> dict:
    strain = convert_adc_to_strain(raw_sample["strain_raw"])
    force = convert_strain_to_force(strain, calibration)
    angular_velocity = calculate_angular_velocity(raw_sample["angle"], raw_sample["timestamp"])
    power = calculate_power(force, angular_velocity)
    return {
        "force_n": force,
        "angular_velocity": angular_velocity,
        "power_w": power,
    }


def reset_processor() -> None:
    calculate_angular_velocity.previous = None


def angle_from_counts(counts: int) -> float:
    return (counts % COUNTS_PER_REV) / COUNTS_PER_REV * 360.0 - 180.0


def counts_from_angle(angle: float) -> int:
    return int(round((angle + 180.0) / 360.0 * COUNTS_PER_REV))


def footboard_force(footboard_raw: int) -> float:
    strain = (footboard_raw - ADC_ZERO) / COUNTS_PER_STRAIN
    return max(0.0, strain * FOOTBOARD_N_PER_STRAIN)


def generate_raw(start: datetime) -> list[tuple]:
    """Five samples a second for 40 minutes, shaped like 2 x 20' with a short rest."""
    rng = random.Random(7)
    phase = 0.0
    rows = []
    for index in range(SAMPLE_COUNT):
        t = index / SAMPLE_HZ
        minute = t / 60.0
        resting = 19.0 <= minute < 20.0
        if resting:
            angle = -50.0 + 3.0 * math.sin(t)
            force = 8.0
        else:
            rate = 27.0 + 3.0 * math.sin(t / 140.0) + 1.1 * math.sin(t / 17.0)
            phase = (phase + (rate / 60.0) / SAMPLE_HZ) % 1.0
            drive = 0.40
            if phase < drive:
                u = phase / drive
                shape = math.sin(math.pi * u) ** 1.15
                angle = -56.0 + 98.0 * u
                scale = 0.9 + 0.1 * math.sin(t / 95.0)
                wobble = 0.9 + 0.1 * math.sin(index / 11.0)
                force = shape * (1040.0 + 160.0 * math.sin(t / 80.0)) * scale * wobble
            else:
                u = (phase - drive) / (1.0 - drive)
                angle = 42.0 - 98.0 * u
                force = 18.0 + 12.0 * math.sin(u * math.pi)
        force = max(0.0, force + rng.uniform(-18.0, 18.0))
        strain = force / CALIBRATION["n_per_strain"]
        strain_raw = int(round(ADC_ZERO + strain * COUNTS_PER_STRAIN + rng.uniform(-40, 40)))
        footboard = force * 0.52 + (30.0 if not resting else 6.0)
        footboard_raw = int(round(ADC_ZERO + (footboard / FOOTBOARD_N_PER_STRAIN) * COUNTS_PER_STRAIN))
        sampled_at = start + timedelta(seconds=t)
        rows.append((sampled_at, strain_raw, footboard_raw, counts_from_angle(angle)))
    return rows


def connect():
    url = os.environ.get("DATABASE_URL")
    if url:
        return psycopg.connect(url)
    return psycopg.connect(
        host="localhost",
        port=5432,
        dbname="impulse",
        user="ethanxia",
        password=os.environ.get("PGPASSWORD"),
    )


def find_athlete_session(conn) -> tuple[str, str]:
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT practice_sessions.id, users.id
            FROM users
            JOIN practice_sessions
              ON practice_sessions.athlete_id = users.id
             AND practice_sessions.mock_id = 'now'
            WHERE users.username = 'testathlete'
            """
        )
        row = cur.fetchone()
    if row is None:
        raise SystemExit("testathlete has no practice session with mock_id 'now'. Start the API once so the mock accounts exist.")
    return row[0], row[1]


def process_rows(samples: list[tuple]) -> tuple[list[tuple], dict]:
    reset_processor()
    telemetry = []
    power_sum = 0.0
    force_sum = 0.0
    footboard_sum = 0.0
    max_power = 0.0
    max_force = 0.0
    strokes = 0
    in_drive = False
    for sampled_at, strain_raw, footboard_raw, encoder_counts, user_id, session_id in samples:
        timestamp = sampled_at.timestamp()
        angle = angle_from_counts(encoder_counts)
        processed = process_sample(
            {"strain_raw": strain_raw, "angle": angle, "timestamp": timestamp},
            CALIBRATION,
        )
        board = footboard_force(footboard_raw)
        power = processed["power_w"]
        force = processed["force_n"]
        power_sum += power
        force_sum += force
        footboard_sum += board
        max_power = max(max_power, power)
        max_force = max(max_force, force)
        if force > DRIVE_FORCE_N and not in_drive:
            in_drive = True
            strokes += 1
        elif force < RECOVERY_FORCE_N:
            in_drive = False
        telemetry.append(
            (
                session_id,
                user_id,
                sampled_at,
                power,
                force,
                angle,
                processed["angular_velocity"],
            )
        )
    count = len(telemetry)
    duration_s = DURATION_S if count == SAMPLE_COUNT else max(1, round((count - 1) / SAMPLE_HZ))
    metrics = {
        "sample_count": count,
        "duration_s": duration_s,
        "avg_power_w": power_sum / count if count else 0,
        "max_power_w": max_power,
        "avg_force_n": force_sum / count if count else 0,
        "max_force_n": max_force,
        "avg_footboard_n": footboard_sum / count if count else 0,
        "stroke_count": strokes,
        "avg_stroke_rate": strokes / (duration_s / 60) if duration_s else 0,
    }
    return telemetry, metrics


def main() -> None:
    start = datetime(2026, 10, 30, 5, 12, tzinfo=ZoneInfo("America/New_York"))
    with connect() as conn:
        session_id, user_id = find_athlete_session(conn)
        with conn.cursor() as cur:
            cur.execute("SELECT count(*) FROM raw_sensor_data WHERE session_id = %s", (session_id,))
            raw_count = cur.fetchone()[0]
            if raw_count == 0:
                rows = generate_raw(start)
                with cur.copy(
                    "COPY raw_sensor_data (sampled_at, strain_raw, footboard_raw, encoder_counts, user_id, session_id) FROM STDIN"
                ) as copy:
                    for sampled_at, strain_raw, footboard_raw, encoder_counts in rows:
                        copy.write_row((sampled_at, strain_raw, footboard_raw, encoder_counts, user_id, session_id))
                raw_count = len(rows)
            cur.execute("SELECT count(*) FROM telemetry WHERE session_id = %s", (session_id,))
            telemetry_count = cur.fetchone()[0]
        if telemetry_count == raw_count and raw_count > 0:
            print(f"session {session_id} already has {raw_count} raw samples and telemetry")
            return

        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT sampled_at, strain_raw, footboard_raw, encoder_counts, user_id, session_id
                FROM raw_sensor_data
                WHERE session_id = %s
                ORDER BY sampled_at
                """,
                (session_id,),
            )
            samples = cur.fetchall()
        telemetry, metrics = process_rows(samples)
        with conn.cursor() as cur:
            cur.execute("DELETE FROM telemetry WHERE session_id = %s", (session_id,))
            cur.execute("DELETE FROM session_metrics WHERE session_id = %s", (session_id,))
            with cur.copy(
                "COPY telemetry (session_id, user_id, sampled_at, power, force, oar_angle, angular_velocity) FROM STDIN"
            ) as copy:
                for row in telemetry:
                    copy.write_row(row)
            cur.execute(
                """
                INSERT INTO session_metrics (
                  session_id, user_id, sample_count, duration_s, avg_power_w, max_power_w,
                  avg_force_n, max_force_n, avg_footboard_n, stroke_count, avg_stroke_rate
                )
                VALUES (%(session_id)s, %(user_id)s, %(sample_count)s, %(duration_s)s, %(avg_power_w)s,
                        %(max_power_w)s, %(avg_force_n)s, %(max_force_n)s, %(avg_footboard_n)s,
                        %(stroke_count)s, %(avg_stroke_rate)s)
                """,
                {"session_id": session_id, "user_id": user_id, **metrics},
            )
        conn.commit()
        print(
            f"processed {metrics['sample_count']} samples for session {session_id}: "
            f"avg {metrics['avg_power_w']:.0f} W, max {metrics['max_power_w']:.0f} W, "
            f"{metrics['stroke_count']} strokes, {metrics['avg_stroke_rate']:.1f} spm"
        )


if __name__ == "__main__":
    main()
