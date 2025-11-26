/* eslint-disable @typescript-eslint/no-namespace, no-inner-declarations */

import { hkdf } from "../hash/hkdf";
import { type IGetter } from "../kms";
import { K128, K192, K256 } from "../const";
import { CryptoError, ERROR_CODE } from "../@internals/errors";
import { ByteReader, ByteWriter, inlineDeserialize, inlineSerialize } from "../binary-protocol";
import type { BufferLike, ByteEncoding } from "../@internals/types";
import { bufferWithEncoding, ByteArray, mask, toByteArray, type IByteArray } from "../buffer";


const AEAD_MAGIC = ByteArray.from([
  0x43, 0x53, 0x55, 0x49,
  0x54, 0x45, 0x4A, 0x53,
  0x41, 0x45, 0x41, 0x44,
  0x4D, 0x42, 0x49, 0x30,
]);

const AEAD_VERSION = 0xA0;

const OPTION_DONT_USE_LAYERS = 0x1 << 0;
const OPTION_USE_LAYERS = 0x1 << 0x1;

let ivCtr: bigint = 0n;
let ivPrefix: IByteArray | null = null;


abstract class AEADMode {
  public static for(alg: AEAD.ALGORITHM | AEAD.AlgorithmName): AEADMode {
    switch(alg) {
      case "aes-ccm":
      case "aes-gcm":
      case AEAD.ALGORITHM.AES_CCM:
      case AEAD.ALGORITHM.AES_GCM:
        return new AEAD.AESMode(alg === "aes-ccm" || alg === AEAD.ALGORITHM.AES_CCM ? "aes-ccm" : "aes-gcm");
      case "chacha20-poly1305":
      case AEAD.ALGORITHM.CHACHA20_POLY1305:
        return new AEAD.ChaCha20Mode();
      default:
        throw new CryptoError(`[AEADMode] Unknown or invalid algorithm ID "${alg}"`, ERROR_CODE.E_CRYPTO_INVALID_ARGUMENT);
    }
  }

  public abstract readonly basename: Lowercase<string>;
  public abstract readonly agid: number;
  public abstract readonly allowedKeySizeInBytes: readonly number[];
  public abstract readonly ivLength: number;
  public abstract readonly tagLength: number;

  public getNodeName(ksize: number = K256): string {
    if(ksize < 100) {
      ksize *= 8;
    }

    if(this.basename.startsWith("aes-")) {
      const parts = this.basename.split("-");

      if(parts.length !== 2) {
        throw new CryptoError("[AEADMode] Invalid basename for AES cipher");
      }

      return `aes-${ksize}-${parts[1].trim()}`;
    }

    return this.basename;
  }

  public getWebCryptoName(): string {
    if([
      "aes-gcm",
      "aes-ccm",
      "chacha20-poly1305",
    ].includes(this.basename.toLowerCase()))
      return this.basename.toUpperCase();

    throw new CryptoError("[AEADMode] Invalid basename for AEAD cipher");
  }
}

export namespace AEAD {
  export type AlgorithmName = "aes-gcm" | "aes-ccm" | "chacha20-poly1305";

  export const enum ALGORITHM {
    AES_GCM = 0x15,
    AES_CCM = 0x1C,
    CHACHA20_POLY1305 = 0xC5,
  }

  export class AESMode extends AEADMode {
    public override readonly basename: AlgorithmName;
    public override readonly agid: number;
    public override readonly allowedKeySizeInBytes: readonly number[];
    public override readonly ivLength: number;
    public override readonly tagLength: number;

    public constructor(mode: Exclude<AlgorithmName, "chacha20-poly1305"> = "aes-gcm") {
      if(!["aes-gcm", "aes-ccm"].includes(mode)) {
        throw new CryptoError(`[AESMode] Invalid algorithm name "${mode}"`, ERROR_CODE.E_CRYPTO_INVALID_ARGUMENT);
      }

      super();
      this.basename = mode;
      this.allowedKeySizeInBytes = Object.freeze([ K128, K192, K256 ]);

      if(mode === "aes-ccm") {
        this.agid = ALGORITHM.AES_CCM;
      } else {
        this.agid = ALGORITHM.AES_GCM;
      }

      this.ivLength = mode === "aes-ccm" ? 0xD : 0xC;
      this.tagLength = 0x10;
    }
  }

