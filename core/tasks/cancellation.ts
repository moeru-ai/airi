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
		this.token = this.buildToken()

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

	/**
	 * Build the consumer-facing token object.
	 *
	 * Extracted as a method so arrow functions close over `this` (the
	 * CancellationTokenSource instance) instead of aliasing it to a local
	 * variable — avoids DeepSource JS-0342 (aliasing this).
	 */
	private buildToken(): CancellationToken {
		const checkCancelled = () => this._isCancelled
		const getReason = () => this._reason

		return {
			get isCancelled() {
				return checkCancelled()
			},
			onCancelled: (handler: (reason?: string) => void) => {
				if (checkCancelled()) {
					try {
						handler(getReason())
					} catch {
						// Handler errors are swallowed.
					}
					return () => { /* already cancelled, no-op unsubscribe */ }
				}
				this.handlers.add(handler)
				return () => {
					this.handlers.delete(handler)
				}
			},
			throwIfCancelled: () => {
				if (checkCancelled()) {
					const reason = getReason()
					throw new Error(reason ? `Task cancelled: ${reason}` : "Task cancelled")
				}
			},
		}
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
