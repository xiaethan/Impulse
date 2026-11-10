#include <Arduino.h>
#include <cstdlib>

#define LGFX_USE_V1
#include <LovyanGFX.hpp>
#include <lgfx/v1/platforms/esp32s3/Bus_RGB.hpp>
#include <lgfx/v1/platforms/esp32s3/Panel_RGB.hpp>

#include "chart.h"
#include "config.h"

/* CrowPanel 7.0 (DIS08070H): 800x480 RGB panel, backlight on GPIO2.
   USB-C is a CH340 on UART0, so Serial is the monitor port. */

class LGFX : public lgfx::LGFX_Device
{
  lgfx::Bus_RGB _bus_instance;
  lgfx::Panel_RGB _panel_instance;
  lgfx::Light_PWM _light_instance;

public:
  LGFX(void)
  {
    {
      auto cfg = _bus_instance.config();
      cfg.panel = &_panel_instance;

      cfg.pin_d0 = GPIO_NUM_15;  // B0
      cfg.pin_d1 = GPIO_NUM_7;   // B1
      cfg.pin_d2 = GPIO_NUM_6;   // B2
      cfg.pin_d3 = GPIO_NUM_5;   // B3
      cfg.pin_d4 = GPIO_NUM_4;   // B4

      cfg.pin_d5 = GPIO_NUM_9;   // G0
      cfg.pin_d6 = GPIO_NUM_46;  // G1
      cfg.pin_d7 = GPIO_NUM_3;   // G2
      cfg.pin_d8 = GPIO_NUM_8;   // G3
      cfg.pin_d9 = GPIO_NUM_16;  // G4
      cfg.pin_d10 = GPIO_NUM_1;  // G5

      cfg.pin_d11 = GPIO_NUM_14; // R0
      cfg.pin_d12 = GPIO_NUM_21; // R1
      cfg.pin_d13 = GPIO_NUM_47; // R2
      cfg.pin_d14 = GPIO_NUM_48; // R3
      cfg.pin_d15 = GPIO_NUM_45; // R4

      cfg.pin_henable = GPIO_NUM_41;
      cfg.pin_vsync = GPIO_NUM_40;
      cfg.pin_hsync = GPIO_NUM_39;
      cfg.pin_pclk = GPIO_NUM_0;
      cfg.freq_write = 15000000;

      cfg.hsync_polarity = 0;
      cfg.hsync_front_porch = 40;
      cfg.hsync_pulse_width = 48;
      cfg.hsync_back_porch = 40;

      cfg.vsync_polarity = 0;
      cfg.vsync_front_porch = 1;
      cfg.vsync_pulse_width = 31;
      cfg.vsync_back_porch = 13;

      cfg.pclk_active_neg = 1;
      cfg.de_idle_high = 0;
      cfg.pclk_idle_high = 0;

      _bus_instance.config(cfg);
    }
    {
      auto cfg = _panel_instance.config();
      cfg.memory_width = SCREEN_WIDTH;
      cfg.memory_height = SCREEN_HEIGHT;
      cfg.panel_width = SCREEN_WIDTH;
      cfg.panel_height = SCREEN_HEIGHT;
      cfg.offset_x = 0;
      cfg.offset_y = 0;
      _panel_instance.config(cfg);
    }
    {
      auto cfg = _light_instance.config();
      cfg.pin_bl = PIN_BL;
      cfg.invert = false;
      cfg.freq = 44100;
      cfg.pwm_channel = 7;
      _light_instance.config(cfg);
    }

    _panel_instance.light(&_light_instance);
    _panel_instance.setBus(&_bus_instance);
    setPanel(&_panel_instance);
  }
};

static LGFX lcd;
static lgfx::LGFX_Sprite canvas(&lcd);

static const uint16_t COLOR_BG = 0xFFFF;
static const uint16_t COLOR_GRID = 0xE75E;
static const uint16_t COLOR_LINE = 0x2B5F;
static const uint16_t COLOR_AXIS = 0x8410;
static const uint16_t COLOR_TEXT = 0x0000;

