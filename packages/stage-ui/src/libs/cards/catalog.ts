import type { ElementNode } from '@openuidev/lang-core'
import type { VNodeChild } from 'vue'

import { createLibrary, defineComponent } from '@openuidev/lang-core'
import { h } from 'vue'
import { z } from 'zod'

import { SEARCH_ICONS_TOOL_NAME } from '../../tools/search-icons'
import { TablerIcon } from '../tabler-icons'

// The parts that a model can use in a card. They copy the look of the chat's tool widgets, so a card that a model
// writes reads like a widget of the app. A part holds its own look, and the program only arranges parts.

function iconOf(name: string | undefined, extra: string) {
  return name ? h(TablerIcon, { name, class: extra }) : null
}

/** As in the web search widget, only a web page becomes a link. Another scheme leaves the part without a link. */
function webUrl(url: string | undefined) {
  return url && /^https?:\/\//i.test(url) ? url : undefined
}

/** Whether a value is a part as OpenUI evaluates it. */
export function isPartNode(value: unknown): value is ElementNode {
  if (value === null || typeof value !== 'object')
    return false
  const node = value as Partial<ElementNode>
  return node.type === 'element' && typeof node.typeName === 'string' && node.props !== null && typeof node.props === 'object'
}

/** Draws one part from its checked values. `draw` draws the parts nested in it. */
type DrawPart = (props: Record<string, unknown>, draw: (value: unknown) => VNodeChild) => VNodeChild

/**
 * The data fields of each part. A field that holds nested parts holds a list of the parts that its schema names. Each
 * nested part checks its own fields.
 */
const partDataSchemas = new Map<string, z.ZodObject>()
/** The part that each `ref` schema stands for, so a field that holds nested parts knows their names. */
const partNamesOfRefs = new Map<unknown, string>()

/**
 * The check of one item of a field that holds nested parts: one of the parts that the field's schema names, or `null`
 * for a missing value. OpenUI draws nothing for plain data in that place and reports nothing.
 */
function nestedPartOf(field: z.ZodType) {
  const element = field instanceof z.ZodArray ? field.element : field
  const names = (element instanceof z.ZodUnion ? element.options : [element]).flatMap((option) => {
    const name = partNamesOfRefs.get(option)
    return name ? [name] : []
  })
  return z.custom(
    value => value === null || (isPartNode(value) && names.includes(value.typeName)),
    `must be ${names.join(' or ')}, not plain data or another part. Turn each data item into a part with @Each.`,
  )
}

/**
 * The first problem of the values of a part, or undefined when they fit. The values can come from data, so the schema
 * types alone do not hold them. OpenUI writes `null` for a missing value, which counts as an absent field.
 */
export function partProblem(name: string, props: Record<string, unknown>) {
  const schema = partDataSchemas.get(name)
  if (!schema)
    return `${name} is not a part of the card catalog.`
  const parsed = schema.safeParse(Object.fromEntries(Object.entries(props).filter(([, value]) => value !== null)))
  if (parsed.success)
    return undefined
  const issue = parsed.error.issues[0]
  return `${name}${issue?.path.length ? ` ${issue.path.join('.')}` : ''}: ${issue?.message ?? 'invalid value'}`
}

/**
 * Defines a part from its schema and its drawing. The drawing gets the values of the program, typed by the schema. A
 * card checks the values of every part before it draws, so the drawing can trust them.
 */
function definePart<T extends z.ZodObject>(config: {
  name: string
  description: string
  props: T
  /** The fields that hold nested parts. Each of them holds a list of the parts that its schema names. */
  slots?: string[]
  render: (props: z.infer<T>, draw: (value: unknown) => VNodeChild) => VNodeChild
}) {
  partDataSchemas.set(config.name, z.object(Object.fromEntries(Object.entries(config.props.shape)
    .map(([key, field]) => [key, config.slots?.includes(key) ? z.array(nestedPartOf(field as z.ZodType)) : field]))))
  // A field of nested parts can hold null for a missing part, for example from a condition. It draws nothing, so the
  // drawing gets the parts only.
  const component: DrawPart = (props, draw) => config.render({
    ...props,
    ...Object.fromEntries((config.slots ?? []).map(slot => [slot, (props[slot] as unknown[]).filter(item => item !== null)])),
  } as z.infer<T>, draw)
  const part = defineComponent({ name: config.name, description: config.description, props: config.props, component })
  partNamesOfRefs.set(part.ref, config.name)
  return part
}

