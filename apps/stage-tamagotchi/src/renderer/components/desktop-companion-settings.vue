<script setup lang="ts">
import type { DesktopPreferences } from '../../shared/desktop-companion'

import { Section } from '@proj-airi/stage-ui/components'
import { Button, FieldCheckbox } from '@proj-airi/ui'
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'

import { useDesktopCompanionStore } from '../stores/desktop-companion'

const { t } = useI18n()
const desktop = useDesktopCompanionStore()
const pending = ref(false)
const prefix = 'tamagotchi.settings.desktop-companion'

async function run(action: () => Promise<void>) {
  if (pending.value)
    return
  pending.value = true
  try {
    await action()
  }
  catch {
    toast.error(t(`${prefix}.save-error`))
  }
  finally {
    pending.value = false
  }
}

function update(key: keyof DesktopPreferences, value: boolean) {
  void run(() => desktop.setPreferences({ [key]: value }))
}

function sendTest() {
  return desktop.publish({
    id: crypto.randomUUID(),
    source: 'test',
    body: t(`${prefix}.test-body`),
    priority: 'high',
    coalesceKey: 'settings-test',
  })
}
</script>

<template>
  <Section :title="t(`${prefix}.title`)" icon="i-solar:bell-line-duotone" inner-class="gap-4">
    <p v-if="desktop.loadFailed || desktop.snapshot.persistence === 'error'" role="alert" :class="['text-sm text-red-600 dark:text-red-400']">
      {{ t(`${prefix}.load-error`) }}
    </p>
    <Button v-if="desktop.loadFailed" :label="t(`${prefix}.retry`)" :loading="pending" @click="run(desktop.refresh)" />
    <fieldset :disabled="pending || !desktop.ready" :class="['grid gap-4 border-0 p-0']">
      <FieldCheckbox
        :model-value="desktop.preferences.pulsingBorder"
        :label="t(`${prefix}.border.title`)"
        :description="t(`${prefix}.border.description`)"
        @update:model-value="update('pulsingBorder', $event)"
      />
      <FieldCheckbox
        :model-value="desktop.preferences.nativeNotifications"
        :label="t(`${prefix}.notifications.title`)"
        :description="t(`${prefix}.notifications.description`)"
        @update:model-value="update('nativeNotifications', $event)"
      />
      <FieldCheckbox
        :model-value="desktop.preferences.notificationPreviews"
        :label="t(`${prefix}.previews.title`)"
        :description="t(`${prefix}.previews.description`)"
        @update:model-value="update('notificationPreviews', $event)"
      />
      <FieldCheckbox
        :model-value="desktop.preferences.doNotDisturb"
        :label="t(`${prefix}.dnd.title`)"
        :description="t(`${prefix}.dnd.description`)"
        @update:model-value="update('doNotDisturb', $event)"
      />
      <FieldCheckbox
        :model-value="desktop.preferences.priorityReactions"
        :label="t(`${prefix}.reactions.title`)"
        :description="t(`${prefix}.reactions.description`)"
        @update:model-value="update('priorityReactions', $event)"
      />
      <p :class="['text-sm text-neutral-600 dark:text-neutral-400']">
        {{ t(`${prefix}.unread`, { count: desktop.snapshot.unreadCount }) }}
      </p>
      <div :class="['flex flex-wrap gap-2']">
        <Button :label="t(`${prefix}.test`)" :loading="pending" @click="run(sendTest)" />
        <Button :label="t(`${prefix}.mark-all-read`)" :disabled="desktop.snapshot.unreadCount === 0" @click="run(() => desktop.markRead())" />
        <Button :label="t(`${prefix}.clear`)" :disabled="desktop.snapshot.notifications.length === 0" @click="run(desktop.clear)" />
      </div>
    </fieldset>
    <p v-if="desktop.ready && !desktop.snapshot.nativeSupported" :class="['text-sm text-neutral-600 dark:text-neutral-400']">
      {{ t(`${prefix}.native-unavailable`) }}
    </p>
    <div v-if="desktop.capabilities" :class="['grid gap-2 text-sm text-neutral-600 dark:text-neutral-400']">
      <p>{{ t(`${prefix}.backend`, { backend: desktop.capabilities.backend, detection: desktop.capabilities.detection }) }}</p>
      <p>{{ t(`${prefix}.cursor.${desktop.capabilities.cursorSource}`) }}</p>
      <p v-if="desktop.capabilities.backend === 'wayland'">
        {{ t(`${prefix}.wayland-limit`) }}
      </p>
      <ul :class="['m-0 grid gap-1 pl-4']">
        <li v-for="display in desktop.capabilities.displays" :key="display.id">
          {{ t(`${prefix}.display`, { id: display.id, x: display.bounds.x, y: display.bounds.y, width: display.bounds.width, height: display.bounds.height, scale: display.scaleFactor }) }}
        </li>
      </ul>
    </div>
  </Section>
</template>
