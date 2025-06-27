---
title: Presence
description: Manages mounting and unmounting of element with transition support.
---

# Presence

<Description>
Manages mounting and unmounting of element with transition support.
</Description>

<Callout type="info" title="Question">

How is this component different from [Vue Transition](https://vuejs.org/guide/built-ins/transition.html#transition)?

A: The biggest difference is it accepts css animation, and control the visibility of element.

</Callout>

Presence component provides enhanced control over element mounting/unmounting. It ensures animations and transitions complete before removing elements from the DOM, making it perfect for animated UI components.

## API Reference

<PropsTable :data="[
  {
    'name': 'present',
    'description': '<p>Conditional to mount or unmount the child element. Similar to <code>v-if</code></p>\n',
    'type': 'boolean',
    'required': true,
  },
  {
    'name': 'forceMount',
    'description': '<p>Force the element to render all the time.\n\nUseful for programmatically render grandchild component with the exposed <code>present</code></p>\n',
    'type': 'boolean',
    'required': false,
    'default': false
  },
]" />

<EmitsTable :data="[
  {
    'name': 'enter',
    'description': '<p>Event handler called when the enter animation has started</p>\n',
    'type': 'CustomEvent'
  },
  {
    'name': 'after-enter',
    'description': '<p>Event handler called when the enter animation has finished</p>\n',
    'type': 'CustomEvent'
  },
  {
    'name': 'leave',
    'description': '<p>Event handler called when the leave animation has started</p>\n',
    'type': 'CustomEvent'
  },
  {
    'name': 'after-leave',
    'description': '<p>Event handler called when the leave animation has finished</p>\n',
    'type': 'CustomEvent'
  },
]" />

<Callout type="tip">

Read our [Animation Guide](/docs/guides/animation) to learn more about implementing animations with Presence component.

</Callout>

## Example

```vue line=2,4,5
<template>
  <Presence :present="isVisible">
    <div
      :data-open="isVisible ? 'open' : 'close'"
      class="data-[state=open]:animate-fadeIn data-[state=closed]:animate-fadeOut"
    >
      <slot />
    </div>
  </Presence>
</template>
```

### Force Mount

When you need to ensure content is always rendered regardless of the present state:

```vue
<template>
  <Presence v-slot="{ present }" :present="isVisible" :force-mount="true">
    <div>
      This content will always be rendered

      <div v-if="present">
        This content is hidden
      </div>
    </div>
  </Presence>
</template>
```
