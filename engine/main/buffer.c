#ifndef __CSUITE_BUFFER_MODULE__
#define __CSUITE_BUFFER_MODULE__ 0x1


#include "buffer.h"


#define CBUFFER_BOUNDS_CHECK(buffer, offset, size) \
  ((buffer) && (offset) <= (buffer)->byte_length && ((buffer)->byte_length - (offset)) >= (size) ? 0 : -1)


static inline uint16_t swap_endian_16(uint16_t value) {
  return (value << 0x8) | (value >> 0x8);
}

static inline uint32_t swap_endian_32(uint32_t value) {
  return (value << 0x18) | ((value & 0x0000FF00) << 0x8) | ((value & 0x00FF0000) >> 0x8) | (value >> 0x18);
}

static inline uint64_t swap_endian_64(uint64_t value) {
  uint64_t result = 0;

  for(int bit = 0; bit < 0x8; bit++) {
    result |= (uint64_t) ((value >> (bit * 0x8)) & 0xFF) << ((0x7 - bit) * 0x8);
  }

  return result;
}

static char* cbuffer_to_hex(const CBuffer *buffer) {
  size_t len = buffer->byte_length;
  char *hex_str = (char *) malloc(len * 2 + 1);

  if(!hex_str)
    return NULL;

  for(size_t i = 0; i < len; i++) {
    sprintf(&hex_str[i * 2], "%02x", buffer->data[i]);
  }

  return hex_str;
}


CBuffer* cbuffer_alloc(size_t capacity) {
  CBuffer *buffer = (CBuffer *) malloc(sizeof(CBuffer));

  if(!buffer) {
    perror("CBuffer allocation failed due to unknown reason");
    return NULL;
  }

  buffer->capacity = (capacity > 0) ? capacity : CBUFFER_DEFAULT_CAPACITY;
  buffer->data = (unsigned char *) malloc(buffer->capacity);

  if(!buffer->data) {
    perror("CBuffer internal data allocation failed due to unknown reason");
    free(buffer);

    return NULL;
  }

  buffer->byte_length = 0;
  return buffer;
}

void cbuffer_free(CBuffer *buffer) {
  if(buffer) {
    if(buffer->data) {
      free(buffer->data);
    }

    free(buffer);
  }
}

CBuffer* cbuffer_from(const void *source, size_t src_len) {
  if(!source || src_len == 0)
    return cbuffer_alloc(CBUFFER_DEFAULT_CAPACITY);

  CBuffer *buffer = (CBuffer *) malloc(sizeof(CBuffer));
  if(!buffer) return NULL;

  buffer->data = (unsigned char *) malloc(src_len);

  if(!buffer->data) {
    free(buffer);
    return NULL;
  }

  memcpy(buffer->data, source, src_len);

  buffer->byte_length = src_len;
  buffer->capacity = src_len;

  return buffer;
}

int cbuffer_ensure_capacity(CBuffer *buffer, size_t size) {
  if(!buffer) return -1;
  if(buffer->capacity >= size) return 0;

  size_t new_capacity = buffer->capacity;

  while(new_capacity < size) {
    new_capacity *= CBUFFER_GROWTH_FACTOR;

    if(new_capacity < buffer->capacity) {
      new_capacity = size;
    }
  }

  unsigned char *new_data = (unsigned char *) realloc(buffer->data, new_capacity);

  if(!new_data) {
    perror("CBuffer reallocation failed due to unknwon reason");
    return -1;
  }

  buffer->data = new_data;
  buffer->capacity = new_capacity;

  return 0;
}

int cbuffer_write(CBuffer *buffer, const void *source, size_t src_len) {
  if(!buffer || !source || src_len == 0) return 0;
  
  size_t tr_size = buffer->byte_length + src_len;

  if(cbuffer_ensure_capacity(buffer, tr_size) != 0) return -1;

  memcpy(buffer->data + buffer->byte_length, source, src_len);
  buffer->byte_length = tr_size;

  return (int) src_len;
}

CBuffer* cbuffer_clone(CBuffer *buffer) {
  if(!buffer) return NULL;
  return cbuffer_from(buffer->data, buffer->byte_length);
}

CBuffer* cbuffer_subarray(const CBuffer *buffer, size_t start, size_t end) {
  if(!buffer) return NULL;

  if(end == 0 || end > buffer->byte_length) {
    end = buffer->byte_length;
  }

  if(start >= buffer->byte_length || start >= end)
    return cbuffer_alloc(0);

  size_t slice_len = end - start;
  return cbuffer_from(buffer->data + start, slice_len);
}


#define CBUFFER_READ_VALUE(T, size, swap_func) \
  if(CBUFFER_BOUNDS_CHECK(buffer, offset, size) != 0) return 0; \
  T value; \
  memcpy(&value, buffer->data + offset, size); \
  return swap_func(value);

#define CBUFFER_WRITE_VALUE(T, size, swap_func) \
  if(CBUFFER_BOUNDS_CHECK(buffer, offset, size) != 0) return 0; \
  T value_le = swap_func(value); \
  mempcy(buffer->data + offset, &value_le, size); \
  return 0;

#endif
