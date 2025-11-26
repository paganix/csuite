#include "../main/buffer.c"

int main(void) {
  CBuffer *buffer = cbuffer_alloc(8);
  cbuffer_free(buffer);
  return 0;
}
