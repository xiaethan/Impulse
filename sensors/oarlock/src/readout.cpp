#include <Arduino.h>
#include <SPI.h>
#include "../include/config.h"

#define SENSOR_NAME "Oarlock Test"

int32_t tare_offset = 0;
float filtered_force = 0.0f;
const float alpha = 0.15f;

// Test load: (raw_counts_with_load / known_load_value)
float calibration_factor = 1000.0f; 

// Deadband in CALIBRATED units (e.g: 0.5 N or 0.5 lbs)
const float DEADBAND = 0.5f; 

static const SPISettings ads_spi(1000000, MSBFIRST, SPI_MODE1);

static void log_begin(void)
{
    Serial.begin(115200);
    Serial0.begin(115200);
}

static void log_println(const char *text)
{
    Serial.println(text);
    Serial0.println(text);
}

static void log_println(int32_t value)
{
    Serial.println(value);
    Serial0.println(value);
}

static void log_println(float value)
{
    Serial.println(value, 2);
    Serial0.println(value, 2);
}

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
    uint8_t buf[5] = {
        BRIDGE_WREG,
        BRIDGE_REG0,
        BRIDGE_REG1,
        BRIDGE_REG2,
        BRIDGE_REG3
    };

    SPI.beginTransaction(ads_spi);
    digitalWrite(PIN_CS, LOW);
    SPI.transfer(buf, 5);
    digitalWrite(PIN_CS, HIGH);
    SPI.endTransaction();
}

static int32_t ads_read(void)
{
    uint8_t buf[4] = { CMD_RDATA, 0x00, 0x00, 0x00 };

    SPI.beginTransaction(ads_spi);
    digitalWrite(PIN_CS, LOW);
    SPI.transfer(buf, 4);
    digitalWrite(PIN_CS, HIGH);
    SPI.endTransaction();

    uint32_t value =
        ((uint32_t)buf[1] << 16) |
        ((uint32_t)buf[2] << 8) |
        buf[3];

    // Sign extend 24-bit value
    if (value & 0x00800000u) {
        value |= 0xff000000u;
    }

    return (int32_t)value;
}

void tare_sensor(void)
{
    log_println("Zeroing sensor... Do not apply load.");
    delay(1000); 

    // Flush the first 10 samples so the ADC digital filter settles
    for (int i = 0; i < 10; i++) {
        while (digitalRead(PIN_DRDY) != LOW);
        ads_read();
    }

    int64_t sum = 0;
    const int num_samples = 60;

    for (int i = 0; i < num_samples; i++) {
        while (digitalRead(PIN_DRDY) != LOW);
        sum += ads_read();
    }

    tare_offset = (int32_t)(sum / num_samples);
    filtered_force = 0.0f; // Reset filter state on tare
    log_println("Tare complete. Offset:");
    log_println(tare_offset);
}

void setup(void)
{
    log_begin();
    delay(1500);

    pinMode(PIN_CS, OUTPUT);
    pinMode(PIN_DRDY, INPUT_PULLUP);
    digitalWrite(PIN_CS, HIGH);

    SPI.begin(PIN_SCK, PIN_MISO, PIN_MOSI, PIN_CS);

    ads_command(CMD_RESET);
    delay(10);

    ads_configure();
    ads_command(CMD_START);

    log_println(SENSOR_NAME);
    tare_sensor();
}

void loop(void)
{
    // Allow re-taring anytime by sending 't' over Serial
    if ((Serial.available() && Serial.read() == 't') || 
        (Serial0.available() && Serial0.read() == 't')) {
        tare_sensor();
    }

    if (digitalRead(PIN_DRDY) != LOW) {
        return;
    }

    int32_t sample = ads_read();
    int32_t raw_counts = sample - tare_offset;

    // Convert raw counts to calibrated engineering units
    float calibrated_force = (float)raw_counts / calibration_factor;

    // Apply exponential moving average
    filtered_force = alpha * calibrated_force + (1.0f - alpha) * filtered_force;

    // Apply deadband around zero
    float output_force = filtered_force;
    if (output_force < DEADBAND && output_force > -DEADBAND) {
        output_force = 0.0f;
    }

    log_println("Raw Counts:");
    log_println(raw_counts);
    log_println("Calibrated Force:");
    log_println(output_force);
}


