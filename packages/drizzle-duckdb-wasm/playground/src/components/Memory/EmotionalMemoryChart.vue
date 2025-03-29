<script setup lang="ts">
import type { EmotionalMemoryItem } from '../../types/memory/emotional-memory'

import { useDark } from '@vueuse/core'
import * as d3 from 'd3'
import { onMounted, onUnmounted, ref, watchEffect } from 'vue'

const props = defineProps<{
  memoryData: EmotionalMemoryItem[]
  selectedMemoryId: string
  decayRate: number
  maxDaysToProject: number
  longTermThreshold: number
  muscleMemoryThreshold: number
  joyBoostFactor: number
  joyDecaySteepness: number
  aversionSpikeFactor: number
  aversionStability: number
}>()

interface DataPoint {
  x: number
  y: number
  label: string
  type: string
}

const chartContainer = ref(null)
const tooltip = ref(null)
let resizeObserver = null

const isDark = useDark()

// Render chart when dependencies change
watchEffect(() => {
  if (chartContainer.value && props.memoryData.length && props.selectedMemoryId) {
    renderChart()
  }
})

// Render D3 chart
function renderChart() {
  // Clear existing chart
  d3.select(chartContainer.value).selectAll('*').remove()

  // Find the selected memory
  const memory = props.memoryData.find(m => m.id === props.selectedMemoryId)
  if (!memory)
    return

  // Get container dimensions
  const containerRect = chartContainer.value.getBoundingClientRect()
  const containerWidth = containerRect.width
  const containerHeight = containerRect.height || 700

  // Set chart margins
  const margin = { top: 40, right: 30, bottom: 40, left: 60 }
  const width = containerWidth - margin.left - margin.right
  const height = containerHeight - margin.top - margin.bottom

  // Prepare data for chart
  const originalScore = Number.parseFloat(String(memory.score))
  const joyScore = Number.parseFloat(String(memory.joy_score))
  const aversionScore = Number.parseFloat(String(memory.aversion_score))
  const retrievalCount = Number.parseInt(String(memory.retrieval_count))
  const dr = props.decayRate
  const maxDays = props.maxDaysToProject
  const ageInDays = Number.parseFloat(String(memory.age_in_seconds)) / (24 * 60 * 60)
  const timeSinceRetrievalDays = Number.parseFloat(String(memory.time_since_retrieval)) / (24 * 60 * 60)

  // Calculate LTM factor
  const ltmFactor = retrievalCount >= props.longTermThreshold
    ? 1.0 - (0.3 ** (retrievalCount / props.longTermThreshold))
    : 0

  // Calculate current score components
  const currentJoyEffect = joyScore * props.joyBoostFactor
    * Math.exp(-props.joyDecaySteepness * timeSinceRetrievalDays)

  const currentAversionEffect = aversionScore * props.aversionSpikeFactor
    * props.aversionStability ** Math.ceil(retrievalCount / 5)

  // Generate baseline data (standard decay without emotional effect)
  const baselineData = [{
    x: 0,
    y: originalScore,
    label: 'Original',
    type: 'baseline',
  }]

  // Generate data with emotional effects
  const emotionalData = [{
    x: 0,
    y: originalScore,
    label: 'Original',
    type: 'emotional',
  }]

  // Generate joy component data
  const joyData = [{
    x: 0,
    y: joyScore * props.joyBoostFactor * originalScore,
    label: 'Original Joy',
    type: 'joy',
  }]

  // Generate aversion component data
  const aversionData = [{
    x: 0,
    y: aversionScore * props.aversionSpikeFactor * originalScore,
    label: 'Original Aversion',
    type: 'aversion',
  }]

  // Current point (today)
  baselineData.push({
    x: ageInDays,
    y: originalScore * Math.exp(-dr * ageInDays * (1 - ltmFactor)),
    label: 'Current',
    type: 'baseline',
  })

  emotionalData.push({
    x: ageInDays,
    y: Number.parseFloat(String(memory.decayed_score)),
    label: 'Current',
    type: 'emotional',
  })

  joyData.push({
    x: ageInDays,
    y: originalScore * currentJoyEffect,
    label: 'Current Joy',
    type: 'joy',
  })

  aversionData.push({
    x: ageInDays,
    y: originalScore * currentAversionEffect,
    label: 'Current Aversion',
    type: 'aversion',
  })

  // Add future projection points
  const dayStep = Math.ceil(maxDays / 20) // Adjust steps based on projection days
  for (let day = dayStep; day <= maxDays; day += dayStep) {
    const projectedDay = ageInDays + day
    const projectedDaysSinceRetrieval = timeSinceRetrievalDays + day
    const label = `+${day}d`

    // Calculate LTM-adjusted decay
    const baseDecay = Math.exp(-dr * projectedDay * (1 - ltmFactor))

    // Joy decays more quickly over time
    const joyEffect = joyScore * props.joyBoostFactor
      * Math.exp(-props.joyDecaySteepness * projectedDaysSinceRetrieval)

    // Aversion is more stable, especially with repeated retrievals
    const aversionEffect = aversionScore * props.aversionSpikeFactor
      * props.aversionStability ** Math.ceil(retrievalCount / 5)

    // Combined emotional effect
    const emotionalEffect = (1 + joyEffect) * (1 + aversionEffect)

    // Add baseline point (standard decay)
    baselineData.push({
      x: projectedDay,
      y: originalScore * baseDecay,
      label,
      type: 'baseline',
    })

    // Add emotional point (with joy and aversion effects)
    emotionalData.push({
      x: projectedDay,
      y: originalScore * baseDecay * emotionalEffect,
      label,
      type: 'emotional',
    })

    // Add joy component (isolates joy effect)
    joyData.push({
      x: projectedDay,
      y: originalScore * joyEffect,
      label,
      type: 'joy',
    })

    // Add aversion component (isolates aversion effect)
    aversionData.push({
      x: projectedDay,
      y: originalScore * aversionEffect,
      label,
      type: 'aversion',
    })
  }

  // Create tooltip if it doesn't exist
  if (!tooltip.value) {
    tooltip.value = d3.select(chartContainer.value)
      .append('div')
      .attr('class', 'absolute pointer-events-none transition-opacity duration-200 bg-white dark:bg-neutral-800 p-2 rounded shadow-md text-sm z-10')
      .style('opacity', 0)
  }

  // Create SVG
  const svg = d3.select(chartContainer.value)
    .append('svg')
    .attr('width', '100%')
    .attr('height', '100%')
    .attr('viewBox', `0 0 ${containerWidth} ${containerHeight}`)
    .attr('preserveAspectRatio', 'xMidYMid meet')
    .append('g')
    .attr('transform', `translate(${margin.left},${margin.top})`)

  // Set up scales
  const xExtent = [0, maxDays + ageInDays]
  const yExtent = [0, d3.max([
    ...emotionalData,
    ...baselineData,
    ...joyData,
    ...aversionData,
  ], d => d.y) * 1.1]

  const xScale = d3.scaleLinear()
    .domain(xExtent)
    .range([0, width])

  const yScale = d3.scaleLinear()
    .domain(yExtent)
    .range([height, 0])

  // Add axes and gridlines
  addAxesAndGrids(svg, xScale, yScale, width, height)

  // Add data lines
  addDataLines(svg, baselineData, emotionalData, joyData, aversionData, xScale, yScale)

  // Add key threshold markers
  if (retrievalCount > 0) {
    const halfLife = Math.log(2) / dr
    if (halfLife <= maxDays + ageInDays) {
      addThresholdLine(svg, halfLife, xScale, height, 'Half-life', 'rgba(220, 38, 38, 0.6)')
    }
  }

  // Add memory type marker
  let memoryTypeLabel = 'Short-term Memory'
  let memoryTypeColor = 'rgba(220, 38, 38, 0.8)'

  if (retrievalCount >= props.muscleMemoryThreshold) {
    memoryTypeLabel = 'Muscle Memory'
    memoryTypeColor = 'rgba(139, 92, 246, 0.8)'
  }
  else if (retrievalCount >= props.longTermThreshold) {
    memoryTypeLabel = 'Long-term Memory'
    memoryTypeColor = 'rgba(59, 130, 246, 0.8)'
  }
  else if (retrievalCount > 0) {
    memoryTypeLabel = 'Working Memory'
    memoryTypeColor = 'rgba(14, 165, 233, 0.8)'
  }

  addMemoryTypeMarker(svg, memoryTypeLabel, memoryTypeColor, retrievalCount, width)

  // Add chart title and legends
  addTitleAndLegends(svg, memory.id, joyScore, aversionScore, retrievalCount, width)

  // Add data points with interaction
  addDataPoints(svg, emotionalData, baselineData, xScale, yScale)
}

