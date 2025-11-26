import { Utf8 } from "./encoders";
import { type Either, left, right } from "./components";
import { CryptoError, ERROR_CODE } from "./@internals/errors";
import type { BufferLike, ByteEncoding } from "./@internals/types";
import { ByteArray, toByteArray, type IByteArray } from "./buffer";
import { jsonSafeParser, jsonSafeStringify } from "./components/safe-json";


export interface IReader {
  read(len?: number): IByteArray;
  readonly readable: boolean;
}

export interface IWriter {
  write(chunk: BufferLike | IByteArray | readonly number[] | number[]): void;
  drain(): IByteArray;
  
  readonly writable: boolean;
}


export class ByteReader implements IReader {
  #Buffer: IByteArray;
  #Cursor: number;
  #Total: number;

  public constructor(source: BufferLike | IByteArray) {
    this.#Buffer = toByteArray(source);

    this.#Cursor = 0;
    this.#Total = this.#Buffer.byteLength;
  }

  public get consumedBytes(): number {
    return this.#Cursor;
  }

  public get remainingBytes(): number {
    return this.#Total - this.#Cursor;
  }

  public get byteLength(): number {
    return this.#Total;
  }

  public get readable(): boolean {
    return this.#Cursor < this.#Buffer.byteLength;
  }

  public read(length?: number): IByteArray {
    const remaining = this.#Buffer.byteLength - this.#Cursor;

    if(remaining < 1) {
      throw new CryptoError("The buffer has already been completly consumed");
    }

    if(typeof length !== "number" || length < 1) {
      const out = this.#Buffer.subarray(this.#Cursor);

      this.#Cursor = this.#Buffer.byteLength;
      this.#Buffer = null!;

      return out;
    }

    const len = Math.min(length, remaining) | 0;
    const chunk = this.#Buffer.subarray(this.#Cursor, this.#Cursor + len);

    this.#Cursor += len;
    return chunk;
  }

  public peek(length?: number, offset?: number): IByteArray {
    if(typeof length !== "number" || length < 0) {
      length = this.#Buffer.byteLength;
    }

    return this.#Buffer.subarray(
      typeof offset === "number" && offset >= 0 ? offset | 0 : 0,
      Math.min(length, this.#Buffer.byteLength) | 0 // eslint-disable-line comma-dangle
    );
  }

  public clear(): void {
    this.#Buffer.cleanup();
    
    this.#Cursor = 0;
    this.#Total = -1;
  }
}

export class ByteWriter implements IWriter {
  #Buffers: IByteArray[];
  #Disposed: boolean;
  #Bytes: number;

  public constructor() {
    this.#Buffers = [];
    this.#Bytes = 0;
    this.#Disposed = false;
  }

  public get writable(): boolean {
    return !this.#Disposed;
  }

