# Screen

CrowPanel 7 inch, DIS08070H. The USB port on this Mac is `/dev/cu.usbserial-210`.

`pio device monitor` does not choose a program. It only shows what was last uploaded. The sample replay is `display_out_test.cpp` still running on the board.

## Live chart

From `sensors/screen`:

```bash
pio run -t upload
```

That uploads `display_out.cpp`. The screen shows the last 15 seconds and waits for readings. A normal upload always selects this program. The replay upload is a separate command, below.

## Live oarlock on the screen

Plug in the oarlock and the screen. From `sensors/screen`:

```bash
python3 live.py
```

That terminal is the oarlock monitor. Each raw reading is copied to the screen.

Leave the screen port closed. Do not run `pio device monitor` in this folder while `live.py` is running, and do not run `pio device monitor` in `sensors/oarlock` either. The oarlock port can only be open in one place, and `live.py` is that place.

## Play the saved recording

From `sensors/screen`:

```bash
pio run -e crowpanel_7_replay -t upload
```

The board then plays the stored `esp32_test` rows on its own. Reset it to play them again. To return to the live chart, run `pio run -t upload`.
