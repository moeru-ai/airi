<script setup lang="ts">
import { Icon } from '@iconify/vue'

import Chip from './Chip.vue'
</script>

<template>
  <section>
    <div class="grid justify-items-center gap-8 p-5 px-3 md:gap-10 md:px-8 sm:px-4">
      <div class="grid mt-2 max-w-4xl w-full justify-items-center gap-[inherit] md:mt-20 sm:mt-10">
        <div class="flex flex-col items-center gap-4">
          <Chip href="/docs/overview/releases">
            <div class="origin-bottom-left transition group-focus:scale-150 group-hover:scale-150">
              🎉
            </div>
            <span class="ml-1 transition-[margin] group-focus:ml-3 group-hover:ml-3">v2 Release!</span>
          </Chip>
          <h1 class="text-foreground text-center text-pretty text-4xl font-bold md:text-7xl sm:text-6xl sm:font-extrabold">
            Craft accessible web apps with Vue
          </h1>
        </div>

        <p class="text-muted-foreground max-w-[720px] text-center text-pretty text-lg lg:text-2xl md:text-xl lg:leading-9 md:leading-8">
          An open-source library with
          <a
            class="text-foreground relative inline-block font-semibold before:[translate:0_-0.1em] before:absolute before:inset-x-0 before:top-full before:h-[2px] before:bg-primary hover:before:h-[4px]"
            href="/docs/guides/styling"
          >
            unstyled</a>,
          <a
            class="text-foreground relative inline-block font-semibold before:[translate:0_-0.1em] before:absolute before:inset-x-0 before:top-full before:h-[2px] before:bg-primary hover:before:h-[4px]"
            href="/docs/guides/composition"
          >
            primitive
          </a>
          components,
          accompanied by a variety of
          <a
            class="text-foreground relative inline-block font-semibold before:[translate:0_-0.1em] before:absolute before:inset-x-0 before:top-full before:h-[2px] before:bg-primary hover:before:h-[4px]"
            href="/examples"
          >
            examples & use cases
          </a>
          ready to be integrated into your projects.
        </p>
      </div>
      <div class="mb-12 max-w-[calc(100%-2rem)] flex flex-wrap items-center justify-center gap-4 md:mb-20">
        <a
          class="text-primary-foreground flex items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-primary px-5 py-2.5 font-semibold hover:bg-primary/90"
          href="/docs/overview/getting-started"
        >
          Get started
        </a>
        <a
          class="group hover:text-foreground hover:bg-card border-muted bg-muted/50 text-foreground/70 flex items-center justify-center gap-2 whitespace-nowrap border rounded-lg px-5 py-2.5 font-semibold"
          href="/docs/components/checkbox"
        >
          Explore components
          <Icon icon="lucide:arrow-right" />
        </a>
      </div>
    </div>
  </section>

  <section class="text-foreground relative mt-12 h-[40rem] w-full overflow-hidden hidden md:block">
    <div class="border-muted bg-card/20 absolute left-1/2 h-[32rem] w-[90rem] overflow-hidden border rounded-3xl -translate-x-1/2">
      <img
        class="absolute max-w-none w-[90rem] flex-none"
        decoding="async"
        src="/new-bg.png"
        alt="backdrop"
        draggable="false"
      >
    </div>
  </section>

  <section class="mx-auto max-w-screen-xl px-4 py-12 md:px-6 md:py-24">
    <div class="grid grid-cols-1 gap-y-4 lg:grid-cols-5 lg:h-96 md:h-[36rem] lg:gap-4">
      <div class="border-muted bg-card relative col-span-3 flex flex-col overflow-hidden border rounded-2xl p-6 md:p-10">
        <div class="text-lg font-bold">
          Accessibility out of the box.
        </div>
        <div class="text-muted-foreground">
          Supports assistive technology
        </div>

        <img
          class="absolute max-w-none w-[1000px] -bottom-40 -left-40 -scale-y-100"
          src="/bg.png"
          alt="Background"
        >
        <div class="relative mt-6 h-full w-full flex flex-col items-start justify-center gap-2 md:mt-0 md:items-center">
          <div class="text-muted-foreground border-muted bg-background/50 md:-translate-y-0 flex items-center gap-2 border rounded-full px-5 py-2.5 text-sm font-medium backdrop-blur-lg md:absolute md:-translate-x-40">
            <Icon
              icon="lucide:shield-check"
              class="text-xl text-primary"
            />
            <span>WAI-ARIA compliant</span>
          </div>

          <div class="text-muted-foreground border-muted bg-background/50 flex items-center gap-2 border rounded-full px-5 py-2.5 text-sm font-medium backdrop-blur-lg md:absolute md:translate-x-28 md:-translate-y-16">
            <Icon
              icon="lucide:keyboard"
              class="text-xl text-primary"
            />
            <span>Keyboard navigation</span>
          </div>

          <div class="text-muted-foreground border-muted bg-background/50 flex items-center gap-2 border rounded-full px-5 py-2.5 text-sm font-medium backdrop-blur-lg md:absolute md:translate-y-16 md:-translate-x-20">
            <Icon
              icon="lucide:text-cursor-input"
              class="text-xl text-primary"
            />
            <span>Focus management</span>
          </div>

          <div class="text-muted-foreground border-muted bg-background/50 flex items-center gap-2 border rounded-full px-5 py-2.5 text-sm font-medium backdrop-blur-lg md:absolute md:translate-x-44 md:translate-y-4">
            <Icon
              icon="lucide:view"
              class="text-xl text-primary"
            />
            <span>Screen reader support</span>
          </div>
        </div>

        <div />
      </div>
      <div class="border-muted bg-card relative col-span-2 h-[22rem] overflow-hidden border rounded-2xl p-6 md:h-auto md:p-10">
        <div>
          <div class="text-lg font-bold">
            Save time. Ship faster.
          </div>
          <div class="text-muted-foreground">
            40+ Primitive Components
          </div>
        </div>

        <div class="absolute left-1/2 top-12 w-full flex flex-col items-center justify-center -translate-x-1/2">
          <img
            draggable="false"
            class="w-[300px]"
            src="/lightning.svg"
            alt="Lightning"
          >
          <!-- <span class="font-bold text-4xl text-center -mt-20">40+ Components</span> -->
        </div>
      </div>
    </div>

    <div class="grid grid-cols-1 mt-4 gap-y-4 lg:grid-cols-5 lg:h-96 md:h-[36rem] lg:gap-4">
      <div class="border-muted bg-card relative col-span-2 h-96 overflow-hidden border rounded-2xl p-6 md:h-auto md:p-10">
        <div class="absolute w-full flex flex-col">
          <div class="z-10 text-lg font-bold">
            Developer Experience First.
          </div>
          <div class="text-muted-foreground">
            Unstyled, Customizable, Familiar API
          </div>

          <div class="relative mt-8 h-full w-full">
            <div class="language-vue prose">
              <pre
                class="shiki github-dark vp-code"
              ><code><span class="line"><span style="color:#E1E4E8;">&lt;</span><span style="color:#85E89D;">script</span><span style="color:#B392F0;"> setup</span><span style="color:#B392F0;"> lang</span><span style="color:#E1E4E8;">=</span><span style="color:#9ECBFF;">"ts"</span><span style="color:#E1E4E8;">&gt;</span></span>