static const int PLOT_LEFT = 86;
static const int PLOT_RIGHT = 776;
static const int PLOT_TOP = 40;
static const int PLOT_BOTTOM = 420;

struct Sample
{
  uint32_t ms;
  int32_t value;
};

static constexpr size_t SAMPLE_CAP = 640;
static Sample samples[SAMPLE_CAP];
static size_t sample_count = 0;
static size_t sample_next = 0;

static bool chart_ready = false;
static bool chart_frozen = false;
static uint32_t frozen_now = 0;

void chart_push_at(uint32_t ms, int32_t value)
{
  samples[sample_next].ms = ms;
  samples[sample_next].value = value;
  sample_next = (sample_next + 1) % SAMPLE_CAP;
  if (sample_count < SAMPLE_CAP)
  {
    sample_count++;
  }
}

void chart_freeze()
{
  chart_frozen = true;
  frozen_now = millis();
}

static bool in_window(uint32_t sample_ms, uint32_t now)
{
  return (now - sample_ms) <= static_cast<uint32_t>(WINDOW_SECONDS) * 1000U;
}

static int x_of(uint32_t sample_ms, uint32_t now)
{
  const uint32_t window_ms = static_cast<uint32_t>(WINDOW_SECONDS) * 1000U;
  uint32_t age = now - sample_ms;
  if (age > window_ms)
  {
    age = window_ms;
  }
  const uint32_t from_left = window_ms - age;
  const int width = PLOT_RIGHT - PLOT_LEFT;
  return PLOT_LEFT + static_cast<int>((static_cast<int64_t>(from_left) * width) / window_ms);
}

static int y_of(int32_t value, int32_t ymin, int32_t ymax)
{
  if (ymax == ymin)
  {
    return (PLOT_TOP + PLOT_BOTTOM) / 2;
  }
  const int64_t span = static_cast<int64_t>(ymax) - ymin;
  const int64_t num = (static_cast<int64_t>(value) - ymin) * (PLOT_BOTTOM - PLOT_TOP);
  int y = PLOT_BOTTOM - static_cast<int>(num / span);
  if (y < PLOT_TOP)
  {
    y = PLOT_TOP;
  }
  if (y > PLOT_BOTTOM)
  {
    y = PLOT_BOTTOM;
  }
  return y;
}

static void limits_for(uint32_t now, int32_t *ymin, int32_t *ymax, size_t *visible)
{
  const size_t start = (sample_count == SAMPLE_CAP) ? sample_next : 0;
  int32_t low = 0;
  int32_t high = 0;
  size_t shown = 0;
  for (size_t i = 0; i < sample_count; i++)
  {
    const Sample &sample = samples[(start + i) % SAMPLE_CAP];
    if (!in_window(sample.ms, now))
    {
      continue;
    }
    if (shown == 0 || sample.value < low)
    {
      low = sample.value;
    }
    if (shown == 0 || sample.value > high)
    {
      high = sample.value;
    }
    shown++;
  }
  *visible = shown;
  if (shown == 0)
  {
    *ymin = -1;
    *ymax = 1;
    return;
  }
  const int32_t span = high - low;
  int32_t pad = span / 10;
  if (pad == 0)
  {
    pad = static_cast<int32_t>(abs(low) / 1000);
    if (pad < 1)
    {
      pad = 1;
    }
  }
  *ymin = low - pad;
  *ymax = high + pad;
}

