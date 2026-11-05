#ifndef FOOTPLATE_CONFIG_H
#define FOOTPLATE_CONFIG_H

#include "ads1220.h"

#define SENSOR_NAME "footplate"

/* Placeholder until the footplate board is drawn. Uno SPI pins for now. */
#define PIN_SCK ADS1220_PIN_DEFAULT
#define PIN_MISO ADS1220_PIN_DEFAULT
#define PIN_MOSI ADS1220_PIN_DEFAULT
#define PIN_CS 7
#define PIN_DRDY 6

#define BRIDGE_MUX ADS1220_MUX_AIN0_AIN1
#define BRIDGE_GAIN ADS1220_GAIN_128
#define BRIDGE_RATE ADS1220_DR_20SPS
#define BRIDGE_REJECT ADS1220_REJECT_50_60

#endif
