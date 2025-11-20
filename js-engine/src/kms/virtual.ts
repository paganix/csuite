import { isThenable } from "../@internals/util";
import { CryptoError } from "../@internals/errors";
import { IDisposable } from "../@internals/disposable";
import type { MaybePromise } from "../@internals/types";
import { CancellationTokenSource, type ICancellationToken } from "../@internals/cancellation";


export type CancellableGetter<T> = (_token: ICancellationToken) => MaybePromise<T | null>;

interface VGetterInit {
  maxCalls?: number;
  token?: ICancellationToken;
}

export class VolatileGetter<T> implements IDisposable {
  #Disposed: boolean;
  #Source: CancellationTokenSource;
  #ExternalToken: ICancellationToken | null;
  #MaxCalls: number | null;
  #CallsCount: number;
  #Caller: CancellableGetter<T>;
  
  public constructor(
    _getValue: CancellableGetter<T>,
    _options?: VGetterInit // eslint-disable-line comma-dangle
  ) {
    this.#Disposed = false;
    this.#CallsCount = 0;
    this.#Caller = _getValue;
    this.#ExternalToken = _options?.token ?? null;
    this.#Source = new CancellationTokenSource(_options?.token);

    this.#MaxCalls = typeof _options?.maxCalls === "number" && _options.maxCalls >= 0
      ? _options.maxCalls | 0
      : null;
  }

  public getValue(): T | null {
    if(this.#MaxCalls != null && this.#CallsCount + 1 > this.#MaxCalls)
      return null;

    if(this.#Disposed)
      return null;

    try {
      const result = this.#Caller(this.#Source.token);

      if(isThenable(result)) {
        throw new CryptoError("[VolatileGetter] the value caller is asyncrhonous. Use VolatileGetter#getValueAsync()");
      }

      return result ?? null;
    } catch (err: any) {
      if(err?.message && String(err.message).includes("#getValueAsync()")) {
        this.#CallsCount--;
        throw err;
      }
      
      return null;
    } finally {
      this.#CallsCount++;
      this.#UpdateToken();
    }
  }

  public async getValueAsync(): Promise<T | null> {
    if(this.#MaxCalls != null && this.#CallsCount + 1 > this.#MaxCalls)
      return null;

    if(this.#Disposed)
      return null;

    try {
      const result = this.#Caller(this.#Source.token);
      
      if(!isThenable(result)) {
        throw new CryptoError("[VolatileGetter] the value caller is syncrhonous. Use VolatileGetter#getValue()");
      }

      return (await result) ?? null;
    } catch (err: any) {
      if(err?.message && String(err.message).includes("#getValue()")) {
        this.#CallsCount--;
        throw err;
      }

      return null;
    } finally {
      this.#CallsCount++;
      this.#UpdateToken();
    }
  }

  public async get(): Promise<T | null> {
    if(this.#MaxCalls != null && this.#CallsCount + 1 > this.#MaxCalls)
      return null;

    if(this.#Disposed)
      return null;

    try {
      return (await this.#Caller(this.#Source.token)) ?? null;
    } catch {
      return null;
    } finally {
      this.#CallsCount++;
      this.#UpdateToken();
    }
  }

  public dispose(): void {
    if(!this.#Disposed) {
      this.#Source.cancel();
      this.#Source.dispose();
      this.#Caller = null!;

      this.#Disposed = true;
    }
  }

  #UpdateToken(): void {
    if(this.#Disposed)
      return;

    if(this.#ExternalToken != null && this.#ExternalToken.isCancellationRequested) {
      this.dispose();
      return;
    }

    this.#Source = new CancellationTokenSource(this.#ExternalToken);
  }
}
