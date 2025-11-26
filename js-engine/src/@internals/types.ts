
/**
 * **BufferLike** - A type that represents any object that can be used as a buffer.
 * 
 * This type encompasses various structures that can hold binary data, including `Buffer`, `string`, `ArrayBuffer`, `Uint8Array`, `Uint16Array`, `Uint32Array`, `SharedArrayBuffer`, `ArrayBufferView`, and `DataView`.
 */
export type BufferLike = Buffer | string | ArrayBuffer | Uint8Array | Uint16Array | Uint32Array | SharedArrayBuffer | ArrayBufferView | DataView;

export type MaybePromise<T> = T | Promise<T>;


export type BinaryToTextEncoding = "base64" | "base64url" | "hex" | "binary";
export type CharacterEncoding = "utf8" | "utf-8" | "utf16le" | "utf-16le" | "latin1";

export type ByteEncoding = CharacterEncoding | BinaryToTextEncoding;

export type NumericFormat = "0x%x" | "0x%X" | "%d" | "%u"


export type Dict<T> = {
  [key: string]: T;
};

export type ReadonlyDict<T> = {
  readonly [key: string]: T;
};

export type WithImplicitCoercion<T> =
        | T
        | { valueOf(): T }
        | (T extends string ? { [Symbol.toPrimitive](hint: "string"): T } : never);
