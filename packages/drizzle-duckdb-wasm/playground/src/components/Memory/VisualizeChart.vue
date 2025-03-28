<script setup lang="ts">
import { useDark } from '@vueuse/core'
import * as d3 from 'd3'
import { onMounted, onUnmounted, ref, watchEffect } from 'vue'

const props = defineProps<{
  memoryData: MemoryDataItem[]
  selectedStoryId: string
  decayRate: number
  maxDaysToShow: number
  longTermMemoryEnabled: boolean
  longTermMemoryThreshold: number
  longTermMemoryVisualize: boolean
  retrievalBoost: number
  retrievalDecaySlowdown: number
}>()

interface MemoryDataItem {
  storyid: string
  score: number
  lastupdate: string // ISO timestamp
  last_retrieved_at: string // ISO timestamp
  retrieval_count: number
  lastupdate_str: string
  last_retrieved_str: string
  age_in_seconds: number
  time_since_retrieval: number
  ltm_factor?: number // Optional since it's only present when longTermMemoryEnabled is true
  decayed_score: number
}

interface DataPoint {
  x: number
  y: number
  label: string
}

interface ChartData {
  labels: string[]
  dataPoints: {
    withRetrievals: DataPoint[]
    withoutRetrievals: DataPoint[]
    ltmProjection: DataPoint[]
  }
}

const chartContainer = ref(null)
const tooltip = ref(null)
let resizeObserver = null

const isDark = useDark()

// Render chart when dependencies change
watchEffect(() => {
  if (chartContainer.value && props.memoryData.length && props.selectedStoryId) {
    renderChart()
  }
})

