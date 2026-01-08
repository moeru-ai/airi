import type { Logg } from '@guiiai/logg'

import type { Plan } from '../../libs/mineflayer/base-agent'
import type { TaskContext, TaskStatus } from './task-state'

import { createCancellationToken } from './task-state'

export class TaskManager {
  private primaryTask: TaskContext | null = null
  private secondaryTasks: Map<string, TaskContext> = new Map()
  private taskHistory: TaskContext[] = []
  private readonly maxHistorySize = 10

  constructor(private readonly logger: Logg) {}

  /**
   * Create a new task.
   * If strictlySecondary is true, it will always be created as specific type (e.g. for forced background tasks).
   * Otherwise, if no primary task exists, new task becomes primary.
   */
  public createTask(goal: string): TaskContext {
    const task: TaskContext = {
      id: this.generateTaskId(),
      goal,
      status: 'idle',
      startTime: Date.now(),
      cancellationToken: createCancellationToken(),
    }

    if (!this.primaryTask) {
      this.primaryTask = task
      this.logger.withFields({ taskId: task.id, goal, type: 'primary' }).log('TaskManager: Created new primary task')
    }
    else {
      this.secondaryTasks.set(task.id, task)
      this.logger.withFields({ taskId: task.id, goal, type: 'secondary' }).log('TaskManager: Created new secondary task')
    }

    return task
  }

  /**
   * Update the status of a specific task
   */
  public updateTaskStatus(taskId: string, status: TaskStatus, currentStep?: string): void {
    const task = this.getTaskById(taskId)
    if (!task) {
      this.logger.warn(`TaskManager: Task ${taskId} not found for update`)
      return
    }

    task.status = status
    if (currentStep) {
      task.currentStep = currentStep
    }

    this.logger.withFields({
      taskId: task.id,
      status,
      currentStep,
    }).log('TaskManager: Updated task status')
  }

  /**
   * Set the plan for a specific task
   */
  public setTaskPlan(taskId: string, plan: Plan): void {
    const task = this.getTaskById(taskId)
    if (!task) {
      this.logger.warn(`TaskManager: Task ${taskId} not found to set plan`)
      return
    }

    task.plan = plan
    this.logger.withFields({ taskId: task.id }).log('TaskManager: Set task plan')
  }

  /**
   * Cancel a specific task. If no taskId provided, cancels primary task.
   */
  public cancelTask(taskId: string, reason?: string): void {
    const task = this.getTaskById(taskId)
    if (!task) {
      this.logger.warn(`TaskManager: Task ${taskId} not found to cancel`)
      return
    }

    this.logger.withFields({
      taskId: task.id,
      reason,
    }).log('TaskManager: Cancelling task')

    task.status = 'cancelling'
    task.cancellationToken.cancel()

    // We don't remove it yet, we wait for completeTask to be called
    this.addToHistory(task)

    // Cleanup reference immediately to allow new primary tasks if this was primary?
    // No, we should wait for the orchestrator to call completeTask/cleanup.
  }

  /**
   * Cancel currently active primary task
   */
  public cancelPrimaryTask(reason?: string): void {
    if (this.primaryTask) {
      this.cancelTask(this.primaryTask.id, reason)
    }
  }

  /**
   * Complete a task and remove it from active list
   */
  public completeTask(taskId: string): void {
    const task = this.getTaskById(taskId)
    if (!task)
      return

    this.logger.withFields({ taskId: task.id }).log('TaskManager: Task completed')
    this.addToHistory(task)

    if (this.primaryTask?.id === taskId) {
      this.primaryTask = null
    }
    else {
      this.secondaryTasks.delete(taskId)
    }
  }

  /**
   * Get the current primary task
   */
  public getPrimaryTask(): TaskContext | null {
    return this.primaryTask
  }

  /**
   * Check if there is a primary task running
   */
  public hasPrimaryTask(): boolean {
    return this.primaryTask !== null
  }

  /**
   * Get a task by ID
   */
  public getTaskById(taskId: string): TaskContext | null {
    if (this.primaryTask?.id === taskId)
      return this.primaryTask
    return this.secondaryTasks.get(taskId) || null
  }

  /**
   * Get formatted task context for LLM.
   * Includes Primary Task and summary of Secondary Tasks.
   */
  public getTaskContextForLLM(): string {
    const lines: string[] = []

    // Primary Task
    if (this.primaryTask) {
      const { goal, status, startTime, currentStep, plan } = this.primaryTask
      const elapsedSeconds = Math.floor((Date.now() - startTime) / 1000)
      lines.push(`[PRIMARY TASK] (${status.toUpperCase()}): "${goal}"`)
      lines.push(`- Duration: ${elapsedSeconds}s`)
      if (currentStep)
        lines.push(`- Step: ${currentStep}`)
      if (plan)
        lines.push(`- Plan: ${plan.steps.length} steps (${plan.status})`)
    }
    else {
      lines.push('No primary task active.')
    }

    // Secondary Tasks
    if (this.secondaryTasks.size > 0) {
      lines.push('\n[SECONDARY TASKS]')
      for (const task of this.secondaryTasks.values()) {
        lines.push(`- [${task.status.toUpperCase()}] "${task.goal}"`)
      }
    }

    return lines.join('\n')
  }

  /**
   * Get all active tasks for debugging
   */
  public getAllActiveTasks(): TaskContext[] {
    const tasks: TaskContext[] = []
    if (this.primaryTask)
      tasks.push(this.primaryTask)
    tasks.push(...this.secondaryTasks.values())
    return tasks
  }

  /**
   * Get task history
   */
  public getTaskHistory(): TaskContext[] {
    return [...this.taskHistory]
  }

  private generateTaskId(): string {
    return `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  private addToHistory(task: TaskContext): void {
    // Only add if not already in history (simple check)
    if (this.taskHistory.some(t => t.id === task.id))
      return

    this.taskHistory.push(task)
    if (this.taskHistory.length > this.maxHistorySize) {
      this.taskHistory.shift()
    }
  }
}
