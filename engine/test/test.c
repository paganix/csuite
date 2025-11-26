#include "../main/ciphers/aead.c"

int main(void) {
  void *s = (void *) malloc(sizeof(AEADMode));
  free(s);
  return 0;
}
