
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License.
 * 
 * Modified in 2025 by João Pagani
 *--------------------------------------------------------------------------------------------*/


import { Lazy } from "./@internals/lazy";
import { CryptoError, ERROR_CODE } from "./@internals/errors";
import { Base64, Hex, Latin1, Utf16, Utf8 } from "./encoders";

import type {
  BinaryToTextEncoding, // same as Node's type
  CharacterEncoding,    // same as Node's type
  WithImplicitCoercion, // same as Node's type
  ByteEncoding,         // joins `BinaryToTextEncoding` and `CharacterEncoding`
} from "./@internals/types";


const hasNodeBuffer = typeof Buffer !== "undefined";
const indexOfTable = new Lazy(() => new Uint8Array(0x100));

const MAX_UINT64 = 18446744073709551615n;
const MAX_INT64 = 9223372036854775807n;
const MIN_INT64 = -9223372036854775808n;

const supportedEncodings = new Set([
  "base64", "base64url", "hex", "binary",
  "utf8", "utf-8", "utf16le", "utf-16le", "latin1",
]);


export interface IByteArrayLike<TBase extends Buffer | Uint8Array = Uint8Array> {
  readonly BYTES_PER_ELEMENT: number;
  readonly byteLength: number;
  readonly byteOffset: number;
  readonly buffer: ArrayBufferLike;

  subarray(start?: number, end?: number): ByteArray<TBase>;
  slice(start?: number, end?: number): ByteArray<TBase>;
  indexOf(subarray: ByteArray | Uint8Array, offset?: number): number;
  size(): number;

  readUInt32BE(offset: number): number;
  writeUInt32BE(value: number, offset: number): void;
  readUInt32LE(offset: number): number;
  writeUInt32LE(value: number, offset: number): void;
  readUInt8(offset: number): number;
  writeUInt8(value: number, offset: number): void;

  writeBigInt64BE(value: bigint, offset: number): void;
  writeBigInt64LE(value: bigint, offset: number): void;
  writeBigUInt64BE(value: bigint, offset: number): void;
  writeBigUInt64LE(value: bigint, offset: number): void;
  readBigInt64LE(offset: number): bigint;
  readBigInt64BE(offset: number): bigint;
  readBigUInt64LE(offset: number): bigint;
  readBigUInt64BE(offset: number): bigint;

  set(array: ByteArray, offset?: number): void;
  set(array: Uint8Array, offset?: number): void;
  set(array: ArrayBuffer, offset?: number): void;
  set(array: ArrayBufferView, offset?: number): void;
  set(array: ByteArray | Uint8Array | ArrayBuffer | ArrayBufferView, offset?: number): void;

  unwrap(): TBase;
  clone(): IByteArrayLike<TBase>;

  reverse(): IByteArray<TBase>;
  toReversed(): IByteArray<TBase>;
  equals(other: IByteArrayLike<Buffer | Uint8Array> | Uint8Array): boolean;
  toString(encoding?: ByteEncoding): string;
  cleanup(): IByteArrayLike<TBase>;
}

export type BinaryWrap = IByteArrayLike<Buffer | Uint8Array> | Buffer | Uint8Array;


export interface IByteArray<T extends Buffer | Uint8Array = Buffer | Uint8Array> extends IByteArrayLike<T> { }

export class ByteArray<TBase extends Buffer | Uint8Array = Uint8Array> implements IByteArray<TBase> {
  public static isByteEncoding(arg: unknown): arg is ByteEncoding {
    return typeof arg === "string" && supportedEncodings.has(arg);
  }

  public static alloc(len: number): ByteArray {
    return new ByteArray(len);
  }

  public static allocUnsafe(len: number): ByteArray {
    if(!hasNodeBuffer) {
      throw new CryptoError(
        "Feature ByteArray#allocUnsafe() is only available within Node.JS' Buffer API",
        ERROR_CODE.E_CRYPTO_UNSUPPORTED_OPERATION // eslint-disable-line comma-dangle
      );
    }

    return new ByteArray( Buffer.allocUnsafe(len) );
  }

  public static allocUnsafeSlow(len: number): ByteArray {
    if(!hasNodeBuffer) {
      throw new CryptoError(
        "Feature ByteArray#allocUnsafeSlow() is only available within Node.JS' Buffer API",
        ERROR_CODE.E_CRYPTO_UNSUPPORTED_OPERATION // eslint-disable-line comma-dangle
      );
    }

    return new ByteArray( Buffer.allocUnsafeSlow(len) );
  }