// Render D3 chart
function renderChart() {
  // Clear existing chart
  d3.select(chartContainer.value).selectAll('*').remove()

  // Find the selected story
  const story = props.memoryData.find(s => s.storyid === props.selectedStoryId)
  if (!story)
    return

  // Get container dimensions
  const containerRect = chartContainer.value.getBoundingClientRect()
  const containerWidth = containerRect.width
  const containerHeight = containerRect.height || 320

  // Set chart margins
  const margin = { top: 20, right: 0, bottom: 20, left: 30 }
  const width = containerWidth - margin.left - margin.right
  const height = containerHeight - margin.top - margin.bottom

  // Prepare data for chart
  const originalScore = Number.parseFloat(String(story.score))
  const dr = props.decayRate
  const maxDays = props.maxDaysToShow
  const ageInDays = Number.parseFloat(String(story.age_in_seconds)) / (24 * 60 * 60)
  const retrievals = Number.parseInt(String(story.retrieval_count))
  const daysSinceRetrieval = Number.parseFloat(String(story.time_since_retrieval)) / (24 * 60 * 60)
  const ltmFactor = props.longTermMemoryEnabled ? Number.parseFloat(String(story.ltm_factor || '0')) : 0

  // Generate data points
  const chartData = {
    labels: ['Original', 'Current'],
    dataPoints: {
      withRetrievals: [
        { x: 0, y: originalScore, label: 'Original' },
        { x: ageInDays, y: Number.parseFloat(String(story.decayed_score)), label: 'Current' },
      ],
      withoutRetrievals: [
        { x: 0, y: originalScore, label: 'Original' },
        { x: ageInDays, y: originalScore * Math.exp(-dr * ageInDays * (1 - ltmFactor)), label: 'Current' },
      ],
      ltmProjection: props.longTermMemoryVisualize
        ? [
            { x: 0, y: originalScore, label: 'Original' },
            {
              x: ageInDays,
              y: retrievals >= props.longTermMemoryThreshold
                ? originalScore * (1 - Math.max(0, 0.1 - 0.1 * retrievals))
                : Number.parseFloat(String(story.decayed_score)),
              label: 'Current',
            },
          ]
        : [],
    },
  }

  // Add future projection points
  const dayStep = Math.ceil(maxDays / 10)
  for (let day = dayStep; day <= maxDays; day += dayStep) {
    const futureDay = ageInDays + day
    const futureDaysSinceRetrieval = daysSinceRetrieval + day
    const label = `+${day}d`

    // Point with retrieval effects
    const scoreWithRetrievals = originalScore
      * Math.exp(-dr * futureDay * (1 - ltmFactor))
      * (1 + (retrievals * props.retrievalBoost
        * Math.exp(-dr * props.retrievalDecaySlowdown * futureDaysSinceRetrieval)))

    // Point without retrieval effects
    const scoreWithoutRetrievals = originalScore * Math.exp(-dr * futureDay * (1 - ltmFactor))

    // Add to data series
    chartData.labels.push(label)
    chartData.dataPoints.withRetrievals.push({ x: futureDay, y: scoreWithRetrievals, label })
    chartData.dataPoints.withoutRetrievals.push({ x: futureDay, y: scoreWithoutRetrievals, label })

    // Add LTM projection if enabled
    if (props.longTermMemoryVisualize) {
      const ltmProjectionValue = retrievals >= props.longTermMemoryThreshold
        ? originalScore * (1 - Math.max(0, 0.1 - 0.1 * retrievals)) * Math.exp(-0.01 * day)
        : scoreWithRetrievals

      chartData.dataPoints.ltmProjection.push({ x: futureDay, y: ltmProjectionValue, label })
    }
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
    ...chartData.dataPoints.withRetrievals,
    ...chartData.dataPoints.withoutRetrievals,
    ...chartData.dataPoints.ltmProjection,
  ], d => d.y) * 1.1]

  const xScale = d3.scaleLinear()
    .domain(xExtent)
    .range([0, width])

  const yScale = d3.scaleLinear()
    .domain(yExtent)
    .range([height, 0])

  // Add axes and gridlines
  addAxesAndGrids(svg, xScale, yScale, width, height)

  // Add data lines and areas
  addDataLines(svg, chartData, xScale, yScale, height)

  // Add half-life indicator
  const halfLife = Math.log(2) / dr
  if (halfLife <= maxDays + ageInDays) {
    addHalfLifeIndicator(svg, halfLife, xScale, height)
  }

  // Add data points with interaction
  addDataPoints(svg, chartData.dataPoints.withRetrievals, xScale, yScale)

  // Add chart title and legends
  addTitleAndLegends(svg, story.storyid, retrievals, ltmFactor, width)

  // Add LTM indicators
  if (props.longTermMemoryEnabled) {
    addLTMIndicators(svg, retrievals, props.longTermMemoryThreshold, ltmFactor, width)
  }
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
  if (!isDark.value) {
    svg.append('g')
      .attr('class', 'grid')
      .attr('transform', `translate(0,${height})`)
      .call(
        d3.axisBottom(xScale)
          .tickSize(-height)
          .tickFormat(() => ''), // Use a function that returns empty string
      )
      .selectAll('line')
      .attr('stroke', '#e5e7eb')
      .attr('stroke-opacity', 0.5)

    svg.append('g')
      .attr('class', 'grid')
      .call(
        d3.axisLeft(yScale)
          .tickSize(-width)
          .tickFormat(() => ''), // Use a function that returns empty string
      )
      .selectAll('line')
      .attr('stroke', '#e5e7eb')
      .attr('stroke-opacity', 0.5)
  }
  else {
    svg.append('g')
      .attr('class', 'grid')
      .attr('transform', `translate(0,${height})`)
      .call(
        d3.axisBottom(xScale)
          .tickSize(-height)
          .tickFormat(() => ''), // Use a function that returns empty string
      )
      .selectAll('line')
      .attr('stroke', '#434345')
      .attr('stroke-opacity', 0.5)

    svg.append('g')
      .attr('class', 'grid')
      .call(
        d3.axisLeft(yScale)
          .tickSize(-width)
          .tickFormat(() => ''), // Use a function that returns empty string
      )
      .selectAll('line')
      .attr('stroke', '#434345')
      .attr('stroke-opacity', 0.5)
  }

  // Add axes
  svg.append('g')
    .attr('class', 'x-axis')
    .attr('transform', `translate(0,${height})`)
    .call(xAxis)
    .append('text')
    .attr('class', 'axis-label')
    .attr('x', width / 2)
    .attr('y', 20)
    .attr('text-anchor', 'middle')
    .text('Time (days)')
    .attr('fill', 'currentColor')

  svg.append('g')
    .attr('class', 'y-axis')
    .call(yAxis)
    .append('text')
    .attr('class', 'axis-label')
    .attr('transform', 'rotate(-90)')
    .attr('y', -10)
    .attr('x', -height / 2)
    .attr('text-anchor', 'middle')
    .text('Memory Strength')
    .attr('fill', 'currentColor')
}

