#include <Arduino.h>
#include <SPI.h>

#include "ads1220.h"
#include "ads1220_port.h"

static uint8_t cs_pin;
static uint8_t drdy_pin;

extern "C" {

void ads1220_port_begin(uint8_t pin_cs, uint8_t pin_drdy,
                        int8_t pin_sck, int8_t pin_miso, int8_t pin_mosi)
{
    cs_pin = pin_cs;
    drdy_pin = pin_drdy;
    pinMode(cs_pin, OUTPUT);
    digitalWrite(cs_pin, HIGH);
    if (pin_drdy != ADS1220_PIN_UNUSED) {
        pinMode(drdy_pin, INPUT_PULLUP);
    }
#if defined(ESP32)
    if (pin_sck >= 0 && pin_miso >= 0 && pin_mosi >= 0) {
        SPI.begin(pin_sck, pin_miso, pin_mosi, pin_cs);
    } else {
        SPI.begin();
    }
#else
    (void)pin_sck;
    (void)pin_miso;
    (void)pin_mosi;
    SPI.begin();
#endif
}

void ads1220_port_begin_transaction(void)
{
    SPI.beginTransaction(SPISettings(1000000, MSBFIRST, SPI_MODE1));
}

void ads1220_port_end_transaction(void)
{
    SPI.endTransaction();
}

void ads1220_port_cs(int level)
{
    digitalWrite(cs_pin, level ? HIGH : LOW);
}

uint8_t ads1220_port_xfer(uint8_t byte)
{
    return SPI.transfer(byte);
}

int ads1220_port_drdy(void)
{
    if (drdy_pin == ADS1220_PIN_UNUSED) {
        return 0;
    }
    return digitalRead(drdy_pin) == HIGH;
}

void ads1220_port_delay_ms(uint32_t ms)
{
    delay(ms);
}

uint32_t ads1220_port_millis(void)
{
    return millis();
}

}
