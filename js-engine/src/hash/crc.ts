
/**
 * Copyright © Michaelangel007 (2017) and The PHP Group (2001-2025)
 * 
 * Modified in 2025 by João Pagani
 * 
 * @see https://php.net/manual/en_US/function.crc32.php
 * @see https://github.com/Michaelangel007/crc32/
 */


import { Lazy } from "../@internals/lazy";
import { toByteArray, type IByteArray } from "../buffer";
import { CryptoError, ERROR_CODE } from "../@internals/errors";
import type { BufferLike, NumericFormat } from "../@internals/types";


let REG_ = 0xFFFFFFFF;

const crc64Table = new Lazy(() => {
  const len = 0x100;
  const arr = new Array<number>(len);

  // ECMA polynomial
  const poly64rev = (0xC96C5795 << 0) | 0xD7870F42;

  // ISO polynomial
  // poly64rev = 0xD8 << 56;

  for(let i = 0; i < len; ++i) {
    let part: number = i, bit: number = 0;

    for(; bit < 0x8; bit++) {
      if(part & 0x1) {
        part = ((part >> 0x1) & ~(0x8 << 0x1C)) ^ poly64rev;
      } else {
        part = (part >> 0x1) & ~(0x8 << 0x1C);
      }
    }

    arr[i] = part;
  }

  return arr;
});


export function crc64(
  value: BufferLike | IByteArray,
  format?: "%d" | "%u" | null // eslint-disable-line comma-dangle
): number;

export function crc64(
  value: BufferLike | IByteArray,
  format: "0x%x" | "0x%X" // eslint-disable-line comma-dangle
): string;

export function crc64(
  value: BufferLike | IByteArray,
  format?: NumericFormat | null // eslint-disable-line comma-dangle
): number | string {
  let crc: number = 0;
  const arr = toByteArray(value).unwrap();

  for(let i = 0; i < arr.length; ++i) {
    crc = (
      crc64Table.value[(crc ^ arr[i]) & 0xFF] ^
      ((crc >> 0x8) & ~(0xFF << 0x18))
    );
  }

  if(!format || format === "%d")
    return crc << 0;

  if(format === "%u")
    return crc >>> 0;

  if(format === "0x%X" || format === "0x%x") {
    const sign = crc < 0;
    return `${sign ? "-" : ""}0x${Math.abs(crc).toString(16)}`[format === "0x%X" ? "toUpperCase" : "toLowerCase"]();
  }

  throw new CryptoError("Invalid output format for CRC-64", ERROR_CODE.E_CRYPTO_INVALID_ARGUMENT);
}


export function bitCRC32(
  value: BufferLike | IByteArray,
  first: boolean = false // eslint-disable-line comma-dangle
): number {
  if(first) {
    REG_ = 0xFFFFFFFF;
  }

  const polyReflected = 0xEDB88320;

  const arr = toByteArray(value).unwrap();
  const zeros = arr.length < 4 ? arr.length : 4;

  for(let i = 0; i < zeros; ++i) {
    REG_ ^= arr[i] << i * 0x8;
  }

  for(let i = 4; i < arr.length; ++i) {
    const next = arr[i];

    for(let bit = 0; bit < 0x8; bit++) {
      REG_ = (
        ((REG_ >> 0x1 & 0x7FFFFFFF) | (next >> bit & 0x1) << 0x1F) ^
        (REG_ & 0x1) * polyReflected
      );
    }
  }

  for(let i = 0; i < zeros * 0x8; ++i) {
    REG_ = (
      (REG_ >> 0x1 & 0x7FFFFFFF) ^
      (REG_ & 0x1) * polyReflected
    );
  }

  return ~REG_;
}


export class BrokenCRC32 {
  #Crc: number[];

  public constructor(poly?: number) {
    poly ??= 0x04C11DB7;
    this.#Crc = new Array(0x100);

    for(let i = 0; i < 0x100; ++i) {
      let crc = i;

      for(let bit = 0; bit < 0x8; bit++) {
        if((crc & 1) === 1) {
          crc >>= 0x1;
          crc &= 0x7FFFFFFF;
          crc ^= poly;
        } else {
          crc >>= 0x1;
          crc &= 0x7FFFFFFF;
        }
      }

      this.#Crc[i] = crc;
    }
  }

  public computeHash(data: BufferLike | IByteArray, output?: "%d" | "%u"): number {
    const arr = toByteArray(data).unwrap();
    let hash: number = 0xFFFFFFFF;

    for(let i = 0; i < arr.length; ++i) {
      hash = this.#Crc[ i ^ (hash >> 0x18) ] ^ (hash << 8);
    }

    hash = ~hash;
    return output === "%u" ? Math.abs(hash) : hash;
  }

