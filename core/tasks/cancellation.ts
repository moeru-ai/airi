/**
 * AIRI Core — Cancellation Infrastructure
 *
 * Cooperative cancellation primitives for the task orchestration layer.
 *
 * Design decisions:
 * - Cooperative, not preemptive: tasks must poll or check the token.
 * - Linked tokens propagate cancellation from parent to child.
 * - Timeout support via withTimeout() wraps any promise with a deadline.
 * - No external dependencies — pure in-memory signaling.
 */

// ── Types ────────────────────────────────────────────────────────────────

/**
 * Unsubscribe function returned by cancellation handlers.
 */
export type UnsubscribeFn = () => void

/**
 * Cancellation token — the consumer-facing side.
 */
export interface CancellationToken {
	/** Whether cancellation has been requested. */
	readonly isCancelled: boolean

	/**
	 * Register a callback that fires when cancellation is requested.
	 * Returns an unsubscribe function.
	 */
	onCancelled(handler: (reason?: string) => void): UnsubscribeFn

	/**
	 * Throw an error if cancellation has been requested.
	 * @throws Error with message "Task cancelled" (or the cancellation reason).
	 */
	throwIfCancelled(): void
}

/**
 * Cancellation token source — the producer-facing side.
 */
export class CancellationTokenSource {
	private _isCancelled = false
	private _reason?: string
	private readonly handlers = new Set<(reason?: string) => void>()
	private readonly linkedSources = new Set<CancellationTokenSource>()
	private parentUnsubscribe: (() => void) | undefined

	/** The token exposed to consumers. */
	readonly token: CancellationToken

	constructor(parent?: CancellationToken) {
		// NOTICE: `self` alias is required because the object literal below uses
		// getters and methods whose `this` refers to the token object, not the
		// CancellationTokenSource instance. DeepSource JS-0342 flags this, but
		// there's no alternative that preserves access to private fields.
		const self = this // deepsource: ignore

		this.token = {
			get isCancelled() {
				return self._isCancelled
			},
			onCancelled(handler: (reason?: string) => void) {
				if (self._isCancelled) {
					try {
						handler(self._reason)
					} catch {
						// Handler errors are swallowed.
					}
					return () => {}
				}
				self.handlers.add(handler)
				return () => {
					self.handlers.delete(handler)
				}
			},
			throwIfCancelled() {
				if (self._isCancelled) {
					throw new Error(self._reason ? `Task cancelled: ${self._reason}` : "Task cancelled")
				}
			},
		}

		if (parent) {
			this.parentUnsubscribe = parent.onCancelled((reason) => {
				this.cancel(reason ?? "Parent cancelled")
			})
			if (parent.isCancelled) {
				this.cancel("Parent cancelled")
			}
		}
	}

	get isCancelled(): boolean {
		return this._isCancelled
	}

	cancel(reason?: string): void {
		if (this._isCancelled) return

		this._isCancelled = true
		this._reason = reason

		if (this.parentUnsubscribe) {
			this.parentUnsubscribe()
			this.parentUnsubscribe = undefined
		}

		for (const handler of this.handlers) {
			try {
				handler(reason)
			} catch {
				// Swallow handler errors.
			}
		}
		this.handlers.clear()

		for (const child of this.linkedSources) {
			child.cancel(reason ?? "Parent cancelled")
		}
	}

	linkTo(child: CancellationTokenSource): UnsubscribeFn {
		this.linkedSources.add(child)
		return () => {
			this.linkedSources.delete(child)
		}
	}
}

// ── Factory ──────────────────────────────────────────────────────────────

/**
 * Create a standalone cancellation token source (no parent).
 */
export function createCancellationToken(): CancellationTokenSource {
	return new CancellationTokenSource()
}

/**
 * Create a linked cancellation token source.
 */
export function createLinkedCancellationToken(parent: CancellationToken): CancellationTokenSource {
	return new CancellationTokenSource(parent)
}

// ── Timeout ──────────────────────────────────────────────────────────────

/**
 * Wrap a promise with a timeout.
 */
export async function withTimeout<T>(
	promise: Promise<T>,
	ms: number,
	token?: CancellationToken,
): Promise<T> {
	return new Promise<T>((resolve, reject) => {
		let settled = false

		const timer = setTimeout(() => {
			if (settled) return
			settled = true
			reject(new Error(`Operation timed out after ${ms}ms`))
		}, ms)

		if (token) {
			if (token.isCancelled) {
				if (settled) return
				settled = true
				clearTimeout(timer)
				reject(new Error("Task cancelled"))
				return
			}

			const unsub = token.onCancelled(() => {
				if (settled) return
				settled = true
				clearTimeout(timer)
				reject(new Error("Task cancelled"))
			})

			promise.finally(unsub)
		}

		promise.then(
			(value) => {
				if (settled) return
				settled = true
				clearTimeout(timer)
				resolve(value)
			},
			(error) => {
				if (settled) return
				settled = true
				clearTimeout(timer)
				reject(error)
			},
		)
	})
}