function addAxesAndGrids(
  svg: d3.Selection<SVGGElement, unknown, null, undefined>,
  xScale: d3.ScaleLinear<number, number>,
  yScale: d3.ScaleLinear<number, number>,
  width: number,
  height: number,
): void {
  const xAxis = d3.axisBottom(xScale)
    .ticks(5)
    .tickFormat((d: d3.NumberValue) => `${Math.round(d.valueOf())} days`)

  const yAxis = d3.axisLeft(yScale)
    .ticks(5)
    .tickFormat((d: d3.NumberValue) => `${Math.round(d.valueOf())}`)

  // Add gridlines
  svg.append('g')
    .attr('class', 'grid')
    .attr('transform', `translate(0,${height})`)
    .call(
      d3.axisBottom(xScale)
        .tickSize(-height)
        .tickFormat(() => ''),
    )
    .selectAll('line')
    .attr('stroke', isDark.value ? 'rgba(75, 85, 99, 0.3)' : 'rgba(229, 231, 235, 0.7)')
    .attr('stroke-width', 1)

  svg.append('g')
    .attr('class', 'grid')
    .call(
      d3.axisLeft(yScale)
        .tickSize(-width)
        .tickFormat(() => ''),
    )
    .selectAll('line')
    .attr('stroke', isDark.value ? 'rgba(75, 85, 99, 0.3)' : 'rgba(229, 231, 235, 0.7)')
    .attr('stroke-width', 1)

  // Add axes
  svg.append('g')
    .attr('class', 'x-axis')
    .attr('transform', `translate(0,${height})`)
    .call(xAxis)
    .append('text')
    .attr('class', 'axis-label')
    .attr('x', width / 2)
    .attr('y', 36)
    .attr('text-anchor', 'middle')
    .text('Time (days)')
    .attr('fill', 'currentColor')

  svg.append('g')
    .attr('class', 'y-axis')
    .call(yAxis)
    .append('text')
    .attr('class', 'axis-label')
    .attr('transform', 'rotate(-90)')
    .attr('y', -40)
    .attr('x', -height / 2)
    .attr('text-anchor', 'middle')
    .text('Memory Strength')
    .attr('fill', 'currentColor')
}

