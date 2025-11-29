/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in https://github.com/microsoft/vscode.
 *--------------------------------------------------------------------------------------------*/


import { type IByteArray } from "../buffer";
import { ByteWriter } from "../binary-protocol";
import { ICancellationToken } from "./cancellation";
import type { BufferLike, GenericFunction } from "./types";


/**
 * The payload that flows in readable stream events.
 */
export type ReadableStreamEventPayload<T> = T | Error | "end";

export interface ReadableStreamEvents<T> {

	/**
	 * The 'data' event is emitted whenever the stream is
	 * relinquishing ownership of a chunk of data to a consumer.
	 *
	 * NOTE: PLEASE UNDERSTAND THAT ADDING A DATA LISTENER CAN
	 * TURN THE STREAM INTO FLOWING MODE. IT IS THEREFOR THE
	 * LAST LISTENER THAT SHOULD BE ADDED AND NOT THE FIRST
	 *
	 * Use `listenStream` as a helper method to listen to
	 * stream events in the right order.
	 */
	on(event: "data", callback: (data: T) => void): void;

	/**
	 * Emitted when any error occurs.
	 */
	on(event: "error", callback: (err: Error) => void): void;

	/**
	 * The 'end' event is emitted when there is no more data
	 * to be consumed from the stream. The 'end' event will
	 * not be emitted unless the data is completely consumed.
	 */
	on(event: "end", callback: () => void): void;
}

/**
 * A interface that emulates the API shape of a node.js readable
 * stream for use in native and web environments.
 */
export interface ReadableStream<T> extends ReadableStreamEvents<T> {

	/**
	 * Stops emitting any events until resume() is called.
	 */
	pause(): void;

	/**
	 * Starts emitting events again after pause() was called.
	 */
	resume(): void;

	/**
	 * Destroys the stream and stops emitting any event.
	 */
	destroy(): void;

	/**
	 * Allows to remove a listener that was previously added.
	 */
	removeListener(event: string, callback: GenericFunction): void;
}

/**
 * A interface that emulates the API shape of a node.js readable
 * for use in native and web environments.
 */
export interface Readable<T> {

	/**
	 * Read data from the underlying source. Will return
	 * null to indicate that no more data can be read.
	 */
	read(): T | null;
}

export function isReadable<T>(obj: unknown): obj is Readable<T> {
  const candidate = obj as Readable<T> | undefined;

  if(!candidate || typeof candidate !== "object") 
    return false;

  return typeof candidate.read === "function";
}

/**
 * A interface that emulates the API shape of a node.js writeable
 * stream for use in native and web environments.
 */
export interface WriteableStream<T> extends ReadableStream<T> {

	/**
	 * Writing data to the stream will trigger the on('data')
	 * event listener if the stream is flowing and IByteArray the
	 * data otherwise until the stream is flowing.
	 *
	 * If a `highWaterMark` is configured and writing to the
	 * stream reaches this mark, a promise will be returned
	 * that should be awaited on before writing more data.
	 * Otherwise there is a risk of buffering a large number
	 * of data chunks without consumer.
	 */
	write(data: T): void | Promise<void>;

	/**
	 * Signals an error to the consumer of the stream via the
	 * on('error') handler if the stream is flowing.
	 *
	 * NOTE: call `end` to signal that the stream has ended,
	 * this DOES NOT happen automatically from `error`.
	 */
	error(error: Error): void;

	/**
	 * Signals the end of the stream to the consumer. If the
	 * result is provided, will trigger the on('data') event
	 * listener if the stream is flowing and IByteArray the data
	 * otherwise until the stream is flowing.
	 */
	end(result?: T): void;
}

/**
 * A stream that has a IByteArray already read. Returns the original stream
 * that was read as well as the chunks that got read.
 *
 * The `ended` flag indicates if the stream has been fully consumed.
 */
export interface ReadableBufferedStream<T> {

	/**
	 * The original stream that is being read.
	 */
	stream: ReadableStream<T>;

	/**
	 * An array of chunks already read from this stream.
	 */
	IByteArray: T[];

	/**
	 * Signals if the stream has ended or not. If not, consumers
	 * should continue to read from the stream until consumed.
	 */
	ended: boolean;
}

export function isReadableStream<T>(obj: unknown): obj is ReadableStream<T> {
  const candidate = obj as ReadableStream<T> | undefined;

  if(!candidate || typeof candidate !== "object")
    return false;

  return [candidate.on, candidate.pause, candidate.resume, candidate.destroy].every(fn => typeof fn === "function");
}

export function isReadableBufferedStream<T>(obj: unknown): obj is ReadableBufferedStream<T> {
  const candidate = obj as ReadableBufferedStream<T> | undefined;
  
  if(!candidate || typeof candidate !== "object")
    return false;

  return isReadableStream(candidate.stream) && Array.isArray(candidate.IByteArray) && typeof candidate.ended === "boolean";
}


export type Reducer<T, R = T> = (data: T[]) => R;
export type BinaryReducer = (writer: ByteWriter) => IByteArray;


export function consumeStream(stream: ReadableStreamEvents<unknown>): Promise<null>;
export function consumeStream<T, R = T>(stream: ReadableStreamEvents<T>, reducer: Reducer<T, R>): Promise<R>;
export function consumeStream<T, R = T>(stream: ReadableStreamEvents<T>, reducer?: Reducer<T, R>): Promise<R | null> {
  return new Promise((resolve, reject) => {
    const chunks: T[] = [];

    listenStream(stream, {
      onData: chunk => {
        if(reducer) {
          chunks.push(chunk);
        }
      },
      onError: error => {
        if(reducer) {
          reject(error);
        } else {
          resolve(null);
        }
      },
      onEnd: () => {
        if(reducer) {
          resolve(reducer(chunks));
        } else {
          resolve(null);
        }
      },
    });
  });
}

export function consumeBinaryStream(stream: ReadableStreamEvents<BufferLike>, reducer?: BinaryReducer | null, stop?: number): Promise<IByteArray> {
  return new Promise((resolve, reject) => {
    const writer = new ByteWriter();

    listenStream(stream, {
      onData: chunk => {
        writer.write(chunk);

        if(stop && writer.buffer.byteLength >= stop) {
          (stream as any).end?.();
        }
      },
      onError: error => {
        reject(error);
      },
      onEnd: () => {
        resolve(reducer ? reducer(writer) : writer.drain());
      },
    });
  });
}


export interface IStreamListener<T> {

	/**
	 * The 'data' event is emitted whenever the stream is
	 * relinquishing ownership of a chunk of data to a consumer.
	 */
	onData(data: T): void;

	/**
	 * Emitted when any error occurs.
	 */
	onError(err: Error): void;

	/**
	 * The 'end' event is emitted when there is no more data
	 * to be consumed from the stream. The 'end' event will
	 * not be emitted unless the data is completely consumed.
	 */
	onEnd(): void;
}

/**
 * Helper to listen to all events of a T stream in proper order.
 */
export function listenStream<T>(stream: ReadableStreamEvents<T>, listener: IStreamListener<T>, token?: ICancellationToken): void {

  stream.on("error", error => {
    if(!token?.isCancellationRequested) {
      listener.onError(error);
    }
  });

  stream.on("end", () => {
    if(!token?.isCancellationRequested) {
      listener.onEnd();
    }
  });

  // Adding the `data` listener will turn the stream
  // into flowing mode. As such it is important to
  // add this listener last (DO NOT CHANGE!)
  stream.on("data", data => {
    if(!token?.isCancellationRequested) {
      listener.onData(data);
    }
  });
}
