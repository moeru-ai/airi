<script setup lang="ts">
import {
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuList,
  NavigationMenuRoot,
  NavigationMenuTrigger,
  NavigationMenuViewport,
} from 'reka-ui'
import { onMounted, ref } from 'vue'

// Define category group interface
interface CategoryGroup {
  id: string
  name: string
  options: { id: string, name: string }[]
}

// Define emits for parent communication
const emit = defineEmits<{
  (e: 'update:filter', filters: Record<string, string>): void
}>()

// Default category group
const defaultGroups: CategoryGroup[] = [
  {
    id: 'price',
    name: 'Pricing',
    options: [
      { id: 'free', name: 'Free' },
      { id: 'paid', name: 'Paid' },
    ],
  },
]

// Reactive variable to store all groups (default + API loaded)
const groups = ref<CategoryGroup[]>([...defaultGroups])

// Currently selected filter options
const selected = ref<Record<string, string>>({})

// Simulated API request to fetch additional groups
async function fetchGroupsFromAPI() {
  // Example API response:
  // [{ id:"type", name:"Model Type", options:[{id:"ai", name:"AI Model"}, {id:"cv", name:"Computer Vision"}] }]
  const resp = await fetch('/api/model/categories')
  const data: CategoryGroup[] = await resp.json()
  groups.value = [...defaultGroups, ...data]
}

// Handle option selection
function selectOption(groupId: string, optionId: string) {
  selected.value[groupId] = optionId
  // Emit event so the parent component can listen via @update:filter
  emitFilter({ ...selected.value })
}

// Helper to emit filter updates
function emitFilter(payload: Record<string, string>) {
  emit('update:filter', payload)
}

// Fetch categories when component mounts
onMounted(() => {
  fetchGroupsFromAPI()
})
</script>

<template>
  <NavigationMenuRoot class="relative z-[1] w-full">
    <NavigationMenuList class="flex list-none gap-2 border rounded-lg bg-white p-1 shadow-sm">
      <!-- Loop through each category group -->
      <NavigationMenuItem
        v-for="group in groups"
        :key="group.id"
        class="min-w-[120px]"
      >
        <!-- Group trigger (button) -->
        <NavigationMenuTrigger
          class="text-grass11 group flex select-none items-center justify-between rounded-[4px] px-3 py-2 text-sm font-medium leading-none outline-none hover:bg-blue-100 focus:shadow-[0_0_0_2px] focus:shadow-blue-200"
        >
          {{ group.name }}
        </NavigationMenuTrigger>

        <!-- Dropdown content with options -->
        <NavigationMenuContent class="absolute top-full z-50 mt-1 rounded-md bg-white p-2 shadow">
          <ul class="flex flex-col gap-2">
            <li
              v-for="opt in group.options"
              :key="opt.id"
              class="cursor-pointer rounded px-2 py-1 hover:bg-blue-100"
              :class="selected[group.id] === opt.id ? 'bg-blue-500 text-white' : ''"
              @click="selectOption(group.id, opt.id)"
            >
              {{ opt.name }}
            </li>
          </ul>
        </NavigationMenuContent>
      </NavigationMenuItem>
    </NavigationMenuList>

    <NavigationMenuViewport />
  </NavigationMenuRoot>
</template>