  export class ChaCha20Mode extends AEADMode {
    public override readonly basename: AlgorithmName;
    public override readonly agid: number;
    public override readonly allowedKeySizeInBytes: readonly number[];
    public override readonly ivLength: number;
    public override readonly tagLength: number;

    public constructor() {
      super();

      this.basename = "chacha20-poly1305";
      this.allowedKeySizeInBytes = Object.freeze([ K256 ]);
      this.agid = ALGORITHM.CHACHA20_POLY1305;
      this.ivLength = 0xC;
      this.tagLength = 0x10;
    }
  }
}


export interface AEADOptions {
  salt?: IGetter<IByteArray>;
  bufferMask?: IGetter<IByteArray | number>;
}

export function aead_encrypt(
  mode: AEAD.ALGORITHM | AEAD.AlgorithmName | AEADMode,
  masterKey: IGetter<IByteArray>,
  payload: IByteArray | BufferLike,
  aad?: IByteArray | BufferLike | null,
  enc?: null,
  options?: AEADOptions // eslint-disable-line comma-dangle
): Promise<IByteArray>;

export function aead_encrypt(
  mode: AEAD.ALGORITHM | AEAD.AlgorithmName | AEADMode,
  masterKey: IGetter<IByteArray>,
  payload: IByteArray | BufferLike,
  aad: IByteArray | BufferLike | null,
  enc: ByteEncoding,
  options?: AEADOptions // eslint-disable-line comma-dangle
): Promise<string>;

export async function aead_encrypt(
  mode: AEAD.ALGORITHM | AEAD.AlgorithmName | AEADMode,
  masterKey: IGetter<IByteArray>,
  payload: IByteArray | BufferLike,
  aad?: IByteArray | BufferLike | null,
  enc?: ByteEncoding | null,
  options?: AEADOptions // eslint-disable-line comma-dangle
): Promise<IByteArray | string> {
  if(!(mode instanceof AEADMode)) {
    mode = AEADMode.for(mode);
  }

  const mK = (await masterKey.get())?.unwrap();
  const kLen = mK?.byteLength; 
  mK?.fill(0);

  if(!kLen || !mode.allowedKeySizeInBytes.includes(kLen)) {
    throw new CryptoError(`Invalid key length for "${mode.basename}" (${kLen}) { ${mode.allowedKeySizeInBytes.join(", ")} }`, ERROR_CODE.E_CRYPTO_INVALID_KEY_LENGTH);
  }

  const dSalt = (await options?.salt?.get())?.unwrap();
  const [headerKey, dataKey] = await deriveKeys_(masterKey, kLen, dSalt);
  
  dSalt?.fill(0);

  const writer = new ByteWriter();

  const headerIV = genIV_(mode.ivLength);
  const dataIV = genIV_(mode.ivLength);

  inlineSerialize(writer, AEAD_VERSION);
  inlineSerialize(writer, Date.now());

  const [headerCipherText, headerTag] = await do_encrypt_(
    mode,
    headerKey,
    headerIV,
    writer.drain(),
    aad // eslint-disable-line comma-dangle
  );

  const [ciphertext, dataTag] = await do_encrypt_(
    mode,
    dataKey,
    dataIV,
    payload,
    headerCipherText // eslint-disable-line comma-dangle
  );

  const buffer: IByteArray = await serializeEnvelope_({
    dataIV,
    ciphertext,
    headerCipherText,
    headerTag,
    headerIV,
    dataTag,
    agid: mode.agid,
    keyLen: kLen,
    optionLayer: OPTION_DONT_USE_LAYERS,
    version: AEAD_VERSION,
    mask: options?.bufferMask,
  });

  return bufferWithEncoding(buffer, enc);
}


export function aead_layered_encrypt(
  mode: AEAD.ALGORITHM | AEAD.AlgorithmName | AEADMode,
  masterKey: IGetter<IByteArray>,
  payload: IByteArray | BufferLike,
  aad?: IByteArray | BufferLike | null,
  enc?: null,
  layers?: number | null,
  options?: AEADOptions // eslint-disable-line comma-dangle
): Promise<IByteArray>;

