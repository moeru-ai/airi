<script setup lang="ts">
import type { EmotionalMemoryItem } from '../../types/memory/emotional-memory'

import * as d3 from 'd3'
import { onMounted, onUnmounted, ref, watchEffect } from 'vue'

const props = defineProps<{
  memoryData: EmotionalMemoryItem[]
  simulatedTimeOffset: number
  timeRange: number // days to display in the heatmap
}>()

interface HeatmapCell {
  id: string
  day: number
  value: number
  isRetrieval: boolean
  isRandom: boolean
  joyScore: number
  aversionScore: number
}

const heatmapContainer = ref<HTMLDivElement>()
const tooltip = ref<d3.Selection<HTMLDivElement, unknown, null, undefined>>()
let resizeObserver: ResizeObserver | undefined

// Add mode toggle
const viewMode = ref<'patterns' | 'counts'>('patterns')

watchEffect(() => {
  if (heatmapContainer.value && props.memoryData.length > 0) {
    viewMode.value === 'patterns' ? renderHeatmap() : renderCountHeatmap()
  }
})

function renderHeatmap() {
  // Clear existing chart
  d3.select(heatmapContainer.value).selectAll('*').remove()

  // Get container dimensions
  const containerRect = heatmapContainer.value.getBoundingClientRect()
  const containerWidth = containerRect.width
  const containerHeight = 300 // Fixed height for the heatmap

  // Set chart margins
  const margin = { top: 30, right: 20, bottom: 60, left: 120 }
  const width = containerWidth - margin.left - margin.right
  const height = containerHeight - margin.top - margin.bottom

  // Prepare data for heatmap
  const heatmapData: HeatmapCell[] = []

  // Generate heatmap data from memory items
  for (const memory of props.memoryData) {
    // const ageInDays = Math.floor(memory.age_in_seconds / (24 * 60 * 60))
    const retrievalDaysAgo = Math.floor(memory.time_since_retrieval / (24 * 60 * 60))

    // Only consider memories retrieved within the time range
    if (retrievalDaysAgo <= props.timeRange) {
      // For each memory, add a heatmap cell for the retrieval day
      heatmapData.push({
        id: memory.id,
        day: props.timeRange - retrievalDaysAgo,
        value: 1, // Strength of retrieval
        isRetrieval: true,
        isRandom: Math.random() < 0.2, // Simulate random recall events (20% chance)
        joyScore: memory.joy_score,
        aversionScore: memory.aversion_score,
      })

      // Add additional cells for fade trail of past retrievals
      const fadeLength = 5 // Days of fade trail
      for (let i = 1; i <= fadeLength; i++) {
        if (props.timeRange - retrievalDaysAgo - i >= 0) {
          heatmapData.push({
            id: memory.id,
            day: props.timeRange - retrievalDaysAgo - i,
            value: 0.2 * (fadeLength - i + 1) / fadeLength, // Decreasing intensity
            isRetrieval: false,
            isRandom: false,
            joyScore: memory.joy_score * 0.5, // Reduced emotional impact
            aversionScore: memory.aversion_score * 0.5,
          })
        }
      }
    }
  }

  // Create tooltip if it doesn't exist
  if (!tooltip.value) {
    tooltip.value = d3.select(heatmapContainer.value)
      .append('div')
      .attr('class', 'absolute pointer-events-none transition-opacity duration-200 bg-white dark:bg-neutral-800 p-2 rounded shadow-md text-sm z-10')
      .style('opacity', 0)
  }

  // Create SVG
  const svg = d3.select(heatmapContainer.value)
    .append('svg')
    .attr('width', containerWidth)
    .attr('height', containerHeight)
    .append('g')
    .attr('transform', `translate(${margin.left},${margin.top})`)

  // Extract unique memory IDs
  const memoryIds = Array.from(new Set(props.memoryData.map(m => m.id)))

  // Set up scales
  const xScale = d3.scaleLinear()
    .domain([0, props.timeRange])
    .range([0, width])

  const yScale = d3.scaleBand()
    .domain(memoryIds)
    .range([0, height])
    .padding(0.1)

  const colorScale = d3.scaleSequential()
    .domain([0, 1])
    .interpolator(d3.interpolateBlues)

  // Create x-axis (time)
  const xAxis = d3.axisBottom(xScale)
    .ticks(Math.min(props.timeRange, 10))

  svg.append('g')
    .attr('class', 'x-axis')
    .attr('transform', `translate(0,${height})`)
    .call(xAxis)
    .selectAll('text')
    .attr('transform', 'rotate(-45)')
    .style('text-anchor', 'end')

  // Create y-axis (memory IDs)
  const yAxis = d3.axisLeft(yScale)

  svg.append('g')
    .attr('class', 'y-axis')
    .call(yAxis)

  // Create heatmap cells
  svg.selectAll('.heatmap-cell')
    .data(heatmapData)
    .enter()
    .append('rect')
    .attr('class', 'heatmap-cell')
    .attr('x', d => xScale(d.day))
    .attr('y', d => yScale(d.id))
    .attr('width', _d => Math.max(2, width / props.timeRange)) // Ensure cells are visible
    .attr('height', yScale.bandwidth())
    .attr('fill', (d) => {
      if (d.isRetrieval) {
        // Create color based on emotional components
        if (d.joyScore > 0.5)
          return d3.interpolateYlOrRd(d.joyScore)
        if (d.aversionScore > 0.5)
          return d3.interpolatePurples(d.aversionScore)
        return colorScale(d.value)
      }
      else {
        // Fade trails
        return colorScale(d.value)
      }
    })
    .attr('stroke', d => d.isRandom ? 'rgba(255, 0, 0, 0.5)' : 'none')
    .attr('stroke-width', 1)
    .on('mouseover', function (event, d) {
      d3.select(this)
        .attr('stroke', '#fff')
        .attr('stroke-width', 2)

      let tooltipContent = `
        <div class="font-semibold">${d.id}</div>
        <div>${d.isRetrieval ? 'Retrieval' : 'Echo'}</div>
        <div>${props.timeRange - d.day} days ago</div>
      `

      if (d.isRetrieval) {
        tooltipContent += `
          <div>Joy: ${Math.round(d.joyScore * 100)}%</div>
          <div>Aversion: ${Math.round(d.aversionScore * 100)}%</div>
          ${d.isRandom ? '<div class="text-red-500">Random Recall</div>' : ''}
        `
      }

      tooltip.value
        .style('opacity', 1)
        .html(tooltipContent)
        .style('left', `${event.offsetX + 10}px`)
        .style('top', `${event.offsetY - 15}px`)
    })
    .on('mouseout', function () {
      d3.select(this)
        // @ts-expect-error - d is of type HeatmapCell
        .attr('stroke', d => d.isRandom ? 'rgba(255, 0, 0, 0.5)' : 'none')
        // @ts-expect-error - d is of type HeatmapCell
        .attr('stroke-width', d => d.isRandom ? 1 : 0)

      tooltip.value
        .style('opacity', 0)
    })

  // Add legend
  const legend = svg.append('g')
    .attr('class', 'legend')
    .attr('transform', `translate(${width - 120}, -30)`)

  // Legend items
  const legendItems = [
    { label: 'Retrieval', color: colorScale(1) },
    { label: 'Joy', color: d3.interpolateYlOrRd(0.8) },
    { label: 'Aversion', color: d3.interpolatePurples(0.8) },
    { label: 'Random', color: 'rgba(70, 130, 180, 0.8)', stroke: 'rgba(255, 0, 0, 0.5)' },
  ]

  legendItems.forEach((item, i) => {
    const g = legend.append('g')
      .attr('transform', `translate(${i * 70}, 0)`)

    g.append('rect')
      .attr('width', 15)
      .attr('height', 15)
      .attr('fill', item.color)
      .attr('stroke', item.stroke || 'none')
      .attr('stroke-width', item.stroke ? 1 : 0)

    g.append('text')
      .attr('x', 20)
      .attr('y', 12)
      .attr('font-size', '10px')
      .attr('fill', 'currentColor')
      .text(item.label)
  })
}

