#ifndef ADS1220_PORT_H
#define ADS1220_PORT_H

#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

void ads1220_port_begin(uint8_t pin_cs, uint8_t pin_drdy,
                        int8_t pin_sck, int8_t pin_miso, int8_t pin_mosi);
void ads1220_port_begin_transaction(void);
void ads1220_port_end_transaction(void);
void ads1220_port_cs(int level);
uint8_t ads1220_port_xfer(uint8_t byte);
/* Returns 1 when DRDY is high (no new sample). */
int ads1220_port_drdy(void);
void ads1220_port_delay_ms(uint32_t ms);
uint32_t ads1220_port_millis(void);

#ifdef __cplusplus
}
#endif

#endif
