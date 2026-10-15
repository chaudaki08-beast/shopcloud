/**
 * Worker process lifecycle and in-flight request tracker (Phase 16)
 */
export class WorkerLifecycle {
  private static shuttingDown = false;
  private static inFlightTasks = 0;

  static incrementInFlight(): void {
    this.inFlightTasks++;
  }

  static decrementInFlight(): void {
    this.inFlightTasks = Math.max(0, this.inFlightTasks - 1);
  }

  static getInFlightCount(): number {
    return this.inFlightTasks;
  }

  static isShuttingDown(): boolean {
    return this.shuttingDown;
  }

  static setShuttingDown(val: boolean): void {
    this.shuttingDown = val;
  }

  static resetForTesting(): void {
    this.shuttingDown = false;
    this.inFlightTasks = 0;
  }
}
