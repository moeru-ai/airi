/**
 * Parser for FFmpeg loudnorm filter output.
 * Extracts measured loudness values from the second-pass JSON output.
 */
export interface LoudnormMeasurement {
  inputI: number
  inputTp: number
  inputLra: number
  inputThresh: number
  outputI: number
  outputTp: number
  outputLra: number
  outputThresh: number
}

const JSON_BLOCK_RE = /\{[^{}]*"input_i"\s*:\s*"[^"]*"[^{}]*"output_i"\s*:\s*"[^"]*"[^{}]*\}/
const FIELD_LINE_RE = /(?:input_i|input_tp|input_lra|input_thresh|output_i|output_tp|output_lra|output_thresh)\s*:\s*(-?[\d.]+)/g

/**
 * Parse loudnorm measurement from FFmpeg stderr output.
 * FFmpeg outputs a JSON block in stderr when loudnorm runs with print_format=json.
 */
export function parseLoudnormOutput(
  stderr: string,
): LoudnormMeasurement | null {
  const jsonBlockMatch = stderr.match(JSON_BLOCK_RE)

  if (!jsonBlockMatch) {
    const fields: Record<string, number> = {}
    let match: RegExpExecArray | null
    while ((match = FIELD_LINE_RE.exec(stderr)) !== null) {
      const fieldName = match[0].split(':')[0].trim()
      fields[fieldName] = Number.parseFloat(match[1])
    }
    if (Object.keys(fields).length >= 8) {
      return {
        inputI: fields.input_i ?? 0,
        inputTp: fields.input_tp ?? 0,
        inputLra: fields.input_lra ?? 0,
        inputThresh: fields.input_thresh ?? 0,
        outputI: fields.output_i ?? 0,
        outputTp: fields.output_tp ?? 0,
        outputLra: fields.output_lra ?? 0,
        outputThresh: fields.output_thresh ?? 0,
      }
    }
    return null
  }

  try {
    const raw = JSON.parse(jsonBlockMatch[0]) as Record<string, string>
    return {
      inputI: Number.parseFloat(raw.input_i),
      inputTp: Number.parseFloat(raw.input_tp),
      inputLra: Number.parseFloat(raw.input_lra),
      inputThresh: Number.parseFloat(raw.input_thresh),
      outputI: Number.parseFloat(raw.output_i),
      outputTp: Number.parseFloat(raw.output_tp),
      outputLra: Number.parseFloat(raw.output_lra),
      outputThresh: Number.parseFloat(raw.output_thresh),
    }
  }
  catch {
    return null
  }
}
