/**
 * AIRI Core — Plan Executor
 *
 * Deterministic multi-step workflow boss that composes existing
 * TaskManager capabilities into sequential or dependency-parallel plans.
 *
 * Design decisions:
 * - Sequential execution for steps with dependencies.
 * - Parallel execution for independent steps (configurable concurrency, default 2).
 * - Cancellation propagates to all running step tasks.
 * - A failed step fails the plan (failure propagation).
 * - Per-step timeout enforcement via withTimeout.
 * - All plan/step events emitted through EventBus.
 * - Optional EventStore persistence for plan/step state transitions.
 */

import type { EventBus } from "../events/bus.js"
import type { Logger } from "../logger.js"
import type { TaskManager } from "../tasks/manager.js"
import type { TaskResult } from "../tasks/types.js"
import type { ToolRuntime } from "../runtime/tool-runtime.js"
import type { ToolExecutionContext, WorkspaceContext } from "../capabilities/types.js"
import { createToolId } from "../capabilities/types.js"
import type { EventStore } from "../persistence/types.js"
import type { AiriEvent } from "../events/types.js"
import { createCancellationToken } from "../tasks/cancellation.js"
import { withTimeout } from "../tasks/cancellation.js"
import type { Plan, PlanId, PlanStep, StepId } from "./types.js"
import type {
	PlanStarted,
	PlanCompleted,
	PlanFailed,
	PlanCancelled,
	StepStarted,
	StepCompleted,
	StepFailed,
} from "./events.js"

// ── Configuration ────────────────────────────────────────────────────────

export interface PlanExecutorOptions {
	/** Maximum concurrent steps. @default 2 */
	readonly concurrency?: number

	/** Default step timeout in milliseconds. @default 300_000 (5 minutes) */
	readonly defaultStepTimeoutMs?: number

	/**
	 * Optional event store for persisting plan/step state transitions.
	 * When configured, all plan and step lifecycle events are persisted
	 * to the event store in addition to being emitted on the EventBus.
	 */
	readonly eventStore?: EventStore

	/** Optional tool runtime for tool-based step execution. */
	readonly toolRuntime?: ToolRuntime
	/** Optional workspace context for sandbox-aware tool execution. */
	readonly workspaceContext?: WorkspaceContext
}

// ── Internal step execution ──────────────────────────────────────────────

interface StepExecution {
	step: PlanStep
	taskId: string
	startedAt: number
}

// ── Plan Executor ────────────────────────────────────────────────────────

/**
 * Orchestrates multi-step plan execution using the existing TaskManager.
 */
export class PlanExecutor {
	private readonly options: PlanExecutorOptions & { readonly concurrency: number; readonly defaultStepTimeoutMs: number }
	private readonly taskManager: TaskManager
	private readonly events: EventBus
	private readonly logger: Logger

	/** Optional tool runtime for tool-based step execution. */
	private readonly toolRuntime: ToolRuntime | undefined
	/** Optional workspace context for sandbox-aware tool execution. */
	private readonly workspaceContext: WorkspaceContext | undefined

	/** Currently running plan, if any. */
	private runningPlan: Plan | undefined

	/** Map of step ID → execution info for the running plan. */
	private readonly stepExecutions = new Map<string, StepExecution>()

	/** Map of plan ID → cancellation callback for active plans. */
	private readonly planCancelHandlers = new Map<string, () => void>()

	constructor(
		taskManager: TaskManager,
		events: EventBus,
		logger: Logger,
		options: PlanExecutorOptions = {},
	) {
		this.taskManager = taskManager
		this.events = events
		this.logger = logger
		this.toolRuntime = options.toolRuntime
		this.workspaceContext = options.workspaceContext
		this.options = {
			concurrency: options.concurrency ?? 2,
			defaultStepTimeoutMs: options.defaultStepTimeoutMs ?? 300_000,
			eventStore: options.eventStore,
		}
	}

	// ── Execute ───────────────────────────────────────────────────────────

