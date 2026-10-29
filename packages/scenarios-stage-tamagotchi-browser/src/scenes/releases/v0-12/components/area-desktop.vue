<script setup lang="ts">
import Icon from '../../../../components/icon.vue'
import ReleaseArea from '../../components/release-area.vue'
import ReleaseReveal from '../../components/release-reveal.vue'

import { PlatformRoot } from '../../../../components/platforms/macos-26'
import { Application } from '../../../../components/platforms/macos-26/containers/dock'
import { WindowRoot } from '../../../../components/platforms/macos-26/containers/window'
import { useReleaseShot } from '../../components/release-shot'
import { copyTimeline } from '../../components/release-timeline'
import { releaseCopy } from './release-copy'
import { releaseShots } from './release-shots'

const shotSrc = useReleaseShot()
</script>

<template>
  <ReleaseArea name="release-v0-12-desktop" :copy="releaseCopy.desktop" :copy-width="400">
    <div :class="['flex h-full items-center justify-end']">
      <ReleaseReveal :at="copyTimeline.visuals" :class="['w-[845px] overflow-hidden rounded-2xl']">
        <PlatformRoot aspect-ratio="16:10" :ui-scale="0.6" :dock-size="1.5">
          <template #windows>
            <WindowRoot
              :style="{ right: '40px', bottom: '0px' }"
              anchor-to="bottom-right"
              anchor-bounds="workarea"
              :frame="false"
              :has-shadow="false"
              transparent
            >
              <img :src="shotSrc(releaseShots.stageLive2dMagic2)" :class="['block w-[450px] max-w-none']">
            </WindowRoot>
            <WindowRoot
              :style="{ left: '520px', top: '90px' }"
              :frame="false"
              :has-shadow="false"
              transparent
            >
              <img :src="shotSrc(releaseShots.chatFloatingDanmaku)" :class="['block w-[380px] max-w-none']">
            </WindowRoot>
          </template>
          <template #dock>
            <Application running>
              <Icon />
            </Application>
          </template>
        </PlatformRoot>
      </ReleaseReveal>
    </div>
  </ReleaseArea>
</template>
