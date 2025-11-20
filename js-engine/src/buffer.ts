
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

  readUInt32BE(offset: number): number;
  writeUInt32BE(value: number, offset: number): void;
  readUInt32LE(offset: number): number;
  writeUInt32LE(value: number, offset: number): void;
  readUInt8(offset: number): number;
  writeUInt8(value: number, offset: number): void;

  set(array: ByteArray, offset?: number): void;
  set(array: Uint8Array, offset?: number): void;
  set(array: ArrayBuffer, offset?: number): void;
  set(array: ArrayBufferView, offset?: number): void;
  set(array: ByteArray | Uint8Array | ArrayBuffer | ArrayBufferView, offset?: number): void;

  unwrap(): TBase;
  clone(): IByteArrayLike<TBase>;

  equals(other: IByteArrayLike<Buffer | Uint8Array> | Uint8Array): boolean;
  toString(encoding?: ByteEncoding): string;
  cleanup(): void;
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
        ERROR_CODE.E_CRYPTO_OUT_OF_BOUNDS // eslint-disable-line comma-dangle
      );
    }

    return new ByteArray( Buffer.allocUnsafe(len) );
  }

  public static allocUnsafeSlow(len: number): ByteArray {
    if(!hasNodeBuffer) {
      throw new CryptoError(
        "Feature ByteArray#allocUnsafeSlow() is only available within Node.JS' Buffer API",
        ERROR_CODE.E_CRYPTO_OUT_OF_BOUNDS // eslint-disable-line comma-dangle
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

  public cleanup(): void {
    this.#U8Array = null!;
    this.#U8Array = (this.#IsBuffer ? Buffer.alloc(0) : new Uint8Array(0)) as TBase;
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


export function bufferWithEncoding(buf: Buffer, enc?: BufferEncoding): Buffer | string;
export function bufferWithEncoding<T extends ByteArray<Uint8Array | Buffer> = ByteArray<Uint8Array | Buffer>>(
  buf: T,
  enc?: ByteEncoding
): T | string;

export function bufferWithEncoding(
  buf: ByteArray | Buffer,
  enc?: BufferEncoding | ByteEncoding // eslint-disable-line comma-dangle
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
