<script setup lang="ts">
import type { Ref } from 'vue'

import { useDraggable, useElementBounding } from '@vueuse/core'
import { computed, ref, useTemplateRef } from 'vue'

interface Detection {
  x: number
  y: number
  width: number
  height: number
  confidence: number
  className: string
}

const box1 = ref<Detection>(
  { x: 100, y: 100, width: 200, height: 200, confidence: 0.9, className: 'box_1' },
)

const box2 = ref<Detection>(
  { x: 150, y: 150, width: 200, height: 200, confidence: 0.8, className: 'box_2' },
)

const colors = ref([
  { labelBg: 'bg-red', border: 'border-red outline-red', bg: 'bg-red/30' },
  { labelBg: 'bg-green', border: 'border-green outline-green', bg: 'bg-green/30' },
])

const containerEl = useTemplateRef('containerEl')
const containerBounding = useElementBounding(containerEl, { immediate: true, windowResize: true })

const object1El = useTemplateRef('object1El')
const object1HandleEl = useTemplateRef('object1HandleEl')
const object2El = useTemplateRef('object2El')
const object2HandleEl = useTemplateRef('object2HandleEl')
function setupDraggableBox(
  box: Ref<Detection>,
  el: Ref<HTMLElement | null>,
  handle: Ref<HTMLElement | null>,
) {
  useDraggable(el, {
    handle,
    initialValue: { x: box.value.x, y: box.value.y },
    onMove(p) {
      box.value.x = Math.round(p.x - containerBounding.left.value)
      box.value.y = Math.round(p.y - containerBounding.top.value)
    },
  })
}

setupDraggableBox(box1, object1El, object1HandleEl)
setupDraggableBox(box2, object2El, object2HandleEl)

const isOverlapping = computed(() => {
  const b1 = box1.value
  const b2 = box2.value
  return (
    b1.x < b2.x + b2.width
    && b1.x + b1.width > b2.x
    && b1.y < b2.y + b2.height
    && b1.y + b1.height > b2.y
  )
})

const intersect = computed(() => {
  // no overlap
  if (!isOverlapping.value) {
    return {
      xLeft: 0,
      yTop: 0,
      xRight: 0,
      yBottom: 0,
      width: 0,
      height: 0,
      area: 0,
    }
  }

  const xLeft = Math.max(box1.value.x, box2.value.x)
  const yTop = Math.max(box1.value.y, box2.value.y)
  const xRight = Math.min(box1.value.x + box1.value.width, box2.value.x + box2.value.width)
  const yBottom = Math.min(box1.value.y + box1.value.height, box2.value.y + box2.value.height)

  const width = xRight - xLeft
  const height = yBottom - yTop

  return {
    xLeft,
    yTop,
    xRight,
    yBottom,
    width,
    height,
    area: width * height,
  }
})

const union = computed(() => {
  return {
    area: box1.value.width * box1.value.height + box2.value.width * box2.value.height - intersect.value.area,
  }
})

const iou = computed(() => {
  if (union.value.area === 0)
    return 0
  return intersect.value.area / union.value.area
})
</script>

