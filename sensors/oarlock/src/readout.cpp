
#include <Arduino.h>
#include <SPI.h>

#include "../include/config.h"

#define SENSOR_NAME "Oarlock Test"

int32_t tare_offset = 0;
float filtered_force = 0.0;
const float alpha = 0.15;    // Smoothing factor (0.05 = heavier filtering, 0.3 = faster response)
const int32_t positive_DEADBAND = 3000; // Ignore noise below this magnitude
const int32_t negative_DEADBAND = -3000; // Ignore noise above this magnitude
int32_t output_force = 0;


static const SPISettings ads_spi(1000000, MSBFIRST, SPI_MODE1);

/* The QT Py profile sends Serial to the native USB port. This cable is the
   UART bridge (usbserial), which is Serial0. Write both so either shows up. */
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

// Send a single command byte
static void ads_command(uint8_t command)
{
    SPI.beginTransaction(ads_spi);
    digitalWrite(PIN_CS, LOW);

    SPI.transfer(command);

    digitalWrite(PIN_CS, HIGH);
    SPI.endTransaction();
}

// Configure ADS registers
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

// Read 24-bit ADC value
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
    Serial.println("Zeroing sensor... Do not touch film.");
    delay(2000); 

    int64_t sum = 0;
    const int num_samples = 60;

    for (int i = 0; i < num_samples; i++) {
        while (digitalRead(PIN_DRDY) != LOW); // Wait for new ADC sample
        sum += ads_read();
        delay(5);
    }

    // Lock in the baseline
    tare_offset = (int32_t)(sum / num_samples);

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
    log_println("raw");

    tare_sensor();
}

void loop(void)
{
    if (digitalRead(PIN_DRDY) != LOW) {
        return;
    }
    int32_t sample = ads_read();
    int32_t raw_force_reading = sample - tare_offset;

    filtered_force = alpha * raw_force_reading + (1 - alpha) * filtered_force;

    log_println("Filtered force:");
    log_println(filtered_force);


    if ((filtered_force < positive_DEADBAND) && (filtered_force > negative_DEADBAND)) {
        output_force = 0;
    } else {
        output_force = (int32_t) filtered_force;
    }

    log_println("Raw:");
    log_println(raw_force_reading);

    log_println("\t Output Force: ");
    log_println(output_force);

}

