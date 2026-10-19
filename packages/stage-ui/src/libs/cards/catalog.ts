import type { IconifyJSON } from '@iconify-json/mingcute'
import type { ElementNode } from '@openuidev/lang-core'
import type { FunctionalComponent, VNodeChild } from 'vue'

import { getIconData, iconToSVG, replaceIDs } from '@iconify/utils'
import { createLibrary, defineComponent } from '@openuidev/lang-core'
import { h, shallowRef } from 'vue'
import { z } from 'zod'

// The parts that a model can use in a card. They copy the look of the chat's tool widgets, so a card that a model
// writes reads like a widget of the app. A part holds its own look, and the program only arranges parts.

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
 * The data fields of each part. A field that holds nested parts must hold a list of parts. Each nested part checks its
 * own fields.
 */
const partDataSchemas = new Map<string, z.ZodObject>()

/** One item of a field that holds nested parts: a part of this catalog, or `null` for a missing value. */
const nestedPart = z.custom(
  value => value === null || (isPartNode(value) && partDataSchemas.has(value.typeName)),
  'must be a part, not plain data. Turn each data item into a part with @Each.',
)

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
  /** The fields that hold nested parts. Each of them holds a list of parts. */
  slots?: string[]
  render: (props: z.infer<T>, draw: (value: unknown) => VNodeChild) => VNodeChild
}) {
  partDataSchemas.set(config.name, z.object(Object.fromEntries(Object.entries(config.props.shape)
    .map(([key, field]) => [key, config.slots?.includes(key) ? z.array(nestedPart) : field]))))
  const component: DrawPart = (props, draw) => config.render(props as z.infer<T>, draw)
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
  description: 'One line of a list: a title, small gray details under it, an icon, and tags. The icon is a MingCute icon name, for example "github-line". With a web url, the row opens the page.',
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
  render: (props, draw) => h('dl', {
    class: ['m-0 grid grid-cols-[max-content_1fr] gap-x-2.5 gap-y-0.5 text-xs', ...surface],
  }, props.items.map(item => draw(item))),
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
  render: (props, draw) => h('div', {
    class: [props.direction === 'row' ? 'flex flex-wrap items-start gap-1.5' : 'flex flex-col gap-1.5'],
  }, props.children.map(child => draw(child))),
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
  render: (props, draw) => h('div', { class: ['flex flex-col gap-1.5'] }, [
    props.title
      ? h('span', { class: ['flex items-center gap-1 text-[11px]', 'text-neutral-500 dark:text-neutral-400'] }, [
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
 * The prompts list their signatures, the parser checks a program against them, and `drawCard` draws a program with
 * them. Every program starts at `Card`.
 */
export const cardLibrary = createLibrary<DrawPart>({
  components: [Card, Stack, Row, Tag, Stat, Facts, Fact, Text, Image],
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
