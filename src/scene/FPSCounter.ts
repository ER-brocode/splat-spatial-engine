/**
 * High-precision FPS and Frame Time performance counter for 3D graphics engines.
 */
export class FPSCounter {
  private frameCount: number = 0;
  private lastTime: number = 0;
  private currentFps: number = 0;
  private currentFrameTime: number = 0;
  private minFps: number = Infinity;
  private maxFps: number = 0;
  private history: number[] = [];
  private maxHistory: number = 60;

  constructor() {
    this.lastTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
  }

  /**
   * Ticks the counter and recalculates metrics.
   * Call once per animation frame.
   */
  public update(now?: number): void {
    const currentTime = now ?? (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const delta = currentTime - this.lastTime;
    this.frameCount++;
    this.currentFrameTime = delta;

    if (delta >= 1000) {
      this.currentFps = Math.round((this.frameCount * 1000) / delta);
      this.minFps = Math.min(this.minFps, this.currentFps);
      this.maxFps = Math.max(this.maxFps, this.currentFps);

      this.history.push(this.currentFps);
      if (this.history.length > this.maxHistory) {
        this.history.shift();
      }

      this.frameCount = 0;
      this.lastTime = currentTime;
    }
  }

  public getFPS(): number {
    return this.currentFps;
  }

  public getFrameTime(): number {
    return this.currentFrameTime;
  }

  public getMinFPS(): number {
    return this.minFps === Infinity ? 0 : this.minFps;
  }

  public getMaxFPS(): number {
    return this.maxFps;
  }

  public getHistory(): number[] {
    return [...this.history];
  }

  public reset(): void {
    this.frameCount = 0;
    this.lastTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
    this.currentFps = 0;
    this.currentFrameTime = 0;
    this.minFps = Infinity;
    this.maxFps = 0;
    this.history = [];
  }
}
