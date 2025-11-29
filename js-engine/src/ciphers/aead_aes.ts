import { AEAD } from "./aead";
import { type IGetter } from "../kms";
import { SystemClock } from "../@internals/chrono";
import type { BufferLike } from "../@internals/types";
import { CryptoError, ERROR_CODE } from "../@internals/errors";
import { ByteArray, toByteArray, type IByteArray } from "../buffer";


export type AESEncryptOptions = {
  forceWebCrypto?: boolean;
  additionalData?: IByteArray | BufferLike;
  salt?: IByteArray | BufferLike | IGetter<IByteArray | BufferLike>;
};

export interface DetachedEncryptionResult {

  /** Estimated computational cost of the operation */
  readonly cpuCost: number;

  /** Time elapsed from the start to the end of the operation */
  readonly timeCost: number;

  /** The result AUTH TAG of encryption */
  readonly tag: IByteArray;

  /** The cipher text */
  readonly ciphertext: IByteArray;

  /** Wich one external API processed the operation */
  readonly ranThrough: "node-crypto" | "web-crypto";
}

export async function aes_aead_encrypt_detached(
  mode: AEAD.CipherMode,
  masterKey: IGetter<IByteArray>,
  nonceIV: IGetter<IByteArray>,
  payload: IByteArray | BufferLike,
  options?: AESEncryptOptions // eslint-disable-line comma-dangle
): Promise<DetachedEncryptionResult> {
  if(!AEAD.isMode(mode)) {
    throw new CryptoError(`Got an invalid AEAD mode for aes detached encrypt 'typeof ${typeof mode}'`, ERROR_CODE.E_CRYPTO_INVALID_TYPE);
  }

  const stime = SystemClock.current_timestamp(!false);
  const K = await masterKey.get();

  if(K == null) {
    throw new CryptoError("Failed to get master key for detached aes encryption");
  }

  const kLen = K.byteLength;

  if(!mode.allowedKeySizeInBytes.includes(kLen)) {
    throw new CryptoError(
      `Invalid key length for "${mode.basename}" (${kLen}) { ${mode.allowedKeySizeInBytes.join(", ")} }`,
      ERROR_CODE.E_CRYPTO_INVALID_KEY_LENGTH // eslint-disable-line comma-dangle
    );
  }

  const IV = await nonceIV.get();

  if(IV == null || IV.byteLength !== mode.ivLength) {
    throw new CryptoError(
      `Invalid initialization vector for "${mode.basename}", it's NULL or length mismatch`,
      ERROR_CODE.E_CRYPTO_INVALID_ARGUMENT // eslint-disable-line comma-dangle
    );
  }

  const P = toByteArray(payload).unwrap();

  if(hasNodeSupport_() && !options?.forceWebCrypto) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { createCipheriv } = require("node:crypto") as typeof import("crypto");

    const cip = createCipheriv(
      mode.getNodeName(kLen),
      K.unwrap(),
      IV.unwrap(),
      { authTagLength: mode.tagLength } as any // eslint-disable-line comma-dangle
    );

    if(options?.additionalData) {
      const data = toByteArray(options.additionalData).unwrap();
      (cip as any).setAAD(data, { plaintextLength: P.byteLength });
    }

    const ciphertext = ByteArray.concat([
      ByteArray.from( cip.update( P ) ),
      ByteArray.from( cip.final() ),
    ]);

    const tag = ByteArray.from((cip as any).getAuthTag());

    return {
      tag,
      ciphertext,
      ranThrough: "node-crypto",
      cpuCost: -1, // unavailable without low level NAPI
      timeCost: SystemClock.current_timestamp() - stime,
    };
  }

  if(!globalThis?.crypto?.subtle) {
    throw new CryptoError("Failed to access secure subtle API");
  }

  const mKey = await globalThis.crypto.subtle.importKey(
    "raw",
    K.unwrap() as any,
    { name: mode.getWebCryptoName() },
    false,
    ["encrypt"] // eslint-disable-line comma-dangle
  );

  const arrayBuf = await globalThis.crypto.subtle.encrypt(
    {
      name: mode.getWebCryptoName(),
      iv: IV.unwrap() as any,
      tagLength: (mode.webTagLengthInBytes ?? mode.tagLength) * 8,
      additionalData: options?.additionalData ? toByteArray(options.additionalData).unwrap() as any : void 0,
    },
    mKey,
    P as any // eslint-disable-line comma-dangle
  );

  const final = ByteArray.from(arrayBuf);
  const ciphertext = final.subarray(0, final.byteLength - mode.tagLength);
  const tag = final.subarray(final.byteLength - mode.tagLength, final.byteLength);

  return {
    tag,
    ciphertext,
    ranThrough: "web-crypto",
    cpuCost: -1, // unavailable without low level NAPI
    timeCost: SystemClock.current_timestamp() - stime,
  };
}


function hasNodeSupport_(): boolean {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return !!require("node:crypto").constants;
  } catch {
    return false;
  }
}
