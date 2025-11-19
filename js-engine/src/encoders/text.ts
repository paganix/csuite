/* eslint-disable @typescript-eslint/no-namespace, no-inner-declarations */

import { Lazy } from "../@internals/lazy";
import type { Dict } from "../@internals/types";
import { CryptoError, ERROR_CODE } from "../@internals/errors";


let textEncoder: { encode: (input: string) => Uint8Array } | null = null;
let textDecoder: { decode: (input: Uint8Array) => string } | null = null;

const hex2dec: Dict<number> = { };
const dec2hex16 = [ ..."0123456789abcdef" ];
const dec2hex256 = new Lazy(() => new Array<string>(0x100));

const b64Chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const b64UrlChars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const b64DecTable = new Lazy(() => new Array(0x100));
const b64UrlDecTable = new Lazy(() => new Array(0x100));

const hasNodeBuffer = typeof Buffer !== "undefined";


for(let i = 0; i < 0x100; ++i) {
  const hex = `${dec2hex16[(i >>> 4) & 0xF]}${dec2hex16[i & 0xF]}`;
  dec2hex256.value[i] = hex.slice();

  const firstLower = hex[0].toLowerCase();
  const firstUpper = hex[0].toUpperCase();

  const lastLower = hex[1].toLowerCase();
  const lastUpper = hex[1].toUpperCase();

  hex2dec[hex] = i;
  hex2dec[`${firstLower}${lastUpper}`] = i;
  hex2dec[`${firstUpper}${lastLower}`] = i;
  hex2dec[`${firstUpper}${lastUpper}`] = i;
}

for(let i = 0; i < 0x40; ++i) {
  b64DecTable.value[b64Chars.charCodeAt(i)] = i;
  b64UrlDecTable.value[b64UrlChars.charCodeAt(i)] = i;
}

b64DecTable.value["=".charCodeAt(0)] = 0;
b64UrlDecTable.value["=".charCodeAt(0)] = 0;

Object.freeze(hex2dec);


export namespace Utf8 {
  export function encode(data: string): Uint8Array {
    return textEnc_().encode(data);
  }

  export function decode(data: Uint8Array): string {
    return textDec_().decode(data);
  }
}

export namespace Hex {
  export function encode(data: Uint8Array | string, avoidBuffer?: boolean): string {
    if(hasNodeBuffer && !avoidBuffer)
      return Buffer.from(data).toString("hex");

    if(typeof data === "string") {
      data = Utf8.encode(data);
    }

    let hex: string = "";

    for(let i = 0; i < data.length; ++i) {
      hex += dec2hex256.value[data[i]];
    }

    return hex;
  }

  export function decode(data: string, asString?: false, avoidBuffer?: boolean): Uint8Array;
  export function decode(data: string, asString: true, avoidBuffer?: boolean): string;
  export function decode(data: string, asString?: boolean, avoidBuffer?: boolean): string | Uint8Array {
    if(hasNodeBuffer && !avoidBuffer) {
      const buf = Buffer.from(data, "hex");
      return asString ? buf.toString("utf8") : buf;
    }

    const len = data.length / 2;
    const u8 = new Uint8Array(len);

    for(let i = 0; i < len; ++i) {
      u8[i] = hex2dec[data.slice(i * 2, (i * 2) + 2)];
    }

    return asString ? Utf8.decode(u8) : u8;
  }

  export function is(data: unknown): data is string {
    if(typeof data !== "string" || !data)
      return false;

    if(data.length % 2 !== 0)
      return false;

    return /^[0-9A-Fa-f]*$/.test(data);
  }
}

export namespace Base64 {
  export type TypedOptions = { urlSafe?: boolean; avoidNodeBuffer?: boolean };

  export function encode(data: Uint8Array | string, options?: TypedOptions): string {
    if(hasNodeBuffer && !options?.avoidNodeBuffer) {
      const buf = Buffer.from(data);
      return buf.toString(options?.urlSafe ? "base64url" : "base64");
    }

    if(typeof data === "string") {
      data = Utf8.encode(data);
    }

    const alphabet = options?.urlSafe ? b64UrlChars : b64Chars;
    const len = data.length;

    let result = "";
    let i: number = 0;

    for(; i < len - 2; i += 3) {
      const triplet = (
        (data[i] << 0x10) |
        (data[i + 1] << 0x08) |
        data[i + 2]
      );

      result += (
        alphabet[(triplet >> 0x12) & 0x3F] +
        alphabet[(triplet >> 0x0C) & 0x3F] +
        alphabet[(triplet >> 0x06) & 0x3F] +
        alphabet[triplet & 0x3F]
      );
    }

    const remainder = len - i;

    if(remainder === 1) {
      const val = data[i];
      result += alphabet[(val >> 0x02) & 0x3F] + alphabet[(val << 0x04) & 0x3F];

      if(!options?.urlSafe) {
        result += "==";
      }
    } else if(remainder === 2) {
      const val = (data[i] << 0x08) | data[i + 1];

      result += (
        alphabet[(val >> 0x10) & 0x3F] +
        alphabet[(val >> 0x04) & 0x3F] +
        alphabet[(val << 0x02) & 0x3F]
      );

      if(!options?.urlSafe) {
        result += "=";
      }
    }

    return result;
  }

