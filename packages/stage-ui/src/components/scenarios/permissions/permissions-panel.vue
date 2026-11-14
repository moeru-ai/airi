<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'

import PermissionCard from './permission-card.vue'

import { useDevicePermissionStatus } from '../../../composables/permissions/use-device-permission-status'
import { useDevicePermissionsStore } from '../../../stores/device-permissions'

const { t } = useI18n()
const { permissions } = storeToRefs(useDevicePermissionsStore())
const { statuses, busyId, request } = useDevicePermissionStatus(permissions)
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
