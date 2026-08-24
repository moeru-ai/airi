---
category: Utilities
---

# useOffsetPagination

Reactive offset pagination.

## Usage

```ts
import { useOffsetPagination } from '@vueuse/core'

function fetchData({ currentPage, currentPageSize }: { currentPage: number, currentPageSize: number }) {
  fetch(currentPage, currentPageSize).then((responseData) => {
    data.value = responseData
  })
}

const {
  currentPage,
  currentPageSize,
  pageCount,
  isFirstPage,
  isLastPage,
  prev,
  next,
} = useOffsetPagination({
  total: database.value.length,
  page: 1,
  pageSize: 10,
  onPageChange: fetchData,
  onPageSizeChange: fetchData,
})
```

## Component Usage

```vue
<template>
  <UseOffsetPagination
    v-slot="{
      currentPage,
      currentPageSize,
      next,
      prev,
      pageCount,
      isFirstPage,
      isLastPage,
    }"
    :total="database.length"
    @page-change="fetchData"
    @page-size-change="fetchData"
  >
    <div class="gap-x-4 gap-y-2 grid-cols-2 inline-grid items-center">
      <div opacity="50">
        total:
      </div>
      <div>{{ database.length }}</div>
      <div opacity="50">
        pageCount:
      </div>
      <div>{{ pageCount }}</div>
      <div opacity="50">
        currentPageSize:
      </div>
      <div>{{ currentPageSize }}</div>
      <div opacity="50">
        currentPage:
      </div>
      <div>{{ currentPage }}</div>
      <div opacity="50">
        isFirstPage:
      </div>
      <div>{{ isFirstPage }}</div>
      <div opacity="50">
        isLastPage:
      </div>
      <div>{{ isLastPage }}</div>
    </div>
    <div>
      <button :disabled="isFirstPage" @click="prev">
        prev
      </button>
      <button :disabled="isLastPage" @click="next">
        next
      </button>
    </div>
  </UseOffsetPagination>
</template>
```

Component event supported props event callback and event listener.

event listener:

```vue
<template>
  <UseOffsetPagination
    v-slot="{
      currentPage,
      currentPageSize,
      next,
      prev,
      pageCount,
      isFirstPage,
      isLastPage,
    }"
    :total="database.length"
    @page-change="fetchData"
    @page-size-change="fetchData"
    @page-count-change="onPageCountChange"
  >
    <!-- your code -->
  </UseOffsetPagination>
</template>
```

or props event callback:

```vue
<template>
  <UseOffsetPagination
    v-slot="{
      currentPage,
      currentPageSize,
      next,
      prev,
      pageCount,
      isFirstPage,
      isLastPage,
    }"
    :total="database.length"
    :on-page-change="fetchData"
    :on-page-size-change="fetchData"
    :on-page-count-change="onPageCountChange"
  >
    <!-- your code -->
  </UseOffsetPagination>
</template>
```

## Type Declarations

```ts
export interface UseOffsetPaginationOptions {
  /**
   * Total number of items.
   */
  total?: MaybeRefOrGetter<number>
  /**
   * The number of items to display per page.
   * @default 10
   */
  pageSize?: MaybeRefOrGetter<number>
  /**
   * The current page number.
   * @default 1
   */
  page?: MaybeRef<number>
  /**
   * Callback when the `page` change.
   */
  onPageChange?: (
    returnValue: UnwrapNestedRefs<UseOffsetPaginationReturn>,
  ) => unknown
  /**
   * Callback when the `pageSize` change.
   */
  onPageSizeChange?: (
    returnValue: UnwrapNestedRefs<UseOffsetPaginationReturn>,
  ) => unknown
  /**
   * Callback when the `pageCount` change.
   */
  onPageCountChange?: (
    returnValue: UnwrapNestedRefs<UseOffsetPaginationReturn>,
  ) => unknown
}
export interface UseOffsetPaginationReturn {
  currentPage: Ref<number>
  currentPageSize: Ref<number>
  pageCount: ComputedRef<number>
  isFirstPage: ComputedRef<boolean>
  isLastPage: ComputedRef<boolean>
  prev: () => void
  next: () => void
}
export type UseOffsetPaginationInfinityPageReturn = Omit<
  UseOffsetPaginationReturn,
  "isLastPage"
>
export declare function useOffsetPagination(
  options: Omit<UseOffsetPaginationOptions, "total">,
): UseOffsetPaginationInfinityPageReturn
export declare function useOffsetPagination(
  options: UseOffsetPaginationOptions,
): UseOffsetPaginationReturn
```