function addDataLines(
  svg: d3.Selection<SVGGElement, unknown, null, undefined>,
  chartData: ChartData,
  xScale: d3.ScaleLinear<number, number>,
  yScale: d3.ScaleLinear<number, number>,
  height: number,
): void {
  // Create line generators with correct types
  const line = d3.line<DataPoint>()
    .x(d => xScale(d.x))
    .y(d => yScale(d.y))
    .curve(d3.curveMonotoneX)

  // Create area generators with correct types
  const area = d3.area<DataPoint>()
    .x(d => xScale(d.x))
    .y0(height)
    .y1(d => yScale(d.y))
    .curve(d3.curveMonotoneX)

  // Add area fill for without retrievals
  svg.append('path')
    .datum(chartData.dataPoints.withoutRetrievals)
    .attr('class', 'area without-retrievals')
    .attr('d', area)
    .attr('fill', 'rgba(156, 163, 175, 0.2)')

  // Add line for without retrievals
  svg.append('path')
    .datum(chartData.dataPoints.withoutRetrievals)
    .attr('class', 'line without-retrievals')
    .attr('d', line)
    .attr('fill', 'none')
    .attr('stroke', 'rgba(156, 163, 175, 0.6)')
    .attr('stroke-width', 2)
    .attr('stroke-dasharray', '5,3')

  // Add area fill for with retrievals
  svg.append('path')
    .datum(chartData.dataPoints.withRetrievals)
    .attr('class', 'area with-retrievals')
    .attr('d', area)
    .attr('fill', 'rgba(59, 130, 246, 0.2)')

  // Add line for with retrievals
  svg.append('path')
    .datum(chartData.dataPoints.withRetrievals)
    .attr('class', 'line with-retrievals')
    .attr('d', line)
    .attr('fill', 'none')
    .attr('stroke', 'rgba(59, 130, 246, 1)')
    .attr('stroke-width', 3)

  // Add LTM projection line if enabled
  if (props.longTermMemoryVisualize && chartData.dataPoints.ltmProjection.length > 0) {
    svg.append('path')
      .datum(chartData.dataPoints.ltmProjection)
      .attr('class', 'line ltm-projection')
      .attr('d', line)
      .attr('fill', 'none')
      .attr('stroke', 'rgba(139, 92, 246, 0.8)')
      .attr('stroke-width', 2)
      .attr('stroke-dasharray', '3,2')
  }
}

function addDataPoints(svg, dataPoints, xScale, yScale) {
  svg.selectAll('.point-with-retrievals')
    .data(dataPoints)
    .enter()
    .append('circle')
    .attr('class', 'point-with-retrievals')
    .attr('cx', d => xScale(d.x))
    .attr('cy', d => yScale(d.y))
    .attr('r', (d, i) => i < 2 ? 6 : 5)
    .attr('fill', (d, i) => i < 2 ? 'rgba(220, 38, 38, 0.8)' : 'rgba(59, 130, 246, 0.8)')
    .attr('stroke', 'white')
    .attr('stroke-width', 2)
    .on('mouseover', function (event, d) {
      d3.select(this)
        .transition()
        .duration(200)
        .attr('r', 8)

      tooltip.value
        .style('opacity', 1)
        .html(`
          <div class="font-semibold">${d.label}</div>
          <div>Score: ${Math.round(d.y)}</div>
          <div>Day: ${Math.round(d.x)}</div>
        `)
        .style('left', `${event.offsetX + 15}px`)
        .style('top', `${event.offsetY - 28}px`)
    })
    .on('mouseout', function () {
      d3.select(this)
        .transition()
        .duration(200)
        .attr('r', (d, i) => i < 2 ? 6 : 5)

      tooltip.value
        .transition()
        .duration(200)
        .style('opacity', 0)
    })

  // Add labels to important points
  svg.selectAll('.point-label')
    .data(dataPoints.filter((d, i) => i === 0 || i === 1 || i === dataPoints.length - 1 || i % 3 === 0))
    .enter()
    .append('text')
    .attr('class', 'point-label')
    .attr('x', d => xScale(d.x))
    .attr('y', d => yScale(d.y) - 15)
    .attr('text-anchor', 'middle')
    .attr('font-size', '12px')
    .attr('font-weight', 'bold')
    .attr('fill', 'currentColor')
    .text(d => Math.round(d.y))
}