export function aead_layered_encrypt(
  mode: AEAD.ALGORITHM | AEAD.AlgorithmName | AEADMode,
  masterKey: IGetter<IByteArray>,
  payload: IByteArray | BufferLike,
  aad: IByteArray | BufferLike | null,
  enc: ByteEncoding,
  layers?: number | null,
  options?: AEADOptions // eslint-disable-line comma-dangle
): Promise<string>;

export async function aead_layered_encrypt(
  mode: AEAD.ALGORITHM | AEAD.AlgorithmName | AEADMode,
  masterKey: IGetter<IByteArray>,
  payload: IByteArray | BufferLike,
  aad?: IByteArray | BufferLike | null,
  enc?: ByteEncoding | null,
  layers: number | null = 7,
  options?: AEADOptions // eslint-disable-line comma-dangle
): Promise<IByteArray | string> {
  if(!layers) {
    layers = 4;
  }

  if(layers < 4) {
    layers = 4;
  }

  if(layers > 19) {
    layers = 19;
  }

  let next: IByteArray = toByteArray(payload);

  for(let i = 0; i < layers; ++i) {
    next = await aead_encrypt(
      mode,
      masterKey,
      next,
      aad,
      null,
      options // eslint-disable-line comma-dangle
    );
  }

  return bufferWithEncoding(
    ByteArray.concat([
      AEAD_MAGIC,
      ByteArray.from([ OPTION_USE_LAYERS ]),
      ByteArray.from([ layers ]),
      next,
    ]),
    enc // eslint-disable-line comma-dangle
  );
}


export function aead_decrypt(
  masterKey: IGetter<IByteArray>,
  payload: IByteArray | BufferLike,
  aad?: IByteArray | BufferLike | null,
  enc?: null,
  inputEnc?: ByteEncoding | null,
  options?: AEADOptions // eslint-disable-line comma-dangle
): Promise<IByteArray>;

export function aead_decrypt(
  masterKey: IGetter<IByteArray>,
  payload: IByteArray | BufferLike,
  aad: IByteArray | BufferLike | null,
  enc: ByteEncoding,
  inputEnc?: ByteEncoding | null,
  options?: AEADOptions // eslint-disable-line comma-dangle
): Promise<string>;

export async function aead_decrypt(
  masterKey: IGetter<IByteArray>,
  payload: IByteArray | BufferLike,
  aad?: IByteArray | BufferLike | null,
  enc?: ByteEncoding | null,
  inputEnc?: ByteEncoding | null,
  options?: AEADOptions // eslint-disable-line comma-dangle
): Promise<IByteArray | string> {
  if(
    typeof payload === "string" &&
    inputEnc && ByteArray.isByteEncoding(inputEnc)
  ) {
    payload = ByteArray.from(payload, inputEnc);
  }

  const reader = new ByteReader(payload);

  if(!reader.read(AEAD_MAGIC.size()).equals(AEAD_MAGIC)) {
    throw new CryptoError("Decription failed: the given argument don't appear to be a cipher text");
  }

  const lFlag = reader.read(1).unwrap()[0];

  if(lFlag !== OPTION_DONT_USE_LAYERS) {
    throw new CryptoError("Don't known how to decrypt a layered envelope");
  }

  const version = inlineDeserialize<number>(reader);

  if(AEAD_VERSION !== version) {
    throw new CryptoError(`Don't known how to decrypt v${version} envelope`);
  }

  const mode = AEADMode.for(inlineDeserialize<number>(reader));
  const kLen = inlineDeserialize<number>(reader);

  const mK = (await masterKey.get())?.unwrap();
  const expectedLen = mK?.byteLength ?? -1; 
  mK?.fill(0);

  if(expectedLen !== kLen) {
    throw new CryptoError("The given key length didn't match with expected");
  }

  if(!kLen || !mode.allowedKeySizeInBytes.includes(kLen)) {
    throw new CryptoError(`Invalid key length for "${mode.basename}" (${kLen}) { ${mode.allowedKeySizeInBytes.join(", ")} }`, ERROR_CODE.E_CRYPTO_INVALID_KEY_LENGTH);
  }

  const dSalt = (await options?.salt?.get())?.unwrap();
  const [headerKey, dataKey] = await deriveKeys_(masterKey, kLen, dSalt);
  
  dSalt?.fill(0);
  const envelope = await deserializeEnvelopeSpecs_(reader, options?.bufferMask);

  return void aad, enc, dataKey, headerKey, envelope as unknown as any;
}


