import { type IByteArray } from "./buffer";
import type { BufferLike } from "./@internals/types";


export interface IReader {
  read(len?: number): IByteArray;
  readonly readable: boolean;
}

export interface IWriter {
  write(chunk: BufferLike | IByteArray): void;
  drain(): IByteArray;
  
  readonly writable: boolean;
}
