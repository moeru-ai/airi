---
title: Animation/Transition
description: Animate Reka UI with CSS keyframes, native Vue Transition or JavaScript animation library of your choice.
---

# Animation

<Description>
Animate Reka UI with CSS keyframes, native Vue Transition or JavaScript animation library of your choice.
</Description>

Adding animation to Reka UI should feel similar to any other component, but there are some caveats noted here in regards to exiting animations with JS animation libraries.

## Animating with CSS animation

The simplest way to animate Primitives is with CSS.

You can use CSS animation to animate both mount and unmount phases. The latter is possible because the Reka UI will suspend unmount while your animation plays out.

```css
@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes fadeOut {
  from {
    opacity: 1;
  }
  to {
    opacity: 0;
  }
}

.DialogOverlay[data-state="open"],
.DialogContent[data-state="open"] {
  animation: fadeIn 300ms ease-out;
}

.DialogOverlay[data-state="closed"],
.DialogContent[data-state="closed"] {
  animation: fadeOut 300ms ease-in;
}
```

## Animating with Vue Transition

Other than using CSS animation, you might prefer to use the native Vue `<Transition>`. Great news! It should be as easy as wrapping component (that has `forceMount` prop), and you are done!

```vue line=11,13,14,19,25-33
<script setup lang="ts">
import { DialogClose, DialogContent, DialogDescription, DialogOverlay, DialogPortal, DialogRoot, DialogTitle, DialogTrigger, } from 'reka-ui'
</script>

<template>
  <DialogRoot v-model:open="open">
    <DialogTrigger>
      Edit profile
    </DialogTrigger>
    <DialogPortal>
      <Transition name="fade">
        <DialogOverlay />
      </Transition>
      <Transition name="fade">
        <DialogContent>
          <h1>Hello from inside the Dialog!</h1>
          <DialogClose>Close</DialogClose>
        </DialogContent>
      </Transition>
    </DialogPortal>
  </DialogRoot>
</template>

<style>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
```

## ⭐️ Animating with Motion Vue

[Motion Vue](https://motion.dev/docs/vue) is the recommended animation library for Reka UI. This lightweight, powerful library integrates seamlessly with components and offers extensive flexibility for creating smooth, performant animations.

```vue line=3,12,14-18,22-26,29,31
<script setup lang="ts">
import { AnimatePresence, Motion } from 'motion-v'
import { DialogClose, DialogContent, DialogDescription, DialogOverlay, DialogPortal, DialogRoot, DialogTitle, DialogTrigger, } from 'reka-ui'
</script>

<template>
  <DialogRoot>
    <DialogTrigger>
      Edit profile
    </DialogTrigger>
    <DialogPortal>
      <AnimatePresence multiple>
        <DialogOverlay as-child>
          <Motion
            :initial="{ opacity: 0, scale: 0 }"
            :animate="{ opacity: 1, scale: 1 }"
            :exit="{ opacity: 0, scale: 0.6 }"
          />
        </DialogOverlay>

        <DialogContent as-child>
          <Motion
            :initial="{ opacity: 0, top: '0%' }"
            :animate="{ opacity: 1, top: '50%' }"
            :exit="{ opacity: 0, top: '30%' }"
          >
            <h1>Hello from inside the Dialog!</h1>
            <DialogClose>Close</DialogClose>
          </Motion>
        </DialogContent>
      </AnimatePresence>
    </DialogPortal>
  </DialogRoot>
</template>
```

<Callout type="tip">

Check out this [Stackblitz Demo](https://stackblitz.com/edit/x7y44ngl?file=src%2FApp.vue) 🤩

</Callout>

## Delegating unmounting for JavaScript Animation

When many stateful Primitives are hidden from view, they are actually removed from the DOM. JavaScript animation libraries need control of the unmounting phase, so we provide the `forceMount` prop on many components to allow consumers to delegate the mounting and unmounting of children based on the animation state determined by those libraries.

For example, if you want to use [@vueuse/motion](https://motion.vueuse.org/) to animate a `Dialog`, you would do so by conditionally rendering the dialog `Overlay` and `Content` parts based on the animation state from one of its composable like `useSpring`:

```vue line=32,34,41
<script setup lang="ts">
import { useSpring } from '@vueuse/motion'
import { DialogClose, DialogContent, DialogDescription, DialogOverlay, DialogPortal, DialogRoot, DialogTitle, DialogTrigger, } from 'reka-ui'
import { reactive, ref, watch } from 'vue'

const stages = {
  initial: { opacity: 0, scale: 0, top: 0, },
  enter: { opacity: 1, scale: 1, top: 50, },
  leave: { opacity: 0, scale: 0.6, top: 30, },
}

const styles = reactive(stages.initial)
const { set } = useSpring(styles, {
  damping: 8,
  stiffness: 200,
})

const open = ref(false)
watch(open, () => {
  if (open.value)
    set(stages.enter)
  else
    set(stages.leave)
})
</script>

<template>
  <DialogRoot v-model:open="open">
    <DialogTrigger>
      Edit profile
    </DialogTrigger>
    <DialogPortal v-if="styles.opacity !== 0">
      <DialogOverlay
        force-mount
        :style="{
          opacity: styles.opacity,
          transform: `scale(${styles.scale})`,
        }"
      />
      <DialogContent
        force-mount
        :style="{
          opacity: styles.opacity,
          top: `${styles.top}%`,
        }"
      >
        <h1>Hello from inside the Dialog!</h1>
        <DialogClose>Close</DialogClose>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
```

<Callout type="tip">

Check out this [Stackblitz Demo](https://stackblitz.com/edit/macsaz-xuwbw3im?file=src%2FApp.vue)

</Callout>