async function deriveKeys_(
  master: IGetter<IByteArray>,
  length: number,
  salt?: IByteArray | BufferLike | null // eslint-disable-line comma-dangle
): Promise<readonly [IByteArray, IByteArray]> {
  const prk = await master.get();

  if(prk == null) {
    throw new CryptoError("Failed to derive encryption key from undefined master PRK");
  }

  return Promise.all([
    hkdf(
      prk.unwrap(),
      length,
      salt,
      "j.csuite::header-mask",
      "SHA-512" // eslint-disable-line comma-dangle
    ),

    hkdf(
      prk.unwrap(),
      length,
      salt,
      "j.csuite::payload-enc",
      "SHA-512" // eslint-disable-line comma-dangle
    ),
  ]);
}

async function do_encrypt_(
  alg: AEADMode,
  key: IByteArray | Uint8Array,
  iv: IByteArray | Uint8Array,
  payload: BufferLike | IByteArray,
  aad?: BufferLike | IByteArray | null // eslint-disable-line comma-dangle
): Promise<readonly [Uint8Array, Uint8Array]> {
  if(hasNodeCrypto_()) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { createCipheriv } = require("node:crypto") as typeof import("crypto");

    const cip = createCipheriv(
      alg.getNodeName(),
      toByteArray(key).unwrap(),
      toByteArray(iv).unwrap(),
      { authTagLength: alg.tagLength } as any // eslint-disable-line comma-dangle
    );

    const P = toByteArray(payload).unwrap();

    if(aad) {
      const buf = toByteArray(aad).unwrap();
      (cip as any).setAAD(buf, { plaintextLength: P.byteLength });
    }

    const final = ByteArray.concat([
      ByteArray.from( cip.update( P ) ),
      ByteArray.from( cip.final() ),
    ]);

    const tag = (cip as any).getAuthTag();
    cip.destroy();

    return Promise.resolve([ final.unwrap(), tag ]);
  }

  if(!globalThis?.crypto?.subtle) {
    throw new CryptoError("Failed to get `subtle` from Web Crypto API");
  }

  const kMat = await globalThis.crypto.subtle.importKey(
    "raw",
    toByteArray(key).unwrap() as any,
    { name: alg.getWebCryptoName() },
    false,
    ["encrypt"],
  );

  const cipBuf = await globalThis.crypto.subtle.encrypt(
    {
      name: alg.getWebCryptoName(),
      iv: toByteArray(iv).unwrap() as any,
      additionalData: aad ? toByteArray(aad).unwrap() as any : void 0,
    },
    kMat,
    toByteArray(payload).unwrap() as any // eslint-disable-line comma-dangle
  );

  const final = new Uint8Array(cipBuf);
  
  return [
    final.subarray(0, final.byteLength - 0x10),
    final.subarray(final.byteLength - 0x10),
  ];
}

function genIV_(len: number): IByteArray {
  const rand_ = (len_: number) => {
    if(hasNodeCrypto_()) {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { randomBytes } = require("node:crypto") as typeof import("crypto");
      return ByteArray.from(randomBytes(len_));
    } else if(typeof globalThis?.crypto.getRandomValues === "function") {
      const buf = new Uint8Array(len_);
      globalThis.crypto.getRandomValues(buf);

      return ByteArray.from(buf);
    } else {
      throw new CryptoError("No secure RNG available to generate IV");
    }
  };

  if(len <= 0x8)
    return rand_(len);

  const counterSize = 0x8;
  const prefixLen = len - counterSize;

  if(ivPrefix == null || ivPrefix.byteLength !== prefixLen) {
    ivPrefix = rand_(prefixLen);
    ivCtr = 0n;
  }

  ivCtr++;
  const maxCounter = (1n << BigInt(counterSize * 0x8)) - 1n;

  if(ivCtr > maxCounter) {
    ivPrefix = rand_(prefixLen);
    ivCtr = 1n;
  }

  const ctrBuf = new Uint8Array(counterSize);
  let v = ivCtr;

  for(let i = counterSize - 0x1; i >= 0; --i) {
    ctrBuf[i] = Number(v & 0xFFn);
    v >>= 0x8n;
  }

  return ByteArray.concat([ ivPrefix, ByteArray.from(ctrBuf) ]);
}

