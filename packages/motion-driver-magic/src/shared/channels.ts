import { clamp } from 'es-toolkit/math'

/** One varying source channel and every exact duplicate value that shares it. */
export interface Channel {
  valueIndices: number[]
  mean: number
  scale: number
  minimum: number
  maximum: number
}

function mean(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function standardDeviation(values: readonly number[], average: number): number {
  const variance = values.reduce((sum, value) => sum + (value - average) ** 2, 0) / values.length
  return Math.sqrt(variance)
}

function tracksMatch(
  frames: readonly (readonly number[])[],
  left: number,
  right: number,
): boolean {
  return frames.every(frame => Math.abs(frame[left] - frame[right]) <= 1e-8)
}

/** Extracts varying channels and folds exact duplicate source curves together. */
export function createMotionChannels(frames: readonly (readonly number[])[]): Channel[] {
  const channels: Channel[] = []
  for (let valueIndex = 0; valueIndex < frames[0].length; valueIndex++) {
    const values = frames.map(frame => frame[valueIndex])
    const average = mean(values)
    const scale = standardDeviation(values, average)
    if (scale <= 1e-8)
      continue

    const matchingChannel = channels.find(channel => tracksMatch(frames, channel.valueIndices[0], valueIndex))
    if (matchingChannel) {
      matchingChannel.valueIndices.push(valueIndex)
      continue
    }

    channels.push({
      valueIndices: [valueIndex],
      mean: average,
      scale,
      minimum: Math.min(...values),
      maximum: Math.max(...values),
    })
  }
  return channels
}

/** Creates the mean frame, including values that are constant in the source. */
export function createBaselineFrame(frames: readonly (readonly number[])[]): number[] {
  return Array.from(
    { length: frames[0].length },
    (_, valueIndex) => mean(frames.map(frame => frame[valueIndex])),
  )
}

/** Projects normalized channel values back into a complete, bounded frame. */
export function frameFromChannels(
  baselineFrame: readonly number[],
  channels: readonly Channel[],
  values: readonly number[],
): number[] {
  const frame = [...baselineFrame]
  for (let channelIndex = 0; channelIndex < channels.length; channelIndex++) {
    const channel = channels[channelIndex]
    const rawValue = clamp(
      channel.mean + values[channelIndex] * channel.scale,
      channel.minimum,
      channel.maximum,
    )
    for (const valueIndex of channel.valueIndices)
      frame[valueIndex] = rawValue
  }
  return frame
}
