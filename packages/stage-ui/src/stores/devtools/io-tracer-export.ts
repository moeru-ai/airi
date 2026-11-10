import type { TraceSampleChunk } from '@proj-airi/trace-kit'
import type { TimelineTrack } from '@proj-airi/trace-kit/projections'

import { MAX_CHUNK_POINTS } from '@proj-airi/trace-kit'

/** The source of the series chunks in a saved file. The series of a track mix sources, so they get their own. */
export const EXPORT_SOURCE = 'export'

/**
 * The series of the timeline as `sample.chunk` records, for a saved file.
 *
 * The event log has no samples, so a file of its records alone has no waveforms or levels. The timeline keeps each
 * series on the trace clock, so the chunks use that clock. A chunk holds at most {@link MAX_CHUNK_POINTS} points, so
 * the untrusted ingest of a later replay accepts it.
 */
export function seriesAsSampleChunks(tracks: Iterable<TimelineTrack>, traceClock: string, epoch: string): TraceSampleChunk[] {
  const chunks: TraceSampleChunk[] = []
  for (const track of tracks) {
    for (const [key, series] of Object.entries(track.series)) {
      for (let begin = 0; begin < series.times.length; begin += MAX_CHUNK_POINTS) {
        const times = series.times.subarray(begin, begin + MAX_CHUNK_POINTS)
        const ts = times[0]!
        chunks.push({
          type: 'sample.chunk',
          source: EXPORT_SOURCE,
          epoch,
          seq: chunks.length,
          ts,
          clock: traceClock,
          track: track.path,
          offsetsMs: Array.from(times, time => time - ts),
          values: { [key]: Array.from(series.values.subarray(begin, begin + MAX_CHUNK_POINTS)) },
        })
      }
    }
  }
  return chunks
}
