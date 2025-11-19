import { EventLoop } from "./event-loop";
import { Disposable, IDisposable } from "./disposable";



export type CancellationRequestListener = (listener: (e: any) => any, thisArgs?: any, disposables?: IDisposable[]) => IDisposable;


export interface ICancellationToken {
  
  /**
	 * A flag signalling is cancellation has been requested.
	 */
	readonly isCancellationRequested: boolean;

	/**
	 * An event which fires when cancellation is requested. This event
	 * only ever fires `once` as cancellation can only happen once. Listeners
	 * that are registered after cancellation will be called (next event loop run),
	 * but also only once.
	 *
	 * @event
	 */
	readonly onCancellationRequested: CancellationRequestListener;
}


const shortcutEvent = Object.freeze(function (callback: (...args: any[]) => any, context?: any): IDisposable {
  return EventLoop.immediate(callback.bind(context));
});


export function isCancellationToken(arg: unknown): arg is ICancellationToken {
  if(typeof arg !== "object" || !arg || Array.isArray(arg)) return false;

  const candidate = (<ICancellationToken>arg);

  return typeof candidate.isCancellationRequested === "boolean" &&
    typeof candidate.onCancellationRequested === "function";
}


// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace CancellationToken {
  export const None = Object.freeze<ICancellationToken>({
    isCancellationRequested: false,
    onCancellationRequested: () => Object.freeze<IDisposable>({ dispose() { } }),
  });
  
  export const Cancelled = Object.freeze<ICancellationToken>({
    isCancellationRequested: true,
    onCancellationRequested: shortcutEvent,
  });
}


class MutableToken extends Disposable implements ICancellationToken {
  private _isCancelled: boolean = false;
  private _listeners: { listener: (reason: any) => unknown; thisArgs?: unknown }[] = [];

  public get isCancellationRequested(): boolean {
    return this._isCancelled;
  }

  public get onCancellationRequested(): CancellationRequestListener {
    if(this._isCancelled) return shortcutEvent;

    return ((listener, thisArgs, disposables) => {
      if(!this._isCancelled) return this._listeners?.push({ listener, thisArgs });

      if(disposables && Array.isArray(disposables)) {
        disposables.push(shortcutEvent(listener, thisArgs));
        
        for(const d of disposables) {
          super._register(d);
        }
      } else return listener.call(thisArgs, void 0);
    }) as CancellationRequestListener;
  }

  public cancel(reason?: any) {
    if(this._isCancelled) return;

    this._isCancelled = true;
    if(this._listeners.length === 0) return this.dispose();

    for(const { listener, thisArgs } of this._listeners) {
      listener.call(thisArgs ?? null, reason);
    }
    
    this.dispose();
  }
}


export class CancellationTokenSource {
  private _token?: ICancellationToken | null = null;
  private _parentListener?: IDisposable | null = null;

  public constructor(private readonly _parent?: ICancellationToken | null) {
    if(!_parent) return;
    this._parentListener = _parent.onCancellationRequested(this.cancel, this);
  }

  public get token(): ICancellationToken {
    if(!this._token) {
      this._token = new MutableToken();
    }

    return this._token;
  }

  public get parent(): ICancellationToken | null | undefined {
    return this._parent;
  }

  public cancel(reason?: any): void {
    if(!this._token) {
      this._token = CancellationToken.Cancelled;
    } else if(this._token instanceof MutableToken) {
      this._token.cancel(reason);
    }
  }

  public dispose(cancel: boolean = false, cancellationReason?: any): void {
    if(cancel === true) {
      this.cancel(cancellationReason);
    }

    this._parentListener?.dispose();

    if(!this._token) {
      this._token = CancellationToken.None;
    } else if(this._token instanceof MutableToken) {
      this._token.dispose();
    }
  }
}
