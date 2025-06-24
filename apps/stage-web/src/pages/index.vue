<script setup lang="ts">

</script>

<template>
  <div mx-10 h-full w-full flex items-center>
    <div class="title-wrapper" w="40%">
      <div class="title-container">
        <div bg="primary-300 dark:primary-700" mb-12 rounded-xl py-4 pl-5 pr-8 text-nowrap text-5xl text-white font-semibold font-quicksand>
          Project AIRI
        </div>
        <div flex flex-col gap-3>
          <div rounded-full px-5 py-4 border="3 solid primary-300 dark:primary-700" bg="primary-300/50 dark:primary-700/50" text-2xl>
            <div>Start</div>
          </div>
          <div rounded-full px-5 py-4 border="3 solid primary-300 dark:primary-700" bg="primary-300/50 dark:primary-700/50" text-2xl>
            <div>Settings</div>
          </div>
          <div rounded-full px-5 py-4 border="3 solid primary-300 dark:primary-700" bg="primary-300/50 dark:primary-700/50" text-2xl>
            <div>About</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style>
.debug .title-wrapper div {
  box-shadow: 0 0 0 2px #ffffff24;
}

.title-wrapper {
  perspective: 800px;
  perspective-origin: 50% 50%;
}

.title-container {
  transform: rotateY(30deg);
}
</style>

<route lang="yaml">
meta:
  layout: home
</route>
