#ifndef SCREEN_CHART_H
#define SCREEN_CHART_H

#include <stdint.h>

bool chart_begin();
void chart_push_at(uint32_t ms, int32_t value);
void chart_draw();
void chart_freeze();

#endif
