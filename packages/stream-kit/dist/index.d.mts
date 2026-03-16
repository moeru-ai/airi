//#region src/queue.d.ts
interface HandlerContext<T> {
  data: T;
  emit: (eventName: string, ...params: any[]) => void;
}
interface Events<T> {
  enqueue: Array<(payload: T, queueLength: number) => void>;
  dequeue: Array<(payload: T, queueLength: number) => void>;
  process: Array<(payload: T, handler: (param: HandlerContext<T>) => Promise<any>) => void>;
  error: Array<(payload: T, error: unknown, handler: (param: HandlerContext<T>) => Promise<any>) => void>;
  result: Array<(<R>(payload: T, result: R, handler: (param: HandlerContext<T>) => Promise<any>) => void)>;
  drain: Array<() => void>;
}
declare function createQueue<T>(options: {
  handlers: Array<(ctx: HandlerContext<T>) => Promise<void>>;
}): {
  enqueue: (payload: T) => void;
  clear: () => void;
  length: () => number;
  on: <E extends keyof Events<T>>(eventName: E, listener: Events<T>[E][number]) => void;
  onHandlerEvent: (eventName: string, listener: (...params: any[]) => void) => void;
};
type UseQueueReturn<T> = ReturnType<typeof createQueue<T>>;
//#endregion
export { Events, HandlerContext, UseQueueReturn, createQueue };