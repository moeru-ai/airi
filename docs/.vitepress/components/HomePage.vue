<script setup lang="ts">
// import { VPTeamMembers } from 'vitepress/theme-without-fonts'
import { teamMembers } from '../contributors'
import Contributors from './Contributors.vue'
</script>

<template>
  <div class="content px-6 lg:px-[64px] sm:px-[48px]">
    <div class="container mx-auto max-w-[1152px] w-full">
      <main class="w-full">
        <div class="vp-doc mt-10 flex flex-col items-center">
          <h2
            id="meet-the-team"
            class="pb-2 pt-10 font-medium opacity-50"
          >
            Meet The Team
          </h2>
          <div class="w-full">
            <VPTeamMembers
              size="small"
              :members="teamMembers"
            />
          </div>
          <h2
            id="the-team"
            class="pb-2 pt-5 font-medium op50"
          >
            Contributors
          </h2>
          <p class="max-w-200 text-center text-lg leading-7">
            <Contributors />
            <br>
            <a
              href="https://chat.unovue.com"
              rel="noopener noreferrer"
            >Join the community</a> and get involved!
          </p>
        </div>
      </main>
    </div>
  </div>
</template>