	/**
	 * Execute a plan to completion.
	 *
	 * Steps are executed in topological order respecting dependencies.
	 * Independent steps run in parallel up to the concurrency limit.
	 */
	async executePlan(plan: Plan): Promise<Plan> {
		const now = new Date().toISOString()
		const startedAt = Date.now()

		// Mark plan as running.
		const running: Plan = {
			...plan,
			status: "running",
			startedAt: now,
		}
		this.runningPlan = running
		this.stepExecutions.clear()

		// Set up plan-level cancellation via task manager.
		let planCancelled = false
		const planCancel = () => {
			planCancelled = true
			this.cancelRunningSteps("Plan cancelled")
		}
		this.planCancelHandlers.set(plan.id as string, planCancel)

		// Emit plan.started.
		const planStartedEvent: PlanStarted = {
			type: "plan.started",
			timestamp: now,
			source: "planner",
			planId: plan.id as string,
			name: plan.name,
			stepCount: plan.steps.length,
		}
		await this.events.publish(planStartedEvent)

		// Persist plan.started event if event store is configured.
		if (this.options.eventStore) {
			await this.options.eventStore.append(planStartedEvent).catch(() => {
				// Persistence failure should not block execution.
			})
		}

		this.logger.info(`Plan ${plan.id} "${plan.name}" started (${plan.steps.length} steps)`)

		try {
			// Execute steps in dependency-respected order.
			await this.executeStepsInOrder(plan)

			// Check if plan was cancelled during execution.
			if (planCancelled) {
				return this.finalizePlan(running, "cancelled")
			}

			// All steps completed.
			const completed = this.finalizePlan(running, "completed")
			const durationMs = Date.now() - startedAt

			const planCompletedEvent: PlanCompleted = {
				type: "plan.completed",
				timestamp: new Date().toISOString(),
				source: "planner",
				planId: plan.id as string,
				name: plan.name,
				durationMs,
			}
			await this.events.publish(planCompletedEvent)

			// Persist plan.completed event.
			if (this.options.eventStore) {
				await this.options.eventStore.append(planCompletedEvent).catch(() => { /* best-effort persistence */ })
			}

			this.logger.info(`Plan ${plan.id} completed in ${durationMs}ms`)
			return completed
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error)
			const failed = this.finalizePlan(running, "failed", message)

			const planFailedEvent: PlanFailed = {
				type: "plan.failed",
				timestamp: new Date().toISOString(),
				source: "planner",
				planId: plan.id as string,
				name: plan.name,
				failureReason: message,
			}
			await this.events.publish(planFailedEvent)

			// Persist plan.failed event.
			if (this.options.eventStore) {
				await this.options.eventStore.append(planFailedEvent).catch(() => { /* best-effort persistence */ })
			}

			this.logger.error(`Plan ${plan.id} failed: ${message}`)
			return failed
		} finally {
			this.runningPlan = undefined
			this.stepExecutions.clear()
			this.planCancelHandlers.delete(plan.id as string)
		}
	}

	// ── Cancel ────────────────────────────────────────────────────────────

	/**
	 * Cancel a running plan and all its active steps.
	 */
	cancelPlan(planId: PlanId, reason?: string): Plan | undefined {
		const plan = this.runningPlan
		if (!plan || (plan.id as string) !== planId) return undefined

		const cancelFn = this.planCancelHandlers.get(planId as string)
		if (cancelFn) {
			cancelFn()
		}

		// Emit plan.cancelled.
		const cancelledEvent: PlanCancelled = {
			type: "plan.cancelled",
			timestamp: new Date().toISOString(),
			source: "planner",
			planId: plan.id as string,
			name: plan.name,
			reason,
		}
		this.events.publish(cancelledEvent).catch(() => { /* best-effort publish */ })

		// Persist plan.cancelled event.
		if (this.options.eventStore) {
			this.options.eventStore.append(cancelledEvent).catch(() => { /* best-effort persistence */ })
		}

		return this.finalizePlan(plan, "cancelled")
	}

	/**
	 * Get the currently executing plan, if any.
	 */
	getRunningPlan(): Plan | undefined {
		return this.runningPlan
	}

	// ── State persistence ─────────────────────────────────────────────────

	/**
	 * Force a state flush — persist the current plan state to the event store.
	 *
	 * This is useful for ensuring durability of the current plan state
	 * before a potentially long-running operation.
	 */
	async persistState(): Promise<void> {
		if (!this.options.eventStore || !this.runningPlan) return

		const plan = this.runningPlan
		const statusEvent = {
			type: `plan.${plan.status}`,
			timestamp: new Date().toISOString(),
			source: "planner",
			planId: plan.id as string,
			name: plan.name,
		}

		await this.options.eventStore.append(statusEvent as AiriEvent).catch(() => { /* best-effort persistence */ })
	}

	// ── Step execution order ──────────────────────────────────────────────

	/**
	 * Execute steps in topological order, running independent steps in parallel.
	 */
	private async executeStepsInOrder(plan: Plan): Promise<void> {
		const stepsById = new Map<string, PlanStep>()
		for (const step of plan.steps) {
			stepsById.set(step.id as string, step)
		}

		// Track completion state.
		const completed = new Set<string>()
		const failed = new Set<string>()
		const running = new Set<string>()

		// Build dependency map.
		const dependencyIds = new Map<string, StepId[]>()
		for (const step of plan.steps) {
			dependencyIds.set(step.id as string, step.dependencyIds ?? [])
		}

		// Execute until all steps are done.
		const pending = new Set(plan.steps.map((s) => s.id as string))

		while (pending.size > 0 || running.size > 0) {
			// Check if any dependency failed — mark dependent pending steps as skipped.
			for (const stepId of pending) {
				const deps = dependencyIds.get(stepId) ?? []
				const shouldSkip = deps.some((depId) => failed.has(depId as string))
				if (shouldSkip) {
					failed.add(stepId)
					pending.delete(stepId)
					this.logger.info(`Step ${stepId} skipped due to failed dependency`)
				}
			}

			// Find steps that are ready to execute (all dependencies met, not yet started).
			const ready: string[] = []
			let slotsUsed = running.size
			for (const stepId of pending) {
				if (slotsUsed >= this.options.concurrency) break
				const deps = dependencyIds.get(stepId) ?? []
				const allDepsMet = deps.every(
					(depId) => completed.has(depId as string) || failed.has(depId as string),
				)
				if (allDepsMet) {
					ready.push(stepId)
					slotsUsed++
				}
			}

			// Launch ready steps.
			for (const stepId of ready) {
				pending.delete(stepId)
				running.add(stepId)

				const step = stepsById.get(stepId)!
				this.executeStepAsync(plan, step).then(() => {
					running.delete(stepId)
					if (step.status === "completed") {
						completed.add(stepId)
					} else {
						failed.add(stepId)
					}
				})
			}

			// Wait for at least one step to complete before re-evaluating.
			if (running.size > 0) {
				await PlanExecutor.waitForAnyStep(running)
			}
		}

		// If any step failed, propagate the failure to the plan level.
		if (failed.size > 0) {
			const failedSteps = [...failed].map((id) => stepsById.get(id)?.name ?? id).join(", ")
			throw new Error(`Plan step(s) failed: ${failedSteps}`)
		}
	}

	/**
	 * Execute a single step asynchronously.
	 */
	private async executeStepAsync(plan: Plan, step: PlanStep): Promise<void> {
		const now = new Date().toISOString()
		const startedAt = Date.now()

		// Update step status to running.
		step.status = "running"
		step.startedAt = now

		// Emit step.started.
		const stepStartedEvent: StepStarted = {
			type: "step.started",
			timestamp: now,
			source: "planner",
			planId: plan.id as string,
			stepId: step.id as string,
			stepName: step.name,
			action: step.action,
		}
		await this.events.publish(stepStartedEvent)

		// Persist step.started event.
		if (this.options.eventStore) {
			await this.options.eventStore.append(stepStartedEvent).catch(() => { /* best-effort persistence */ })
		}

		this.logger.info(`Step ${step.id} "${step.name}" started [${step.action}]`)

		try {
			// Create a task for this step.
			const task = this.taskManager.createTask({
				title: `Plan: ${plan.name} — Step: ${step.name}`,
				description: step.description,
				moduleId: "planner",
				metadata: {
					planId: plan.id as string,
					stepId: step.id as string,
					action: step.action,
					stepInput: step.input,
				},
			})

			// Assign step → task mapping.
			step.taskId = task.id as string
			this.stepExecutions.set(step.id as string, {
				step,
				taskId: task.id as string,
				startedAt,
			})

			// Queue the task.
			this.taskManager.queue(task.id as string)

			// Execute the task directly (self-contained execution).
			const result = await this.runStepTask(task.id as string, step.timeoutMs)

			const durationMs = Date.now() - startedAt
			const completedAt = new Date().toISOString()

			if (result.success) {
				step.status = "completed"
				step.result = {
					success: true,
					output: result.output,
					durationMs,
				}
				step.completedAt = completedAt

				const stepCompletedEvent: StepCompleted = {
					type: "step.completed",
					timestamp: completedAt,
					source: "planner",
					planId: plan.id as string,
					stepId: step.id as string,
					stepName: step.name,
					success: true,
					durationMs,
				}
				await this.events.publish(stepCompletedEvent)

				// Persist step.completed event.
				if (this.options.eventStore) {
					await this.options.eventStore.append(stepCompletedEvent).catch(() => { /* best-effort persistence */ })
				}

				this.logger.info(`Step ${step.id} completed in ${durationMs}ms`)
			} else {
				throw new Error(result.error ?? "Step task failed")
			}
		} catch (error) {
			const durationMs = Date.now() - startedAt
			const message = error instanceof Error ? error.message : String(error)
			const completedAt = new Date().toISOString()

			step.status = "failed"
			step.completedAt = completedAt

			if (message.includes("cancelled") || message.includes("Cancelled")) {
				step.status = "cancelled"
			}

			step.result = {
				success: false,
				error: message,
				durationMs,
			}
			step.error = {
				code: step.status === "cancelled" ? "STEP_CANCELLED" : "STEP_FAILED",
				message,
				recoverable: false,
			}

			const stepFailedEvent: StepFailed = {
				type: "step.failed",
				timestamp: completedAt,
				source: "planner",
				planId: plan.id as string,
				stepId: step.id as string,
				stepName: step.name,
				error: step.error,
			}
			await this.events.publish(stepFailedEvent)

			// Persist step.failed event.
			if (this.options.eventStore) {
				await this.options.eventStore.append(stepFailedEvent).catch(() => { /* best-effort persistence */ })
			}

			this.logger.error(`Step ${step.id} failed: ${message}`)
		}
	}

	// ── Direct task execution ──────────────────────────────────────────────

	/**
	 * Run a step task directly by finding and calling the executor.
	 *
	 * This is self-contained execution — the PlanExecutor runs the task
	 * without requiring an external scheduler. This enables testing without
	 * a full scheduler setup and ensures step execution is deterministic.
	 */
	private async runStepTask(taskId: string, timeoutMs?: number): Promise<TaskResult> {
		const effectiveTimeout = timeoutMs ?? this.options.defaultStepTimeoutMs
		const task = this.taskManager.get(taskId)
		if (!task) {
			throw new Error(`Task not found: ${taskId}`)
		}

		// Try tool runtime first: if the step action maps to a registered tool, use it.
		if (this.toolRuntime) {
			// Check if the step's action field maps to a known tool.
			const stepAction = task.metadata?.action as string | undefined
			if (stepAction && this.toolRuntime.hasTool(createToolId(stepAction))) {
				const toolInput = (task.metadata?.stepInput as Record<string, unknown>) ?? {}
				const stepToken = this.taskManager.getCancellationToken(taskId)
				const toolCtx: ToolExecutionContext = {
					taskId: task.id,
					workspaceContext: this.workspaceContext,
					cancellationToken: stepToken ?? createCancellationToken().token,
					timeoutMs: effectiveTimeout,
					metadata: {
						planId: task.metadata?.planId as string | undefined,
						stepId: task.metadata?.stepId as string | undefined,
					},
				}

				try {
					const toolResult = await this.toolRuntime.execute(createToolId(stepAction), toolInput, toolCtx)

					if (toolResult.success) {
						this.taskManager.complete(taskId, { success: true, output: toolResult.output })
					} else {
						this.taskManager.fail(taskId, {
							code: toolResult.error?.code ?? "TOOL_EXECUTION_FAILED",
							message: toolResult.error?.message ?? "Tool execution failed",
							recoverable: true,
							details: toolResult.error?.details,
						})
					}

					return {
						success: toolResult.success,
						output: toolResult.output,
						error: toolResult.error?.message,
					}
				} catch (error) {
					const message = error instanceof Error ? error.message : String(error)

					if (message.includes("cancelled") || message.includes("Cancelled")) {
						this.taskManager.cancel(taskId, message)
					} else if (message.includes("timed out")) {
						this.taskManager.cancel(taskId, "Step timed out")
						throw new Error(`Step timed out after ${effectiveTimeout}ms`)
					} else {
						this.taskManager.fail(taskId, {
							code: "TOOL_EXECUTION_ERROR",
							message,
							recoverable: false,
							details: error,
						})
					}

					return { success: false, error: message }
				}
			}
		}

		// Fall back to the existing TaskExecutor path.
		const executor = this.findExecutorForTask(task)
		if (!executor) {
			throw new Error(`No executor found for task ${taskId} (module: ${task.moduleId})`)
		}

		// Transition to running.
		this.taskManager.startTask(taskId)

		// Build execution context.
		const token = this.taskManager.getCancellationToken(taskId)
		const ctx = {
			task,
			token: token ?? { isCancelled: false, onCancelled: () => () => { /* no-op */ }, throwIfCancelled: () => { /* no-op */ } },
			reportProgress: (percent: number, message?: string) => {
				this.taskManager.reportProgress(taskId, percent, message)
			},
			events: this.events,
			logger: this.logger,
		}

		// Execute with timeout.
		try {
			const result = await withTimeout(
				executor.execute(task, ctx),
				effectiveTimeout,
			)

			if (result.success) {
				this.taskManager.complete(taskId, result)
			} else {
				this.taskManager.fail(taskId, {
					code: "EXECUTION_FAILED",
					message: result.error ?? "Task execution failed",
					recoverable: true,
				})
			}

			return result
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error)

			if (message.includes("cancelled") || message.includes("Cancelled")) {
				this.taskManager.cancel(taskId, message)
			} else if (message.includes("timed out")) {
				this.taskManager.cancel(taskId, "Step timed out")
				throw new Error(`Step timed out after ${effectiveTimeout}ms`)
			} else {
				this.taskManager.fail(taskId, {
					code: "EXECUTION_ERROR",
					message,
					recoverable: false,
					details: error,
				})
			}

			return { success: false, error: message }
		}
	}

	/**
	 * Find an executor for the given task.
	 * Delegates to TaskManager's findExecutor.
	 */
	private findExecutorForTask(task: { moduleId: string }): { canExecute(task: unknown): boolean; execute(task: unknown, ctx: unknown): Promise<TaskResult> } | undefined {
		// Access the TaskManager's findExecutor method via the task manager.
		// We use the same logic as the TaskScheduler.
		return (this.taskManager as unknown as { findExecutor(task: unknown): ReturnType<typeof this.findExecutorForTask> }).findExecutor(task)
	}

	// ── Helpers ────────────────────────────────────────────────────────────

	/**
	 * Wait for any step in the running set to complete.
	 */
	private static waitForAnyStep(running: Set<string>): Promise<void> {
		return new Promise<void>((resolve) => {
			if (running.size === 0) {
				resolve()
				return
			}

			// Poll with a short interval.
			const timer = setInterval(() => {
				if (running.size === 0) {
					clearInterval(timer)
					resolve()
				}
			}, 20)

			// Safety: don't hang forever.
			setTimeout(() => {
				clearInterval(timer)
				resolve()
			}, 60_000)
		})
	}

	/**
	 * Cancel all running step tasks.
	 */
	private cancelRunningSteps(reason: string): void {
		for (const [, execution] of this.stepExecutions) {
			try {
				this.taskManager.cancel(execution.taskId, reason)
			} catch {
				// Task may already be in a terminal state.
			}
		}
	}

	/**
	 * Finalize a plan with a terminal status.
	 */
	private finalizePlan(plan: Plan, status: "completed" | "failed" | "cancelled", failureReason?: string): Plan {
		const now = new Date().toISOString()
		return {
			...plan,
			status,
			completedAt: status === "completed" ? now : plan.completedAt,
			failedAt: status === "failed" ? now : plan.failedAt,
			cancelledAt: status === "cancelled" ? now : plan.cancelledAt,
			failureReason: status === "failed" ? failureReason : plan.failureReason,
		}
	}
}
