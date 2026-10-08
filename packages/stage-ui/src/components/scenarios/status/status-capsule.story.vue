<script setup lang="ts">
import StatusCapsule from './status-capsule.vue'
</script>

<template>
  <Story title="Status Capsule" group="misc">
    <Variant id="details" title="Expandable status details">
      <div :class="['flex flex-col items-start gap-8 p-4 pt-32']">
        <StatusCapsule label="Connected" details="The server channel is ready.">
          <template #indicator>
            <span :class="['i-solar:check-circle-linear size-4']" />
          </template>
        </StatusCapsule>
        <StatusCapsule label="Connection failed" details="Retry the connection in settings." tone="error" placement="below">
          <template #indicator>
            <span :class="['i-solar:danger-circle-linear size-4']" />
          </template>
        </StatusCapsule>
      </div>
    </Variant>
    <Variant id="revealed" title="Visible label">
      <StatusCapsule label="Listening" reveal :class="['m-4']">
        <template #indicator>
          <span :class="['i-solar:microphone-linear size-4']" />
        </template>
      </StatusCapsule>
    </Variant>
  </Story>
</template>
