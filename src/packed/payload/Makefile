# Build bootstrap payloads as flat binary blobs.
# Outputs are checked into the repo and embedded via include_bytes!().
#
# Adapted from onelf (https://github.com/QaidVoid/onelf) — MIT licensed.

CC  ?= gcc
AS  ?= as
LD  ?= ld

CFLAGS = -nostdlib -static -fPIC -ffreestanding -O2 -fno-stack-protector \
         -fno-asynchronous-unwind-tables -Wall -Wextra

all: bootstrap_x86_64.bin

bootstrap_x86_64.bin: trampoline_x86_64.o bootstrap_x86_64.o
	$(LD) -nostdlib --oformat binary -e _hod_start \
		-T payload.ld $^ -o $@
	@echo "x86_64 payload: $$(wc -c < $@) bytes"

trampoline_x86_64.o: trampoline_x86_64.S
	$(AS) --64 -o $@ $<

bootstrap_x86_64.o: bootstrap_x86_64.c
	$(CC) $(CFLAGS) -c -o $@ $<

clean:
	rm -f *.o *.bin

.PHONY: all clean
