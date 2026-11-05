#!/usr/bin/env python3
"""Live chart of the newest oarlock samples.

Shows recorded time against the raw reading, and only the last
WINDOW_SECONDS of rows. Older rows stay in esp32_test and are left
off the chart.

    python3 sensors/oarlock/capture/visualize.py
    python3 sensors/oarlock/capture/visualize.py --seconds 30
"""

from __future__ import annotations

import argparse
import os
from datetime import datetime, timedelta, timezone

import matplotlib.dates as mdates
import matplotlib.pyplot as plt
from matplotlib.animation import FuncAnimation
import psycopg

WINDOW_SECONDS = 15
REFRESH_MS = 200

QUERY = """
SELECT recorded_at, raw_value
FROM esp32_test
WHERE recorded_at >= now() - make_interval(secs => %s)
ORDER BY recorded_at
"""


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


def latest_samples(conn, seconds: float) -> list[tuple[datetime, int]]:
    with conn.cursor() as cur:
        cur.execute(QUERY, (seconds,))
        return [(recorded_at.astimezone(), raw_value) for recorded_at, raw_value in cur]


def draw(ax, line, samples: list[tuple[datetime, int]], seconds: float) -> None:
    now = datetime.now(timezone.utc).astimezone()
    ax.set_xlim(now - timedelta(seconds=seconds), now)
    if not samples:
        line.set_data([], [])
        ax.set_ylim(-1, 1)
        return
    times = [recorded_at for recorded_at, _ in samples]
    values = [raw_value for _, raw_value in samples]
    line.set_data(times, values)
    low = min(values)
    high = max(values)
    span = high - low
    pad = span * 0.1 if span else max(abs(low) * 0.001, 1)
    ax.set_ylim(low - pad, high + pad)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Chart the latest oarlock samples.")
    parser.add_argument(
        "--seconds",
        type=float,
        default=WINDOW_SECONDS,
        help=f"how many seconds of samples to show (default {WINDOW_SECONDS})",
    )
    args = parser.parse_args()
    if args.seconds <= 0:
        parser.error("--seconds must be greater than 0")
    return args


def main() -> None:
    args = parse_args()
    conn = connect()
    conn.autocommit = True

    fig, ax = plt.subplots(figsize=(9, 4.5))
    fig.canvas.manager.set_window_title("Oarlock")
    line, = ax.plot([], [], color="#2f6bff", linewidth=1.4)
    ax.set_title(f"Last {args.seconds:g} seconds")
    ax.set_xlabel("Time")
    ax.set_ylabel("Raw value")
    ax.xaxis.set_major_formatter(mdates.DateFormatter("%H:%M:%S"))
    ax.grid(True, color="#e6eaf0", linewidth=0.8)
    fig.autofmt_xdate(rotation=0, ha="center")
    fig.tight_layout()

    def refresh(_frame):
        draw(ax, line, latest_samples(conn, args.seconds), args.seconds)
        return (line,)

    fig.canvas.mpl_connect("close_event", lambda _event: conn.close())
    animation = FuncAnimation(fig, refresh, interval=REFRESH_MS, cache_frame_data=False)
    plt.show()
    del animation


if __name__ == "__main__":
    main()