  export function decode(data: string, options?: TypedOptions): Uint8Array {
    if(hasNodeBuffer && !options?.avoidNodeBuffer)
      return Buffer.from(data, options?.urlSafe ? "base64url" : "base64");
    
    const table = options?.urlSafe ? b64UrlDecTable : b64DecTable;
    let end = data.length;

    while(end > 0 && data[end - 1] === "=") {
      end--;
    }

    const byteLen = Math.floor((end * 3) / 4);
    const u8 = new Uint8Array(byteLen);

    let p: number = 0;
    let b: number = 0;

    while(p < end) {
      const c1 = table.value[data.charCodeAt(p++)];
      const c2 = table.value[data.charCodeAt(p++)];
      const c3 = p < end ? table.value[data.charCodeAt(p++)] : -1;
      const c4 = p < end ? table.value[data.charCodeAt(p++)] : -1;

      if(c1 === -1 || c2 === -1)
        break;

      const val = (
        (c1 << 0x12) |
        (c2 << 0x0C) |
        ((c3 & 0x3F) << 0x06) |
        (c4 & 0x3F)
      );

      u8[b++] = (val >> 0x10) & 0xFF;

      if(c3 !== -1) {
        u8[b++] = (val >> 0x08) & 0xFF;
      }

      if(c4 !== -1) {
        u8[b++] = val & 0xFF;
      }
    }

    return u8;
  }

  export function is(data: unknown): data is string {
    if(typeof data !== "string" || !data)
      return false;

    try {
      // eslint-disable-next-line no-useless-escape
      const base64Regex = /^(?:[A-Za-z0-9+\/]{4})*?(?:[A-Za-z0-9+\/]{2}==|[A-Za-z0-9+\/]{3}=)?$/;
      return (data.length % 4 === 0 && base64Regex.test(data)) || btoa(atob(data)) === data;
    } catch {
      return false;
    }
  }
}

export namespace Latin1 {
  export function encode(data: string): Uint8Array {
    const len = data.length;
    const u8 = new Uint8Array(len);

    for(let i = 0; i < len; ++i) {
      u8[i] = data.charCodeAt(i) & 0xFF;
    }
    
    return u8;
  }

  export function decode(data: Uint8Array): string {
    const CHUNK_SIZE = 0x8000;

    if(data.length < CHUNK_SIZE)
      return String.fromCharCode.apply(null, data as unknown as number[]);

    let str: string = "";

    for(let i = 0; i < data.length; i += CHUNK_SIZE) {
      const slice = data.subarray(i, i + CHUNK_SIZE);
      str += String.fromCharCode.apply(null, slice as unknown as number[]);
    }

    return str;
  }
}

export namespace Utf16 {
  export function encode(data: string, avoidBuffer?: boolean): Uint8Array {
    if(hasNodeBuffer && !avoidBuffer)
      return Buffer.from(data, "utf16le");

    const len = data.length;

    const u8 = new Uint8Array(len * 2);
    const view = new DataView(u8.buffer);

    for(let i = 0; i < len; ++i) {
      view.setUint16(i * 2, data.charCodeAt(i), true);
    }

    return u8;
  }

  export function decode(data: Uint8Array, avoidBuffer?: boolean): string {
    if(hasNodeBuffer && !avoidBuffer)
      return Buffer.from(data).toString("utf16le");

    if(data.length % 2 !== 0) {
      throw new CryptoError("[Utf16] Data length must be even", ERROR_CODE.E_CRYPTO_INVALID_ARGUMENT);
    }

    const buffer = data.byteOffset % 2 === 0 ? data.buffer : data.slice().buffer;
    new Uint16Array(buffer, data.byteOffset, data.length / 2);

    const len = data.length / 2;
    const CHUNK_SIZE = 0x4000;

    let str: string = "";
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

    for(let i = 0; i < len; i += CHUNK_SIZE) {
      const end = Math.min(i + CHUNK_SIZE, len);
      const chunk = new Array(end - i);

      for(let j = 0; j < (end - i); ++j) {
        chunk[j] = view.getUint16((i + j) * 2, true);
      }

      str += String.fromCharCode.apply(null, chunk);
    }

    return str;
  }
}


function textEnc_(): { encode: (input: string) => Uint8Array } {
  if(!textEncoder) {
    textEncoder = new TextEncoder();
  }

  return textEncoder;
}

function textDec_(): { decode: (input: Uint8Array) => string } {
  if(!textDecoder) {
    textDecoder = new TextDecoder("utf-8", { ignoreBOM: true });
  }

  return textDecoder;
}
