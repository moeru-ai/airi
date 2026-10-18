import type { IconifyJSON } from '@iconify-json/mingcute'
import type { OpenUIError } from '@openuidev/lang-core'
import type { ComponentRenderProps } from '@openuidev/vue-lang'
import type { FunctionalComponent, InjectionKey, VNodeChild } from 'vue'

import { getIconData, iconToSVG, replaceIDs } from '@iconify/utils'
import { errorMessageFrom } from '@moeru/std'
import { createParser, createStore, evaluate, evaluateElementProps } from '@openuidev/lang-core'
import { createLibrary, defineComponent, useIsQueryLoading } from '@openuidev/vue-lang'
import { h, inject, shallowRef } from 'vue'
import { z } from 'zod'

// The parts that a model can use in a tool card. They copy the look of the widgets in this folder, so a card that a
// model writes reads like a widget of the app. A part holds its own behavior, and the program only arranges parts.

/** The icon set of every card icon. It loads on first use, so the app does not carry 1.5 MB of icons until a card needs one. */
let iconSet: Promise<IconifyJSON> | undefined
const loadedIconSet = shallowRef<IconifyJSON>()

/**
 * Loads the MingCute icons, once. A program can name any of them, so they do not go through UnoCSS, which only
 * generates icons whose class a scanned file writes out.
 */
export function loadCardIcons() {
  iconSet ??= import('@iconify-json/mingcute').then(({ icons }) => {
    loadedIconSet.value = icons
    return icons
  })
  return iconSet
}

/** Draws a MingCute icon by name. An unknown name, or an icon set that is still loading, draws nothing. */
const CardIcon: FunctionalComponent<{ name?: string }> = (props, { attrs }) => {
  if (!props.name)
    return null
  if (!loadedIconSet.value) {
    void loadCardIcons()
    return null
  }
  const data = getIconData(loadedIconSet.value, props.name)
  if (!data)
    return null
  const { attributes, body } = iconToSVG(data, { height: '1em' })
  return h('svg', { ...attributes, ...attrs, 'aria-hidden': 'true', 'innerHTML': replaceIDs(body) })
}
CardIcon.props = ['name']
// The caller's class goes on the svg through `attrs`, so Vue must not add it a second time.
CardIcon.inheritAttrs = false

function iconOf(name: string | undefined, extra: string) {
  return name ? h(CardIcon, { name, class: extra }) : null
}

/** As in the web search widget, only a web page becomes a link. Another scheme leaves the part without a link. */
function webUrl(url: string | undefined) {
  return url && /^https?:\/\//i.test(url) ? url : undefined
}

/**
 * Where a card hears about a part that cannot draw its values. The part draws nothing, so without this the card would
 * lose the part without a sign. OpenUI catches errors of each part itself and does not report them.
 */
export const CARD_PROBLEM: InjectionKey<(problem: string) => void> = Symbol('tool-card-problem')

/** The data fields of each part, without the fields that hold nested parts. Each nested part checks its own fields. */
const partDataSchemas = new Map<string, z.ZodObject>()

/**
 * The first problem of the values of a part, or undefined when they fit. The values come from data at runtime, so the
 * schema types alone do not hold them. OpenUI writes `null` for a missing value, which counts as an absent field.
 */
function partProblem(name: string, props: unknown) {
  const schema = partDataSchemas.get(name)
  if (!schema || props === null || typeof props !== 'object')
    return undefined
  const parsed = schema.safeParse(Object.fromEntries(Object.entries(props).filter(([, value]) => value !== null)))
  if (parsed.success)
    return undefined
  const issue = parsed.error.issues[0]
  return `${name}${issue?.path.length ? ` ${issue.path.join('.')}` : ''}: ${issue?.message ?? 'invalid value'}`
}

/**
 * Defines a part from its schema and its drawing. The drawing gets the values of the program as `props`, typed by the
 * schema, and `renderNode`, which draws the parts nested in it. Values that do not fit draw nothing and report a problem.
 */
