---

title: Composition
description: Use the `asChild` prop to compose Reka's functionality onto alternative element types or your own Vue components.
---

# Composition

<Description>

Use the `asChild` prop to compose Reka's functionality onto alternative
element types or your own Vue components.

</Description>

All Reka UI parts that render a DOM element accept an `asChild` prop. When `asChild` is set to `true`, Reka UI will not render a default DOM element, instead passing the props and behavior required to make it functional to the first child of the slots.

## Changing the element type

In the majority of cases you shouldn’t need to modify the element type as Reka has been designed to provide the most appropriate defaults. However, there are cases where it is helpful to do so.

A good example is with `TooltipTrigger`. By default this part is rendered as a `button`, though you may want to add a tooltip to a link (`a` tag) as well. Let's see how you can achieve this using `asChild`:

```vue{7}
<script setup lang="ts">
import { TooltipRoot, TooltipTrigger, TooltipPortal } from "reka-ui";
</script>

<template>
  <TooltipRoot>
    <TooltipTrigger asChild>
      <a href="https://reka-ui.com/">Reka UI</a>
    </TooltipTrigger>
    <TooltipPortal>…</TooltipPortal>
  </TooltipRoot>
</template>
```

<Callout type="warning">

If you do decide to change the underlying element type, it is your responsibility to ensure it remains accessible and functional. In the case of `TooltipTrigger` for example, it must be a focusable element that can respond to pointer and keyboard events. If you were to switch it to a `div`, it would no longer be accessible.

</Callout>

In reality, you will rarely modify the underlying DOM element like we've seen above. Instead it's more common to use your own Vue components. This is especially true for most `Trigger` parts, as you usually want to compose the functionality with the custom buttons and links in your design system.

## Composing with your own Vue components

This works exactly the same as above, you pass `asChild` to the part and then wrap your own component with it.
However, there are a few gotchas to be aware of.

## Composing multiple primitives

`asChild` can be used as deeply as you need to. This means it is a great way to compose multiple primitive's behavior together.
Here is an example of how you can compose `TooltipTrigger` and `DialogTrigger` together with your own button:

```vue{9,10}
<script setup lang="ts">
import { TooltipRoot, TooltipTrigger, TooltipPortal, DialogRoot, DialogTrigger, DialogPortal } from "reka-ui";
import MyButton from from "@/components/MyButton.vue"
</script>

<template>
  <DialogRoot>
    <TooltipRoot>
      <TooltipTrigger asChild>
        <DialogTrigger asChild>
          <MyButton>Open dialog</MyButton>
        </DialogTrigger>
      </TooltipTrigger>
      <TooltipPortal>…</TooltipPortal>
    </TooltipRoot>

    <DialogPortal>...</DialogPortal>
  </DialogRoot>
</template>
```
