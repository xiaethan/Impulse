#include "ads1220.h"
#include "ads1220_port.h"

static void ads1220_command(uint8_t cmd)
{
    ads1220_port_begin_transaction();
    ads1220_port_cs(0);
    ads1220_port_xfer(cmd);
    ads1220_port_cs(1);
    ads1220_port_end_transaction();
}

static void ads1220_write_regs(uint8_t addr, const uint8_t *buf, uint8_t count)
{
    uint8_t i;
    uint8_t cmd = (uint8_t)(0x40 | ((addr & 0x03) << 2) | ((count - 1) & 0x03));

    ads1220_port_begin_transaction();
    ads1220_port_cs(0);
    ads1220_port_xfer(cmd);
    for (i = 0; i < count; i++) {
        ads1220_port_xfer(buf[i]);
    }
    ads1220_port_cs(1);
    ads1220_port_end_transaction();
}

void ads1220_read_regs(uint8_t addr, uint8_t *buf, uint8_t count)
{
    uint8_t i;
    uint8_t cmd = (uint8_t)(0x20 | ((addr & 0x03) << 2) | ((count - 1) & 0x03));

    ads1220_port_begin_transaction();
    ads1220_port_cs(0);
    ads1220_port_xfer(cmd);
    for (i = 0; i < count; i++) {
        buf[i] = ads1220_port_xfer(0x00);
    }
    ads1220_port_cs(1);
    ads1220_port_end_transaction();
}

int ads1220_init(const ads1220_config *cfg)
{
    uint8_t regs[4];
    uint8_t check[4];
    uint8_t i;

    ads1220_port_begin(cfg->pin_cs, cfg->pin_drdy,
                       cfg->pin_sck, cfg->pin_miso, cfg->pin_mosi);
    ads1220_command(ADS1220_CMD_RESET);
    /* RESET needs 50 us + 32 clocks before the next command. */
    ads1220_port_delay_ms(2);

    regs[0] = (uint8_t)(((cfg->mux & 0x0f) << 4) | ((cfg->gain & 0x07) << 1));
    regs[1] = (uint8_t)(((cfg->data_rate & 0x07) << 5) | (ADS1220_CM_CONTINUOUS << 2));
    regs[2] = (uint8_t)(((cfg->vref & 0x03) << 6) | ((cfg->reject & 0x03) << 4));
    regs[3] = 0x00;

    ads1220_write_regs(0, regs, 4);
    ads1220_read_regs(0, check, 4);
    for (i = 0; i < 4; i++) {
        if (check[i] != regs[i]) {
            return -1;
        }
    }

    ads1220_command(ADS1220_CMD_START);
    return 0;
}

int ads1220_wait_drdy(uint32_t timeout_ms)
{
    uint32_t start = ads1220_port_millis();

    while (ads1220_port_drdy()) {
        if ((ads1220_port_millis() - start) > timeout_ms) {
            return -1;
        }
    }
    return 0;
}

int32_t ads1220_read_raw(void)
{
    uint32_t value;

    ads1220_port_begin_transaction();
    ads1220_port_cs(0);
    value = (uint32_t)ads1220_port_xfer(0x00) << 16;
    value |= (uint32_t)ads1220_port_xfer(0x00) << 8;
    value |= (uint32_t)ads1220_port_xfer(0x00);
    ads1220_port_cs(1);
    ads1220_port_end_transaction();

    if (value & 0x00800000u) {
        value |= 0xff000000u;
    }
    return (int32_t)value;
}

int32_t ads1220_microvolts(int32_t code, uint8_t gain_code, int32_t vref_uv)
{
    int32_t gain = 1L << (gain_code & 0x07);
    return (int32_t)(((int64_t)code * vref_uv) / ((int64_t)gain * 8388608LL));
}
