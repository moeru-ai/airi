/** A server refused a request of a transfer. */
export class TransferRequestError extends Error {
  constructor(readonly status: number, message: string) {
    super(message)
    this.name = 'TransferRequestError'
  }
}

/**
 * True when a retry cannot change the answer, for example a full quota, a deleted record, or a wrong
 * file format. A background retry skips these failures, so it does not send the same file again and again.
 */
export function isPermanentTransferFailure(error: unknown) {
  return error instanceof TransferRequestError
    && error.status >= 400 && error.status < 500
    && ![401, 408, 429].includes(error.status)
}