  public get buffer(): IByteArray {
    this.#EnsureNotDisposed();
    return ByteArray.concat(this.#Buffers);
  }

  public get byteLength(): number {
    this.#EnsureNotDisposed();
    return this.#Bytes;
  }

  public write(data: BufferLike | IByteArray | readonly number[] | number[]): void {
    this.#EnsureNotDisposed();
    const buffer = toByteArray(data);

    this.#Buffers.push(buffer);
    this.#Bytes += buffer.byteLength;
  }

  public drain(): IByteArray;
  public drain(enc: ByteEncoding): string;
  public drain(enc?: ByteEncoding): IByteArray | string {
    this.#EnsureNotDisposed();
    const result = ByteArray.concat(this.#Buffers);

    this.#Buffers.forEach(x => x.cleanup());
    this.#Buffers.length = 0;
    this.#Bytes = 0;

    return enc && ByteArray.isByteEncoding(enc) ? result.toString(enc) : result;
  }
  
  public dispose(): void {
    if(!this.#Disposed) {
      this.#Buffers.forEach(x => x.cleanup());
      this.#Buffers.length = 0;
      this.#Bytes = 0;

      this.#Disposed = true;
    }
  }

  #EnsureNotDisposed(): void {
    if(this.#Disposed) {
      throw new CryptoError("The current ByteWriter instance is already disposed", ERROR_CODE.E_CRYPTO_RESOURCE_DISPOSED);
    }
  }
}


export const enum SERIALIZABLE_DATA_TYPE {
  NULL = 0,
  STRING = 1,
  UINT32 = 2,
  INT64 = 3,
  FLOAT64 = 4,
  OBJECT = 5,
  ARRAY = 6,
  MARSHAL_OBJECT = 7,
  BINARY = 8,
}

function createOneByteBuffer_(value: number): IByteArray {
  return ByteArray.from([ value ]);
}

const TypePresets: {
  readonly [K in keyof typeof SERIALIZABLE_DATA_TYPE]: Uint8Array // Just for debug
} = Object.freeze({
  NULL: createOneByteBuffer_(SERIALIZABLE_DATA_TYPE.NULL).unwrap(),
  STRING: createOneByteBuffer_(SERIALIZABLE_DATA_TYPE.STRING).unwrap(),
  UINT32: createOneByteBuffer_(SERIALIZABLE_DATA_TYPE.UINT32).unwrap(),
  INT64: createOneByteBuffer_(SERIALIZABLE_DATA_TYPE.INT64).unwrap(),
  FLOAT64: createOneByteBuffer_(SERIALIZABLE_DATA_TYPE.FLOAT64).unwrap(),
  OBJECT: createOneByteBuffer_(SERIALIZABLE_DATA_TYPE.OBJECT).unwrap(),
  ARRAY: createOneByteBuffer_(SERIALIZABLE_DATA_TYPE.ARRAY).unwrap(),
  MARSHAL_OBJECT: createOneByteBuffer_(SERIALIZABLE_DATA_TYPE.MARSHAL_OBJECT).unwrap(),
  BINARY: createOneByteBuffer_(SERIALIZABLE_DATA_TYPE.BINARY).unwrap(),
});


const vqlZero = createOneByteBuffer_(0);

export function readIntVQL(reader: IReader): number {
  let value: number = 0;

  for(let shift = 0; ; shift += 7) {
    const next = reader.read(1).unwrap()[0];
    value |= (next & 0x7F) << shift;

    if((next & 0x80) === 0)
      break;
  }

  return value;
}

export function writeInt32VQL(writer: IWriter, value: number): void {
  if(value === 0) {
    writer.write(vqlZero);
    return;
  }

  const result: number[] = [];

  while(value !== 0) {
    let byte = value & 0x7F;
    value >>>= 7;

    if(value > 0) {
      byte |= 0x80;
    }

    result.push(byte);
  }

  writer.write(result);
}


export function inlineSerialize(writer: IWriter, data: unknown): void {
  if(data == null || typeof data === "undefined") {
    writer.write(TypePresets.NULL);
  } else if(typeof data === "string") {
    const buffer = Utf8.encode(data);

    writer.write(TypePresets.STRING);
    writeInt32VQL(writer, buffer.length);
    writer.write(buffer);
  } else if(typeof data === "number" && (data | 0) === data) {
    writer.write(TypePresets.UINT32);
    writeInt32VQL(writer, data);
  } else if(typeof data === "number" && !Number.isInteger(data)) {
    const str = data.toString();

    writer.write(TypePresets.FLOAT64);
    writeInt32VQL(writer, str.length);
    writer.write(str);
  } else if(typeof data === "bigint") {
    const buf = ByteArray.alloc(8);
    const sign = data < 0n ? 1 : 0;

    if(sign === 1) {
      buf.writeBigInt64BE(data, 0);
    } else {
      buf.writeBigUInt64BE(data, 0);
    }

    writer.write(TypePresets.INT64);
    writeInt32VQL(writer, sign);
    writer.write(buf);
  } else if(Array.isArray(data)) {
    writer.write(TypePresets.ARRAY);
    writeInt32VQL(writer, data.length);

    for(let i = 0; i < data.length; ++i) {
      inlineSerialize(writer, data[i]);
    }
  } else if(
    data instanceof Uint8Array ||
    data instanceof ArrayBuffer || 
    data instanceof ByteArray
  ) {
    const buf = toByteArray(data).unwrap();

    writer.write(TypePresets.BINARY);
    writeInt32VQL(writer, buf.length);
    writer.write(buf);
  } else {
    // TODO: check for marshalling candidates

    const result = jsonSafeStringify(data);
    const buf = result.isRight() ? Utf8.encode(result.value) : null;

    if(buf == null) {
      throw result.value;
    }

    writer.write(TypePresets.OBJECT);
    writeInt32VQL(writer, buf.length);
    writer.write(buf);
  }
}

export function inlineDeserialize<T = any>(reader: IReader): T {
  const type = reader.read(1).unwrap()[0];

  switch(type) {
    case SERIALIZABLE_DATA_TYPE.NULL:
      return null as T;
    case SERIALIZABLE_DATA_TYPE.STRING: {
      const len = readIntVQL(reader);
      return Utf8.decode(reader.read(len).unwrap()) as T;
    } break;
    case SERIALIZABLE_DATA_TYPE.UINT32:
      return readIntVQL(reader) as T;
    case SERIALIZABLE_DATA_TYPE.INT64: {
      const sign = readIntVQL(reader);
      const buf = reader.read(8);

      return buf[sign === 1 ? "readBigInt64BE" : "readBigUInt64BE"](0) as T;
    } break;
    case SERIALIZABLE_DATA_TYPE.FLOAT64: {
      const strlen = readIntVQL(reader);
      return parseFloat(reader.read(strlen).toString()) as T;
    } break;
    case SERIALIZABLE_DATA_TYPE.BINARY: {
      const len = readIntVQL(reader);
      return reader.read(len) as T;
    } break;
    case SERIALIZABLE_DATA_TYPE.ARRAY: {
      const len = readIntVQL(reader);
      const result: unknown[] = [];

      for(let i = 0; i < len; ++i) {
        result.push(inlineDeserialize(reader));
      }

      return result as T;
    } break;
    // TODO: SERIALIZABLE_DATA_TYPE.MARSHAL_OBJECT
    case SERIALIZABLE_DATA_TYPE.OBJECT: {
      const len = readIntVQL(reader);
      const json = Utf8.decode(reader.read(len).unwrap());
      const parsed = jsonSafeParser<T>(json);

      if(parsed.isLeft()) {
        throw parsed.value;
      }

      return parsed.value;
    } break;
    default:
      throw new CryptoError(`Don't known how to deserialize unknown data type (0x${type.toString(16).toUpperCase()})`, ERROR_CODE.E_CRYPTO_INVALID_TYPE);
  }
}

export function safeInlineDeserialize<T = any>(reader: IReader): Either<CryptoError, T> {
  try {
    const val = inlineDeserialize(reader);
    return right(val);
  } catch (err: any) {
    return left(err);
  }
}