<template>
  <div font-mono class="nms-iou">
    <div ref="containerEl" class="relative size-160" border="gray-100 solid 2px" rounded="t-md" user-select-none>
      <div
        ref="object1El" :style="{
          left: `${box1.x}px`,
          top: `${box1.y}px`,
          width: `${box1.width}px`,
          height: `${box1.height}px`,
        }" class="absolute" border="solid 2px"
        :class="[colors[0]?.border, colors[0]?.bg]" rounded="b-md" z="1 hover:2"
      >
        <div
          ref="object1HandleEl" class="label" text="no-wrap white" h="6" w="full" outline="solid 2px"
          :class="[colors[0]?.border, colors[0]?.labelBg]" flex="~ items-center justify-between" rounded="t-md"
          top="-6" absolute cursor-grab select-none px-2
        >
          <div>
            {{ box1.className }}
          </div>
          <div>
            {{ box1.confidence.toFixed(2) }}
          </div>
        </div>
        <div absolute :class="[box1.y > box2.y ? 'top-1 left-1' : '-top-12 -left-20']">
          box1x1: {{ box1.x }} <br> box1y1: {{ box1.y }}
        </div>
        <div absolute :class="[box1.y < box2.y ? 'bottom-1 right-1' : '-bottom-14 -right-14']">
          box1x2: {{ (box1.x + box1.width) }} <br> box1y2: {{ (box1.y + box1.height) }}
        </div>
      </div>
      <div
        ref="object2El" :style="{
          left: `${box2.x}px`,
          top: `${box2.y}px`,
          width: `${box2.width}px`,
          height: `${box2.height}px`,
        }" class="absolute" border="solid 2px"
        :class="[colors[1]?.border, colors[1]?.bg]" rounded="b-md" z="1 hover:2"
      >
        <div
          ref="object2HandleEl" class="label" text="no-wrap white" h="6" w="full" outline="solid 2px"
          :class="[colors[1]?.border, colors[1]?.labelBg]" flex="~ items-center justify-between" rounded="t-md"
          top="-6" absolute cursor-grab select-none px-2
        >
          <div>
            {{ box2.className }}
          </div>
          <div>
            {{ box2.confidence.toFixed(2) }}
          </div>
        </div>
        <div absolute :class="[box2.y > box1.y ? 'top-1 left-1' : '-top-12 -left-20']">
          box2x1: {{ box2.x }} <br> box2y1: {{ box2.y }}
        </div>
        <div absolute :class="[box2.y < box1.y ? 'bottom-1 right-1' : '-bottom-14 -right-14']">
          box2x2: {{ (box2.x + box2.width) }} <br> box2y2: {{ (box2.y + box2.height) }}
        </div>
      </div>
      <div
        v-if="isOverlapping"
        class="intersect-area" :style="{
          height: `${intersect.height}px`,
          width: `${intersect.width}px`,
          top: `${intersect.yTop}px`,
          left: `${intersect.xLeft}px`,
        }" border="solid 2px blue" absolute rounded-md z="3"
      />
    </div>
    <div rounded-b-md bg-gray-100 p-4>
      <div v-if="isOverlapping" class="intersect-info">
        <div>Intersect:</div>
        <div>x1: {{ `Math.max(${box1.x}, ${box2.x}) = ${intersect.xLeft}` }}</div>
        <div>y1: {{ `Math.max(${box1.y}, ${box2.y}) = ${intersect.yTop}` }}</div>
        <div>x2: {{ `Math.min(${box1.x + box1.width}, ${box2.x + box2.width}) = ${intersect.xRight}` }}</div>
        <div>y2: {{ `Math.min(${box1.y + box1.height}, ${box2.y + box2.height}) = ${intersect.yBottom}` }}</div>
        <div>width: {{ `${intersect.xRight} - ${intersect.xLeft} = ${intersect.width}` }}</div>
        <div>height: {{ `${intersect.yBottom} - ${intersect.yTop} = ${intersect.height}` }}</div>
        <div>intersect area: {{ `${intersect.width} * ${intersect.height} = ${intersect.area}` }}</div>
      </div>
      <div v-if="isOverlapping" class="union-info">
        <div>Union:</div>
        <div>box1 area: {{ `${box1.width} * ${box1.height} = ${box1.width * box1.height}` }}</div>
        <div>box2 area: {{ `${box2.width} * ${box2.height} = ${box2.width * box2.height}` }}</div>
        <div>union area: {{ `${box1.width * box1.height} + ${box2.width * box2.height} - ${intersect.area} = ${box1.width * box1.height + box2.width * box2.height - intersect.area}` }}</div>
        <div>IoU: {{ `${intersect.area} / ${box1.width * box1.height + box2.width * box2.height - intersect.area} = ${iou.toFixed(2)}` }}</div>
      </div>
      <div v-else>
        <div>Not overlapping!</div>
      </div>
    </div>
  </div>
</template>
