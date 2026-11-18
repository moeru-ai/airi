import type { MaybeRefOrGetter } from 'vue'

import type { DevicePermission, DevicePermissionStatus } from '../../stores/device-permissions'

import { errorMessageFrom } from '@moeru/std'
import { useDocumentVisibility, useWindowFocus } from '@vueuse/core'
import { ref, toValue, watch } from 'vue'

/**
 * Reads the status of each permission and requests one.
 *
 * The user grants a denied permission in the system settings, outside the app. So the statuses are read again when the
 * window gets focus on desktop, and when the page becomes visible on Pocket. The statuses are view state of the caller,
 * so each caller reads them itself.
 */
export function useDevicePermissionStatus(permissions: MaybeRefOrGetter<readonly DevicePermission[]>) {
  /** The last read status of each permission, by ID. A missing entry is not read yet. */
  const statuses = ref<Record<string, DevicePermissionStatus>>({})
  /** The permission whose request runs. */
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
    return Promise.all(toValue(permissions).map(check))
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

  watch(() => toValue(permissions), () => void checkAll(), { immediate: true })
  const focused = useWindowFocus()
  const visibility = useDocumentVisibility()
  watch([focused, visibility], ([isFocused, state]) => {
    if (isFocused || state === 'visible')
      void checkAll()
  })

  return { statuses, busyId, check, request }
}