  public static wrap<TBase extends Buffer | Uint8Array>(actual: TBase): ByteArray<TBase> {
    if(hasNodeBuffer && !Buffer.isBuffer(actual)) {
      actual = Buffer.from(actual.buffer, actual.byteOffset, actual.byteLength) as TBase;
    }

    return new ByteArray(actual);
  }

  public static from<TBase extends Buffer | Uint8Array = Uint8Array>(value: TBase): ByteArray<TBase>;
  public static from(value: WithImplicitCoercion<string>, enc?: BinaryToTextEncoding | CharacterEncoding): ByteArray;
  public static from(value: WithImplicitCoercion<ArrayLike<number>>): ByteArray;
  public static from<TArrayBuffer extends WithImplicitCoercion<ArrayBufferLike>>(
    arrayBuffer: TArrayBuffer,
    byteOffset?: number,
    length?: number
  ): ByteArray;
  
  public static from(
    value: Uint8Array | WithImplicitCoercion<string | ArrayLike<number> | ArrayBufferLike>,
    encodingOrByteOffset?: number | BinaryToTextEncoding | CharacterEncoding | null,
    length?: number | null // eslint-disable-line comma-dangle
  ): ByteArray {
    return this.#From_(
      value,
      encodingOrByteOffset,
      length,
      { dontUseNodeBuffer: false } // eslint-disable-line comma-dangle
    );
  }

  public static staticFrom<TBase extends Buffer | Uint8Array = Uint8Array>(value: TBase): ByteArray<TBase>;
  public static staticFrom(value: WithImplicitCoercion<string>, enc?: BinaryToTextEncoding | CharacterEncoding): ByteArray;
  public static staticFrom(value: WithImplicitCoercion<ArrayLike<number>>): ByteArray;
  public static staticFrom<TArrayBuffer extends WithImplicitCoercion<ArrayBufferLike>>(
    arrayBuffer: TArrayBuffer,
    byteOffset?: number,
    length?: number
  ): ByteArray;

  public static staticFrom(
    value: Uint8Array | WithImplicitCoercion<string | ArrayLike<number> | ArrayBufferLike>,
    encodingOrByteOffset?: number | BinaryToTextEncoding | CharacterEncoding | null,
    length?: number | null // eslint-disable-line comma-dangle
  ): ByteArray {
    return this.#From_(
      value,
      encodingOrByteOffset,
      length,
      { dontUseNodeBuffer: true } // eslint-disable-line comma-dangle
    );
  }

  public static concat(buffers: IByteArray[], totalLength?: number): ByteArray {
    if(typeof totalLength !== "number") {
      totalLength = 0;

      for(let i = 0; i < buffers.length; ++i) {
        totalLength += buffers[i].byteLength;
      }
    }

    const res = ByteArray.alloc(totalLength);
    let offset: number = 0;

    for(let i = 0; i < buffers.length; ++i) {
      const buf = buffers[i];

      res.set(buf, offset);
      offset += buf.byteLength;
    }

    return res;
  }

  static #From_(
    value: Uint8Array | WithImplicitCoercion<string | ArrayLike<number> | ArrayBufferLike>,
    encodingOrByteOffset?: number | BinaryToTextEncoding | CharacterEncoding | null,
    length?: number | null,
    options?: { dontUseNodeBuffer?: boolean; depth?: number } // eslint-disable-line comma-dangle
  ): ByteArray {
    const depth = options?.depth ?? 0;

    if(value instanceof Uint8Array || (hasNodeBuffer && Buffer.isBuffer(value)))
      return ByteArray.wrap(value);

    if(
      value instanceof ArrayBuffer ||
      (
        typeof value === "object" && !!value &&
        typeof (value as ArrayBufferLike).byteLength === "number" &&
        "buffer" in value
      )
    ) {
      const buffer = value instanceof ArrayBuffer ? value : (value as { buffer: SharedArrayBuffer }).buffer;

      const byteOffset = typeof encodingOrByteOffset === "number"
        ? encodingOrByteOffset
        : 0;

      return new ByteArray( new Uint8Array(buffer, byteOffset, length ?? (buffer.byteLength - byteOffset)) );
    }
    
    if(Array.isArray(value) && value.every(x => typeof x === "number"))
      return new ByteArray( hasNodeBuffer ? Buffer.from(value) : Uint8Array.from(value) );

    if(typeof value === "string") {
      if(
        typeof encodingOrByteOffset !== "string" ||
        encodingOrByteOffset === "utf-8" ||
        encodingOrByteOffset === "utf8"
      ) return new ByteArray( Utf8.encode(value) );

      switch(encodingOrByteOffset) {
        case "base64":
        case "base64url":
          return new ByteArray(
            Base64.decode(value, {
              urlSafe: encodingOrByteOffset === "base64url",
              dontUseNodeBuffer: options?.dontUseNodeBuffer,
            }) // eslint-disable-line comma-dangle
          );
        case "binary":
        case "latin1":
          return new ByteArray( Latin1.encode(value) );
        case "hex":
          return new ByteArray( Hex.decode(value, false, options?.dontUseNodeBuffer) );
        case "utf-16le":
        case "utf16le":
          return new ByteArray( Utf16.encode(value, options?.dontUseNodeBuffer) );
        default:
          throw new CryptoError(`[ByteArray] Invalid or unknown text encoding "${encodingOrByteOffset}"`, ERROR_CODE.E_CRYPTO_INVALID_ARGUMENT);
      }
    }

    if(depth > 0) {
      throw new CryptoError(`[ByteArray] Failed to cast unknown object to byte array 'typeof ${typeof value}'`, ERROR_CODE.E_CRYPTO_INVALID_TYPE);
    }

    if(
      typeof value === "object" && !!value &&
      "valueOf" in value && typeof value.valueOf === "function"
    ) return ByteArray.#From_(value.valueOf() as any, encodingOrByteOffset, length, { ...options, depth: depth + 1});

    if(
      typeof value === "object" && !!value &&
      Symbol.toStringTag in value &&
      typeof value[Symbol.toStringTag] === "function"
    ) return ByteArray.#From_(String(value), encodingOrByteOffset, length, { ...options, depth: depth + 1});

    throw new CryptoError(`[ByteArray] Failed to cast unknown object to byte array 'typeof ${typeof value}'`, ERROR_CODE.E_CRYPTO_INVALID_TYPE);
  }

  #IsBuffer: boolean;
  #U8Array: TBase;

  protected constructor(lenOrBuf: TBase | number) {
    if(typeof lenOrBuf === "number") {
      if(lenOrBuf < 0) {
        throw new CryptoError("Length of 'typeof ByteArray' must be a positive integer", ERROR_CODE.E_CRYPTO_OUT_OF_BOUNDS);
      }

      this.#IsBuffer = hasNodeBuffer;
      this.#U8Array = (hasNodeBuffer ? Buffer.alloc(lenOrBuf) : new Uint8Array(lenOrBuf)) as TBase;
    } else {
      this.#IsBuffer = hasNodeBuffer && Buffer.isBuffer(lenOrBuf);
      this.#U8Array = lenOrBuf;
    }

    if(!(this.#U8Array instanceof Uint8Array)) {
      throw new CryptoError(`Failed to initialize byte array 'typeof ${typeof lenOrBuf}'`);
    }
  }

  public get BYTES_PER_ELEMENT(): number {
    return this.#U8Array.BYTES_PER_ELEMENT;
  }

  public get byteLength(): number {
    return this.#U8Array.byteLength;
  }

  public get byteOffset(): number {
    return this.#U8Array.byteOffset;
  }

  public get buffer(): ArrayBufferLike {
    return this.#U8Array.buffer;
  }

  public get isNodeBuffer(): boolean {
    return this.#IsBuffer;
  }

  public size(): number {
    return this.#U8Array.length;
  }

  public subarray(start?: number, end?: number): ByteArray<TBase> {
    return new ByteArray<TBase>(this.#U8Array.subarray(start, end) as TBase);
  }

  /**
   * @deprecated Use `ByteArray#subarray()` instead to creates a shallow copy of buffer
   */
  public slice(start?: number, end?: number): ByteArray<TBase> {
    return new ByteArray<TBase>(this.#U8Array.slice(start, end) as TBase);
  }

  public unwrap(shallowCopy?: boolean): TBase {
    return shallowCopy ? this.#U8Array.subarray() as TBase : this.#U8Array;
  }

  public clone(): ByteArray<TBase> {
    const res = ByteArray.alloc(this.#U8Array.byteLength);
    res.set(this);

    return res as ByteArray<TBase>;
  }

  public reverse(): ByteArray<TBase> {
    this.#U8Array.reverse();
    return this;
  }

  public toReversed(): ByteArray<TBase> {
    const arr = [ ...this.#U8Array ].reverse();
    return ByteArray.from(arr) as ByteArray<TBase>;
  }

  public set(array: ByteArray, offset?: number): void;
  public set(array: Uint8Array, offset?: number): void;
  public set(array: ArrayBuffer, offset?: number): void;
  public set(array: ArrayBufferView, offset?: number): void;
  public set(array: ByteArray | Uint8Array | ArrayBuffer | ArrayBufferView, offset?: number): void;
  public set(array: ByteArray | Uint8Array | ArrayBuffer | ArrayBufferView, offset?: number): void {
    if (array instanceof ByteArray) {
      this.#U8Array.set(array.#U8Array, offset);
    } else if (array instanceof Uint8Array) {
      this.#U8Array.set(array, offset);
    } else if (array instanceof ArrayBuffer) {
      this.#U8Array.set(new Uint8Array(array), offset);
    } else if (ArrayBuffer.isView(array)) {
      this.#U8Array.set(new Uint8Array(array.buffer, array.byteOffset, array.byteLength), offset);
    } else {
      throw new CryptoError(`[ByteArray] Unknown argument for 'array' as 'typeof ${typeof array}'`, ERROR_CODE.E_CRYPTO_INVALID_TYPE);
    }
  }

  public readUInt32BE(offset: number): number {
    return readUInt32BE(this.#U8Array, offset);
  }

  public writeUInt32BE(value: number, offset: number): void {
    writeUInt32BE(this.#U8Array, value, offset);
  }

  public readUInt32LE(offset: number): number {
    return readUInt32LE(this.#U8Array, offset);
  }

  public writeUInt32LE(value: number, offset: number): void {
    writeUInt32LE(this.#U8Array, value, offset);
  }

  public readUInt8(offset: number): number {
    return readUInt8(this.#U8Array, offset);
  }

  public writeUInt8(value: number, offset: number): void {
    writeUInt8(this.#U8Array, value, offset);
  }

  public writeBigInt64BE(value: bigint, offset: number): void {
    writeBigInt64BE(this.#U8Array, value, offset);
  }

  public writeBigInt64LE(value: bigint, offset: number): void {
    writeBigInt64LE(this.#U8Array, value, offset);
  }

  public writeBigUInt64BE(value: bigint, offset: number): void {
    writeBigUInt64BE(this.#U8Array, value, offset);
  }

  public writeBigUInt64LE(value: bigint, offset: number): void {
    writeBigUInt64LE(this.#U8Array, value, offset);
  }

  public readBigInt64LE(offset: number): bigint {
    return readBigInt64LE(this.#U8Array, offset);
  }

  public readBigInt64BE(offset: number): bigint {
    return readBigInt64BE(this.#U8Array, offset);
  }

  public readBigUInt64LE(offset: number): bigint {
    return readBigUInt64LE(this.#U8Array, offset);
  }

  public readBigUInt64BE(offset: number): bigint {
    return readBigUInt64BE(this.#U8Array, offset);
  }

  public indexOf(subarray: ByteArray | Uint8Array, offset = 0) {
    return binaryIndexOf(
      this.#U8Array, subarray instanceof ByteArray ? subarray.#U8Array : subarray,
      offset // eslint-disable-line comma-dangle
    );
  }

  public equals(other: unknown): boolean {
    if(!(other instanceof ByteArray))
      return false;

    if(this === other)
      return true;

    if(this.#U8Array.byteLength !== other.#U8Array.byteLength)
      return false;

    // TODO: Check if this can be done more efficiently
    return this.#U8Array.every((value, index) => {
      return value === other.#U8Array[index];
    });
  }

  public toString(encoding?: ByteEncoding, options?: { dontUseNodeBuffer?: boolean }): string {
    if(
      !encoding ||
      encoding === "utf8" || 
      encoding === "utf-8"
    ) return Utf8.decode(this.#U8Array);

    switch(encoding) {
      case "base64":
      case "base64url":
        return Base64.encode(this.#U8Array, {
          urlSafe: encoding === "base64url",
          dontUseNodeBuffer: options?.dontUseNodeBuffer,
        });
      case "hex":
        return Hex.encode(this.#U8Array, options?.dontUseNodeBuffer);
      case "binary":
      case "latin1":
        return Latin1.decode(this.#U8Array);
      case "utf-16le":
      case "utf16le":
        return Utf16.decode(this.#U8Array, options?.dontUseNodeBuffer);
      default:
        throw new CryptoError(`[ByteArray] Invalid or unknown text encoding "${encoding}"`, ERROR_CODE.E_CRYPTO_INVALID_ARGUMENT);
    }
  }

  public cleanup(): this {
    this.#U8Array = null!;
    this.#U8Array = (this.#IsBuffer ? Buffer.alloc(0) : new Uint8Array(0)) as TBase;

    return this;
  }
}


export function binaryIndexOf(
  haystack: Uint8Array,
  needle: Uint8Array,
  offset: number = 0 // eslint-disable-line comma-dangle
): number {
  const needleLen = needle.byteLength;
  const haystackLen = haystack.byteLength;

  if(needleLen === 0)
    return 0;

  if(needleLen === 1)
    return haystack.indexOf(needle[0]);

  if(needleLen > haystackLen - offset)
    return -1;

  const table = indexOfTable.value;
  table.fill(needle.length);

  for(let i = 0; i < needle.length; ++i) {
    table[needle[i]] = needle.length - i - 1;
  }

  let i = offset + needle.length - 1;
  let j = i;
  let result = -1;

  while(i < haystackLen) {
    if(haystack[i] === needle[i]) {
      if(j === 0) {
        result = i;
        break;
      }

      i--;
      j--;
    } else {
      i += Math.max(needle.length - j, table[haystack[i]]);
      j = needle.length - 1;
    }
  }

  return result;
}

export function readUInt16LE(source: Uint8Array, offset: number): number {
  return (
    ((source[offset + 0] << 0) >>> 0) |
    ((source[offset + 1] << 0x8) >>> 0)
  );
}

export function writeUint16LE(destination: Uint8Array, value: number, offset: number): void {
  destination[offset + 0] = (value & 0b11111111);
  value = value >>> 0x8;
  destination[offset + 1] = (value & 0b11111111);
}

export function readUInt32BE(source: Uint8Array, offset: number): number {
  return (
    source[offset] * 2 ** 24
		+ source[offset + 1] * 2 ** 16
		+ source[offset + 2] * 2 ** 8
		+ source[offset + 3]
  );
}

export function writeUInt32BE(destination: Uint8Array, value: number, offset: number): void {
  destination[offset + 3] = value;
  value = value >>> 8;
  destination[offset + 2] = value;
  value = value >>> 8;
  destination[offset + 1] = value;
  value = value >>> 8;
  destination[offset] = value;
}

export function readUInt32LE(source: Uint8Array, offset: number): number {
  return (
    ((source[offset + 0] << 0) >>> 0) |
		((source[offset + 1] << 8) >>> 0) |
		((source[offset + 2] << 16) >>> 0) |
		((source[offset + 3] << 24) >>> 0)
  );
}

export function writeUInt32LE(destination: Uint8Array, value: number, offset: number): void {
  destination[offset + 0] = (value & 0b11111111);
  value = value >>> 8;
  destination[offset + 1] = (value & 0b11111111);
  value = value >>> 8;
  destination[offset + 2] = (value & 0b11111111);
  value = value >>> 8;
  destination[offset + 3] = (value & 0b11111111);
}

export function readUInt8(source: Uint8Array, offset: number): number {
  return source[offset];
}

export function writeUInt8(destination: Uint8Array, value: number, offset: number): void {
  destination[offset] = value;
}

export function writeBigUInt64LE(destination: Uint8Array, value: bigint, offset: number): void {
  ensureRange_(value, 0n, MAX_UINT64, "value 'typeof bigint'");
  ensureBounds_(destination, offset, 8);

  const lo = Number(value & 0xffffffffn);
  const hi = Number(value >> 0x20n & 0xffffffffn);

  destination[offset] = lo;
  destination[offset + 1] = lo >> 0x08;
  destination[offset + 2] = lo >> 0x10;
  destination[offset + 3] = lo >> 0x18;

  destination[offset + 4] = hi;
  destination[offset + 5] = hi >> 0x08;
  destination[offset + 6] = hi >> 0x10;
  destination[offset + 7] = hi >> 0x18;
}

export function writeBigUInt64BE(destination: Uint8Array, value: bigint, offset: number): void {
  ensureRange_(value, 0n, MAX_UINT64, "value 'typeof bigint'");
  ensureBounds_(destination, offset, 8);

  const lo = Number(value & 0xffffffffn);
  const hi = Number(value >> 0x20n & 0xffffffffn);

  destination[offset] = hi >> 0x18;
  destination[offset + 1] = hi >> 0x10;
  destination[offset + 2] = hi >> 0x08;
  destination[offset + 3] = hi;

  destination[offset + 4] = lo >> 0x18;
  destination[offset + 5] = lo >> 0x10;
  destination[offset + 6] = lo >> 0x08;
  destination[offset + 7] = lo;
}

export function writeBigInt64LE(destination: Uint8Array, value: bigint, offset: number): void {
  ensureRange_(value, MIN_INT64, MAX_INT64, "value 'typeof bigint'");
  ensureBounds_(destination, offset, 8);

  const lo = Number(value & 0xffffffffn);
  const hi = Number(value >> 0x20n & 0xffffffffn);

  destination[offset] = lo;
  destination[offset + 1] = lo >> 0x08;
  destination[offset + 2] = lo >> 0x10;
  destination[offset + 3] = lo >> 0x18;

  destination[offset + 4] = hi;
  destination[offset + 5] = hi >> 0x08;
  destination[offset + 6] = hi >> 0x10;
  destination[offset + 7] = hi >> 0x18;
}

export function writeBigInt64BE(destination: Uint8Array, value: bigint, offset: number): void {
  ensureRange_(value, MIN_INT64, MAX_INT64, "value 'typeof bigint'");
  ensureBounds_(destination, offset, 8);

  const lo = Number(value & 0xffffffffn);
  const hi = Number(value >> 0x20n & 0xffffffffn);

  destination[offset] = hi >> 0x18;
  destination[offset + 1] = hi >> 0x10;
  destination[offset + 2] = hi >> 0x08;
  destination[offset + 3] = hi;

  destination[offset + 4] = lo >> 0x18;
  destination[offset + 5] = lo >> 0x10;
  destination[offset + 6] = lo >> 0x08;
  destination[offset + 7] = lo;
}

export function readBigUInt64LE(source: Uint8Array, offset: number): bigint {
  ensureBounds_(source, offset, 8);

  const lo = source[offset] | (source[offset + 1] << 8) | (source[offset + 2] << 16) | (source[offset + 3] << 24);
  const hi = source[offset + 4] | (source[offset + 5] << 8) | (source[offset + 6] << 16) | (source[offset + 7] << 24);

  // We use >>> 0 to ensure the 32-bit integers are treated as unsigned before converting to BigInt
  return (BigInt(hi >>> 0) << 32n) | BigInt(lo >>> 0);
}

export function readBigUInt64BE(source: Uint8Array, offset: number): bigint {
  ensureBounds_(source, offset, 8);

  const hi = source[offset] << 24 | (source[offset + 1] << 16) | (source[offset + 2] << 8) | source[offset + 3];
  const lo = source[offset + 4] << 24 | (source[offset + 5] << 16) | (source[offset + 6] << 8) | source[offset + 7];

  return (BigInt(hi >>> 0) << 32n) | BigInt(lo >>> 0);
}

export function readBigInt64LE(source: Uint8Array, offset: number): bigint {
  const unsigned = readBigUInt64LE(source, offset);
  return BigInt.asIntN(0x40, unsigned);
}

export function readBigInt64BE(source: Uint8Array, offset: number): bigint {
  const unsigned = readBigUInt64BE(source, offset);
  return BigInt.asIntN(0x40, unsigned);
}


export function mask(
  source: Uint8Array,
  mask?: Uint8Array | number | null,
  inplace: boolean = true // eslint-disable-line comma-dangle
): Uint8Array {
  if(!mask) {
    if(inplace) return source;
    const dest = new Uint8Array(source.length);
    
    for(let i = 0; i < source.length; ++i) {
      dest[i] = source[i];
    }

    return dest;
  }

  const maskLen = mask instanceof Uint8Array ? mask.length : 1;
  const dest = inplace ? source : new Uint8Array(source.length);

  for(let i = 0; i < dest.length; ++i) {
    const maskByte = mask instanceof Uint8Array
      ? mask[i % maskLen]
      : mask;

    dest[i] = source[i] ^ maskByte;
  }

  return dest;
}

export function bufferWithEncoding(buf: Buffer, enc?: BufferEncoding | null): Buffer | string;
export function bufferWithEncoding<T extends IByteArray<Uint8Array | Buffer> = ByteArray<Uint8Array | Buffer>>(
  buf: T,
  enc?: ByteEncoding | null
): T | string;

export function bufferWithEncoding(
  buf: ByteArray | Buffer,
  enc?: BufferEncoding | ByteEncoding | null // eslint-disable-line comma-dangle
): Buffer | ByteArray | string {
  if(hasNodeBuffer && Buffer.isBuffer(buf))
    return enc && Buffer.isEncoding(enc) ? buf.toString(enc) : buf;

  if(buf instanceof ByteArray)
    return enc && ByteArray.isByteEncoding(enc) ? buf.toString(enc) : buf;

  throw new CryptoError(`Cannot resolve unknown 'typeof ${typeof buf}' as binary wrap`, ERROR_CODE.E_CRYPTO_INVALID_ARGUMENT);
}


export function toByteArray(chunk: unknown): ByteArray {
  if(chunk instanceof ByteArray)
    return chunk;

  if(typeof chunk === "string")
    return ByteArray.from(chunk);
  
  if(chunk instanceof ArrayBuffer)
    return ByteArray.from(chunk);
  
  if(chunk instanceof Uint8Array)
    return ByteArray.from(chunk);
  
  if(chunk instanceof Uint16Array)
    return ByteArray.from(chunk);
  
  if(chunk instanceof Uint32Array)
    return ByteArray.from(chunk);
  
  if(chunk instanceof Int8Array)
    return ByteArray.from(chunk);
  
  if(chunk instanceof Int16Array)
    return ByteArray.from(chunk);
  
  if(chunk instanceof Int32Array)
    return ByteArray.from(chunk);
  
  if(chunk instanceof Float32Array)
    return ByteArray.from(chunk);
  
  if(chunk instanceof Float64Array)
    return ByteArray.from(chunk);
  
  if(chunk instanceof SharedArrayBuffer)
    return ByteArray.from(chunk);
  
  if(chunk instanceof DataView)
    return ByteArray.from(chunk.buffer, chunk.byteOffset, chunk.byteLength);

  if(ArrayBuffer.isView(chunk))
    return ByteArray.from(chunk.buffer, chunk.byteOffset, chunk.byteLength);

  if(Array.isArray(chunk))
    return ByteArray.from(chunk);

  throw new CryptoError(`Failed to cast 'typeof ${typeof chunk}' to binary representation`, ERROR_CODE.E_CRYPTO_INVALID_TYPE);
}

export function chunkToBuffer(obj: unknown): Uint8Array {
  if(hasNodeBuffer && Buffer.isBuffer(obj))
    return obj;

  if(obj instanceof Uint8Array)
    return obj;

  return toByteArray(obj).unwrap();
}


function ensureRange_(value: number, min: number, max: number, name?: string): void;
function ensureRange_(value: bigint, min: bigint, max: bigint, name?: string): void;
function ensureRange_(
  value: bigint | number,
  min: bigint | number,
  max: bigint | number,
  name?: string // eslint-disable-line comma-dangle
): void {
  if(typeof value === "bigint") {
    if(typeof min !== "bigint" || typeof max !== "bigint") {
      throw new CryptoError(`The value of "${name}" is out of range`);
    }

    if(value < min || value > max) {
      throw new CryptoError(`The value of "${name}" is out of range`);
    }
  } else {
    if(typeof min !== "number" || typeof max !== "number") {
      throw new CryptoError(`The value of "${name}" is out of range`);
    }

    if(value < min || value > max) {
      throw new CryptoError(`The value of "${name}" is out of range`);
    }
  }
}

function ensureBounds_(buf: Uint8Array, offset: number, byteLen: number): void {
  if(offset < 0 || offset + byteLen > buf.length) {
    const diff = buf.byteLength - (offset + byteLen);

    throw new CryptoError(
      `Attempt to access memory outside buffer bounds (${diff < 0 ? "-" : ""}0x${Math.abs(diff).toString(16).toUpperCase()})`,
      ERROR_CODE.E_CRYPTO_OUT_OF_BOUNDS // eslint-disable-line comma-dangle
    );
  }
}
