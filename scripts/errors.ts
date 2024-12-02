export function rejectIfError<E = unknown>(error: E | undefined, reject: (error?: E) => void, handler?: (error?: E) => void) {
  if (error) {
    reject(error)
    !!handler && handler(error)
  }
}

export function onError<E = unknown>(reject: (error?: E) => void, handler?: (error?: E) => void) {
  return (error?: E) => rejectIfError(error, reject, handler)
}

export function resolveWhenNoError<R = void, E = unknown>(reject: (error?: E) => void, resolve: (result?: R) => void) {
  return (err: E) => {
    if (err) {
      reject(err)
    }
    else {
      resolve()
    }
  }
}

export function noError<
  T,
  U extends unknown[],
  E = unknown,
>(
  reject: (err?: E) => void,
  fn: (...args: U) => T,
): (err: E | undefined, ...args: U) => T | undefined {
  return (err, ...args) => {
    if (err) {
      rejectIfError(err, reject)
      return
    }

    return fn(...args)
  }
}
