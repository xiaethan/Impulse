#!/usr/bin/env python3
"""Show the oarlock monitor and copy each raw reading to the screen.

The oarlock and the CrowPanel are separate USB serial ports. This
process is the oarlock monitor: it prints that stream here and writes
each raw integer to the screen, which is running display_out.cpp.

Do not also run `pio device monitor` in sensors/oarlock. That port
can only be open in one place.

    python3 sensors/screen/live.py
"""

from __future__ import annotations

import glob
import os
import pty
import select
import shutil
import signal
import subprocess
import sys
import termios
from pathlib import Path

OARLOCK = Path(__file__).resolve().parents[1] / "oarlock"
BAUD = 115200
DEFAULT_SCREEN = "/dev/cu.usbserial-210"


def pio_bin() -> str:
    found = shutil.which("pio")
    if found:
        return found
    bundled = Path.home() / ".platformio" / "penv" / "bin" / "pio"
    if bundled.is_file():
        return str(bundled)
    sys.exit("pio was not found. Install PlatformIO or add it to PATH.")


def usb_ports() -> list[str]:
    return sorted(glob.glob("/dev/cu.usbserial*"))


def sample_value(line: str) -> int | None:
    text = line.strip()
    if not text or text in {"-", "+"}:
        return None
    sign = text[1:] if text[0] in "+-" else text
    if not sign.isdigit():
        return None
    return int(text)


def open_screen(path: str) -> int:
    fd = os.open(path, os.O_RDWR | os.O_NOCTTY | os.O_NONBLOCK)
    attrs = termios.tcgetattr(fd)
    attrs[0] = 0
    attrs[1] = 0
    attrs[2] = termios.CS8 | termios.CREAD | termios.CLOCAL
    attrs[3] = 0
    attrs[4] = termios.B115200
    attrs[5] = termios.B115200
    attrs[6][termios.VMIN] = 0
    attrs[6][termios.VTIME] = 0
    termios.tcsetattr(fd, termios.TCSANOW, attrs)
    return fd


def main() -> None:
    ports = usb_ports()
    screen = DEFAULT_SCREEN if DEFAULT_SCREEN in ports else ""
    oarlock_ports = [port for port in ports if port != DEFAULT_SCREEN]
    if screen == "":
        sys.exit(f"Screen port {DEFAULT_SCREEN} is not connected.")
    if not oarlock_ports:
        sys.exit(
            "The oarlock is not connected. Plug it in, then run this again. "
            "The screen is on /dev/cu.usbserial-210."
        )
    oarlock = oarlock_ports[0]

    try:
        screen_fd = open_screen(screen)
    except OSError as exc:
        sys.exit(f"Could not open the screen at {screen}: {exc}")

    master, slave = pty.openpty()
    monitor = subprocess.Popen(
        [
            pio_bin(),
            "device",
            "monitor",
            "--port",
            oarlock,
            "--quiet",
            "--baud",
            str(BAUD),
            "--filter",
            "direct",
        ],
        cwd=OARLOCK,
        stdin=slave,
        stdout=slave,
        stderr=slave,
        start_new_session=True,
    )
    os.close(slave)
    print(f"Oarlock {oarlock} -> screen {screen}", flush=True)

    pending = b""
    labeled = False
    expect_raw = False
    try:
        while monitor.poll() is None:
            ready, _, _ = select.select([master], [], [], 0.5)
            if not ready:
                continue
            try:
                chunk = os.read(master, 4096)
            except OSError:
                break
            if not chunk:
                break
            pending += chunk
            while b"\n" in pending:
                raw_line, pending = pending.split(b"\n", 1)
                line = raw_line.decode("utf-8", errors="replace")
                print(line, flush=True)
                text = line.strip()
                if text == "Raw:":
                    labeled = True
                    expect_raw = True
                    continue
                if text in {"Filtered force:", "raw"} or "Output Force" in text:
                    labeled = True
                    expect_raw = False
                    continue
                value = sample_value(text)
                if value is None:
                    expect_raw = False
                    continue
                if labeled and not expect_raw:
                    continue
                expect_raw = False
                try:
                    os.write(screen_fd, f"{value}\n".encode())
                except OSError as exc:
                    print(f"Screen write failed: {exc}", flush=True)
                    return
    except KeyboardInterrupt:
        print("\nStopped.", flush=True)
    finally:
        if monitor.poll() is None:
            os.killpg(monitor.pid, signal.SIGKILL)
            monitor.wait(timeout=2)
        os.close(master)
        os.close(screen_fd)


if __name__ == "__main__":
    main()