function definePart<T extends z.ZodObject>(config: {
  name: string
  description: string
  props: T
  /** The fields that hold nested parts. */
  slots?: string[]
  render: (props: z.infer<T>, renderNode: (value: unknown) => VNodeChild) => VNodeChild
}) {
  partDataSchemas.set(config.name, z.object(Object.fromEntries(Object.entries(config.props.shape).filter(([key]) => !config.slots?.includes(key)))))
  const component: FunctionalComponent<ComponentRenderProps<z.infer<T>>> = ({ props, renderNode }) => {
    const problem = partProblem(config.name, props)
    if (problem) {
      // Before the data arrives, a part draws the Query defaults, which can be empty. Only values from the data count.
      if (!useIsQueryLoading().value)
        inject(CARD_PROBLEM, undefined)?.(problem)
      return null
    }
    return config.render(props, renderNode as (value: unknown) => VNodeChild)
  }
  component.props = ['props', 'renderNode']
  return defineComponent({ name: config.name, description: config.description, props: config.props, component })
}

const surface = ['rounded-lg px-2 py-1.5', 'bg-white/75 dark:bg-neutral-800/60']

const Tag = definePart({
  name: 'Tag',
  description: 'A small neutral label, for example a state or a category. Write the state as words.',
  props: z.object({ text: z.string() }),
  render: props => h('span', {
    class: ['shrink-0 rounded-full px-1.5 text-[10px] leading-4', 'bg-neutral-100 text-neutral-500 dark:bg-neutral-700/60 dark:text-neutral-300'],
  }, props.text),
})

const Row = definePart({
  name: 'Row',
  description: 'One line of a list: a title, small gray details under it, an icon, and tags. The icon is a MingCute icon name, for example "github-line" or "time-line". With a web url, the row opens the page.',
  props: z.object({
    title: z.string(),
    details: z.array(z.string()).optional(),
    icon: z.string().optional(),
    tags: z.array(z.string()).optional(),
    url: z.string().optional(),
  }),
  render: (props) => {
    const href = webUrl(props.url)
    const details = (props.details ?? []).filter(detail => detail !== '')
    return h(href ? 'a' : 'div', {
      href,
      target: href ? '_blank' : undefined,
      rel: href ? 'noopener noreferrer' : undefined,
      class: [
        'flex items-start gap-2 outline-none',
        ...surface,
        href ? 'transition-colors duration-200 hover:bg-white dark:hover:bg-neutral-800 focus-visible:ring-2 focus-visible:ring-primary-400/60' : '',
      ],
    }, [
      iconOf(props.icon, 'mt-0.5 shrink-0 text-sm text-primary-500 dark:text-primary-300'),
      h('span', { class: ['min-w-0 flex flex-1 flex-col'] }, [
        h('span', { class: ['flex flex-wrap items-center gap-1.5'] }, [
          h('span', { class: ['min-w-0 text-xs', 'text-neutral-800 dark:text-neutral-100'] }, props.title),
          ...(props.tags ?? []).map(tag => h('span', {
            class: ['shrink-0 rounded-full px-1.5 text-[10px] leading-4', 'bg-neutral-100 text-neutral-500 dark:bg-neutral-700/60 dark:text-neutral-300'],
          }, tag)),
        ]),
        details.length > 0
          ? h('span', { class: ['flex flex-wrap gap-x-2 text-[11px]', 'text-neutral-500 dark:text-neutral-400'] }, details.map(detail => h('span', detail)))
          : null,
      ]),
    ])
  },
})

const Stat = definePart({
  name: 'Stat',
  description: 'One large value with its unit and a label, for the number that matters most.',
  props: z.object({
    value: z.union([z.string(), z.number()]),
    label: z.string().optional(),
    unit: z.string().optional(),
  }),
  render: props => h('div', { class: ['flex flex-col', ...surface] }, [
    props.label ? h('span', { class: ['text-[11px]', 'text-neutral-500 dark:text-neutral-400'] }, props.label) : null,
    h('span', { class: ['flex items-baseline gap-1'] }, [
      h('span', { class: ['text-lg font-semibold tabular-nums', 'text-primary-600 dark:text-primary-300'] }, String(props.value)),
      props.unit ? h('span', { class: ['text-xs', 'text-neutral-500 dark:text-neutral-400'] }, props.unit) : null,
    ]),
  ]),
})

