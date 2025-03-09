<script setup lang="ts">
defineProps<{
  title: string
  description: string
  icon?: string
  iconTemplate?: boolean
  to: string
}>()
</script>

<template>
  <RouterLink
    flex="~ row"
    bg="neutral-50 dark:neutral-800"
    border="neutral-100 dark:neutral-700 hover:primary-500 dark:hover:primary-400 solid 2"
    drop-shadow="none hover:[0px_4px_4px_rgba(220,220,220,0.4)] active:[0px_0px_0px_rgba(220,220,220,0.25)] dark:hover:none"
    class="menu-icon-item"
    transition="all ease-in-out duration-200"
    relative w-full items-center overflow-hidden rounded-lg p-5 text-left
    :to="to"
  >
    <div z-1 flex-1>
      <div text-lg font-bold class="menu-icon-item-title" transition="all ease-in-out duration-200">
        {{ title }}
      </div>
      <div
        text="sm neutral-500 dark:neutral-400"
        class="menu-icon-item-description"
        transition="all ease-in-out duration-200"
      >
        <span>{{ description }}</span>
      </div>
    </div>
    <template v-if="typeof icon === 'string'">
      <div
        class="menu-icon-item-icon"
        transition="all ease-in-out duration-500"
        absolute right-0 size-24
        translate-y-4
        text="neutral-400/50 dark:neutral-600/50"
        :class="[icon]"
      />
    </template>
    <template v-if="iconTemplate">
      <slot name="icon" />
    </template>
  </RouterLink>
</template>

<style scoped>
.menu-icon-item::after {
  --at-apply: 'bg-dotted-[neutral-200] hover:bg-dotted-[primary-300/50] dark:bg-dotted-[neutral-700/80] dark:hover:bg-dotted-[primary-200/20]';
  position: absolute;
  inset: 0;
  z-index: -1;
  width: 100%;
  height: 100%;
  background-size: 10px 10px;
  content: '';
  mask-image: linear-gradient(165deg, white 30%, transparent 50%);
}

.menu-icon-item:hover .menu-icon-item-title {
  --at-apply: text-primary-500;
}

.menu-icon-item:hover .menu-icon-item-description {
  --at-apply: text-primary-500;
  opacity: 0.8;
}

.menu-icon-item:hover .menu-icon-item-icon {
  --at-apply: text-primary-500;
  scale: 1.2;
  opacity: 0.2;
}

.dark .menu-icon-item:hover .menu-icon-item-title {
  --at-apply: text-primary-400;
}

.dark .menu-icon-item:hover .menu-icon-item-description {
  --at-apply: text-primary-400;
  opacity: 0.8;
}

.dark .menu-icon-item:hover .menu-icon-item-icon {
  --at-apply: text-primary-400;
  opacity: 0.2;
}
</style>
