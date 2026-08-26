export interface CancellablePromise<T> {
  cancel: () => void
  promise: Promise<T>
}

export function cancellable<T>(promise: Promise<T>): CancellablePromise<T> {
  let cancel: () => void

  const wrappedPromise = new Promise<T>((resolve, reject) => {
    cancel = () => reject(new Error('CANCELLED'))
    promise.then(resolve).catch(reject)
  })

  return {
    cancel: () => cancel?.(),
    promise: wrappedPromise,
  }
}
