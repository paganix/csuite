export interface IDisposable {
  dispose(): void;
}


export class Disposable implements IDisposable {
  public static readonly None: IDisposable = Object.freeze<IDisposable>({ dispose() {} });
  readonly #lifecycle: Set<IDisposable> = new Set();
  #isDisposed: boolean = false;

  public dispose(): void {
    if(this.#isDisposed) return;

    this.#isDisposed = true;
    this._clear();
  }
      
  protected _clear() {
    this.#lifecycle.forEach(item => item.dispose());
    this.#lifecycle.clear();
  }

  protected _isDisposed(): boolean {
    return this.#isDisposed;
  }

  protected _register<T extends IDisposable>(t: T): T {
    if(this.#isDisposed) {
      console.warn("[Disposable] Registering disposable on object that has already been disposed.");
      t.dispose();
    } else {
      this.#lifecycle.add(t);
    }

    return t;
  }
}
