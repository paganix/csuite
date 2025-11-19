// import { Lazy } from "./@internals/lazy";
// import { CryptoError, ERROR_CODE } from "./@internals/errors";

// import type {
//   BinaryToTextEncoding, // same as Node's type
//   CharacterEncoding,    // same as Node's type
//   WithImplicitCoercion, // same as Node's type
// } from "./@internals/types";


// const hasNodeBuffer = typeof Buffer !== "undefined";
// const indexOfTable = new Lazy(() => new Uint8Array(0x100));


// export interface IByteArrayLike<TBase extends Buffer | Uint8Array> {
//   readonly BYTES_PER_ELEMENT: number;
//   readonly byteLength: number;
//   readonly byteOffset: number;
//   readonly buffer: ArrayBufferLike;

//   subarray(start?: number, end?: number): ByteArray<TBase>;
// }

// export class ByteArray<TBase extends Buffer | Uint8Array = Uint8Array> implements IByteArrayLike<TBase> {
//   public static alloc(len: number): ByteArray {
//     return new ByteArray(len);
//   }

//   public static wrap<TBase extends Buffer | Uint8Array>(actual: TBase): ByteArray<TBase> {
//     if(hasNodeBuffer && !Buffer.isBuffer(actual)) {
//       actual = Buffer.from(actual.buffer, actual.byteOffset, actual.byteLength) as TBase;
//     }

//     return new ByteArray(actual);
//   }

//   public static from<TBase extends Buffer | Uint8Array = Uint8Array>(value: TBase): ByteArray<TBase>;
//   public static from(value: WithImplicitCoercion<string>, enc?: BinaryToTextEncoding | CharacterEncoding): ByteArray;
//   public static from(value: WithImplicitCoercion<ArrayLike<number>>): ByteArray;
//   public static from<TArrayBuffer extends WithImplicitCoercion<ArrayBufferLike>>(
//     arrayBuffer: TArrayBuffer,
//     byteOffset?: number,
//     length?: number
//   ): ByteArray;
  
//   public static from(
//     value: Uint8Array | WithImplicitCoercion<string | ArrayLike<number> | ArrayBufferLike>,
//     encodingOrByteOffset?: number | BinaryToTextEncoding | CharacterEncoding,
//     length?: number // eslint-disable-line comma-dangle
//   ): ByteArray {
//     if(value instanceof Uint8Array || (hasNodeBuffer && Buffer.isBuffer(value)))
//       return ByteArray.wrap(value);

//     // TODO: !!
//   }

//   public static concat(buffers: ByteArray[], totalLength?: number): ByteArray {
//     if(typeof totalLength !== "number") {
//       totalLength = 0;

//       for(let i = 0; i < buffers.length; ++i) {
//         totalLength += buffers[i].byteLength;
//       }
//     }

//     // TODO: !!
//   }

//   #IsBuffer: boolean;
//   #U8Array: TBase;

//   protected constructor(lenOrBuf: TBase | number) {
//     if(typeof lenOrBuf === "number") {
//       if(lenOrBuf < 0) {
//         throw new CryptoError("Length of 'typeof ByteArray' must be a positive integer", ERROR_CODE.E_CRYPTO_OUT_OF_BOUNDS);
//       }

//       this.#IsBuffer = hasNodeBuffer;
//       this.#U8Array = (hasNodeBuffer ? Buffer.alloc(lenOrBuf) : new Uint8Array(lenOrBuf)) as TBase;
//     } else {
//       this.#IsBuffer = hasNodeBuffer && Buffer.isBuffer(lenOrBuf);
//       this.#U8Array = lenOrBuf;
//     }

//     if(!(this.#U8Array instanceof Uint8Array)) {
//       throw new CryptoError(`Failed to initialize byte array 'typeof ${typeof lenOrBuf}'`);
//     }
//   }

//   public get BYTES_PER_ELEMENT(): number {
//     return this.#U8Array.BYTES_PER_ELEMENT;
//   }

//   public get byteLength(): number {
//     return this.#U8Array.byteLength;
//   }

//   public get byteOffset(): number {
//     return this.#U8Array.byteOffset;
//   }

//   public get buffer(): ArrayBufferLike {
//     return this.#U8Array.buffer;
//   }

//   public subarray(start?: number, end?: number): ByteArray<TBase> {
//     return new ByteArray<TBase>(this.#U8Array.subarray(start, end) as TBase);
//   }

//   public unwrap(shallowCopy?: boolean): TBase {
//     return shallowCopy ? this.#U8Array.subarray() as TBase : this.#U8Array;
//   }

//   public set(array: ByteArray, offset?: number): void;
//   public set(array: Uint8Array, offset?: number): void;
//   public set(array: ArrayBuffer, offset?: number): void;
//   public set(array: ArrayBufferView, offset?: number): void;
//   public set(array: ByteArray | Uint8Array | ArrayBuffer | ArrayBufferView, offset?: number): void;
//   public set(array: ByteArray | Uint8Array | ArrayBuffer | ArrayBufferView, offset?: number): void {
//     if (array instanceof ByteArray) {
//       this.#U8Array.set(array.#U8Array, offset);
//     } else if (array instanceof Uint8Array) {
//       this.#U8Array.set(array, offset);
//     } else if (array instanceof ArrayBuffer) {
//       this.#U8Array.set(new Uint8Array(array), offset);
//     } else if (ArrayBuffer.isView(array)) {
//       this.#U8Array.set(new Uint8Array(array.buffer, array.byteOffset, array.byteLength), offset);
//     } else {
//       throw new CryptoError(`[ByteArray] Unknown argument for 'array' as 'typeof ${typeof array}'`, ERROR_CODE.E_CRYPTO_INVALID_TYPE);
//     }
//   }
// }


// function binaryIndexOf_(
//   haystack: Uint8Array,
//   needle: Uint8Array,
//   offset: number = 0 // eslint-disable-line comma-dangle
// ): number {
//   const needleLen = needle.byteLength;
//   const haystackLen = haystack.byteLength;

//   if(needleLen === 0)
//     return 0;

//   if(needleLen === 1)
//     return haystack.indexOf(needle[0]);

//   if(needleLen > haystackLen - offset)
//     return -1;

//   const table = indexOfTable.value;
//   table.fill(needle.length);

//   for(let i = 0; i < needle.length; ++i) {
//     table[needle[i]] = needle.length - i - 1;
//   }

//   let i = offset + needle.length - 1;
//   let j = i;
//   let result = -1;

//   while(i < haystackLen) {
//     if(haystack[i] === needle[i]) {
//       if(j === 0) {
//         result = i;
//         break;
//       }

//       i--;
//       j--;
//     } else {
//       i += Math.max(needle.length - j, table[haystack[i]]);
//       j = needle.length - 1;
//     }
//   }

//   return result;
// }
