export class AsyncThread {
  public static delay(t: number = 750): Promise<void> {
    return new Promise(r => setTimeout(r, t));
  }
}
