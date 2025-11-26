import { CryptoError } from "../@internals/errors";
import type { BufferLike } from "../@internals/types";
import { ByteArray, toByteArray, type IByteArray } from "../buffer";


export type HKDFHash = "SHA-1" | "SHA-256" | "SHA-384" | "SHA-512";


export async function hkdf(
  ikm: BufferLike | IByteArray,
  length: number,
  salt?: BufferLike | IByteArray | null,
  info?: BufferLike | IByteArray | null,
  hash: HKDFHash = "SHA-384" // eslint-disable-line comma-dangle
): Promise<IByteArray> {
  const ikmBuf = toByteArray(ikm).unwrap();
  const saltBuf = (salt != null ? toByteArray(salt) : ByteArray.alloc(0)).unwrap();
  const infoBuf = (info != null ? toByteArray(info) : ByteArray.alloc(0)).unwrap();

  if(hasNodeCrypto_()) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { hkdf } = require("node:crypto") as typeof import("crypto");

    return new Promise((resolve, reject) => {
      hkdf(
        hash.replace(/-/g, "").toLowerCase(),
        ikmBuf,
        saltBuf,
        infoBuf,
        length,
        (err, arrayBuf) => {
          if(!err) {
            resolve(ByteArray.from(arrayBuf));
          } else {
            reject(err);
          }
        } // eslint-disable-line comma-dangle
      );
    });
  }

  if(!globalThis?.crypto?.subtle) {
    throw new CryptoError("Failed to get `subtle` from Web Crypto API");
  }

  const kMat = await globalThis.crypto.subtle.importKey(
    "raw",
    ikmBuf as any,
    { name: "HKDF" },
    false,
    ["deriveBits"] // eslint-disable-line comma-dangle
  );

  const dBits = await globalThis.crypto.subtle.deriveBits(
    {
      name: "HKDF",
      hash,
      salt: saltBuf as any,
      info: infoBuf as any,
    },
    kMat,
    length * 8 // eslint-disable-line comma-dangle
  );

  return ByteArray.from(dBits);
}

function hasNodeCrypto_(): boolean {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const x = require("node:crypto");
    return !!(x as typeof import("crypto")).constants;
  } catch {
    return false;
  }
}
