export function isThenable<T>(obj: unknown): obj is Promise<T> {
  return (
    typeof obj === "object" &&
      !!obj &&
      "then" in obj &&
      typeof obj.then === "function"
  );
}
