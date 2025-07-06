---

title: Styling
description: Reka UI are unstyled—and compatible with any styling solution—giving you complete control over styling.
---

# Styling

<Description>
Reka UI are unstyled and compatible with any styling solution giving you complete control over styling.
</Description>

## Styling overview

### Functional styles

You are in control of all aspects of styling, including functional styles. For example, by default, a [Dialog Overlay](../components/dialog) won't cover the entire viewport. You're responsible for adding those styles, plus any presentation styles.

### Classes

All components accept `class` attributes, just like normal component. This class will be passed through to the DOM element. You can use it in CSS as expected.

#### Teleported elements

Some elements, such as modals or popovers, are teleported to the `body`. When using scoped style to apply CSS, you will need to use [deep selectors](https://vuejs.org/api/sfc-css-features.html#deep-selectors) to target them.

### Data attributes

When components are stateful, their state will be exposed in a `data-state` attribute. For example, when an [Accordion Item](../components/accordion) is opened, it includes a `data-state="open"` attribute.

## Styling with CSS

### Styling a part

You can style a component part by targeting the `class` that you provide.

```vue{7}
<script setup lang="ts">
import { AccordionRoot, AccordionItem, ... } from "reka-ui";
</script>

<template>
  <AccordionRoot>
    <AccordionItem class="AccordionItem" value="item-1" />
    <!-- ... -->
  </AccordionRoot>
</template>

<style>
.AccordionItem {
  /* ... */
}
</style>
```

### Styling a state

You can style a component state by targeting its `data-state` attribute.

```css
.AccordionItem {
  border-bottom: 1px solid gainsboro;
}

.AccordionItem[data-state="open"] {
  border-bottom-width: 2px;
}
```

### Scoped style

You can style a component using scoped style. Be wary of teleported elements, as they require the use of [deep selectors](https://vuejs.org/api/sfc-css-features.html#deep-selectors) to be targeted.

```vue{9}
<script setup lang="ts">
import { DropdownMenuRoot, DropdownMenuItem, ... } from "reka-ui";
</script>

<template>
  <DropdownMenuRoot>
    <!-- ... -->
    <DropdownMenuPortal>
      <DropdownMenuContent class="DropdownMenuContent">
        <DropdownMenuItem class="DropdownMenuItem">An item</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenuPortal>
  </DropdownMenuRoot>
</template>

<style scoped>
:deep(.DropdownMenuContent) {
  /* ... */
}

.DropdownMenuItem {
  /* ... */
}
</style>
```

## Styling with Tailwind CSS

The examples below are using [Tailwind CSS](https://tailwindcss.com/), but you can use any library of your choice.

### Styling a part

You can style a component part by targeting the `class`.

```vue{7}
<script setup lang="ts">
import { AccordionRoot, AccordionItem, ... } from "reka-ui";
</script>

<template>
  <AccordionRoot>
    <AccordionItem class="border border-gray-400 rounded-2xl" value="item-1" />
    <!-- ... -->
  </AccordionRoot>
</template>
```

### Styling a state

With Tailwind CSS's powerful variant selector, you can style a component state by targeting its `data-state` attribute.

```vue{10}
<script setup lang="ts">
import { AccordionRoot, AccordionItem, ... } from "reka-ui";
</script>

<template>
  <AccordionRoot>
    <AccordionItem
      class="
        border border-gray-400 rounded-2xl
        data-[state=open]:border-b-2 data-[state=open]:border-gray-800
      "
      value="item-1"
    />
    <!-- ... -->
  </AccordionRoot>
</template>
```

## Extending a primitive

Extending a primitive is done the same way you extend any Vue component.

```vue[CustomAccordion.vue]
<script setup lang="ts">
import { AccordionItem, type AccordionItemProps } from "reka-ui";

interface Props extends AccordionItemProps {
  foo: string;
}

defineProps<Props>();
</script>

<template>
  <AccordionItem v-bind="$props"><slot /></AccordionItem>
</template>
```

## Summary

Reka UI were designed to encapsulate accessibility concerns and other complex functionalities, while ensuring you retain complete control over styling.

For convenience, stateful components include a `data-state` attribute.
