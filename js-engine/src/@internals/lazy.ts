
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/


/**
 * A function that takes no arguments and returns a value of type `T`.
 */
export type LazyExecutor<T> = () => T;

/**
 * A lazy value.
 *
 * The lazy value is calculated once on first access and then cached.
 *
 * @param T The type of the lazy value.
 */
export class Lazy<T> {
  private _error: Error | undefined;
  private _didRun: boolean = false;
  private _value?: T;
  
  constructor(private readonly _executor: LazyExecutor<T>) { }

  /**
   * True if the lazy value has been resolved.
   */
  get hasValue() { return this._didRun; }

  /**
   * Get the wrapped value.
   *
   * This will force evaluation of the lazy value if it has not been resolved yet. Lazy values are only
   * resolved once. `getValue` will re-throw exceptions that are hit while resolving the value
   */
  get value(): T {
    if(!this._didRun) {
      try {
        this._value = this._executor();
      } catch (err: any) {
        let e = err;

        if(!(err instanceof Error)) {
          e = new Error(err?.message || String(err) || "Unknown error");
        }

        this._error = e;
      } finally {
        this._didRun = true;
      }
    }

    if(this._error) {
      throw this._error;
    }

    return this._value!;
  }

  /**
   * Get the wrapped value without forcing evaluation.
   */
  get rawValue(): T | undefined {
    return this._value;
  }
}


export class AsyncLazy<T> {
  private _value: T | undefined;
  private _didRun: boolean = false;
  private _error: Error | null = null;
  private _promise: Promise<T> | null = null;

  public constructor(
    private readonly _executor: () => Promise<T> // eslint-disable-line comma-dangle
  ) { }

  public get hasValue(): boolean {
    return this._didRun;
  }

  public get rawValue(): T | undefined {
    return this._value;
  }

  public get value(): Promise<T> {
    if(this._didRun) {
      if(!this._error)
        return Promise.resolve(this._value!);

      return Promise.reject(this._error);
    }

    if(!this._promise) {
      this._promise = this._executor()
        .then(result => {
          this._value = result;
          return result;
        }, err => {
          this._error = err;
          throw err;
        })
        .finally(() => {
          this._didRun = true;
        });
    }

    return this._promise;
  }
}
