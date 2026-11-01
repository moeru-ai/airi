<script setup lang="ts">
import type { DevicePermission, DevicePermissionStatus } from '../../../stores/device-permissions'

import { errorMessageFrom } from '@moeru/std'
import { useDocumentVisibility, useWindowFocus } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import PermissionCard from './permission-card.vue'

import { useDevicePermissionsStore } from '../../../stores/device-permissions'

const { t } = useI18n()
const { permissions } = storeToRefs(useDevicePermissionsStore())

/** The last checked status of each permission, by ID. It is view state, so each panel checks for itself. */
const statuses = ref<Record<string, DevicePermissionStatus>>({})
const busyId = ref<string>()

async function check(permission: DevicePermission) {
  try {
    // Await before the spread. Checks run in parallel, and a spread taken before the await drops the other results.
    const status = await permission.check()
    statuses.value = { ...statuses.value, [permission.id]: status }
  }
  catch (error) {
    console.error(`[permissions] Failed to check ${permission.id}:`, errorMessageFrom(error))
  }
}

function checkAll() {
  return Promise.all(permissions.value.map(check))
}

async function request(permission: DevicePermission) {
  busyId.value = permission.id
  try {
    await permission.request()
  }
  catch (error) {
    console.error(`[permissions] Failed to request ${permission.id}:`, errorMessageFrom(error))
  }
  finally {
    busyId.value = undefined
  }
  await check(permission)
}

onMounted(checkAll)
// The user grants a denied permission in the system settings, outside the app. Check again when
// the user comes back: the window gets focus on desktop, and the page becomes visible on Pocket.
const focused = useWindowFocus()
const visibility = useDocumentVisibility()
watch([focused, visibility], ([isFocused, state]) => {
  if (isFocused || state === 'visible')
    void checkAll()
})
</script>

<template>
  <div :class="['flex flex-col gap-4']">
    <PermissionCard
      v-for="permission in permissions"
      :key="permission.id"
      :title="t(permission.titleKey)"
      :description="t(permission.descriptionKey)"
      :status="statuses[permission.id]"
      :busy="busyId === permission.id"
      @request="request(permission)"
    />
  </div>
</template>
