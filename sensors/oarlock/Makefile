FQBN ?= esp32:esp32:esp32c3:CDCOnBoot=cdc
PORT ?= COM3
BAUD ?= 115200
LIB  := ../common

.PHONY: all build upload monitor read

all: build

build:
	arduino-cli compile --fqbn $(FQBN) --libraries $(LIB) .

upload: build
	arduino-cli upload -p $(PORT) --fqbn $(FQBN) .

monitor:
	arduino-cli monitor -p $(PORT) -c baudrate=$(BAUD)

read: upload monitor