// New function to render the count heatmap
function renderCountHeatmap() {
  // Clear existing chart
  d3.select(heatmapContainer.value).selectAll('*').remove()

  // Get container dimensions
  const containerRect = heatmapContainer.value.getBoundingClientRect()
  const containerWidth = containerRect.width
  const containerHeight = 300 // Fixed height for the heatmap

  // Set chart margins
  const margin = { top: 30, right: 20, bottom: 60, left: 120 }
  const width = containerWidth - margin.left - margin.right
  const height = containerHeight - margin.top - margin.bottom

  // Create tooltip if it doesn't exist
  if (!tooltip.value) {
    tooltip.value = d3.select(heatmapContainer.value)
      .append('div')
      .attr('class', 'absolute pointer-events-none transition-opacity duration-200 bg-white dark:bg-neutral-800 p-2 rounded shadow-md text-sm z-10')
      .style('opacity', 0)
  }

  // Create SVG
  const svg = d3.select(heatmapContainer.value)
    .append('svg')
    .attr('width', containerWidth)
    .attr('height', containerHeight)
    .append('g')
    .attr('transform', `translate(${margin.left},${margin.top})`)

  // Extract unique memory IDs
  const memoryIds = Array.from(new Set(props.memoryData.map(m => m.id)))

  // Get retrieval count data
  const countData = memoryIds.map((id) => {
    const memory = props.memoryData.find(m => m.id === id)
    return {
      id,
      count: memory ? memory.retrieval_count : 0,
      joyScore: memory ? memory.joy_score : 0,
      aversionScore: memory ? memory.aversion_score : 0,
    }
  }).sort((a, b) => b.count - a.count) // Sort by count (highest first)

  // Get sorted IDs for the y-axis
  const sortedIds = countData.map(d => d.id)

  // Set up scales
  const yScale = d3.scaleBand()
    .domain(sortedIds)
    .range([0, height])
    .padding(0.1)

  // Find max count for color scale
  const maxCount = d3.max(countData, d => d.count) || 1

  // Create color scale for counts
  const colorScale = d3.scaleSequential()
    .domain([0, maxCount])
    .interpolator(d3.interpolateReds)

  // Create bar width scale
  const xScale = d3.scaleLinear()
    .domain([0, maxCount])
    .range([0, width - 50]) // Leave space for count text

  // Create y-axis (memory IDs)
  const yAxis = d3.axisLeft(yScale)

  svg.append('g')
    .attr('class', 'y-axis')
    .call(yAxis)

  // Create count bars
  const bars = svg.selectAll('.count-bar')
    .data(countData)
    .enter()
    .append('g')
    .attr('class', 'count-bar')
    .attr('transform', d => `translate(0, ${yScale(d.id)})`)

  // Add bars
  bars.append('rect')
    .attr('x', 0)
    .attr('y', 0)
    .attr('width', d => xScale(d.count))
    .attr('height', yScale.bandwidth())
    .attr('fill', (d) => {
      // Color based on emotional components and count
      if (d.joyScore > 0.5 && d.count > 0)
        return d3.interpolateYlOrRd(Math.min(1, d.joyScore * (d.count / maxCount)))
      if (d.aversionScore > 0.5 && d.count > 0)
        return d3.interpolatePurples(Math.min(1, d.aversionScore * (d.count / maxCount)))
      return colorScale(d.count)
    })
    .attr('stroke', 'rgba(255, 255, 255, 0.3)')
    .attr('stroke-width', 1)
    .on('mouseover', function (event, d) {
      d3.select(this)
        .attr('stroke', '#fff')
        .attr('stroke-width', 2)

      const tooltipContent = `
        <div class="font-semibold">${d.id}</div>
        <div>Retrievals: ${d.count}</div>
        <div>Joy: ${Math.round(d.joyScore * 100)}%</div>
        <div>Aversion: ${Math.round(d.aversionScore * 100)}%</div>
      `

      tooltip.value
        .style('opacity', 1)
        .html(tooltipContent)
        .style('left', `${event.offsetX + 10}px`)
        .style('top', `${event.offsetY - 15}px`)
    })
    .on('mouseout', function () {
      d3.select(this)
        .attr('stroke', 'rgba(255, 255, 255, 0.3)')
        .attr('stroke-width', 1)

      tooltip.value
        .style('opacity', 0)
    })

  // Add count labels
  bars.append('text')
    .attr('x', d => xScale(d.count) + 5)
    .attr('y', yScale.bandwidth() / 2 + 5)
    .attr('fill', 'currentColor')
    .attr('font-size', '12px')
    .attr('font-weight', 'bold')
    .text(d => d.count)

  // Add title
  svg.append('text')
    .attr('x', width / 2)
    .attr('y', -10)
    .attr('text-anchor', 'middle')
    .attr('font-size', '14px')
    .attr('font-weight', 'bold')
    .attr('fill', 'currentColor')
    .text('Memory Retrieval Counts')

  // Add legend
  const legend = svg.append('g')
    .attr('class', 'legend')
    .attr('transform', `translate(${width - 120}, -30)`)

  // Legend items
  const legendItems = [
    { label: 'Low', color: colorScale(maxCount * 0.2) },
    { label: 'Medium', color: colorScale(maxCount * 0.5) },
    { label: 'High', color: colorScale(maxCount * 0.8) },
    { label: 'Joy Impact', color: d3.interpolateYlOrRd(0.8) },
    { label: 'Aversion', color: d3.interpolatePurples(0.8) },
  ]

  legendItems.forEach((item, i) => {
    const g = legend.append('g')
      .attr('transform', `translate(${(i % 3) * 70}, ${Math.floor(i / 3) * 20})`)

    g.append('rect')
      .attr('width', 15)
      .attr('height', 15)
      .attr('fill', item.color)

    g.append('text')
      .attr('x', 20)
      .attr('y', 12)
      .attr('font-size', '10px')
      .attr('fill', 'currentColor')
      .text(item.label)
  })
}