static void draw_chart()
{
  const uint32_t now = chart_frozen ? frozen_now : millis();
  int32_t ymin = -1;
  int32_t ymax = 1;
  size_t visible = 0;
  limits_for(now, &ymin, &ymax, &visible);

  lgfx::LovyanGFX *out = canvas.getBuffer() ? static_cast<lgfx::LovyanGFX *>(&canvas) : static_cast<lgfx::LovyanGFX *>(&lcd);
  out->fillScreen(COLOR_BG);
  out->setTextColor(COLOR_TEXT, COLOR_BG);

  char title[32];
  snprintf(title, sizeof(title), "Last %d seconds", WINDOW_SECONDS);
  out->setTextSize(2);
  out->setTextDatum(textdatum_t::top_center);
  out->drawString(title, SCREEN_WIDTH / 2, 8);

  out->setTextSize(1);
  out->setTextDatum(textdatum_t::top_left);
  out->drawString("Raw value", 8, PLOT_TOP - 16);
  out->setTextDatum(textdatum_t::top_center);
  out->drawString("Time", (PLOT_LEFT + PLOT_RIGHT) / 2, PLOT_BOTTOM + 28);

  const int y_ticks = 4;
  out->setTextDatum(textdatum_t::middle_right);
  for (int i = 0; i <= y_ticks; i++)
  {
    const int64_t value = static_cast<int64_t>(ymin) +
                          ((static_cast<int64_t>(ymax) - ymin) * i) / y_ticks;
    const int y = y_of(static_cast<int32_t>(value), ymin, ymax);
    out->drawFastHLine(PLOT_LEFT, y, PLOT_RIGHT - PLOT_LEFT, COLOR_GRID);
    char label[16];
    snprintf(label, sizeof(label), "%ld", static_cast<long>(value));
    out->drawString(label, PLOT_LEFT - 6, y);
  }

  out->setTextDatum(textdatum_t::top_center);
  for (int sec = 0; sec <= WINDOW_SECONDS; sec += 3)
  {
    const int x = PLOT_LEFT + ((PLOT_RIGHT - PLOT_LEFT) * sec) / WINDOW_SECONDS;
    out->drawFastVLine(x, PLOT_TOP, PLOT_BOTTOM - PLOT_TOP, COLOR_GRID);
    char label[8];
    if (sec == WINDOW_SECONDS)
    {
      snprintf(label, sizeof(label), "now");
    }
    else
    {
      snprintf(label, sizeof(label), "-%ds", WINDOW_SECONDS - sec);
    }
    out->drawString(label, x, PLOT_BOTTOM + 6);
  }

  out->drawRect(PLOT_LEFT, PLOT_TOP, PLOT_RIGHT - PLOT_LEFT, PLOT_BOTTOM - PLOT_TOP, COLOR_AXIS);

  const size_t start = (sample_count == SAMPLE_CAP) ? sample_next : 0;
  bool have_prev = false;
  int prev_x = 0;
  int prev_y = 0;
  for (size_t i = 0; i < sample_count; i++)
  {
    const Sample &sample = samples[(start + i) % SAMPLE_CAP];
    if (!in_window(sample.ms, now))
    {
      continue;
    }
    const int x = x_of(sample.ms, now);
    const int y = y_of(sample.value, ymin, ymax);
    if (have_prev)
    {
      out->drawWideLine(prev_x, prev_y, x, y, 1, COLOR_LINE);
    }
    else if (visible == 1)
    {
      out->fillCircle(x, y, 2, COLOR_LINE);
    }
    prev_x = x;
    prev_y = y;
    have_prev = true;
  }

  if (canvas.getBuffer())
  {
    canvas.pushSprite(0, 0);
  }
}

bool chart_begin()
{
  pinMode(PIN_BL, OUTPUT);
  digitalWrite(PIN_BL, HIGH);
  if (!lcd.init())
  {
    Serial.println("display init failed");
    return false;
  }
  lcd.setRotation(0);
  lcd.setBrightness(255);
  canvas.setPsram(true);
  canvas.setColorDepth(16);
  canvas.createSprite(SCREEN_WIDTH, SCREEN_HEIGHT);
  chart_ready = true;
  chart_draw();
  return true;
}

void chart_draw()
{
  if (!chart_ready)
  {
    return;
  }
  static uint32_t last_draw = 0;
  const uint32_t now = millis();
  if (now - last_draw < REFRESH_MS)
  {
    return;
  }
  last_draw = now;
  draw_chart();
}
