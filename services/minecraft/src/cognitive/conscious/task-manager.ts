import type { Logg } from '@guiiai/logg'

import type { Plan } from '../../libs/mineflayer/base-agent'
import type { TaskContext, TaskStatus } from './task-state'

import { createCancellationToken } from './task-state'

export class TaskManager {
  private currentTask: TaskContext | null = null
  private taskHistory: TaskContext[] = []
  private readonly maxHistorySize = 10

  constructor(private readonly logger: Logg) {}

  /**
   * Create a new task with cancellation support
   */
  public createTask(goal: string): TaskContext {
    const task: TaskContext = {
      id: this.generateTaskId(),
      goal,
      status: 'idle',
      startTime: Date.now(),
      cancellationToken: createCancellationToken(),
    }

    this.currentTask = task
    this.logger.withFields({ taskId: task.id, goal }).log('TaskManager: Created new task')

    return task
  }

  /**
   * Update the status of the current task
   */
  public updateTaskStatus(status: TaskStatus, currentStep?: string): void {
    if (!this.currentTask) {
      this.logger.warn('TaskManager: No current task to update')
      return
    }

    this.currentTask.status = status
    if (currentStep) {
      this.currentTask.currentStep = currentStep
    }

    this.logger.withFields({
      taskId: this.currentTask.id,
      status,
      currentStep,
    }).log('TaskManager: Updated task status')
  }

  /**
   * Set the plan for the current task
   */
  public setTaskPlan(plan: Plan): void {
    if (!this.currentTask) {
      this.logger.warn('TaskManager: No current task to set plan for')
      return
    }

    this.currentTask.plan = plan
    this.logger.withFields({ taskId: this.currentTask.id }).log('TaskManager: Set task plan')
  }

  /**
   * Cancel the current task
   */
  public cancelCurrentTask(reason?: string): void {
    if (!this.currentTask) {
      this.logger.warn('TaskManager: No current task to cancel')
      return
    }

    this.logger.withFields({
      taskId: this.currentTask.id,
      reason,
    }).log('TaskManager: Cancelling current task')

    this.currentTask.status = 'cancelling'
    this.currentTask.cancellationToken.cancel()

    // Move to history
    this.addToHistory(this.currentTask)
    this.currentTask = null
  }

  /**
   * Complete the current task
   */
  public completeCurrentTask(): void {
    if (!this.currentTask) {
      return
    }

    this.logger.withFields({ taskId: this.currentTask.id }).log('TaskManager: Task completed')

    // Move to history
    this.addToHistory(this.currentTask)
    this.currentTask = null
  }

  /**
   * Get the current task
   */
  public getCurrentTask(): TaskContext | null {
    return this.currentTask
  }

  /**
   * Check if there is a current task
   */
  public hasCurrentTask(): boolean {
    return this.currentTask !== null
  }

  /**
   * Check if can accept a new task
   */
  public canAcceptNewTask(): boolean {
    return this.currentTask === null
  }

  /**
   * Get formatted task context for LLM
   */
  public getTaskContextForLLM(): string {
    if (!this.currentTask) {
      return 'No active task'
    }

    const { goal, status, startTime, currentStep, plan } = this.currentTask
    const elapsedSeconds = Math.floor((Date.now() - startTime) / 1000)

    const lines = [
      `Current Task: [${status.toUpperCase()}] ${goal}`,
      `- Started: ${elapsedSeconds} seconds ago`,
    ]

    if (currentStep) {
      lines.push(`- Current Step: ${currentStep}`)
    }

    if (plan) {
      const totalSteps = plan.steps.length
      lines.push(`- Plan: ${totalSteps} steps total`)
    }

    return lines.join('\n')
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
    this.taskHistory.push(task)

    // Limit history size
    if (this.taskHistory.length > this.maxHistorySize) {
      this.taskHistory.shift()
    }
  }
}