onMounted(() => {
  // Setup resize observer
  resizeObserver = new ResizeObserver(() => {
    if (props.memoryData.length > 0) {
      viewMode.value === 'patterns' ? renderHeatmap() : renderCountHeatmap()
    }
  })

  if (heatmapContainer.value) {
    resizeObserver.observe(heatmapContainer.value)
  }
})

onUnmounted(() => {
  if (resizeObserver) {
    resizeObserver.disconnect()
  }
})
</script>

<template>
  <div class="rounded-lg bg-white p-4 shadow dark:bg-neutral-800/50">
    <div class="mb-4 flex items-center justify-between">
      <h2 class="text-lg font-semibold">
        Memory Retrieval Analysis
      </h2>
      <div class="flex rounded-lg bg-neutral-100 dark:bg-neutral-700">
        <button
          class="px-3 py-1 text-sm font-medium transition-colors"
          :class="viewMode === 'patterns' ? 'bg-blue-500 text-white rounded-lg' : 'text-neutral-600 dark:text-neutral-300'"
          @click="viewMode = 'patterns'"
        >
          Patterns
        </button>
        <button
          class="px-3 py-1 text-sm font-medium transition-colors"
          :class="viewMode === 'counts' ? 'bg-blue-500 text-white rounded-lg' : 'text-neutral-600 dark:text-neutral-300'"
          @click="viewMode = 'counts'"
        >
          Counts
        </button>
      </div>
    </div>
    <div ref="heatmapContainer" class="relative h-[300px] w-full">
      <!-- D3.js will render the heatmap here -->
    </div>
    <div v-if="viewMode === 'patterns'" class="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
      Heatmap shows when memories were retrieved, with color intensity showing emotional impact.
      Red outlines indicate possible random "flashback" retrievals.
    </div>
    <div v-else class="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
      Bar chart shows total retrieval counts for each memory, sorted by frequency.
      Color intensity and hue indicate emotional impact.
    </div>
  </div>
</template>

<style scoped>
:deep(.x-axis path),
:deep(.y-axis path),
:deep(.x-axis line),
:deep(.y-axis line),
:deep(.domain) {
  stroke: #dce0e3;
}

.dark {
  :deep(.x-axis path),
  :deep(.y-axis path),
  :deep(.x-axis line),
  :deep(.y-axis line),
  :deep(.domain) {
    stroke: #374151;
  }
}
</style>
