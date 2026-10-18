import type { IconifyJSON } from '@iconify-json/mingcute'
import type { ComponentRenderProps } from '@openuidev/vue-lang'
import type { FunctionalComponent, VNodeChild } from 'vue'

import { getIconData, iconToSVG, replaceIDs } from '@iconify/utils'
import { createLibrary, defineComponent } from '@openuidev/vue-lang'
import { h, shallowRef } from 'vue'
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

/** A part receives the values of the program as `props`, and `renderNode` draws the parts nested in it. */
function part<P>(render: (props: P, renderNode: (value: unknown) => VNodeChild) => VNodeChild) {
  const component: FunctionalComponent<ComponentRenderProps<P>> = ({ props, renderNode }) => render(props, renderNode as (value: unknown) => VNodeChild)
  component.props = ['props', 'renderNode']
  return component
}

const surface = ['rounded-lg px-2 py-1.5', 'bg-white/75 dark:bg-neutral-800/60']

const Tag = defineComponent({
  name: 'Tag',
  description: 'A small neutral label, for example a state or a category. Write the state as words.',
  props: z.object({ text: z.string() }),
  component: part<{ text: string }>(props => h('span', {
    class: ['shrink-0 rounded-full px-1.5 text-[10px] leading-4', 'bg-neutral-100 text-neutral-500 dark:bg-neutral-700/60 dark:text-neutral-300'],
  }, props.text)),
})

const Row = defineComponent({
  name: 'Row',
  description: 'One line of a list: a title, small gray details under it, an icon, and tags. The icon is a MingCute icon name, for example "github-line" or "time-line". With a web url, the row opens the page.',
  props: z.object({
    title: z.string(),
    details: z.array(z.string()).optional(),
    icon: z.string().optional(),
    tags: z.array(z.string()).optional(),
    url: z.string().optional(),
  }),
  component: part<{ title: string, details?: string[], icon?: string, tags?: string[], url?: string }>((props) => {
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
  }),
})

const Stat = defineComponent({
  name: 'Stat',
  description: 'One large value with its unit and a label, for the number that matters most.',
  props: z.object({
    value: z.union([z.string(), z.number()]),
    label: z.string().optional(),
    unit: z.string().optional(),
  }),
  component: part<{ value: string | number, label?: string, unit?: string }>(props => h('div', { class: ['flex flex-col', ...surface] }, [
    props.label ? h('span', { class: ['text-[11px]', 'text-neutral-500 dark:text-neutral-400'] }, props.label) : null,
    h('span', { class: ['flex items-baseline gap-1'] }, [
      h('span', { class: ['text-lg font-semibold tabular-nums', 'text-primary-600 dark:text-primary-300'] }, String(props.value)),
      props.unit ? h('span', { class: ['text-xs', 'text-neutral-500 dark:text-neutral-400'] }, props.unit) : null,
    ]),
  ])),
})

const Fact = defineComponent({
  name: 'Fact',
  description: 'One label and its value. Use it only inside Facts.',
  props: z.object({ label: z.string(), value: z.union([z.string(), z.number(), z.boolean()]) }),
  component: part<{ label: string, value: string | number | boolean }>(props => [
    h('dt', { class: ['text-neutral-500 dark:text-neutral-400'] }, props.label),
    h('dd', { class: ['m-0 min-w-0 break-words', 'text-neutral-700 dark:text-neutral-200'] }, String(props.value)),
  ]),
})

const Facts = defineComponent({
  name: 'Facts',
  description: 'Labels and values in two columns, for the fields of one item.',
  props: z.object({ items: z.array(Fact.ref) }),
  component: part<{ items: unknown[] }>((props, renderNode) => h('dl', {
    class: ['m-0 grid grid-cols-[max-content_1fr] gap-x-2.5 gap-y-0.5 text-xs', ...surface],
  }, props.items.map(item => renderNode(item)))),
})

const Text = defineComponent({
  name: 'Text',
  description: 'A sentence or a paragraph. Muted text is small and gray.',
  props: z.object({ text: z.string(), muted: z.boolean().optional() }),
  component: part<{ text: string, muted?: boolean }>(props => h('p', {
    class: ['m-0 whitespace-pre-wrap break-words', props.muted ? 'text-[11px] text-neutral-500 dark:text-neutral-400' : 'text-xs text-neutral-700 dark:text-neutral-200'],
  }, props.text)),
})

const Image = defineComponent({
  name: 'Image',
  description: 'An image from a URL, with a short text that says what it shows.',
  props: z.object({ src: z.string(), alt: z.string().optional() }),
  component: part<{ src: string, alt?: string }>(props => h('img', {
    src: props.src,
    alt: props.alt ?? '',
    class: ['max-h-48 max-w-full self-start rounded-lg object-contain'],
  })),
})

const leaves = [Row.ref, Tag.ref, Stat.ref, Facts.ref, Text.ref, Image.ref] as const

const Stack = defineComponent({
  name: 'Stack',
  description: 'Places parts below each other, or side by side when the direction is "row".',
  props: z.object({
    children: z.array(z.union(leaves)),
    direction: z.enum(['column', 'row']).optional(),
  }),
  component: part<{ children: unknown[], direction?: 'column' | 'row' }>((props, renderNode) => h('div', {
    class: [props.direction === 'row' ? 'flex flex-wrap items-start gap-1.5' : 'flex flex-col gap-1.5'],
  }, props.children.map(child => renderNode(child)))),
})

const Card = defineComponent({
  name: 'Card',
  description: 'The whole card, with an optional title line and a MingCute icon name for it. Every other part goes inside it.',
  props: z.object({
    children: z.array(z.union([...leaves, Stack.ref])),
    title: z.string().optional(),
    icon: z.string().optional(),
  }),
  component: part<{ children: unknown[], title?: string, icon?: string }>((props, renderNode) => h('div', { class: ['flex flex-col gap-1.5'] }, [
    props.title
      ? h('span', { class: ['flex items-center gap-1 text-[11px]', 'text-neutral-500 dark:text-neutral-400'] }, [
          iconOf(props.icon, 'text-xs'),
          h('span', { class: ['min-w-0 truncate'] }, props.title),
        ])
      : null,
    ...props.children.map(child => renderNode(child)),
  ])),
})

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
