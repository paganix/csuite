import { randomBytes, timingSafeEqual } from "node:crypto";

import { Base64, Hex, Utf8 } from "./text";


describe("encoders/text", () => {
  test("Should encode hex text", () => {
    const data = randomBytes(12);

    const nodeStr = data.toString("hex");
    const hexStr = Hex.encode(data, true);

    expect(nodeStr).toStrictEqual(hexStr);
  });

  test("Should decode hex text", () => {
    const data = randomBytes(12).toString("hex");

    const nodeBuf = Buffer.from(data, "hex");
    const u8Buf = Hex.decode(data, false, true);

    expect(timingSafeEqual(u8Buf, nodeBuf)).toBe(true);
  });

  test("Should encode utf-8 text", () => {
    const data = randomBytes(12);

    const nodeStr = data.toString("utf8");
    const hexStr = Utf8.decode(data);

    expect(nodeStr).toStrictEqual(hexStr);
  });

  test("Should decode utf-8 text", () => {
    const data = randomBytes(12).toString("utf8");

    const nodeBuf = Buffer.from(data, "utf-8");
    const u8Buf = Utf8.encode(data);

    expect(timingSafeEqual(u8Buf, nodeBuf)).toBe(true);
  });

  test("Should encode base64 text", () => {
    const data = randomBytes(12);

    const nodeStr = data.toString("base64");
    const base64Str = Base64.encode(data, { dontUseNodeBuffer: true });

    expect(nodeStr).toStrictEqual(base64Str);
  });

  test("Should decode base64 text", () => {
    const data = randomBytes(12).toString("base64");

    const nodeBuf = Buffer.from(data, "base64");
    const u8Buf = Base64.decode(data, { dontUseNodeBuffer: true });

    expect(timingSafeEqual(u8Buf, nodeBuf)).toBe(true);
  });

  test("Should encode base64url text", () => {
    const data = randomBytes(12);

    const nodeStr = data.toString("base64url");
    const base64Str = Base64.encode(data, { dontUseNodeBuffer: true, urlSafe: true });

    expect(nodeStr).toStrictEqual(base64Str);
  });

  test("Should decode base64url text", () => {
    const data = randomBytes(12).toString("base64url");

    const nodeBuf = Buffer.from(data, "base64url");
    const u8Buf = Base64.decode(data, { dontUseNodeBuffer: true, urlSafe: true });

    expect(timingSafeEqual(u8Buf, nodeBuf)).toBe(true);
  });
});
