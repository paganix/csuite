import { AsyncThread } from "../components/async";
import { CancellationToken, CancellationTokenSource } from "./cancellation";


describe("INTERNALS/cancellation", () => {
  test("Cancelled token should call `onCancellationRequested()` callback", async () => {
    const callback = jest.fn();
    CancellationToken.Cancelled.onCancellationRequested(callback);

    await AsyncThread.delay(72);
    expect(callback).toHaveBeenCalledTimes(1);
  });

  test("An cancellation token should be cancelled by it's source", () => {
    const source = new CancellationTokenSource();
    const callback = jest.fn();

    source.token.onCancellationRequested(callback);
    expect(source.token.isCancellationRequested).toBe(false);


    source.cancel();

    expect(source.token.isCancellationRequested).toBe(true);
    expect(callback).toHaveBeenCalledTimes(1);
  });

  test("An cancellation token should be cancelled when source is disposed with `cancel=true`", () => {
    const source = new CancellationTokenSource();
    const callback = jest.fn();

    source.token.onCancellationRequested(callback);
    expect(source.token.isCancellationRequested).toBe(false);


    source.dispose(true);

    expect(source.token.isCancellationRequested).toBe(true);
    expect(callback).toHaveBeenCalledTimes(1);
  });

  test("An cancellation token should not be cancelled when source is disposed with `cancel=false`", () => {
    const source = new CancellationTokenSource();
    const callback = jest.fn();

    source.token.onCancellationRequested(callback);
    expect(source.token.isCancellationRequested).toBe(false);


    source.dispose();

    expect(source.token.isCancellationRequested).toBe(false);
    expect(callback).not.toHaveBeenCalled();
  });

  test("Cancellation token should handle parent's token cancellation", () => {
    const parent = new CancellationTokenSource();
    const source = new CancellationTokenSource(parent.token);

    const callback = jest.fn();
    source.token.onCancellationRequested(callback);

    expect(parent.token.isCancellationRequested).toBe(false);
    expect(source.token.isCancellationRequested).toBe(false);
    
    parent.cancel();

    expect(source.token.isCancellationRequested).toBe(true);
    expect(parent.token.isCancellationRequested).toBe(true);
    expect(callback).toHaveBeenCalledTimes(1);
  });
});