function addDataLines(
  svg: d3.Selection<SVGGElement, unknown, null, undefined>,
  baselineData: DataPoint[],
  emotionalData: DataPoint[],
  joyData: DataPoint[],
  aversionData: DataPoint[],
  xScale: d3.ScaleLinear<number, number>,
  yScale: d3.ScaleLinear<number, number>,
): void {
  // Create line generator
  const line = d3.line<DataPoint>()
    .x(d => xScale(d.x))
    .y(d => yScale(d.y))
    .curve(d3.curveMonotoneX)

  // Add baseline decay line
  svg.append('path')
    .datum(baselineData)
    .attr('class', 'line baseline')
    .attr('d', line)
    .attr('fill', 'none')
    .attr('stroke', 'rgba(156, 163, 175, 0.8)')
    .attr('stroke-width', 2)
    .attr('stroke-dasharray', '5,3')

  // Add joy component line (transparent fill under curve)
  svg.append('path')
    .datum(joyData)
    .attr('class', 'line joy')
    .attr('d', line)
    .attr('fill', 'none')
    .attr('stroke', 'rgba(250, 204, 21, 0.8)')
    .attr('stroke-width', 2)
    .attr('stroke-dasharray', '3,2')

  // Add aversion component line (transparent fill under curve)
  svg.append('path')
    .datum(aversionData)
    .attr('class', 'line aversion')
    .attr('d', line)
    .attr('fill', 'none')
    .attr('stroke', 'rgba(220, 38, 38, 0.8)')
    .attr('stroke-width', 2)
    .attr('stroke-dasharray', '3,2')

  // Add emotional effect line (main result)
  svg.append('path')
    .datum(emotionalData)
    .attr('class', 'line emotional')
    .attr('d', line)
    .attr('fill', 'none')
    .attr('stroke', 'rgba(59, 130, 246, 1)')
    .attr('stroke-width', 3)
}

function addThresholdLine(
  svg: d3.Selection<SVGGElement, unknown, null, undefined>,
  position: number,
  xScale: d3.ScaleLinear<number, number>,
  height: number,
  label: string,
  color: string,
): void {
  svg.append('line')
    .attr('class', 'threshold-line')
    .attr('x1', xScale(position))
    .attr('y1', 0)
    .attr('x2', xScale(position))
    .attr('y2', height)
    .attr('stroke', color)
    .attr('stroke-width', 1)
    .attr('stroke-dasharray', '5,5')

  svg.append('text')
    .attr('class', 'threshold-label')
    .attr('x', xScale(position))
    .attr('y', -8)
    .attr('text-anchor', 'middle')
    .attr('font-size', '12px')
    .attr('fill', color)
    .text(`${label}: ${position.toFixed(1)} days`)
}

function addMemoryTypeMarker(
  svg: d3.Selection<SVGGElement, unknown, null, undefined>,
  typeLabel: string,
  color: string,
  retrievalCount: number,
  width: number,
): void {
  svg.append('text')
    .attr('class', 'memory-type-label')
    .attr('x', width / 2)
    .attr('y', -20)
    .attr('text-anchor', 'middle')
    .attr('font-size', '14px')
    .attr('fill', color)
    .text(`${typeLabel} (${retrievalCount} retrievals)`)
}

