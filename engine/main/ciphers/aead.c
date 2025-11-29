#ifndef __CSUITE_CIPAEAD_MODULE__
#define __CSUITE_CIPAEAD_MODULE__ 0x1


#include "aead.h"


typedef enum {
  AES_GCM = 0x15,
  AES_CCM = 0x1C,
  CHACHA20_POLY1305 = 0xC5,
} AGID;

static const unsigned char AES_KEY_SIZES[] = { 0x10, 0x18, 0x20 };
#define AES_KEY_SIZES_COUNT (sizeof(AES_KEY_SIZES) / sizeof(unsigned char))

static const unsigned char CHACHA20_KEY_SIZES[] = { 0x20 };
#define CHACHA20_KEY_SIZES_COUNT (sizeof(CHACHA20_KEY_SIZES) / sizeof(unsigned char))


static AEADMode AEAD_AES_GCM_MODE = {
  .basename = "aes-gcm",
  .agid = AES_GCM,
  .iv_length = 0xC,
  .tag_length = 0x10,
  .allowed_key_sizes = AES_KEY_SIZES,
  .allowed_key_sizes_count = AES_KEY_SIZES_COUNT
};

static AEADMode AEAD_AES_CCM_MODE = {
  .basename = "aes-ccm",
  .agid = AES_CCM,
  .iv_length = 0xD,
  .tag_length = 0x10,
  .allowed_key_sizes = AES_KEY_SIZES,
  .allowed_key_sizes_count = AES_KEY_SIZES_COUNT
};

static AEADMode AEAD_CHACHA20_MODE = {
  .basename = "chacha20-poly1305",
  .agid = CHACHA20_POLY1305,
  .iv_length = 0xC,
  .tag_length = 0x10,
  .allowed_key_sizes = CHACHA20_KEY_SIZES,
  .allowed_key_sizes_count = CHACHA20_KEY_SIZES_COUNT
};


AEADMode* aead_aes(const char *mode) {
  if(!mode) return NULL;

  if(strcmp(mode, "ccm") == 0 || strcmp(mode, "CCM") == 0)
    return &AEAD_AES_CCM_MODE;

  if(strcmp(mode, "gcm") == 0 || strcmp(mode, "GCM") == 0)
    return &AEAD_AES_GCM_MODE;

  return NULL;
}

AEADMode* aead_chacha20() {
  return &AEAD_CHACHA20_MODE;
}

#endif
