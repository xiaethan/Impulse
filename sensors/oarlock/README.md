# Oarlock

Reads the strain-gauge bridge on the oarlock board and prints each sample on the serial port.

The board in the schematic is an ESP32. This image uses that SPI wiring. The hall-effect encoder and the LCD are not read yet.

## Run

Install the CLI and the ESP32 core once:

```powershell
arduino-cli config add board_manager.additional_urls https://espressif.github.io/arduino-esp32/package_esp32_index.json
arduino-cli core update-index
arduino-cli core install esp32:esp32
```

Plug in the board, then find its COM port:

```powershell
arduino-cli board list
```

From this directory, flash it and open the monitor. Use the COM port from the list:

```powershell
make read PORT=COM5
```

Ctrl+C closes the monitor. The program keeps running on the board.

`make` needs to be on your PATH (Git for Windows provides it). The same steps without make:

```powershell
arduino-cli compile --fqbn esp32:esp32:esp32 --libraries ..\common .
arduino-cli upload -p COM5 --fqbn esp32:esp32:esp32 .
arduino-cli monitor -p COM5 -c baudrate=115200
```

## What you should see

```
oarlock
oarlock regs: 0E 04 10 00
raw,uV
1523,186
```

`raw` is the signed 24-bit code. `uV` is the differential voltage at the ADC inputs, in microvolts, using the internal 2.048 V reference. A new line is printed every 50 ms. Bending the gauge should move both numbers. The sign flips if AIN0 and AIN1 are swapped.

`ADS1220 config readback failed` means SPI is not talking. Check CS on GPIO5, SCK on GPIO18, MISO on GPIO19, MOSI on GPIO23, and a common ground.

A `raw` value stuck at `8388607` or `-8388608` is the rail. Gain 128 only covers about ±16 mV. The schematic builds a quarter-bridge with three 100 ohm resistors, so the gauge needs to be near 100 ohm or the resting voltage already fills that range. Lower `BRIDGE_GAIN` in `include/config.h` and flash again.

## Pins

| Schematic | ESP32 | Firmware |
|---|---|---|
| ADC SCK | GPIO18 | `PIN_SCK` |
| ADC Data Out (MISO) | GPIO19 | `PIN_MISO` |
| ADC Data In (MOSI) | GPIO23 | `PIN_MOSI` |
| ADC CS | GPIO5 | `PIN_CS` |

DRDY is not on the schematic. Leave it open. GPIO5 is a strap pin: it must be high while the ESP32 boots, and this firmware holds CS high when it is not transferring.