function addDataPoints(
  svg: d3.Selection<SVGGElement, unknown, null, undefined>,
  emotionalData: DataPoint[],
  baselineData: DataPoint[],
  xScale: d3.ScaleLinear<number, number>,
  yScale: d3.ScaleLinear<number, number>,
): void {
  // Add key data points for emotional line
  svg.selectAll('.point-emotional')
    .data(emotionalData.filter((d, i) => i === 0 || i === 1 || i % 5 === 0))
    .enter()
    .append('circle')
    .attr('class', 'point-emotional')
    .attr('cx', d => xScale(d.x))
    .attr('cy', d => yScale(d.y))
    .attr('r', (d, i) => i < 2 ? 6 : 4)
    .attr('fill', 'rgba(59, 130, 246, 0.8)')
    .attr('stroke', 'white')
    .attr('stroke-width', 2)
    .on('mouseover', function (event, d) {
      d3.select(this)
        .transition()
        .duration(200)
        .attr('r', 8)

      const baselinePoint = baselineData.find(bd => bd.x === d.x)
      const baselineValue = baselinePoint ? Math.round(baselinePoint.y) : 'N/A'

      tooltip.value
        .style('opacity', 1)
        .html(`
          <div class="font-semibold">${d.label}</div>
          <div>Total: ${Math.round(d.y)}</div>
          <div>Base: ${baselineValue}</div>
          <div>Day: ${Math.round(d.x)}</div>
        `)
        .style('left', `${event.offsetX + 15}px`)
        .style('top', `${event.offsetY - 28}px`)
    })
    .on('mouseout', function () {
      d3.select(this)
        .transition()
        .duration(200)
        .attr('r', (d, i) => i < 2 ? 6 : 4)

      tooltip.value
        .transition()
        .duration(200)
        .style('opacity', 0)
    })

  // Add labels to important emotional points
  svg.selectAll('.emotional-point-label')
    .data(emotionalData.filter((d, i) => i === 0 || i === 1 || i === emotionalData.length - 1))
    .enter()
    .append('text')
    .attr('class', 'emotional-point-label')
    .attr('x', d => xScale(d.x))
    .attr('y', d => yScale(d.y) - 15)
    .attr('text-anchor', 'middle')
    .attr('font-size', '12px')
    .attr('font-weight', 'bold')
    .attr('fill', 'rgba(59, 130, 246, 1)')
    .text(d => Math.round(d.y))
}

function addTitleAndLegends(
  svg: d3.Selection<SVGGElement, unknown, null, undefined>,
  memoryId: string,
  joyScore: number,
  aversionScore: number,
  retrievalCount: number,
  width: number,
): void {
  // Add emotional scores label
  const joyPercent = Math.round(joyScore * 100)
  const aversionPercent = Math.round(aversionScore * 100)

  // Add legend
  const legendData = [
    { label: 'Emotional Memory', color: 'rgba(59, 130, 246, 0.8)' },
    { label: 'Base Decay', color: 'rgba(156, 163, 175, 0.8)' },
    { label: `Joy Component (${joyPercent}%)`, color: 'rgba(250, 204, 21, 0.8)' },
    { label: `Aversion Component (${aversionPercent}%)`, color: 'rgba(220, 38, 38, 0.8)' },
  ]

  const legend = svg.append('g')
    .attr('class', 'legend')
    .attr('transform', `translate(${width - 220}, 10)`)

  const legendItems = legend.selectAll('.legend-item')
    .data(legendData)
    .enter()
    .append('g')
    .attr('class', 'legend-item')
    .attr('transform', (d, i) => `translate(10, ${i * 20})`)

  legendItems.append('line')
    .attr('x1', 0)
    .attr('y1', 8)
    .attr('x2', 20)
    .attr('y2', 8)
    .attr('stroke', d => d.color)
    .attr('stroke-width', 2)
    .attr('stroke-dasharray', (d, i) => i === 0 ? '0' : i === 1 ? '5,3' : '3,2')

  legendItems.append('text')
    .attr('x', 25)
    .attr('y', 12)
    .attr('font-size', '12px')
    .attr('fill', 'currentColor')
    .text(d => d.label)
}

onMounted(() => {
  // Setup resize observer
  resizeObserver = new ResizeObserver(() => {
    if (props.memoryData.length && props.selectedMemoryId) {
      renderChart()
    }
  })

  if (chartContainer.value) {
    resizeObserver.observe(chartContainer.value)
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
    <h2 class="mb-4 text-lg font-semibold">
      Emotional Memory Projection
    </h2>
    <!-- D3.js chart container -->
    <div ref="chartContainer" class="relative h-[800px] w-full">
      <!-- D3 will render the chart here -->
    </div>
  </div>
</template>

<style scoped>
/* D3 Chart Styles */
:deep(.axis-label) {
  font-size: 12px;
}

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
