/** A server refused a request of a transfer. */
export class TransferRequestError extends Error {
  constructor(
    readonly status: number,
    message: string,
    /** True when a retry cannot change the answer. A call can decide this when a status has several meanings. */
    readonly permanent = status >= 400 && status < 500 && ![401, 408, 410, 429].includes(status),
  ) {
    super(message)
    this.name = 'TransferRequestError'
  }
}

/**
 * True when a retry cannot change the answer, for example a full quota, a deleted record, or a wrong
 * file format. A background retry skips these failures, so it does not send the same file again and again.
 * An expired session (410) stays retryable, because the next attempt reserves a new session.
 */
export function isPermanentTransferFailure(error: unknown) {
  return error instanceof TransferRequestError && error.permanent
}
