#include <Arduino.h>
#include <cstdlib>
#include <cstring>

#include "chart.h"

/* Live chart. Each integer line on the USB serial port is one raw sample. */

static char serial_line[24];
static size_t serial_len = 0;

static bool parse_sample(const char *text, int32_t *value)
{
  while (*text == ' ' || *text == '\t')
  {
    text++;
  }
  if (*text == '\0' || strcmp(text, "+") == 0 || strcmp(text, "-") == 0)
  {
    return false;
  }
  char *end = nullptr;
  long parsed = strtol(text, &end, 10);
  if (end == text || *end != '\0')
  {
    return false;
  }
  *value = static_cast<int32_t>(parsed);
  return true;
}

static void poll_serial()
{
  while (Serial.available() > 0)
  {
    char c = static_cast<char>(Serial.read());
    if (c == '\n' || c == '\r')
    {
      if (serial_len == 0)
      {
        continue;
      }
      serial_line[serial_len] = '\0';
      serial_len = 0;
      int32_t value = 0;
      if (parse_sample(serial_line, &value))
      {
        chart_push_at(millis(), value);
      }
      continue;
    }
    if (serial_len + 1 < sizeof(serial_line))
    {
      serial_line[serial_len++] = c;
    }
  }
}

void setup()
{
  Serial.begin(115200);
  delay(300);
  if (!chart_begin())
  {
    return;
  }
  Serial.println("display ready");
}

void loop()
{
  poll_serial();
  chart_draw();
}