  public dump(): string {
    return dump_(this.#Crc);
  }
}

export class CRC32 {
  #Crc: number[];
  #Reverse8: number[];

  public constructor(poly?: number) {
    const len = 0x100;
    poly ??= 0x04C11DB7;

    this.#Crc = new Array(len);

    for(let i = 0; i < len; ++i) {
      let crc = i << 0x18;

      for(let bit = 0; bit < 0x8; bit++) {
        if(crc < 0) {
          crc <<= 0x1;
          crc ^= poly;
        } else {
          crc <<= 0x1;
        }
      }

      this.#Crc[i] = crc;
    }

    this.#Reverse8 = new Array(len);

    for(let i = 0; i < len; ++i) {
      this.#Reverse8[i] = (this.#Reflect(i) >> 0x18) & 0xFF;
    }
  }

  public reflect32(int: number): number {
    return this.#Reflect(int);
  }

  public computeHash(data: BufferLike | IByteArray, output?: "%d" | "%u"): number {
    let hash = 0xFFFFFFFF;
    const arr = toByteArray(data).unwrap();

    for(let i = 0; i < arr.length; ++i) {
      hash = this.#Crc[ (this.#Reverse8[ i ] ^ (hash >> 0x18)) & 0xFF ] ^ (hash << 0x8);
    }

    hash = this.#Reflect( ~hash );
    return output === "%u" ? Math.abs(hash) : hash;
  }

  public dump(): string {
    return dump_(this.#Crc);
  }

  #Reflect(x: number): number {
    let bits = 0, mask = x;

    for(let i = 0; i < 0x20; i++) {
      bits <<= 0x1;

      if((mask & 0x1) === 1) {
        bits |= 0x1;
      }

      mask >>= 0x1;
    }

    return bits;
  }
}

export class ReflectCRC32 {
  #Crc: number[];

  public constructor(poly?: number) {
    poly ??= 0xEDB88320;
    this.#Crc = new Array(0x100);

    for(let i = 0; i < 0x100; ++i) {
      let crc = i;

      for(let bit = 0; bit < 0x8; bit++) {
        if((crc & 0x1) === 1) {
          crc >>= 0x1;
          crc &= 0x7FFFFFFF;
          crc ^= poly;
        } else {
          crc >>= 0x1;
          crc &= 0x7FFFFFFF;
        }
      }

      this.#Crc[i] = crc;
    }
  }

  public computeHash(data: BufferLike | IByteArray, output?: "%d" | "%u"): number {
    let hash = 0xFFFFFFFF;
    const arr = toByteArray(data).unwrap();

    for(let i = 0; i < arr.length; ++i) {
      hash = this.#Crc[ (i ^ hash) & 0xFF ] ^ ((hash >> 8) & 0xFFFFFF);
    }

    hash = ~hash;
    return output === "%u" ? Math.abs(hash) : hash;
  }

  public dump(): string {
    return dump_(this.#Crc);
  }
}


function dump_(arr: number[] | readonly number[], o?: { tabSize?: number }): string {
  const len = 0x100;
  const out: string[] = [];

  if(arr.length < len) {
    throw new CryptoError("[BrokenCRC32] Invalid array length for #dump()", ERROR_CODE.E_CRYPTO_INVALID_ARGUMENT);
  }

  for(let i = 0; i < len; ++i) {
    if(i % 0x8 === 0) {
      out.push(" ".repeat(o?.tabSize ?? 4));
    }

    const hex32 = arr[i].toString(16)
      .toUpperCase()
      .padStart(8, "0");

    out.push(`${hex32}, `);

    if(i % 0x8 === 0x7) {
      const base = i - 0x7;
      const hex8 = i.toString(16)
        .toUpperCase()
        .padStart(2, "0");

      out.push(` // ${base.toString().padStart(3, " ")} [ 0x${hex8} ]\n`);
    }
  }

  return out.join("") + "\n";
}


let ins32: CRC32 | null = null;

export function crc32(
  data: BufferLike | IByteArray,
  o?: { poly?: number; output?: "%d" | "%u" } // eslint-disable-line comma-dangle
): number {
  if(ins32 == null) {
    ins32 = new CRC32(o?.poly);
  }

  return ins32.computeHash(data, o?.output);
}

export function dump32(): string | null {
  return ins32?.dump() ?? null;
}
