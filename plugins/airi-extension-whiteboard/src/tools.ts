import type { GameletHandle } from '@proj-airi/plugin-sdk-stage/kits/gamelet'
import type { PluginToolDefinition } from '@proj-airi/plugin-sdk-stage/tools'
import type { HostDataRecord } from '@proj-airi/plugin-sdk/plugin-host'

const emptyObjectSchema: Record<string, unknown> = {
  type: 'object',
  properties: {},
  required: [],
  additionalProperties: false,
} as const

const canvasIdProperty = { type: 'string', description: 'The canvas id.' } as const
const pointSchema = {
  type: 'object',
  properties: { x: { type: 'number' }, y: { type: 'number' } },
  required: ['x', 'y'],
  additionalProperties: false,
} as const

function commandTool(name: string, description: string, parameters: Record<string, unknown>, gamelet: GameletHandle): PluginToolDefinition<Record<string, unknown>> {
  return {
    id: name,
    title: name,
    description,
    inputSchema: parameters,
    execute: async (input) => {
      if (!input || typeof input !== 'object' || Array.isArray(input)) {
        throw new Error(`Input for \`${name}\` must be an object.`)
      }
      await gamelet.open()
      return await gamelet.request({ type: name, ...input } as HostDataRecord)
    },
  }
}

/** Returns the nine model tools owned by the whiteboard extension. */
export function createWhiteboardTools(gamelet: GameletHandle): Array<PluginToolDefinition<Record<string, unknown>>> {
  return [
    commandTool('create_canvas', 'Create a whiteboard canvas and make it active.', {
      type: 'object',
      properties: {
        name: { type: 'string' },
        width: { type: 'number', exclusiveMinimum: 0 },
        height: { type: 'number', exclusiveMinimum: 0 },
        background: { type: 'string' },
      },
      required: [],
      additionalProperties: false,
    }, gamelet),
    commandTool('list_canvases', 'List local whiteboard canvases.', emptyObjectSchema, gamelet),
    commandTool('get_canvas', 'Get the active canvas or one canvas by id.', {
      type: 'object',
      properties: { canvasId: canvasIdProperty },
      required: [],
      additionalProperties: false,
    }, gamelet),
    commandTool('delete_canvas', 'Delete one canvas by id.', {
      type: 'object',
      properties: { canvasId: canvasIdProperty },
      required: ['canvasId'],
      additionalProperties: false,
    }, gamelet),
    commandTool('add_path', 'Add a freehand path to a canvas.', {
      type: 'object',
      properties: {
        canvasId: canvasIdProperty,
        points: { type: 'array', items: pointSchema },
        color: { type: 'string' },
        width: { type: 'number', exclusiveMinimum: 0 },
      },
      required: ['points'],
      additionalProperties: false,
    }, gamelet),
    commandTool('remove_path', 'Remove one freehand path from a canvas.', {
      type: 'object',
      properties: { canvasId: canvasIdProperty, pathId: { type: 'string' } },
      required: ['pathId'],
      additionalProperties: false,
    }, gamelet),
    commandTool('add_text', 'Add text to a canvas.', {
      type: 'object',
      properties: {
        canvasId: canvasIdProperty,
        value: { type: 'string' },
        x: { type: 'number' },
        y: { type: 'number' },
        color: { type: 'string' },
        fontSize: { type: 'number' },
      },
      required: ['value', 'x', 'y'],
      additionalProperties: false,
    }, gamelet),
    commandTool('undo', 'Undo the last whiteboard change.', emptyObjectSchema, gamelet),
    commandTool('redo', 'Redo the last undone whiteboard change.', emptyObjectSchema, gamelet),
  ]
}
