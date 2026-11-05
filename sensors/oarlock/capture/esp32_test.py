#!/usr/bin/env python3
"""Start the oarlock serial monitor and store each raw sample.

Run from anywhere:

    python3 sensors/oarlock/capture/esp32_test.py
    python3 sensors/oarlock/capture/esp32_test.py --seconds 30

This also opens visualize.py on the newest samples. Ctrl+C stops the
monitor and the chart, and leaves the rows already written.
"""

from __future__ import annotations

import argparse
import os
import pty
import select
import shutil
import signal
import subprocess
import sys
from pathlib import Path

import psycopg

OARLOCK = Path(__file__).resolve().parents[1]
BAUD = "115200"

CREATE_TABLE = """
CREATE TABLE IF NOT EXISTS esp32_test (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  raw_value integer NOT NULL
)
"""

CREATE_INDEX = """
CREATE INDEX IF NOT EXISTS esp32_test_recorded_at_idx
  ON esp32_test (recorded_at DESC)
"""

INSERT = "INSERT INTO esp32_test (raw_value) VALUES (%s)"


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


def pio_command() -> list[str]:
    pio = shutil.which("pio")
    if pio is None:
        bundled = Path.home() / ".platformio" / "penv" / "bin" / "pio"
        if bundled.is_file():
            pio = str(bundled)
    if pio is None:
        sys.exit("pio was not found. Install PlatformIO or add it to PATH.")
    return [
        pio,
        "device",
        "monitor",
        "--quiet",
        "--baud",
        BAUD,
        "--filter",
        "direct",
    ]


def sample_value(line: str) -> int | None:
    text = line.strip()
    if not text or text in {"-", "+"}:
        return None
    sign = text[1:] if text[0] in "+-" else text
    if not sign.isdigit():
        return None
    return int(text)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Log oarlock samples into esp32_test.")
    parser.add_argument(
        "--seconds",
        type=float,
        default=None,
        help="chart window in seconds (visualize.py default is 15)",
    )
    parser.add_argument(
        "--no-chart",
        action="store_true",
        help="log samples without opening the chart",
    )
    args = parser.parse_args()
    if args.seconds is not None and args.seconds <= 0:
        parser.error("--seconds must be greater than 0")
    return args


def start_chart(seconds: float | None) -> subprocess.Popen[bytes]:
    script = Path(__file__).resolve().parent / "visualize.py"
    command = [sys.executable, str(script)]
    if seconds is not None:
        command.extend(["--seconds", str(seconds)])
    return subprocess.Popen(command, start_new_session=True)


def kill_process(proc: subprocess.Popen[bytes] | None) -> None:
    """Stop a session leader. SIGTERM is not enough: the serial monitor
    swallows it, and the chart window ignores it."""
    if proc is None or proc.poll() is not None:
        return
    try:
        os.killpg(proc.pid, signal.SIGKILL)
    except OSError:
        try:
            proc.kill()
        except OSError:
            return
    try:
        proc.wait(timeout=2)
    except subprocess.TimeoutExpired:
        pass


def main() -> None:
    args = parse_args()
    with connect() as conn:
        conn.autocommit = True
        with conn.cursor() as cur:
            cur.execute(CREATE_TABLE)
            cur.execute(CREATE_INDEX)

        chart: subprocess.Popen[bytes] | None = None
        monitor: subprocess.Popen[bytes] | None = None
        master = -1
        stopping = False
        pending = b""
        stored = 0

        def request_stop(signum, _frame) -> None:
            nonlocal stopping
            if stopping:
                return
            stopping = True
            signal.signal(signal.SIGINT, signal.SIG_IGN)
            signal.signal(signal.SIGTERM, signal.SIG_IGN)
            signal.signal(signal.SIGHUP, signal.SIG_IGN)
            kill_process(chart)
            kill_process(monitor)

        signal.signal(signal.SIGINT, request_stop)
        signal.signal(signal.SIGTERM, request_stop)
        signal.signal(signal.SIGHUP, request_stop)

        try:
            if not args.no_chart:
                chart = start_chart(args.seconds)
            master, slave = pty.openpty()
            monitor = subprocess.Popen(
                pio_command(),
                cwd=OARLOCK,
                stdin=slave,
                stdout=slave,
                stderr=slave,
                start_new_session=True,
            )
            os.close(slave)
            print(f"Logging samples from the oarlock into esp32_test ({BAUD} baud).", flush=True)
            print("Press Ctrl+C to stop the monitor and the chart.", flush=True)
            while not stopping and monitor.poll() is None:
                ready, _, _ = select.select([master], [], [], 0.5)
                if stopping or not ready:
                    continue
                try:
                    chunk = os.read(master, 4096)
                except OSError:
                    break
                if not chunk:
                    break
                pending += chunk
                while b"\n" in pending and not stopping:
                    raw_line, pending = pending.split(b"\n", 1)
                    line = raw_line.decode("utf-8", errors="replace")
                    value = sample_value(line)
                    if value is None:
                        continue
                    with conn.cursor() as cur:
                        cur.execute(INSERT, (value,))
                    stored += 1
                    print(value, flush=True)
        finally:
            request_stop(signal.SIGINT, None)
            if master >= 0:
                os.close(master)
            print(f"Stopped. {stored} samples stored.", flush=True)


if __name__ == "__main__":
    main()
