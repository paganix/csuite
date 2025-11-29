import { ByteWriter } from "../binary-protocol";
import type { BufferLike } from "../@internals/types";
import { consumeBinaryStream } from "../@internals/stream";
import { CryptoError, ERROR_CODE } from "../@internals/errors";
import { ByteArray, mask, toByteArray, type IByteArray } from "../buffer";


export function canAccessDevRandom(): Promise<boolean> {
  if(!hasNodeFS_())
    return Promise.resolve(false);

  let existsSync: typeof import("fs").existsSync;
  let createReadStream: typeof import("fs").createReadStream;

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const x = require("node:fs");

    existsSync = x.existsSync;
    createReadStream = x.createReadStream;
  } catch {
    return Promise.resolve(false);
  }
  
  return new Promise(resolve => {
    if(!existsSync("/dev/urandom"))
      return resolve(false);

    const stream = createReadStream("/dev/urandom", {
      start: 0,
      end: 1024,
    });

    stream.on("error", () => {
      resolve(false);
    });

    stream.on("end", () => {
      resolve(true);
    });
  });
}

export async function urandom(len: number = 0xFF, entropy?: BufferLike | IByteArray): Promise<IByteArray | null> {
  if(len > 7.68e+8) {
    throw new CryptoError("Requested random buffer is too large, it may overflow system's memory", ERROR_CODE.E_CRYPTO_OUT_OF_RANGE);
  }

  const stream = openEntropyDevice_(len);
  if(stream == null) return null;

  const raw = await new Promise<IByteArray>((resolve, reject) => {
    const writer = new ByteWriter();

    stream.on("error", reject);
    stream.on("end", () => resolve(writer.drain()));

    stream.on("data", chunk => {
      writer.write(chunk);
    });
  });

  return ByteArray.from(
    mask(
      raw.unwrap(),
      entropy ? toByteArray(entropy).unwrap() : void 0,
      true // eslint-disable-line comma-dangle
    ) // eslint-disable-line comma-dangle
  );
}

export function urandomStream(len: number = 0xFF, entropy?: IByteArray | BufferLike): import("stream").Readable | null {
  /* eslint-disable @typescript-eslint/no-var-requires */
  const dev = openEntropyDevice_(len);
  const STEP = 0x400;

  if(dev == null) return null;
  if(!entropy) return dev;

  let cursor: number = 0;
  const { createReadStream } = require("node:fs") as typeof import("fs");

  return new (require("node:stream") as typeof import("stream")).Readable({
    async read() {
      if(cursor >= len) {
        this.push(null);
        return;
      }

      const chunkSize = Math.min(STEP, len - cursor);
      cursor += chunkSize;

      dev.destroy();

      const buf = await consumeBinaryStream(
        createReadStream("/dev/urandom", {
          start: 0,
          end: chunkSize,
        }) // eslint-disable-line comma-dangle
      );

      this.push(
        mask(
          buf.unwrap(),
          entropy ? toByteArray(entropy).unwrap() : void 0,
          true // eslint-disable-line comma-dangle
        ) // eslint-disable-line comma-dangle
      );
    },
  });

  /* eslint-enable @typescript-eslint/no-var-requires */
}


function openEntropyDevice_(stopSize?: number | null): import("stream").Readable | null {
  if(!hasNodeFS_())
    return null;

  let existsSync: typeof import("fs").existsSync;
  let createReadStream: typeof import("fs").createReadStream;

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const x = require("node:fs");

    existsSync = x.existsSync;
    createReadStream = x.createReadStream;
  } catch {
    return null;
  }

  if(!stopSize) {
    stopSize = 0xFF;
  }

  if(!existsSync("/dev/urandom"))
    return null;

  return createReadStream("/dev/urandom", {
    start: 0,
    end: stopSize | 0,
  });
}

function hasNodeFS_(): boolean {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const x = require("node:crypto");
    return !!(x as typeof import("crypto")).constants;
  } catch {
    return false;
  }
}
