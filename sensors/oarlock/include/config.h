#ifndef OARLOCK_CONFIG_H
#define OARLOCK_CONFIG_H

#define PIN_DRDY 5
#define PIN_MOSI 6
#define PIN_MISO 7
#define PIN_SCK 10
#define PIN_CS 4

/* ADS1220 image that reads this bridge:
   0x0E AIN0-AIN1, gain 128
   0x04 continuous conversion, 20 SPS
   0x00 internal 2.048 V reference
   0x00 defaults */
#define BRIDGE_WREG 0x43
#define BRIDGE_REG0 0x0E
#define BRIDGE_REG1 0x04
#define BRIDGE_REG2 0x00
#define BRIDGE_REG3 0x00

#define CMD_RESET 0x06
#define CMD_START 0x08
#define CMD_RDATA 0x10
#define CMD_WREG  0x40

#endif
