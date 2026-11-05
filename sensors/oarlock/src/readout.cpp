#include <Arduino.h>

#include "../include/config.h"

static ads1220_config bridge;

static void print_regs(void)
{
    uint8_t regs[4];
    uint8_t i;

    ads1220_read_regs(0, regs, 4);
    Serial.print(SENSOR_NAME);
    Serial.print(" regs:");
    for (i = 0; i < 4; i++) {
        Serial.print(' ');
        if (regs[i] < 0x10) {
            Serial.print('0');
        }
        Serial.print(regs[i], HEX);
    }
    Serial.println();
}

void setup(void)
{
    unsigned long start = millis();

    Serial.begin(115200);
    while (!Serial && (millis() - start) < 3000) {
    }

    bridge.pin_cs = PIN_CS;
    bridge.pin_drdy = PIN_DRDY;
    bridge.pin_sck = PIN_SCK;
    bridge.pin_miso = PIN_MISO;
    bridge.pin_mosi = PIN_MOSI;
    bridge.mux = BRIDGE_MUX;
    bridge.gain = BRIDGE_GAIN;
    bridge.data_rate = BRIDGE_RATE;
    bridge.vref = ADS1220_VREF_INTERNAL;
    bridge.reject = BRIDGE_REJECT;

    Serial.println(SENSOR_NAME);
    if (ads1220_init(&bridge) != 0) {
        while (1) {
            Serial.println("ADS1220 config readback failed");
            print_regs();
            delay(1000);
        }
    }
    print_regs();
    Serial.println("raw,uV");
}

void loop(void)
{
    int32_t raw;
    int32_t microvolts;

#if PIN_DRDY == ADS1220_PIN_UNUSED
    delay(SAMPLE_PERIOD_MS);
#else
    if (ads1220_wait_drdy(500) != 0) {
        Serial.println("timeout waiting for DRDY");
        return;
    }
#endif

    raw = ads1220_read_raw();
    microvolts = ads1220_microvolts(raw, bridge.gain, ADS1220_VREF_INTERNAL_UV);
    Serial.print(raw);
    Serial.print(',');
    Serial.println(microvolts);
}