const surface = ['rounded-lg px-2 py-1.5', 'bg-white/75 dark:bg-neutral-800/60']
const mutedText = 'text-neutral-500 dark:text-neutral-400'
const bodyText = 'text-neutral-700 dark:text-neutral-200'

function textOf(value: unknown) {
  return value === null || value === undefined ? '' : String(value)
}

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
  description: `One item with its own title: small gray details under it, an icon, tags, and a link, for example an issue or a message. Several items with the same fields read better as a Table. The icon is a Tabler icon name that \`${SEARCH_ICONS_TOOL_NAME}\` found.`,
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
          ? h('span', { class: ['flex flex-wrap gap-x-2 text-[11px]', mutedText] }, details.map(detail => h('span', detail)))
          : null,
      ]),
    ])
  },
})

const Stat = definePart({
  name: 'Stat',
  description: 'One large value with its unit and a label, for a number that matters.',
  props: z.object({
    value: z.union([z.string(), z.number()]),
    label: z.string().optional(),
    unit: z.string().optional(),
  }),
  render: props => h('div', { class: ['flex flex-col', ...surface] }, [
    props.label ? h('span', { class: ['text-[11px]', mutedText] }, props.label) : null,
    h('span', { class: ['flex items-baseline gap-1'] }, [
      h('span', { class: ['text-lg font-semibold tabular-nums', 'text-primary-600 dark:text-primary-300'] }, String(props.value)),
      props.unit ? h('span', { class: ['text-xs', mutedText] }, props.unit) : null,
    ]),
  ]),
})

const Fact = definePart({
  name: 'Fact',
  description: 'One label and its value. Use it only inside Facts.',
  props: z.object({ label: z.string(), value: z.union([z.string(), z.number(), z.boolean()]) }),
  render: props => [
    h('dt', { class: [mutedText] }, props.label),
    h('dd', { class: ['m-0 min-w-0 break-words', bodyText] }, String(props.value)),
  ],
})

const Facts = definePart({
  name: 'Facts',
  description: 'Labels and values in two columns, for the fields of one item.',
  props: z.object({ items: z.array(Fact.ref) }),
  slots: ['items'],
  render: (props, draw) => h('dl', {
    class: ['m-0 grid grid-cols-[max-content_1fr] gap-x-2.5 gap-y-0.5 text-xs', ...surface],
  }, props.items.map(item => draw(item))),
})

const Col = definePart({
  name: 'Col',
  description: 'One column of a Table: its label and its values from top to bottom. `data.items.price` gives the values of every item. Use it only inside Table.',
  props: z.object({ label: z.string(), values: z.array(z.union([z.string(), z.number(), z.boolean()]).nullable()) }),
  // A Table draws its columns itself, cell by cell.
  render: () => null,
})

const Table = definePart({
  name: 'Table',
  description: 'Rows and columns, for several items with the same fields or for a comparison. Write it column by column.',
  props: z.object({ columns: z.array(Col.ref) }),
  slots: ['columns'],
  render: (props) => {
    const columns = props.columns.map(column => column.props)
    const rows = Math.max(0, ...columns.map(column => column.values.length))
    // A column of numbers lines up on the right, so its digits line up.
    const numeric = columns.map(column => column.values.every(value => value === null || typeof value === 'number'))
    const cellClass = (index: number) => ['py-1 pr-2 align-top', numeric[index] ? 'text-right tabular-nums' : 'text-left']
    return h('div', { class: ['overflow-x-auto', ...surface] }, h('table', { class: ['w-full border-collapse text-xs'] }, [
      h('thead', h('tr', columns.map((column, index) => h('th', {
        class: [...cellClass(index), 'pt-0 font-medium text-[11px] whitespace-nowrap', mutedText],
      }, column.label)))),
      h('tbody', Array.from({ length: rows }, (_, row) => h('tr', {
        class: ['border-t border-neutral-200/70 dark:border-neutral-700/60'],
      }, columns.map((column, index) => h('td', { class: [...cellClass(index), bodyText] }, textOf(column.values[row])))))),
    ]))
  },
})

const Bar = definePart({
  name: 'Bar',
  description: 'One label and its amount. Use it only inside Bars.',
  props: z.object({ label: z.string(), value: z.number() }),
  // Bars draws each bar against the largest amount.
  render: () => null,
})

