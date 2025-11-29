#ifndef __CSUITE_CIPAEAD_HEADER__
#define __CSUITE_CIPAEAD_HEADER__ 0x1


#include <stddef.h>
#include <stdint.h>
#include <string.h>

typedef struct {
  const char *basename;
  const unsigned short agid;
  const unsigned short iv_length;
  const unsigned short tag_length;

  const unsigned char *allowed_key_sizes;
  const size_t allowed_key_sizes_count;
} AEADMode;

AEADMode* aead_aes(const char *mode);
AEADMode* aead_chacha20();

int aead_encrypt(
  const AEADMode *mode,
  const IGetter<uint8_t> *key
);

#endif
