export interface CancellablePromise<T> {
  promise: Promise<T>
  cancel: () => void
}

export function cancellable<T>(promise: Promise<T>): CancellablePromise<T> {
  let cancel: () => void

  const wrappedPromise = new Promise<T>((resolve, reject) => {
    cancel = () => reject(new Error('CANCELLED'))
    promise.then(resolve).catch(reject)
  })

  return {
    promise: wrappedPromise,
    cancel: () => cancel?.(),
  }
}