const Fact = definePart({
  name: 'Fact',
  description: 'One label and its value. Use it only inside Facts.',
  props: z.object({ label: z.string(), value: z.union([z.string(), z.number(), z.boolean()]) }),
  render: props => [
    h('dt', { class: ['text-neutral-500 dark:text-neutral-400'] }, props.label),
    h('dd', { class: ['m-0 min-w-0 break-words', 'text-neutral-700 dark:text-neutral-200'] }, String(props.value)),
  ],
})

const Facts = definePart({
  name: 'Facts',
  description: 'Labels and values in two columns, for the fields of one item.',
  props: z.object({ items: z.array(Fact.ref) }),
  slots: ['items'],
  render: (props, renderNode) => h('dl', {
    class: ['m-0 grid grid-cols-[max-content_1fr] gap-x-2.5 gap-y-0.5 text-xs', ...surface],
  }, props.items.map(item => renderNode(item))),
})

const Text = definePart({
  name: 'Text',
  description: 'A sentence or a paragraph. Muted text is small and gray.',
  props: z.object({ text: z.string(), muted: z.boolean().optional() }),
  render: props => h('p', {
    class: ['m-0 whitespace-pre-wrap break-words', props.muted ? 'text-[11px] text-neutral-500 dark:text-neutral-400' : 'text-xs text-neutral-700 dark:text-neutral-200'],
  }, props.text),
})

const Image = definePart({
  name: 'Image',
  description: 'An image from a URL, with a short text that says what it shows.',
  props: z.object({ src: z.string(), alt: z.string().optional() }),
  render: props => h('img', {
    src: props.src,
    alt: props.alt ?? '',
    class: ['max-h-48 max-w-full self-start rounded-lg object-contain'],
  }),
})

const leaves = [Row.ref, Tag.ref, Stat.ref, Facts.ref, Text.ref, Image.ref] as const

const Stack = definePart({
  name: 'Stack',
  description: 'Places parts below each other, or side by side when the direction is "row".',
  props: z.object({
    children: z.array(z.union(leaves)),
    direction: z.enum(['column', 'row']).optional(),
  }),
  slots: ['children'],
  render: (props, renderNode) => h('div', {
    class: [props.direction === 'row' ? 'flex flex-wrap items-start gap-1.5' : 'flex flex-col gap-1.5'],
  }, props.children.map(child => renderNode(child))),
})

const Card = definePart({
  name: 'Card',
  description: 'The whole card, with an optional title line and a MingCute icon name for it. Every other part goes inside it.',
  props: z.object({
    children: z.array(z.union([...leaves, Stack.ref])),
    title: z.string().optional(),
    icon: z.string().optional(),
  }),
  slots: ['children'],
  render: (props, renderNode) => h('div', { class: ['flex flex-col gap-1.5'] }, [
    props.title
      ? h('span', { class: ['flex items-center gap-1 text-[11px]', 'text-neutral-500 dark:text-neutral-400'] }, [
          iconOf(props.icon, 'text-xs'),
          h('span', { class: ['min-w-0 truncate'] }, props.title),
        ])
      : null,
    ...props.children.map(child => renderNode(child)),
  ]),
})

/** OpenUI shows its own spinner while a Query loads. A card gets its data at once, so it shows none. */
export const NoQueryLoader: FunctionalComponent = () => null

/**
 * The parts of a tool card, as an OpenUI library.
 *
 * The prompt of the card agent lists their signatures, the parser checks a program against them, and the renderer
 * draws a program with them. Every program starts at `Card`.
 */
export const toolCardLibrary = createLibrary({
  components: [Card, Stack, Row, Tag, Stat, Facts, Fact, Text, Image],
  root: 'Card',
})

