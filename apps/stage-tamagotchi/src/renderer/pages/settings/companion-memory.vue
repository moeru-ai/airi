<script setup lang="ts">
// PERSONAL: The memory and reminders page of the personal companion. See personal/README.md.
// The texts are in English only, because this page exists only in this fork.
import { Button, Input } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed, shallowRef } from 'vue'

import { usePersonalCompanionStore } from '../../personal/companion-store'
import { featuresConfig } from '../../personal/features'
import { formatLocalMinute } from '../../personal/memory-keeper'

const companionStore = usePersonalCompanionStore()
const { facts, pendingReminders } = storeToRefs(companionStore)

const newFact = shallowRef('')
const newReminderTitle = shallowRef('')
const newReminderDue = shallowRef('')

const newReminderDueAt = computed(() => {
  // `datetime-local` values have no offset, so `Date.parse` reads them as local time.
  const dueAt = Date.parse(newReminderDue.value)
  return Number.isNaN(dueAt) ? undefined : dueAt
})

function addFact() {
  companionStore.addFact(newFact.value)
  newFact.value = ''
}

function addReminder() {
  if (newReminderDueAt.value === undefined)
    return
  companionStore.addReminder(newReminderTitle.value, newReminderDueAt.value)
  newReminderTitle.value = ''
  newReminderDue.value = ''
}

function formatDue(dueAt: number) {
  return formatLocalMinute(new Date(dueAt)).replace('T', ' ')
}
</script>

<template>
  <div flex="~ col gap-8" pb-12>
    <section v-if="featuresConfig.memory.enabled" flex="~ col gap-4">
      <div flex="~ col gap-1">
        <h2 text-lg font-semibold>
          Memories
        </h2>
        <p text="sm neutral-500 dark:neutral-400">
          Facts that the companion remembers about you. It adds facts from your chats. You can also add or delete facts here.
        </p>
      </div>

      <form flex="~ row gap-2" @submit.prevent="addFact">
        <Input v-model="newFact" placeholder="For example: My cat is called Miso." flex-1 />
        <Button type="submit" variant="primary" label="Add" :disabled="!newFact.trim()" />
      </form>

      <p v-if="facts.length === 0" text="sm neutral-500 dark:neutral-400">
        No memories yet.
      </p>
      <ul v-else flex="~ col gap-2">
        <li
          v-for="fact in facts"
          :key="fact.id"
          flex="~ row gap-2 items-center"
          rounded-lg bg="neutral-100 dark:neutral-800" px-3 py-2
        >
          <span flex-1 text-sm>{{ fact.text }}</span>
          <Button size="sm" label="Delete" :aria-label="`Delete the memory: ${fact.text}`" @click="companionStore.removeFact(fact.id)" />
        </li>
      </ul>
    </section>

    <section v-if="featuresConfig.reminders.enabled" flex="~ col gap-4">
      <div flex="~ col gap-1">
        <h2 text-lg font-semibold>
          Reminders
        </h2>
        <p text="sm neutral-500 dark:neutral-400">
          The companion says each reminder when it is due. Ask in the chat, for example "Remind me at 6 pm to call Mom", or add one here.
        </p>
      </div>

      <form flex="~ row wrap gap-2" @submit.prevent="addReminder">
        <Input v-model="newReminderTitle" placeholder="What to remind you about" flex-1 />
        <Input v-model="newReminderDue" type="datetime-local" aria-label="When" />
        <Button type="submit" variant="primary" label="Add" :disabled="!newReminderTitle.trim() || newReminderDueAt === undefined" />
      </form>

      <p v-if="pendingReminders.length === 0" text="sm neutral-500 dark:neutral-400">
        No reminders.
      </p>
      <ul v-else flex="~ col gap-2">
        <li
          v-for="reminder in pendingReminders"
          :key="reminder.id"
          flex="~ row gap-2 items-center"
          rounded-lg bg="neutral-100 dark:neutral-800" px-3 py-2
        >
          <span text="sm neutral-500 dark:neutral-400" font-mono>{{ formatDue(reminder.dueAt) }}</span>
          <span flex-1 text-sm>{{ reminder.title }}</span>
          <Button size="sm" label="Delete" :aria-label="`Delete the reminder: ${reminder.title}`" @click="companionStore.removeReminder(reminder.id)" />
        </li>
      </ul>
    </section>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  title: Companion memory
  subtitleKey: settings.title
  description: Facts that the companion remembers about you, and your reminders
  icon: i-solar:notebook-bookmark-bold-duotone
  settingsEntry: true
  order: 99
  stageTransition:
    name: slide
    pageSpecificAvailable: true
</route>
