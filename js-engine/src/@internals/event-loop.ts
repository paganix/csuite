import { IDisposable } from "./disposable";


let promise: Promise<void> | undefined;


export class EventLoop {
  public static schedule<T extends ((...args: unknown[]) => any | Promise<any>)>(callback: T): void {
    if(typeof queueMicrotask !== "undefined" &&
      typeof queueMicrotask === "function") return void queueMicrotask(callback);

    (promise || (promise = Promise.resolve()))
      .then(callback)
      .catch(err => {
        this.immediate(() => { throw err; });
      });
  }

  public static immediate<TArgs extends any[]>(callback: (...args: TArgs) => void, ...args: TArgs): IDisposable & Disposable {
    const hasNativeMethod = typeof setImmediate === "function";
    const id = hasNativeMethod ? setImmediate(callback, ...args) : setTimeout(callback, 0, ...args);

    return {
      dispose() {
        if(hasNativeMethod) {
          clearImmediate(id as NodeJS.Immediate);
        } else {
          clearTimeout(id as NodeJS.Timeout);
        }
      },

      [Symbol.dispose]() {
        if(hasNativeMethod) {
          clearImmediate(id as NodeJS.Immediate);
        } else {
          clearTimeout(id as NodeJS.Timeout);
        }
      },
    };
  }
}