<span class="line"><span style="color:#F97583;">import</span><span style="color:#E1E4E8;"> { AccordionRoot, AccordionItem } </span><span style="color:#F97583;">from</span><span style="color:#9ECBFF;"> 'reka-ui'</span></span>
<span class="line"><span style="color:#E1E4E8;">&lt;/</span><span style="color:#85E89D;">script</span><span style="color:#E1E4E8;">&gt;</span></span>
<span class="line" />
<span class="line"><span style="color:#E1E4E8;">&lt;</span><span style="color:#85E89D;">template</span><span style="color:#E1E4E8;">&gt;</span></span>
<span class="line"><span style="color:#E1E4E8;">  &lt;</span><span style="color:#85E89D;">AccordionRoot</span> v-model</span><span style="color:#E1E4E8;">=</span><span style="color:#9ECBFF;">"controlRef"</span><span style="color:#B392F0;"><span style="color:#E1E4E8;">&gt;</span></span>
<span class="line"><span style="color:hsl(var(--muted-foreground));">    &lt;!-- css --&gt;</span></span>
<span class="line highlighted"><span style="color:#E1E4E8;">    &lt;</span><span style="color:#85E89D;">AccordionItem</span><span style="color:#B392F0;"> class</span><span style="color:#E1E4E8;">=</span><span style="color:#9ECBFF;">"AccordionItem"</span><span style="color:#B392F0;"> /&gt;</span></span>
<span class="line"><span style="color:hsl(var(--muted-foreground));">    &lt;!-- tailwind --&gt;</span></span>
<span class="line highlighted"><span style="color:#E1E4E8;">    &lt;</span><span style="color:#85E89D;">AccordionItem</span><span style="color:#B392F0;"> class</span><span style="color:#E1E4E8;">=</span><span style="color:#9ECBFF;">"bg-white px-4 py-2"</span><span style="color:#B392F0;"> /&gt;</span></span>
<span class="line"><span style="color:#E1E4E8;">  &lt;/</span><span style="color:#85E89D;">AccordionRoot</span><span style="color:#E1E4E8;">&gt;</span></span>
<span class="line"><span style="color:#E1E4E8;">&lt;/</span><span style="color:#85E89D;">template</span><span style="color:#E1E4E8;">&gt;</span></span>
            </code></pre>
            </div>
          </div>
        </div>
      </div>

      <div class="border-muted bg-card relative col-span-3 h-80 overflow-hidden border rounded-2xl p-6 md:h-auto md:p-10">
        <div class="absolute z-10">
          <div class="text-xl text-white font-bold">
            Ready for an international audience
          </div>
          <div class="text-muted-foreground">
            RTL support, Locale, Numbering System
          </div>
        </div>
        <img
          draggable="false"
          class="absolute bottom-0 hue-rotate-[220deg] saturate-[1.2] md:left-48 md:top-0 md:scale-[1.75] dark:mix-blend-lighten"
          src="/globe.jpg"
          alt="Globe image"
        >
      </div>
    </div>
  </section>

  <section class="from-background via-card/80 to-background mx-auto w-full bg-gradient-to-b px-6 py-24 sm:py-56">
    <div class="mx-auto max-w-screen-xl">
      <div class="flex flex-col items-center justify-center gap-12 sm:flex-row sm:gap-20">
        <div class="flex flex-col items-center justify-center">
          <div class="text-4xl font-bold md:text-6xl">
            600k+
          </div>
          <div class="mt-1">
            Monthly downloads
          </div>
        </div>

        <div class="flex flex-col items-center justify-center">
          <div class="text-4xl font-bold md:text-6xl">
            130+
          </div>
          <div class="mt-1">
            Contributors
          </div>
        </div>

        <div class="flex flex-col items-center justify-center">
          <div class="text-4xl font-bold md:text-6xl">
            4k+
          </div>
          <div class="mt-1">
            GitHub Stars
          </div>
        </div>
      </div>
    </div>
  </section>

  <section class="mx-auto max-w-screen-xl px-4 py-12 md:px-6 md:py-32">
    <h2 class="text-foreground text-center text-pretty text-3xl font-bold md:text-6xl sm:text-5xl sm:font-extrabold">
      Ready to get started?
    </h2>

    <div class="grid mt-6 gap-4 md:grid-cols-3 md:mt-12 md:gap-8">
      <a
        href="/docs/overview/installation"
        class="group border-muted bg-card hover:bg-muted/50 relative border rounded-2xl p-4 md:p-6"
      >
        <div class="w-max border-primary/30 rounded-lg bg-primary/10 p-2 text-xl text-primary transition group-focus:scale-105 group-hover:scale-105">
          <Icon icon="lucide:wrench" />
        </div>
        <div class="mt-4 flex items-center gap-2">
          <h3 class="text-lg font-semibold">
            Install and Setup
          </h3>
          <Icon icon="lucide:arrow-right" />
        </div>
        <p class="text-muted-foreground group-hover:text-foreground group-focus:text-foreground mt-2">
          Learn how to install and setup Reka UI in your project, and build and style a component.
        </p>
      </a>

      <a
        href="/docs/components/checkbox"
        class="group border-muted bg-card hover:bg-muted/50 relative border rounded-2xl p-4 md:p-6"
      >
        <div class="w-max border-primary/30 rounded-lg bg-primary/10 p-2 text-xl text-primary transition group-focus:scale-105 group-hover:scale-105">
          <Icon icon="lucide:box" />
        </div>
        <div class="mt-4 flex items-center gap-2">
          <h3 class="text-lg font-semibold">
            Browse components
          </h3>
          <Icon icon="lucide:arrow-right" />
        </div>
        <p class="text-muted-foreground group-hover:text-foreground group-focus:text-foreground mt-2">
          Check out all the components and utilities offered by Reka UI.
        </p>
      </a>

      <a
        href="/examples/checkbox-group"
        class="group border-muted bg-card hover:bg-muted/50 relative border rounded-2xl p-4 md:p-6"
      >
        <div class="w-max border-primary/30 rounded-lg bg-primary/10 p-2 text-xl text-primary transition group-focus:scale-105 group-hover:scale-105">
          <Icon icon="lucide:swatch-book" />
        </div>
        <div class="mt-4 flex items-center gap-2">
          <h3 class="text-lg font-semibold">
            Explore Examples
          </h3>
          <Icon icon="lucide:arrow-right" />
        </div>
        <p class="text-muted-foreground group-hover:text-foreground group-focus:text-foreground mt-2">
          Check out some fully styled examples showing what is possible with Reka UI.
        </p>
      </a>
    </div>
  </section>

  <footer class="mx-auto max-w-screen-xl flex justify-end px-4 py-8 md:px-6">
    <div class="text-muted-foreground text-sm">
      2025 @ unovue
    </div>
  </footer>
</template>
