<script setup lang="ts">
import { WidgetStage } from '@proj-airi/stage-ui/components'

import Header from '../components/Layouts/Header.vue'
import InteractiveArea from '../components/Layouts/InteractiveArea.vue'
import MobileHeader from '../components/Layouts/MobileHeader.vue'
import MobileInteractiveArea from '../components/Layouts/MobileInteractiveArea.vue'
</script>

<template>
  <div>
    <div relative flex="~ col" z-2 h-100vh w-100vw of-hidden>
      <!-- header -->
      <div>
        <Header class="flex <md:hidden" p2 />
        <MobileHeader class="hidden <md:block" />
      </div>
      <!-- page -->
      <div relative flex="~ 1 row gap-y-0 gap-x-2 <md:col">
        <WidgetStage flex-1 min-w="1/2" />
        <InteractiveArea class="flex <md:hidden" flex-1 max-w="30%" />
        <MobileInteractiveArea class="hidden <md:block" mx2 mb2 />
      </div>
    </div>
  </div>
</template>

<route lang="yaml">
meta:
  layout: default
</route>
