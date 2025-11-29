const hasPerformanceNow = (
  !!globalThis?.performance &&
  typeof globalThis.performance?.now === "function"
);


export class SystemClock {
  public static time_since_epoch(): number {
    return Date.now();
  }

  public static current_timestamp(highPrecision: boolean = true): number {
    if(!highPrecision) return Date.now();
    return hasPerformanceNow ? globalThis.performance.now() : Date.now();
  }
}
