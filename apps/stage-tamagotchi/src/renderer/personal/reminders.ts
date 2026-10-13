import { useCharacterNotebookStore, useCharacterStore } from '@proj-airi/stage-ui/stores/character'
import { watch } from 'vue'

import { usePersonalCompanionStore } from './companion-store'

/** How often the bridge checks for reminders that the companion did not say. */
const GIVE_UP_CHECK_INTERVAL_MS = 60_000

/**
 * How long the bridge waits for the companion to say a reminder after the
 * first attempt. Until then, the orchestrator tries again every 30 seconds,
 * and each try is one chat model request, for example while Ollama is not
 * running. After this time the reminder is closed.
 */
const GIVE_UP_AFTER_MS = 3 * 60_000

/**
 * Connects the saved reminders to the notebook of the character orchestrator.
 *
 * The orchestrator says a notebook task when it is due, but it does not save
 * tasks and it repeats a task until something marks it done. This bridge:
 *
 * - adds each pending reminder to the notebook as a task, also after a restart;
 * - marks a reminder done when the companion said it (a reaction to `task-<task id>` exists);
 * - closes a reminder when the companion did not say it within {@link GIVE_UP_AFTER_MS};
 * - closes the task of a reminder that was deleted in Settings.
 *
 * Install it only in the synchronization leader. The notebook is not
 * synchronized, so each window that installs the bridge says each reminder.
 *
 * @returns A function that stops the watchers and the timer. Notebook tasks stay until the window closes.
 */
export function installReminderBridge(): () => void {
  const companionStore = usePersonalCompanionStore()
  const notebookStore = useCharacterNotebookStore()
  const characterStore = useCharacterStore()

  /** Runtime state of this window: the notebook task of each pending reminder. */
  const taskIdByReminderId = new Map<string, string>()
  /** Runtime state of this window: when the orchestrator first tried to say each task. */
  const firstNotifiedAtByTaskId = new Map<string, number>()

  function closeReminder(reminderId: string, taskId: string) {
    companionStore.markReminderDone(reminderId)
    notebookStore.markTaskDone(taskId)
    taskIdByReminderId.delete(reminderId)
    firstNotifiedAtByTaskId.delete(taskId)
  }

  function syncTasks() {
    const pendingIds = new Set(companionStore.pendingReminders.map(reminder => reminder.id))

    for (const reminder of companionStore.pendingReminders) {
      if (taskIdByReminderId.has(reminder.id))
        continue
      const task = notebookStore.scheduleTask({
        title: reminder.title,
        dueAt: reminder.dueAt,
        metadata: { personalReminderId: reminder.id },
      })
      taskIdByReminderId.set(reminder.id, task.id)
    }

    for (const [reminderId, taskId] of taskIdByReminderId) {
      if (pendingIds.has(reminderId))
        continue
      // The reminder was deleted or closed in another window. Stop its task here too.
      notebookStore.markTaskDone(taskId)
      taskIdByReminderId.delete(reminderId)
      firstNotifiedAtByTaskId.delete(taskId)
    }
  }

  function closeSaidReminders() {
    for (const [reminderId, taskId] of taskIdByReminderId) {
      // The orchestrator uses `task-<task id>` as the event id of a task reminder.
      if (characterStore.reactions.some(reaction => reaction.sourceEventId === `task-${taskId}`))
        closeReminder(reminderId, taskId)
    }
  }

  function closeStaleReminders() {
    const now = Date.now()
    for (const [reminderId, taskId] of taskIdByReminderId) {
      const task = notebookStore.tasks.find(item => item.id === taskId)
      if (!task?.lastNotifiedAt)
        continue

      const firstNotifiedAt = firstNotifiedAtByTaskId.get(taskId) ?? task.lastNotifiedAt
      firstNotifiedAtByTaskId.set(taskId, firstNotifiedAt)
      if (now - firstNotifiedAt < GIVE_UP_AFTER_MS)
        continue

      console.warn(`[personal] The companion did not say the reminder "${task.title}". The reminder is closed.`)
      closeReminder(reminderId, taskId)
    }
  }

  const stopPendingWatch = watch(() => companionStore.pendingReminders, syncTasks, { immediate: true })
  const stopReactionWatch = watch(() => characterStore.reactions.length, closeSaidReminders)
  const giveUpTimer = setInterval(closeStaleReminders, GIVE_UP_CHECK_INTERVAL_MS)

  return () => {
    stopPendingWatch()
    stopReactionWatch()
    clearInterval(giveUpTimer)
  }
}
