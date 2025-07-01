<script lang="ts" setup>
import Progress from './Progress.vue'
</script>

<template>
  <Story
    title="Progress"
    group="misc"
    :layout="{ type: 'grid', width: '100%' }"
  >
    <Variant
      id="basic"
      title="Basic Progress"
    >
      <Progress :progress="50" />
    </Variant>

    <Variant
      id="all-progresses"
      title="All Progresses"
    >
      <div flex flex-col gap-2>
        <Progress :progress="0" />
        <Progress :progress="10" />
        <Progress :progress="20" />
        <Progress :progress="30" />
        <Progress :progress="40" />
        <Progress :progress="50" />
        <Progress :progress="60" />
        <Progress :progress="70" />
        <Progress :progress="80" />
        <Progress :progress="90" />
        <Progress :progress="100" />
      </div>
    </Variant>
  </Story>
</template>