function addHalfLifeIndicator(svg, halfLife, xScale, height) {
  svg.append('line')
    .attr('class', 'half-life-line')
    .attr('x1', xScale(halfLife))
    .attr('y1', 0)
    .attr('x2', xScale(halfLife))
    .attr('y2', height)
    .attr('stroke', 'rgba(220, 38, 38, 0.5)')
    .attr('stroke-width', 1)
    .attr('stroke-dasharray', '5,5')

  svg.append('text')
    .attr('class', 'half-life-label')
    .attr('x', xScale(halfLife))
    .attr('y', 0)
    .attr('dy', -8)
    .attr('text-anchor', 'middle')
    .attr('font-size', '12px')
    .attr('fill', 'rgba(220, 38, 38, 0.8)')
    .text(`Half-life: ${halfLife.toFixed(1)} days`)
}

function addTitleAndLegends(svg, storyId, retrievals, ltmFactor, width) {
  // Add chart title
  let titleText = `Memory Decay for ${storyId} (${retrievals} retrievals)`
  if (props.longTermMemoryEnabled) {
    if (retrievals >= props.longTermMemoryThreshold) {
      const ltmPercent = Math.round(ltmFactor * 100)
      titleText += ` - LTM: ${ltmPercent}%`
    }
    else if (retrievals > 0) {
      titleText += ` - LTM: ${retrievals}/${props.longTermMemoryThreshold} retrievals`
    }
  }

  svg.append('text')
    .attr('class', 'chart-title')
    .attr('x', width / 2)
    .attr('y', -30)
    .attr('text-anchor', 'middle')
    .attr('font-size', '16px')
    .attr('font-weight', 'bold')
    .attr('fill', 'currentColor')
    .text(titleText)

  // Add legend
  const legendData = [
    { label: `Current (${retrievals} retrievals)`, color: 'rgba(59, 130, 246, 0.8)' },
    { label: 'Without retrievals', color: 'rgba(156, 163, 175, 0.8)' },
  ]

  if (props.longTermMemoryVisualize) {
    legendData.push({ label: 'Long-term memory', color: 'rgba(139, 92, 246, 0.8)' })
  }

  const legend = svg.append('g')
    .attr('class', 'legend')
    .attr('transform', `translate(${width - 180}, 10)`)

  const legendItems = legend.selectAll('.legend-item')
    .data(legendData)
    .enter()
    .append('g')
    .attr('class', 'legend-item')
    .attr('transform', (d, i) => `translate(10, ${i * 25 + 20})`)

  legendItems.append('circle')
    .attr('r', 6)
    .attr('fill', d => d.color)
    .attr('stroke', 'white')
    .attr('stroke-width', 1)

  legendItems.append('text')
    .attr('x', 15)
    .attr('y', 4)
    .attr('font-size', '12px')
    .attr('fill', 'currentColor')
    .text(d => d.label)
}

function addLTMIndicators(svg, retrievals, threshold, ltmFactor, width) {
  if (retrievals > 0 && retrievals < threshold) {
    const progress = Math.round((retrievals / threshold) * 100)
    svg.append('g')
      .attr('class', 'progress-indicator')
      .attr('transform', `translate(${width / 2}, ${-20})`)
      .append('text')
      .attr('text-anchor', 'middle')
      .attr('font-size', '12px')
      .attr('fill', 'rgba(139, 92, 246, 0.8)')
      .text(`LTM Progress: ${progress}%`)
  }

  if (retrievals >= threshold) {
    const stability = Math.round(ltmFactor * 100)
    svg.append('text')
      .attr('class', 'ltm-info')
      .attr('x', width / 2)
      .attr('y', -10)
      .attr('text-anchor', 'middle')
      .attr('font-size', '14px')
      .attr('fill', 'rgba(139, 92, 246, 1)')
      .text(`Long-term memory stability: ${stability}%`)
  }
}

onMounted(() => {
  // Setup resize observer
  resizeObserver = new ResizeObserver(() => {
    if (props.memoryData.length && props.selectedStoryId) {
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
    <h2 class="mb-4 text-xl font-semibold">
      Memory Strength Projection
    </h2>
    <!-- D3.js chart container -->
    <div ref="chartContainer" class="relative h-120 w-full">
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
:deep(.y-axis line) {
  stroke: #dce0e3;
}

:deep(.grid line) {
  stroke: #2c2d2e;
  stroke-opacity: 0.5;
}

.dark {
  :deep(.x-axis path),
  :deep(.y-axis path),
  :deep(.x-axis line),
  :deep(.y-axis line) {
    stroke: #1f2831;
  }
}
</style>
