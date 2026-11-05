#ifndef OARLOCK_CONFIG_H
#define OARLOCK_CONFIG_H

#include "ads1220.h"

#define SENSOR_NAME "oarlock"

/* ESP32 VSPI pins from the oarlock schematic.
   DRDY is not wired, so the read loop paces itself. */
#define PIN_SCK 18
#define PIN_MISO 19
#define PIN_MOSI 23
#define PIN_CS 5
#define PIN_DRDY ADS1220_PIN_UNUSED

/* 20 SPS. The loop waits this long between reads when DRDY is open. */
#define SAMPLE_PERIOD_MS 50

/* Quarter-bridge output, after the RC filter, on AIN0 and AIN1.
   Gain 128 is +/-16 mV full scale against the 2.048 V reference. */
#define BRIDGE_MUX ADS1220_MUX_AIN0_AIN1
#define BRIDGE_GAIN ADS1220_GAIN_128
#define BRIDGE_RATE ADS1220_DR_20SPS
#define BRIDGE_REJECT ADS1220_REJECT_50_60

#endif
