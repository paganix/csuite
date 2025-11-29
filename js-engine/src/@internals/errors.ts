import type { Dict } from "./types";


/** Enum of codes used to map errors [Range 262 - X] */
export const enum ERROR_CODE {

  /** Something was failed in crypto routine */
  E_CRYPTO_FAILURE = 0x106,
  
  /** The given type didn't match with expected */
  E_CRYPTO_INVALID_TYPE = 0x107,

  /** An invalid argument was provided */
  E_CRYPTO_INVALID_ARGUMENT = 0x108,

  /** The given value is out of bounds */
  E_CRYPTO_OUT_OF_BOUNDS = 0x109,

  /** [describe the error] */
  E_CRYPTO_UNSUPPORTED_OPERATION = 0x10A,

  /** [describe the error] */
  E_CRYPTO_RESOURCE_DISPOSED = 0x10B,

  /** [describe the error] */
  E_CRYPTO_INVALID_KEY_LENGTH = 0x10C,

  E_CRYPTO_OUT_OF_RANGE = 0x10D,
}


export interface ExceptionInit {
  context?: Dict<unknown> | null | undefined;
  overrideStack?: string;
}


export class CryptoError extends Error {
  public override readonly name: string;
  public override readonly message: string;

  /** Numeric code that referring the error */
  public readonly code: number;

  /** Optional context for error as (typeof struct) */
  public readonly context: Dict<unknown>;

  public constructor(
    message?: string | null,
    code: number = ERROR_CODE.E_CRYPTO_FAILURE,
    options?: ExceptionInit // eslint-disable-line comma-dangle
  ) {
    super(message || "");

    this.code = -Math.abs(code);
    this.context = options?.context || {};
    this.message = message || "";
    this.name = "CryptoError";
  }

  public is(code: number): boolean {
    return -Math.abs(code) === this.code;
  }
}
