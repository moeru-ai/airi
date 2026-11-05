import type { RawToolOptions } from '@xsai/tool'

/**
 * Provider-facing contract of the image journal tool.
 * `image-journal.ts` adds the store-backed execution.
 */
export const imageJournalToolDefinition = {
  name: 'image_journal',
  description: 'Manage AI-generated images. Use "create" to generate and display images. An optional "mode" (inline, widget, bg, bg_widget) can override the default character routing preference. Use "apply" to switch to an existing image from the journal.',
  parameters: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['create', 'apply'],
        description: 'Choose "create" to generate a new image, or "apply" to use an existing one.',
      },
      prompt: {
        type: ['string', 'null'],
        description: 'Description for the image (required for "create").',
      },
      title: {
        type: ['string', 'null'],
        description: 'Label for the entry (optional).',
      },
      query: {
        type: ['string', 'null'],
        description: 'Search term for existing images (required for "apply").',
      },
      mode: {
        type: ['string', 'null'],
        enum: ['inline', 'widget', 'bg', 'bg_widget', null],
        description: 'Display mode: "inline" (in chat), "widget" (overlay), "bg" (environment), or "bg_widget" (both). Defaults to character preference.',
      },
    },
    required: [
      'action',
      'prompt',
      'title',
      'query',
      'mode',
    ],
    additionalProperties: false,
  },
} satisfies Omit<RawToolOptions, 'execute'>