const Bars = definePart({
  name: 'Bars',
  description: 'Horizontal bars that compare amounts of one unit. The largest amount fills its bar.',
  props: z.object({ bars: z.array(Bar.ref), unit: z.string().optional() }),
  slots: ['bars'],
  render: (props) => {
    const bars = props.bars.map(bar => bar.props)
    const largest = Math.max(0, ...bars.map(bar => bar.value))
    return h('div', { class: ['grid grid-cols-[minmax(3.5rem,max-content)_1fr_max-content] items-center gap-x-2 gap-y-1 text-[11px]', ...surface] }, bars.flatMap(bar => [
      h('span', { class: ['min-w-0 truncate', bodyText] }, bar.label),
      h('span', { class: ['h-2 overflow-hidden rounded-full', 'bg-neutral-200/70 dark:bg-neutral-700/60'] }, h('span', {
        class: ['block h-full rounded-full', 'bg-primary-400 dark:bg-primary-500'],
        style: { width: `${largest > 0 ? Math.max(0, bar.value) / largest * 100 : 0}%` },
      })),
      h('span', { class: ['tabular-nums', bodyText] }, props.unit ? `${bar.value} ${props.unit}` : String(bar.value)),
    ]))
  },
})

const Point = definePart({
  name: 'Point',
  description: 'One label on the line and its value, for example a day and its temperature. Use it only inside Line.',
  props: z.object({ label: z.string(), value: z.number() }),
  // Line draws its points as one line.
  render: () => null,
})

const Line = definePart({
  name: 'Line',
  description: 'A line of values in order, for a change over time. The axis shows the first and the last label.',
  props: z.object({ points: z.array(Point.ref), unit: z.string().optional() }),
  slots: ['points'],
  render: (props) => {
    const points = props.points.map(point => point.props)
    const values = points.map(point => point.value)
    const low = Math.min(...values)
    const high = Math.max(...values)
    // The chart is 100 wide and 40 high. A flat line sits in the middle.
    const coordinates = points.map((point, index) => {
      const x = points.length > 1 ? index / (points.length - 1) * 100 : 50
      const y = high > low ? 38 - (point.value - low) / (high - low) * 36 : 20
      return `${x},${y}`
    }).join(' ')
    const valueText = (value: number) => props.unit ? `${value} ${props.unit}` : String(value)
    return h('div', { class: ['flex flex-col gap-1 text-[10px]', ...surface] }, [
      h('div', { class: ['flex items-stretch gap-2'] }, [
        points.length > 0
          ? h('span', { class: ['flex flex-col justify-between tabular-nums', mutedText] }, [h('span', valueText(high)), h('span', valueText(low))])
          : null,
        h('svg', { 'viewBox': '0 0 100 40', 'preserveAspectRatio': 'none', 'class': ['h-16 min-w-0 flex-1', 'text-primary-500 dark:text-primary-300'], 'aria-hidden': 'true' }, [
          h('polyline', { 'points': coordinates, 'fill': 'none', 'stroke': 'currentColor', 'stroke-width': 2, 'vector-effect': 'non-scaling-stroke', 'stroke-linejoin': 'round' }),
        ]),
      ]),
      points.length > 0
        ? h('span', { class: ['flex justify-between', mutedText] }, [h('span', points[0]!.label), h('span', points.at(-1)!.label)])
        : null,
    ])
  },
})

const Progress = definePart({
  name: 'Progress',
  description: 'One value against its limit, for example a quota or a step count. The bar shows how full it is.',
  props: z.object({ label: z.string(), value: z.number(), max: z.number(), unit: z.string().optional() }),
  render: (props) => {
    const share = props.max > 0 ? Math.min(1, Math.max(0, props.value / props.max)) : 0
    return h('div', { class: ['flex flex-col gap-1 text-[11px]', ...surface] }, [
      h('span', { class: ['flex justify-between gap-2'] }, [
        h('span', { class: ['min-w-0 truncate', bodyText] }, props.label),
        h('span', { class: ['shrink-0 tabular-nums font-medium', bodyText] }, `${props.value} / ${props.max}${props.unit ? ` ${props.unit}` : ''}`),
      ]),
      h('span', { class: ['h-1.5 overflow-hidden rounded-full', 'bg-neutral-200/70 dark:bg-neutral-700/60'] }, h('span', {
        class: ['block h-full rounded-full', 'bg-primary-500 dark:bg-primary-400'],
        style: { width: `${share * 100}%` },
      })),
    ])
  },
})

