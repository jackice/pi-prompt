/** 合并渲染请求：普通更新最多 10Hz，紧急更新立即执行。 */
export class RenderScheduler {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private last = 0;
  private readonly minIntervalMs: number;

  constructor(
    private readonly request: () => void,
    minIntervalMs = 100,
  ) {
    this.minIntervalMs = minIntervalMs;
  }

  requestNow(): void {
    this.cancel();
    this.last = Date.now();
    this.request();
  }

  requestThrottled(): void {
    if (this.timer !== undefined) return;
    const delay = Math.max(0, this.minIntervalMs - (Date.now() - this.last));
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.last = Date.now();
      this.request();
    }, delay);
  }

  dispose(): void {
    this.cancel();
  }

  private cancel(): void {
    if (this.timer !== undefined) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
  }
}