async function serializeEnvelope_(data: {
  version: number;
  agid: number;
  keyLen: number;
  headerIV: IByteArray;
  headerCipherText: Uint8Array;
  headerTag: Uint8Array;
  dataIV: IByteArray;
  ciphertext: Uint8Array;
  dataTag: Uint8Array;
  optionLayer: number;
  mask?: IGetter<IByteArray | number>;
}): Promise<IByteArray> {
  let bufMask: any = await data.mask?.get();
  const writer = new ByteWriter();

  if(typeof bufMask !== "number" && !!bufMask) {
    bufMask = toByteArray(bufMask).unwrap();
  }

  inlineSerialize(writer, AEAD_VERSION);
  inlineSerialize(writer, data.agid);
  inlineSerialize(writer, data.keyLen);

  inlineSerialize(
    writer,
    mask(
      data.headerIV.unwrap(),
      bufMask as Uint8Array | number | undefined,
      true // eslint-disable-line comma-dangle
    ) // eslint-disable-line comma-dangle
  );

  inlineSerialize(
    writer,
    mask(
      data.headerCipherText,
      bufMask as Uint8Array | number | undefined,
      true // eslint-disable-line comma-dangle
    ) // eslint-disable-line comma-dangle
  );

  inlineSerialize(
    writer,
    mask(
      data.headerTag,
      bufMask as Uint8Array | number | undefined,
      true // eslint-disable-line comma-dangle
    ) // eslint-disable-line comma-dangle
  );

  inlineSerialize(
    writer,
    mask(
      data.dataIV.unwrap(),
      bufMask as Uint8Array | number | undefined,
      true // eslint-disable-line comma-dangle
    ) // eslint-disable-line comma-dangle
  );

  inlineSerialize(
    writer,
    mask(
      data.ciphertext,
      bufMask as Uint8Array | number | undefined,
      true // eslint-disable-line comma-dangle
    ) // eslint-disable-line comma-dangle
  );

  inlineSerialize(
    writer,
    mask(
      data.dataTag,
      bufMask as Uint8Array | number | undefined,
      true // eslint-disable-line comma-dangle
    ) // eslint-disable-line comma-dangle
  );

  inlineSerialize(writer, [0x0]);

  return ByteArray.concat([
    AEAD_MAGIC,
    ByteArray.from([ data.optionLayer ]),
    writer.drain(),
  ]);
}

async function deserializeEnvelopeSpecs_(reader: ByteReader, M?: IGetter<IByteArray | number>): Promise<{
  headerIV: Uint8Array;
  headerCipherText: Uint8Array;
  headerTag: Uint8Array;
  dataIV: Uint8Array;
  ciphertext: Uint8Array;
  dataTag: Uint8Array;
}> {
  let bufMask: any = await M?.get();

  if(typeof bufMask !== "number" && !!bufMask) {
    bufMask = toByteArray(bufMask).unwrap();
  }

  const headerIV = mask(
    inlineDeserialize<IByteArray>(reader).unwrap(),
    bufMask,
    true // eslint-disable-line comma-dangle
  );

  const headerCipherText = mask(
    inlineDeserialize<IByteArray>(reader).unwrap(),
    bufMask,
    true // eslint-disable-line comma-dangle
  );

  const headerTag = mask(
    inlineDeserialize<IByteArray>(reader).unwrap(),
    bufMask,
    true // eslint-disable-line comma-dangle
  );

  const dataIV = mask(
    inlineDeserialize<IByteArray>(reader).unwrap(),
    bufMask,
    true // eslint-disable-line comma-dangle
  );

  const ciphertext = mask(
    inlineDeserialize<IByteArray>(reader).unwrap(),
    bufMask,
    true // eslint-disable-line comma-dangle
  );

  const dataTag = mask(
    inlineDeserialize<IByteArray>(reader).unwrap(),
    bufMask,
    true // eslint-disable-line comma-dangle
  );

  const endByte = inlineDeserialize<[0x0]>(reader);

  if(!Array.isArray(endByte) || endByte[0] !== 0x0) {
    throw new CryptoError("Failed to parse envelope specs due to unknown error");
  }

  return {
    headerCipherText,
    ciphertext,
    dataIV,
    dataTag,
    headerIV,
    headerTag,
  };
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
