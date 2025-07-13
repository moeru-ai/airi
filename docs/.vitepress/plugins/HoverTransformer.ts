import type { Element, Text } from 'hast'
import type { ShikiTransformer } from 'shiki'

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { components as componentsObj } from 'reka-ui/constant'

const __dirname = dirname(fileURLToPath(import.meta.url))

function extractAndTransformData(tagName: string, raw: string): Element | null {
  const match = raw.match(new RegExp(`<${tagName} :data="(\\[.*?\\])" \\/>`, 's'))
  if (match && match[1]) {
    return {
      type: 'element',
      tagName: 'link-hover-card-content',
      properties: {
        title: tagName.toLowerCase().replace('table', ''),
        data: match[1].replace(/'/g, '"'),
      },
      children: [],
    }
  }
  return null
}

export function createHoverTransformer(): ShikiTransformer {
  const contentMap = new Map<string, Element[]>()

  return {
    name: 'custom:hover-card',
    preprocess(code, options) {
      // Reference
      // https://github.com/shikijs/shiki/blob/5cf4b3c24baef51df44618e3d2652102fdddc794/packages/vitepress-twoslash/src/index.ts
      // https://github.com/shikijs/shiki/blob/5cf4b3c24baef51df44618e3d2652102fdddc794/packages/twoslash/src/renderer-rich.ts
      // https://github.com/shikijs/shiki/blob/5cf4b3c24baef51df44618e3d2652102fdddc794/packages/vitepress-twoslash/src/renderer-floating-vue.ts

      if (options.lang === 'vue') {
        // Disable v-pre for this transformer, because we need to render `LinkHoverCard`
        const vPre = options.transformers?.find(i => i.name === 'vitepress:v-pre')
        if (vPre)
          options.transformers?.splice(options.transformers.indexOf(vPre), 1)
      }
    },
    code() {
      if (this.options.lang !== 'vue')
        return

      const component = Object.values(componentsObj).flat()
      // Build a map of tokens to their line and character position
      const tokensMap: [line: number, charStart: number, charEnd: number, token: Element | Text, value: string][] = []
      this.lines.forEach((lineEl, line) => {
        let index = 0
        for (const token of lineEl.children.flatMap(i => i.type === 'element' ? i.children || [] : []) as (Text | Element)[]) {
          if ('value' in token && typeof token.value === 'string') {
            const value = token.value
            if (component.includes(value)) {
              tokensMap.push([line, index, index + value.length, token, value])
              index += value.length

              if (!contentMap.get(value)) {
                try {
                  const raw = readFileSync(join(__dirname, `../../content/meta/${value}.md`), 'utf8')

                  const content = ['PropsTable', 'EmitsTable', 'SlotsTable', 'MethodsTable']
                    .map(tag => extractAndTransformData(tag, raw))
                    .filter((element): element is Element => element !== null)

                  contentMap.set(value, content)
                }
                catch {
                  // File doesn't exist
                }
              }
            }
          }
        }
      })

      // We excluded vPre transformer during preprocess so that we can render `LinkHoverCard` component
      // However this causes some code to be executed instead of just being rendered as string
      // Temporary using hacky way to add `v-pre` to each line.
      const ignoredPreLine = tokensMap.map(i => i[0])
      this.lines.forEach((lineEl, line) => {
        if (!ignoredPreLine.includes(line)) {
          lineEl.properties['v-pre'] = ''
        }
      })

      if (tokensMap.length) {
        tokensMap.forEach(([,,,token, value]) => {
          if (!contentMap.has(value))
            return

          Object.assign(token, {
            type: 'element',
            tagName: 'link-hover-card',
            properties: {
              name: value,
            },
            children: [
              { ...token },
              {
                type: 'element',
                tagName: 'template',
                properties: {
                  'v-slot:content': '{}',
                },
                children: [],
                content: {
                  type: 'root',
                  children: contentMap.get(value) ?? [],
                },
              },
            ],
          } satisfies Element)
        })
      }
    },
  }
}