const Step = definePart({
  name: 'Step',
  description: 'One step of a Timeline: what happens, and small gray details such as the time or the place. Write a state as words. Use it only inside Timeline.',
  props: z.object({ title: z.string(), detail: z.string().optional() }),
  render: props => h('li', { class: ['relative pb-2 pl-4 last:pb-0'] }, [
    h('span', { 'class': ['absolute left-0.5 top-1.5 size-1.5 rounded-full', 'bg-primary-400 dark:bg-primary-500'], 'aria-hidden': 'true' }),
    h('span', { class: ['block text-xs', 'text-neutral-800 dark:text-neutral-100'] }, props.title),
    props.detail ? h('span', { class: ['block text-[11px]', mutedText] }, props.detail) : null,
  ]),
})

const Timeline = definePart({
  name: 'Timeline',
  description: 'Steps or events in order, for example a schedule, the steps of a recipe or a how-to, or a delivery.',
  props: z.object({ steps: z.array(Step.ref) }),
  slots: ['steps'],
  render: (props, draw) => h('ol', { class: ['m-0 list-none', ...surface] }, props.steps.map(step => draw(step))),
})

const Text = definePart({
  name: 'Text',
  description: 'A sentence or a paragraph. Muted text is small and gray.',
  props: z.object({ text: z.string(), muted: z.boolean().optional() }),
  render: props => h('p', {
    class: ['m-0 whitespace-pre-wrap break-words', props.muted ? `text-[11px] ${mutedText}` : `text-xs ${bodyText}`],
  }, props.text),
})

const Code = definePart({
  name: 'Code',
  description: 'Text as it is, in a monospace block, for example a command output, a file, or a diff.',
  props: z.object({ text: z.string() }),
  render: props => h('pre', {
    class: ['m-0 overflow-x-auto rounded-lg px-2 py-1.5', 'whitespace-pre-wrap break-words font-mono text-[11px]', 'bg-neutral-800 text-neutral-100 dark:bg-neutral-950'],
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

/** The parts that draw their own box, so they line up next to each other in a Grid. */
const boxed = [Stat.ref, Facts.ref, Table.ref, Bars.ref, Line.ref, Progress.ref, Code.ref, Image.ref] as const

const Grid = definePart({
  name: 'Grid',
  description: 'Places parts of the same kind side by side in cells of equal width, for example a few Stats. The cells wrap on a narrow screen.',
  props: z.object({ children: z.array(z.union(boxed)) }),
  slots: ['children'],
  render: (props, draw) => h('div', {
    class: ['grid grid-cols-[repeat(auto-fit,minmax(7rem,1fr))] gap-1.5'],
  }, props.children.map(child => draw(child))),
})

const leaves = [...boxed, Row.ref, Tag.ref, Text.ref, Timeline.ref, Grid.ref] as const

const Stack = definePart({
  name: 'Stack',
  description: 'Places parts below each other, for example the rows of a list.',
  props: z.object({ children: z.array(z.union(leaves)) }),
  slots: ['children'],
  render: (props, draw) => h('div', { class: ['flex flex-col gap-1.5'] }, props.children.map(child => draw(child))),
})

const Card = definePart({
  name: 'Card',
  description: `The whole card, with an optional title line and an icon for it: a Tabler icon name that \`${SEARCH_ICONS_TOOL_NAME}\` found. Every other part goes inside it.`,
  props: z.object({
    children: z.array(z.union([...leaves, Stack.ref])),
    title: z.string().optional(),
    icon: z.string().optional(),
  }),
  slots: ['children'],
  render: (props, draw) => h('div', { class: ['flex flex-col gap-1.5'] }, [
    props.title
      ? h('span', { class: ['flex items-center gap-1 text-[11px]', mutedText] }, [
          iconOf(props.icon, 'text-xs'),
          h('span', { class: ['min-w-0 truncate'] }, props.title),
        ])
      : null,
    ...props.children.map(child => draw(child)),
  ]),
})

/**
 * The parts of a card, as an OpenUI library.
 *
 * The card prompt lists their signatures, the parser checks a program against them, and `drawCard` draws a program
 * with them. Every program starts at `Card`.
 */
export const cardLibrary = createLibrary<DrawPart>({
  components: [Card, Stack, Grid, Row, Tag, Stat, Facts, Fact, Table, Col, Bars, Bar, Line, Point, Progress, Timeline, Step, Text, Code, Image],
  root: 'Card',
})

/** Draws an evaluated card. Each part trusts its values, so the caller draws only a card whose check passed. */
export function drawCard(value: unknown): VNodeChild {
  if (Array.isArray(value))
    return value.map(drawCard)
  if (!isPartNode(value))
    return null
  return cardLibrary.components[value.typeName]?.component(value.props, drawCard) ?? null
}
