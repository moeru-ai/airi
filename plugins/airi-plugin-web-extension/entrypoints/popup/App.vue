<script lang="ts" setup>
import HelloWorld from '../../components/HelloWorld.vue'
</script>

<template>
  <div flex justify-center>
    <a href="https://wxt.dev" target="_blank">
      <img src="/wxt.svg" h-24 p-6 transition-filter duration-300 will-change-filter class="hover:drop-shadow-[0_0_2em_#54bc4ae0]" alt="WXT logo">
    </a>
    <a href="https://vuejs.org/" target="_blank">
      <img src="@/assets/vue.svg" h-24 p-6 transition-filter duration-300 will-change-filter class="hover:drop-shadow-[0_0_2em_#42b883aa]" alt="Vue logo">
    </a>
  </div>
  <HelloWorld msg="WXT + Vue" />
</template>
