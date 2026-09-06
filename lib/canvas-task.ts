export type CanvasTask<T> = {
  readonly canvasId: string | null;
  readonly source: T;
  readonly signal: AbortSignal;
};

// A result belongs to one canvas session and one exact element revision.
export function createCanvasTaskScope<T extends { id: string }>() {
  let active: { task: CanvasTask<T>; controller: AbortController } | null = null;
  return {
    start(canvasId: string | null, source: T): CanvasTask<T> {
      active?.controller.abort();
      const controller = new AbortController();
      const task = { canvasId, source, signal: controller.signal };
      active = { task, controller };
      return task;
    },
    isCurrent(task: CanvasTask<T>, canvasId: string | null, elements: readonly T[]) {
      return active?.task === task && task.canvasId === canvasId &&
        elements.find((element) => element.id === task.source.id) === task.source;
    },
    cancel(elementId?: string) {
      if (!active || (elementId && active.task.source.id !== elementId)) return false;
      active.controller.abort();
      active = null;
      return true;
    },
    finish(task: CanvasTask<T>) {
      if (active?.task !== task) return false;
      active = null;
      return true;
    },
  };
}
