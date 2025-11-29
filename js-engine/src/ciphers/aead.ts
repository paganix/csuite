/* eslint-disable @typescript-eslint/no-namespace, no-inner-declarations */

import { K128, K192, K256 } from "../const";
import { CryptoError, ERROR_CODE } from "../@internals/errors";


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
  public abstract readonly webTagLengthInBytes?: number;

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

  export interface CipherMode extends AEADMode { }

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
    public override readonly webTagLengthInBytes: number;

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
      this.webTagLengthInBytes = 0xC;
    }
  }

  export class ChaCha20Mode extends AEADMode {
    public override readonly basename: AlgorithmName;
    public override readonly agid: number;
    public override readonly allowedKeySizeInBytes: readonly number[];
    public override readonly ivLength: number;
    public override readonly tagLength: number;
    public override readonly webTagLengthInBytes: number;

    public constructor() {
      super();

      this.basename = "chacha20-poly1305";
      this.allowedKeySizeInBytes = Object.freeze([ K256 ]);
      this.agid = ALGORITHM.CHACHA20_POLY1305;
      this.ivLength = 0xC;
      this.tagLength = 0x10;
      this.webTagLengthInBytes = 0x10;
    }
  }

  export function isMode(arg: unknown): arg is CipherMode {
    return arg instanceof AEADMode;
  }
}
