#ifndef ADS1220_H
#define ADS1220_H

#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

#define ADS1220_CMD_RESET 0x06
#define ADS1220_CMD_START 0x08
#define ADS1220_CMD_POWERDOWN 0x02
#define ADS1220_CMD_RDATA 0x10

/* Config register 0, MUX[3:0]. */
#define ADS1220_MUX_AIN0_AIN1 0x0
#define ADS1220_MUX_AIN0_AIN2 0x1
#define ADS1220_MUX_AIN0_AIN3 0x2
#define ADS1220_MUX_AIN1_AIN2 0x3
#define ADS1220_MUX_AIN1_AIN3 0x4
#define ADS1220_MUX_AIN2_AIN3 0x5
#define ADS1220_MUX_AIN1_AIN0 0x6
#define ADS1220_MUX_AIN3_AIN2 0x7

/* Config register 0, GAIN[2:0]. The numeric gain is 1 << code. */
#define ADS1220_GAIN_1 0x0
#define ADS1220_GAIN_2 0x1
#define ADS1220_GAIN_4 0x2
#define ADS1220_GAIN_8 0x3
#define ADS1220_GAIN_16 0x4
#define ADS1220_GAIN_32 0x5
#define ADS1220_GAIN_64 0x6
#define ADS1220_GAIN_128 0x7

/* Config register 1, DR[2:0], normal mode. */
#define ADS1220_DR_20SPS 0x0
#define ADS1220_DR_45SPS 0x1
#define ADS1220_DR_90SPS 0x2
#define ADS1220_DR_175SPS 0x3
#define ADS1220_DR_330SPS 0x4
#define ADS1220_DR_600SPS 0x5
#define ADS1220_DR_1000SPS 0x6

#define ADS1220_MODE_NORMAL 0x0
#define ADS1220_CM_SINGLE 0x0
#define ADS1220_CM_CONTINUOUS 0x1

/* Config register 2, VREF[1:0]. */
#define ADS1220_VREF_INTERNAL 0x0
#define ADS1220_VREF_EXT0 0x1
#define ADS1220_VREF_EXT1 0x2
#define ADS1220_VREF_AVDD 0x3
#define ADS1220_VREF_INTERNAL_UV 2048000L

/* Config register 2, 50/60[1:0]. Only valid at 20 SPS in normal mode. */
#define ADS1220_REJECT_OFF 0x0
#define ADS1220_REJECT_50_60 0x1
#define ADS1220_REJECT_50 0x2
#define ADS1220_REJECT_60 0x3

/* pin_drdy value when the board leaves DRDY unconnected. */
#define ADS1220_PIN_UNUSED 0xFF
/* SPI pin value that keeps the board's default hardware SPI pins. */
#define ADS1220_PIN_DEFAULT (-1)

typedef struct {
    uint8_t pin_cs;
    uint8_t pin_drdy;
    int8_t pin_sck;
    int8_t pin_miso;
    int8_t pin_mosi;
    uint8_t mux;
    uint8_t gain;
    uint8_t data_rate;
    uint8_t vref;
    uint8_t reject;
} ads1220_config;

/* Returns 0 when the four config registers read back as written. */
int ads1220_init(const ads1220_config *cfg);

/* Blocks until DRDY is low. Returns 0, or -1 on timeout. */
int ads1220_wait_drdy(uint32_t timeout_ms);

/* Clocks out the latest 24-bit signed conversion. */
int32_t ads1220_read_raw(void);

void ads1220_read_regs(uint8_t addr, uint8_t *buf, uint8_t count);

/* code * vref_uv / (gain * 2^23). vref_uv is the reference in microvolts. */
int32_t ads1220_microvolts(int32_t code, uint8_t gain_code, int32_t vref_uv);

#ifdef __cplusplus
}
#endif

#endif
