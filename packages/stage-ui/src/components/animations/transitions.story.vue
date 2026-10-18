<script setup lang="ts">
import { AnimatedContent, Button, TransitionBidirectional, TransitionHorizontal, TransitionVertical } from '@proj-airi/ui'
import { CollapsibleContent, CollapsibleRoot, CollapsibleTrigger } from 'reka-ui'
import { shallowRef } from 'vue'

const visible = shallowRef(true)
</script>

<template>
  <Story title="Transitions" group="misc">
    <Variant id="directions" title="Vertical, horizontal, and bidirectional">
      <div :class="['flex flex-col items-start gap-4 p-4']">
        <Button label="Toggle content" :aria-pressed="visible" @click="visible = !visible" />
        <TransitionVertical>
          <div v-if="visible" :class="['rounded-lg bg-primary-100 p-4 dark:bg-primary-900']">
            Vertical content
          </div>
        </TransitionVertical>
        <TransitionHorizontal>
          <div v-if="visible" :class="['overflow-hidden whitespace-nowrap rounded-lg bg-primary-100 p-4 dark:bg-primary-900']">
            Horizontal content
          </div>
        </TransitionHorizontal>
        <TransitionBidirectional from-class="opacity-0" active-class="transition-opacity duration-300" to-class="opacity-100">
          <div v-if="visible" :class="['rounded-lg bg-primary-100 p-4 dark:bg-primary-900']">
            Bidirectional content
          </div>
        </TransitionBidirectional>
      </div>
    </Variant>
    <Variant id="animated" title="Animated content lifecycle">
      <CollapsibleRoot v-model:open="visible" :class="['flex flex-col items-start gap-4 p-4']">
        <CollapsibleTrigger as-child>
          <Button label="Toggle lifecycle state" />
        </CollapsibleTrigger>
        <CollapsibleContent as-child>
          <AnimatedContent :class="['rounded-lg bg-primary-100 dark:bg-primary-900']">
            <p :class="['p-4']">
              The lifecycle owner keeps this content mounted during its exit animation.
            </p>
          </AnimatedContent>
        </CollapsibleContent>
      </CollapsibleRoot>
    </Variant>
  </Story>
</template>
