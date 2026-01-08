<script setup lang="ts">
import { useElementBounding } from '@vueuse/core'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import * as d3 from 'd3'

interface Props {
  data: number[]
  height?: number
  bins?: number
  range?: [number, number] | null
}

const props = withDefaults(defineProps<Props>(), {
  height: 120,
  bins: 40,
  range: null,
})

const emit = defineEmits<{
  (event: 'update:range', value: [number, number] | null): void
}>()

const containerRef = ref<HTMLDivElement | null>(null)
const { width } = useElementBounding(containerRef, { windowResize: true })

let svg: d3.Selection<SVGSVGElement, unknown, null, undefined> | null = null
let brushBehavior: d3.BrushBehavior<unknown> | null = null
let xScale: d3.ScaleLinear<number, number> | null = null

const sanitizedData = computed(() => props.data.filter(value => Number.isFinite(value)))

function clearChart() {
  if (!containerRef.value)
    return
  containerRef.value.innerHTML = ''
  svg = null
  brushBehavior = null
  xScale = null
}

function drawChart() {
  if (!containerRef.value)
    return

  const containerWidth = Math.max(0, Math.floor(width.value || 0))
  if (containerWidth === 0)
    return

  clearChart()

  const margin = {
    top: 12,
    right: 14,
    bottom: 20,
    left: 28,
  }
  const chartWidth = Math.max(0, containerWidth - margin.left - margin.right)
  const chartHeight = Math.max(0, props.height - margin.top - margin.bottom)

  const data = sanitizedData.value
  if (data.length === 0) {
    svg = d3.select(containerRef.value)
      .append('svg')
      .attr('width', containerWidth)
      .attr('height', props.height)
    return
  }

  const [minValueRaw, maxValueRaw] = d3.extent(data) as [number, number]
  const minValue = Number.isFinite(minValueRaw) ? minValueRaw : 0
  const maxValue = Number.isFinite(maxValueRaw) ? maxValueRaw : minValue + 1
  const paddedMax = maxValue === minValue ? maxValue + 1 : maxValue

  xScale = d3.scaleLinear()
    .domain([minValue, paddedMax])
    .range([0, chartWidth])

  const bins = d3.bin()
    .domain(xScale.domain() as [number, number])
    .thresholds(props.bins)(data)

  const yScale = d3.scaleLinear()
    .domain([0, d3.max(bins, bin => bin.length) || 1])
    .range([chartHeight, 0])

  svg = d3.select(containerRef.value)
    .append('svg')
    .attr('width', containerWidth)
    .attr('height', props.height)
    .style('overflow', 'visible')

  const chart = svg
    .append('g')
    .attr('transform', `translate(${margin.left},${margin.top})`)

  chart
    .append('g')
    .attr('class', 'timeline-range-bars')
    .selectAll('rect')
    .data(bins)
    .join('rect')
    .attr('x', bin => xScale?.(bin.x0 ?? minValue) ?? 0)
    .attr('y', bin => yScale(bin.length))
    .attr('width', bin => Math.max(1, (xScale?.(bin.x1 ?? minValue) ?? 0) - (xScale?.(bin.x0 ?? minValue) ?? 0) - 1))
    .attr('height', bin => chartHeight - yScale(bin.length))
    .attr('rx', 2)
    .attr('fill', 'rgba(66,72,83,0.85)')

  const axis = d3.axisBottom(xScale).ticks(4).tickFormat((d) => {
    if (typeof d === 'number')
      return new Date(d).toLocaleTimeString()
    return `${d}`
  })

  chart
    .append('g')
    .attr('class', 'timeline-range-axis')
    .attr('transform', `translate(0,${chartHeight})`)
    .call(axis)
    .call(g => g.select('.domain').attr('opacity', 0.2))
    .call(g => g.selectAll('text').attr('fill', '#9CA1AE'))
    .call(g => g.selectAll('line').attr('opacity', 0.08))

  brushBehavior = d3.brushX()
    .extent([[0, 0], [chartWidth, chartHeight]])
    .on('brush end', (event) => {
      if (!xScale)
        return
      if (!event.selection) {
        emit('update:range', null)
        return
      }
      const [start, end] = event.selection as [number, number]
      emit('update:range', [xScale.invert(start), xScale.invert(end)])
    })

  const brushGroup = chart
    .append('g')
    .attr('class', 'timeline-range-brush')
    .call(brushBehavior)

  brushGroup.selectAll('.selection')
    .attr('fill', 'rgba(114,163,183,0.25)')
    .attr('stroke', 'rgba(114,163,183,0.6)')

  if (props.range) {
    const [start, end] = props.range
    brushGroup.call(brushBehavior.move, [xScale(start), xScale(end)])
  }
}

onMounted(() => {
  drawChart()
})

watch([width, sanitizedData, () => props.bins, () => props.height], () => {
  drawChart()
})

watch(() => props.range, (nextRange) => {
  if (!svg || !brushBehavior || !xScale)
    return
  const brushGroup = svg.select<SVGGElement>('g.timeline-range-brush')
  if (!nextRange) {
    brushGroup.call(brushBehavior.move, null)
    return
  }
  brushGroup.call(brushBehavior.move, [xScale(nextRange[0]), xScale(nextRange[1])])
})

onBeforeUnmount(() => {
  clearChart()
})
</script>

<template>
  <div ref="containerRef" :class="['w-full']" />
</template>
