export function isThenable<T>(obj: unknown): obj is Promise<T> {
  return (
    typeof obj === "object" &&
      !!obj &&
      "then" in obj &&
      typeof obj.then === "function"
  );
}


const kindOf = (cache => (thing: unknown) => {
  const str = Object.prototype.toString.call(thing);
  return cache[str] || (cache[str] = str.slice(8, -1).toLowerCase());
})(Object.create(null));


export function isPlainObject(val: any): boolean {
  if(Array.isArray(val)) return false;
  if(kindOf(val) !== "object" || typeof val !== "object") return false;

  const prototype = Object.getPrototypeOf(val);
  return (prototype === null || prototype === Object.prototype || Object.getPrototypeOf(prototype) === null) && !(Symbol.toStringTag in val) && !(Symbol.iterator in val);
}

export function isInstance(thing: unknown): boolean {
  return (
    !!thing &&
    !isPlainObject(thing) &&
    Object.getPrototypeOf(thing) !== Object.prototype
  );
}
