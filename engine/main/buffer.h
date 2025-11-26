#ifndef __CSUITE_BUFFER_HEADER__
#define __CSUITE_BUFFER_HEADER__ 0x1

#define CBUFFER_DEFAULT_CAPACITY 0x40
#define CBUFFER_GROWTH_FACTOR 0x2

#define CBUFFER_BYTES_PER_ELEMENT 0x1

#define CBUFFER_ENCODING_HEX        0x1 << 0
#define CBUFFER_ENCODING_BASE64     0x1 << 1
#define CBUFFER_ENCODING_LATIN1     0x1 << 2
#define CBUFFER_ENCODING_UTF8       0x1 << 3
#define CBUFFER_ENCODING_UTF16LE    0x1 << 4

#define CBUFFER_BYTEOFFSET(b) 0

#include <stddef.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include <stdio.h>
#include <math.h>
#include <limits.h>


typedef struct {
  size_t byte_length;
  size_t capacity;
  unsigned char *data;
} CBuffer;

CBuffer* cbuffer_alloc(size_t capacity);
CBuffer* cbuffer_from(const void *source, size_t src_len);
CBuffer* cbuffer_clone(CBuffer *buffer);
CBuffer* cbuffer_subarray(const CBuffer *buffer, size_t start, size_t end);

int cbuffer_indexof(CBuffer *buffer, const void *search, size_t search_len, size_t offset);
int cbuffer_compare(const CBuffer *buffer, const CBuffer *other);
int cbuffer_equals(const CBuffer *buffer, const CBuffer *other);

void cbuffer_free(CBuffer *buffer);
int cbuffer_ensure_capacity(CBuffer *buffer, size_t req_size);

int cbuffer_write(CBuffer *buffer, const void *source, size_t src_len);

int cbuffer_read_byte(const CBuffer *buffer, size_t offset);
int cbuffer_write_byte(const CBuffer *buffer, size_t offset, unsigned char value);

char* cbuffer_tostring(const CBuffer *buffer, const int encoding);

#endif
