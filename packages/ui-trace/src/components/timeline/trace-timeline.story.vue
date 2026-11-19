<script setup lang="ts">
import TimelineFrame from '../../stories/timeline-frame.vue'
</script>

<template>
  <Story title="Trace timeline" group="devtools" :layout="{ type: 'single', iframe: true }">
    <Variant id="voice-turn" title="Voice turn">
      <div :class="['flex h-screen flex-col gap-3 p-4 text-xs text-neutral-500']">
        <p>One voice turn with a real recording. Drag to pan, wheel to zoom, and click the lanes to move the cursor. Each lane label can collapse its lane and hide its tracks. Hover an item for its card, and click it to select it.</p>
        <TimelineFrame />
      </div>
    </Variant>

    <Variant id="selection" title="Selection">
      <div :class="['flex h-screen flex-col gap-3 p-4 text-xs text-neutral-500']">
        <p>The failed speech recognition is selected. Items that are not related to it fade, and the lane summary rings it thinly.</p>
        <TimelineFrame :selection="{ kind: 'span', key: 'window:main/e1/asr-1' }" />
      </div>
    </Variant>

    <Variant id="cursor" title="Cursor">
      <div :class="['flex h-screen flex-col gap-3 p-4 text-xs text-neutral-500']">
        <p>The scrub cursor at the end of speech. The pipeline and the states read the trace at the cursor.</p>
        <TimelineFrame :cursor="4764" />
      </div>
    </Variant>

    <Variant id="collapsed" title="Collapsed lane">
      <div :class="['flex h-screen flex-col gap-3 p-4 text-xs text-neutral-500']">
        <p>The agent lane is collapsed to its summary. Its handoff from the user stays.</p>
        <TimelineFrame :collapse="['participant:agent']" />
      </div>
    </Variant>

    <Variant id="hidden" title="Hidden tracks">
      <div :class="['flex h-screen flex-col gap-3 p-4 text-xs text-neutral-500']">
        <p>The speech and speech recognition tracks are hidden. Their rows keep a label, so they can show again.</p>
        <TimelineFrame :hide="['participants/user/speech', 'participants/user/asr']" />
      </div>
    </Variant>
  </Story>
</template>
