<script setup lang="ts">
import { AvatarFallback, AvatarImage, AvatarRoot, TooltipContent, TooltipRoot, TooltipTrigger } from 'reka-ui'

import { } from 'vue'

import { contributors } from '../contributors'

function getInitials(name: string) {
  return name.match(/\b[A-Z]/gi) // Match the first letter of each word, if it’s an alphabet character
    ?.join('') // Join the matched characters to form initials
    ?? name[0] // Default to the first character if no match
}
</script>

<template>
  <div class="not-prose my-8 flex flex-wrap justify-center gap-2">
    <TooltipRoot
      v-for="{ name, avatar } of contributors"
      :key="name"
      :delay-duration="0"
      :disable-hoverable-content="true"
      :data-id="name"
    >
      <TooltipTrigger as-child>
        <AvatarRoot as-child>
          <a
            :href="`https://github.com/${name}`"
            class="m-0 -ml-3"
            rel="noopener noreferrer"
            :aria-label="`${name} on GitHub`"
            target="_blank"
          >
            <div class="bg-card outline-background h-12 w-12 flex items-center justify-center overflow-hidden rounded-full outline-[4px] outline">
              <AvatarImage
                :src="avatar"
                :alt="`${name}'s avatar`"
              />
              <AvatarFallback
                class="text-center text-sm font-semibold uppercase"
                :delay-ms="1000"
              >
                {{ getInitials(name) }}
              </AvatarFallback>
            </div>
          </a>
        </AvatarRoot>
      </TooltipTrigger>

      <TooltipContent
        class="bg-card border-muted border rounded px-2 py-1 text-xs font-semibold"
        side="bottom"
      >
        {{ name }}
      </TooltipContent>
    </TooltipRoot>
  </div>
</template>
