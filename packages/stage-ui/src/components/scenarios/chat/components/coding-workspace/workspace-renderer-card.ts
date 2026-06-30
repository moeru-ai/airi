import type { ChatToolCallRendererProps } from '../tool-call-renderer'
import type { WorkspaceRendererModel } from './model'

import { computed, defineComponent, h, ref } from 'vue'

const toneClasses: Record<WorkspaceRendererModel['tone'], string> = {
  neutral:
    'border-neutral-200/70 bg-neutral-50/70 text-neutral-800 dark:border-neutral-800 dark:bg-neutral-900/60 dark:text-neutral-200',
  info: 'border-sky-200/70 bg-sky-50/70 text-sky-900 dark:border-sky-900/60 dark:bg-sky-950/40 dark:text-sky-100',
  success:
    'border-emerald-200/70 bg-emerald-50/70 text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-100',
  warning:
    'border-amber-200/70 bg-amber-50/70 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-100',
  danger: 'border-red-200/70 bg-red-50/70 text-red-900 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-100',
}

const rowToneClasses: Record<NonNullable<WorkspaceRendererModel['rows'][number]['tone']>, string> = {
  neutral: 'border-neutral-200/70 dark:border-neutral-800',
  info: 'border-sky-200/80 dark:border-sky-900/60',
  success: 'border-emerald-200/80 dark:border-emerald-900/60',
  warning: 'border-amber-200/80 dark:border-amber-900/60',
  danger: 'border-red-200/80 dark:border-red-900/60',
}

function stateIcon(state: WorkspaceRendererModel['state']): string {
  if (state === 'executing') {
    return 'i-eos-icons:loading'
  }

  if (state === 'error') {
    return 'i-solar:danger-circle-bold-duotone text-red-500'
  }

  return 'i-solar:check-circle-bold-duotone text-emerald-500'
}

export function createWorkspaceRendererCard(
  name: string,
  createModel: (props: ChatToolCallRendererProps) => WorkspaceRendererModel,
) {
  return defineComponent({
    name,
    props: {
      toolName: {
        type: String,
        required: true,
      },
      args: {
        type: String,
        required: true,
      },
      state: {
        type: String,
        required: false,
        default: undefined,
      },
      result: {
        required: false,
        default: undefined,
      },
    },
    setup(props) {
      const expanded = ref(false)
      const model = computed(() =>
        createModel({
          toolName: props.toolName,
          args: props.args,
          state: props.state as ChatToolCallRendererProps['state'],
          result: props.result,
        }),
      )

      return () =>
        h(
          'section',
          {
            class: [
              'w-full overflow-hidden rounded-lg border px-2 py-1.5 text-xs shadow-sm',
              toneClasses[model.value.tone],
            ],
          },
          [
            h(
              'button',
              {
                type: 'button',
                class: 'grid w-full grid-cols-[auto_1fr_auto] items-center gap-2 text-left',
                'aria-expanded': expanded.value ? 'true' : 'false',
                onClick: () => {
                  expanded.value = !expanded.value
                },
              },
              [
                h('span', { class: ['size-4 shrink-0', stateIcon(model.value.state)] }),
                h('span', { class: 'min-w-0' }, [
                  h('span', { class: 'flex min-w-0 items-center gap-1.5' }, [
                    h('span', { class: ['size-3.5 shrink-0 opacity-70', model.value.icon] }),
                    h('span', { class: 'truncate font-medium' }, model.value.title),
                    model.value.backend
                      ? h(
                          'span',
                          {
                            class: 'rounded bg-black/5 px-1 py-0.25 text-[10px] uppercase opacity-70 dark:bg-white/10',
                          },
                          model.value.backend,
                        )
                      : undefined,
                  ]),
                  h('span', { class: 'block truncate text-[11px] opacity-70' }, model.value.summary),
                ]),
                h('span', {
                  class: [
                    'i-solar:alt-arrow-down-linear size-3.5 shrink-0 opacity-55 transition-transform',
                    expanded.value ? 'rotate-180' : '',
                  ],
                  'aria-hidden': 'true',
                }),
              ],
            ),
            expanded.value
              ? h('div', { class: 'mt-2 space-y-1.5' }, [
                  model.value.rows.length > 0
                    ? h(
                        'div',
                        { class: 'space-y-1' },
                        model.value.rows.map((row) =>
                          h(
                            'div',
                            {
                              class: [
                                'rounded-md border bg-white/45 px-2 py-1 dark:bg-black/15',
                                rowToneClasses[row.tone ?? 'neutral'],
                              ],
                            },
                            [
                              h('div', { class: 'flex min-w-0 items-center justify-between gap-2' }, [
                                h('span', { class: 'truncate font-medium' }, row.title),
                                row.meta
                                  ? h('span', { class: 'shrink-0 text-[10px] opacity-55' }, row.meta)
                                  : undefined,
                              ]),
                              row.detail
                                ? h(
                                    'div',
                                    { class: 'mt-0.5 line-clamp-2 break-words text-[11px] opacity-70' },
                                    row.detail,
                                  )
                                : undefined,
                            ],
                          ),
                        ),
                      )
                    : undefined,
                  h(
                    'pre',
                    {
                      class:
                        'max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-md bg-black/5 p-2 font-mono text-[11px] dark:bg-white/5',
                    },
                    model.value.detail,
                  ),
                ])
              : undefined,
          ],
        )
    },
  })
}