const programParser = createParser(toolCardLibrary.toJSONSchema(), 'Card')
/** A tool name in a Query is a string literal, so it evaluates without state or references. */
const LITERAL_CONTEXT = { getState: () => null, resolveRef: () => null }

/** Every part of a drawn card, with its evaluated values. */
function partsOf(value: unknown, parts: { typeName: string, props: Record<string, unknown> }[] = []) {
  if (Array.isArray(value)) {
    for (const item of value)
      partsOf(item, parts)
  }
  else if (value !== null && typeof value === 'object') {
    const node = value as { type?: unknown, typeName?: unknown, props?: Record<string, unknown> }
    if (node.type === 'element' && typeof node.typeName === 'string' && node.props) {
      parts.push({ typeName: node.typeName, props: node.props })
      for (const prop of Object.values(node.props))
        partsOf(prop, parts)
    }
  }
  return parts
}

/**
 * The problems that keep a program from drawing. The model reads them and fixes the program.
 *
 * A tool card passes the tool and a sample result: its program must read every value through `Query(key)`, and it is
 * drawn with the sample. A reply card passes nothing: its program holds every value, so it must not query.
 */
export async function problemsOfProgram(program: string, query?: { key: string, sample: unknown }): Promise<string[]> {
  const parsed = programParser.parse(program)
  const problems = parsed.meta.errors.map(error => `${error.statementId ?? error.component}${error.path ? ` ${error.path}` : ''}: ${error.message}`)
  if (query && !parsed.queryStatements.some(statement => statement.toolAST && evaluate(statement.toolAST, LITERAL_CONTEXT) === query.key))
    problems.push(`The program must read the result with \`Query("${query.key}", {}, defaults)\` instead of fixed values.`)
  if (!query && parsed.queryStatements.length > 0)
    problems.push('Remove every Query. Write every value into the program.')
  if (parsed.mutationStatements.length > 0)
    problems.push('Remove every Mutation. A card only shows a result.')
  if (!parsed.root) {
    problems.push('No statement renders a Card. Start the program with `root = Card(...)`.')
    return problems
  }

  // The values are evaluated here as the chat will evaluate them, with the sample for a tool card, and each part checks
  // them as it does before it draws. A value that fails, does not fit its part, or names an icon that MingCute does not
  // have shows now, while the model can still fix it.
  const store = createStore()
  store.initialize(parsed.stateDeclarations ?? {}, {})
  const queries = new Set(parsed.queryStatements.map(query => query.statementId))
  try {
    const errors: OpenUIError[] = []
    const drawn = evaluateElementProps(parsed.root, {
      ctx: { getState: name => store.get(name) ?? null, resolveRef: name => query && queries.has(name) ? query.sample : null },
      library: toolCardLibrary,
      store,
      errors,
    })
    problems.push(...errors.map(error => `${error.statementId ?? error.component ?? 'program'}: ${error.message}`))
    const icons = await loadCardIcons()
    for (const part of partsOf(drawn)) {
      const problem = partProblem(part.typeName, part.props)
      if (problem)
        problems.push(problem)
      const icon = part.props.icon
      if (typeof icon === 'string' && icon && !getIconData(icons, icon))
        problems.push(`"${icon}" is not a MingCute icon name. Use a MingCute name such as "github-line", or leave the icon out.`)
    }
  }
  catch (error) {
    problems.push(`Drawing the card failed: ${errorMessageFrom(error) ?? 'unknown error'}`)
  }
  return problems
}

/**
 * How to write the program of a reply card. The draw tool returns it on its first call, so a turn without a card does
 * not carry it.
 */
export function replyCardRules() {
  return toolCardLibrary.prompt({
    preamble: 'These are the rules for the `program` argument of the card tool. The program is openui-lang, a declarative UI language. Write it only in that argument, never in your reply text.',
    toolCalls: false,
    bindings: false,
    additionalRules: [
      'Write every value into the program. A reply card has no Query and no tools.',
      'Keep the card small: the answer first, then the few facts that support it.',
    ],
  })
}
