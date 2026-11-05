#include <Arduino.h>
#include <SPI.h>

//#include "../include/config.h"


// M5Stamp ESP32-C3 connections
#define PIN_DRDY 5
#define PIN_MOSI 6
#define PIN_MISO 7
#define PIN_SCK 10
#define PIN_CS 4

#define CMD_RESET  0x06
#define CMD_START  0x08
#define CMD_RDATA  0x10
#define CMD_WREG   0x40

#define BRIDGE_WREG 0x43
#define BRIDGE_REG0 0x0E
#define BRIDGE_REG1 0x04
#define BRIDGE_REG2 0x00
#define BRIDGE_REG3 0x00

static const SPISettings ads_spi(1000000, MSBFIRST, SPI_MODE1);

static void ads_command(uint8_t command)
{
    SPI.beginTransaction(ads_spi);
    digitalWrite(PIN_CS, LOW);
    SPI.transfer(command);
    digitalWrite(PIN_CS, HIGH);
    SPI.endTransaction();
}

static void ads_configure(void)
{
    uint8_t buf[5] = { BRIDGE_WREG, BRIDGE_REG0, BRIDGE_REG1, BRIDGE_REG2, BRIDGE_REG3 };

    SPI.beginTransaction(ads_spi);
    digitalWrite(PIN_CS, LOW);
    SPI.transfer(buf, 5);
    digitalWrite(PIN_CS, HIGH);
    SPI.endTransaction();
}

static int32_t ads_read(void)
{
    uint8_t buf[4] = { CMD_RDATA, 0x00, 0x00, 0x00 };
    uint32_t value;

    SPI.beginTransaction(ads_spi);
    digitalWrite(PIN_CS, LOW);
    SPI.transfer(buf, 4);
    digitalWrite(PIN_CS, HIGH);
    SPI.endTransaction();

    value = ((uint32_t)buf[1] << 16) | ((uint32_t)buf[2] << 8) | buf[3];
    if (value & 0x00800000u) {
        value |= 0xff000000u;
    }
    return (int32_t)value;
}

void setup(void)
{
    Serial.begin(115200);
    delay(1500);

    pinMode(PIN_CS, OUTPUT);
    pinMode(PIN_DRDY, INPUT_PULLUP);
    digitalWrite(PIN_CS, HIGH);
    SPI.begin(PIN_SCK, PIN_MISO, PIN_MOSI, PIN_CS);

    ads_command(CMD_RESET);
    delay(10);
    ads_configure();
    ads_command(CMD_START);

    Serial.println(SENSOR_NAME);
    Serial.println("raw");
}

void loop(void)
{
    if (digitalRead(PIN_DRDY) != LOW) {
        return;
    }
    Serial.println(ads_read());
}
