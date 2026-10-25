import type { Plugin } from 'vite'
import type { SFCDescriptor, SFCTemplateBlock } from 'vue/compiler-sfc'

import { access, readFile } from 'node:fs/promises'

import { SETTINGS_SEARCH_ATTRIBUTE } from '@proj-airi/stage-shared/settings-search'
import { babelParse, MagicString, parse } from 'vue/compiler-sfc'

type TemplateRoot = NonNullable<SFCTemplateBlock['ast']>
type TemplateChild = TemplateRoot['children'][number]
type TemplateElement = Extract<TemplateChild, { tag: string }>
type ScriptProgram = ReturnType<typeof babelParse>['program']
type Statement = ScriptProgram['body'][number]
type Expression = Extract<Statement, { type: 'ExpressionStatement' }>['expression']

/** The fields of a route node that the scan reads and writes. `vue-router/vite` passes an `EditableTreeNode`. */
export interface SettingsSearchRouteNode {
  readonly fullPath: string
  readonly component: string | undefined
  readonly meta: Readonly<Record<string, unknown>>
  addToMeta: (meta: Record<string, unknown>) => void
}

/** A setting name that the scan cannot read, so search cannot find it. */
interface UnreadableName {
  file: string
  line: number
  expression: string
}

interface ImportBinding {
  source: string
  imported: string
}

/**
 * A setting that a component renders.
 *
 * `conditions` lists the runtime conditions around the setting, outermost first. Each one is a `v-if`, `v-else`, or `v-show`
 * that the build cannot decide, such as the current model type. The setting shows only when all of them hold.
 */
interface ScanEntry {
  key: string
  conditions: string[]
}

/** What a component adds to the page that renders it. */
interface ComponentScan {
  /** The settings that the component renders on the page, in document order. */
  entries: ScanEntry[]
  /** Whether the component marks rows of runtime items itself, with a bound `:data-settings-search`. */
  marksItems: boolean
  /**
   * The runtime conditions around the default slot, such as the `v-if="visible"` of a collapsible section.
   * Content passed to the component shows only when they hold.
   */
  slotConditions: string[]
  /** Whether every slot of the component renders inside an overlay or a notice, so content passed to it is not on the page. */
  slotsHidden: boolean
}

/** What a condition can use: the constants of its file, the static props of the usage, and the imports. */
interface EvaluationContext {
  file: string
  statics: ReadonlyMap<string, unknown>
  imports: ReadonlyMap<string, ImportBinding>
}

/** The result of a condition that depends on runtime state, such as a store. */
const UNKNOWN = Symbol('unknown')

type TemplateLiteralNode = Extract<Expression, { type: 'TemplateLiteral' }>

/** A translation helper, such as `const tn = (key: string) => t(`prefix.${key}`)`. A call such as `tn('enable')` names the key that it builds. */
interface TranslationHelper {
  param: string
  template: TemplateLiteralNode
}

/** What a template expression can use to build a key. */
interface NameScope {
  /** String constants of the file, and the static string props of the usage. */
  values: ReadonlyMap<string, string>
  helpers: ReadonlyMap<string, TranslationHelper>
}

/** A name read from one template expression. */
interface ReadName {
  /** The expression in the template. */
  source: string
  /** Every i18n key that the expression can show. `undefined` when the key uses a value that only the runtime knows, such as a prop. */
  keys: string[] | undefined
  /** The row marker as an expression: the keys as one string, or the key expression itself when only the runtime knows the key. */
  marker: string | undefined
}

/** Component props that name the control or the section they belong to. */
const NAME_PROPS = new Set(['label', 'title'])
/** Elements whose text names a setting or a section. A button names an action, not a setting, so it is not here. */
const NAME_TAGS = /^(?:h[1-6]|label|legend)$/
/** A button names an action, not a setting, so its `label` and `title` props are not names either. */
const BUTTON = /Button$/
/**
 * Overlay parts. Their content shows only after a click, so it is not on the page. Chrome settings search skips dialogs and menus for the same reason.
 * A component whose slots all render inside an overlay part counts as an overlay too. The scan finds that by itself.
 */
const OVERLAY_PART = /^(?:Teleport|(?:Dialog|AlertDialog|Drawer|Popover|DropdownMenu|ContextMenu|HoverCard|Tooltip|Select|Combobox|Menubar|NavigationMenu|Toast)(?:Portal|Content))$/
/** Notices describe a state, such as an error or a tip. Their titles do not name a setting. */
const NOTICE = /^(?:Callout|Alert|ErrorContainer)$/
/** The translation functions of a template. */
const TRANSLATE = new Set(['t', '$t'])
const I18N_KEY = /^[\w.-]+$/
/** The module that maps each settings route to the loader of its runtime item provider. */
const PROVIDERS_MODULE = 'virtual:settings-search-providers'
const RESOLVED_PROVIDERS_MODULE = `\0${PROVIDERS_MODULE}`
const SCRIPT_FILE = /\.[cm]?[jt]sx?$/

function stripQuery(id: string) {
  return id.split('?')[0]
}

function pascalCase(tag: string) {
  return tag.replace(/(?:^|-)(\w)/g, (_, letter: string) => letter.toUpperCase())
}

function camelCase(name: string) {
  return name.replace(/-(\w)/g, (_, letter: string) => letter.toUpperCase())
}

function isElement(node: TemplateChild): node is TemplateElement {
  return 'tag' in node && 'props' in node
}

function* elementsOf(children: TemplateChild[]): Generator<TemplateElement> {
  for (const child of children) {
    if (!isElement(child))
      continue
    yield child
    yield* elementsOf(child.children)
  }
}

/** Whether the content of an element is not part of the page: an overlay part or a notice. */
function hidesContent(element: TemplateElement) {
  const name = pascalCase(element.tag)
  return OVERLAY_PART.test(name) || NOTICE.test(name)
}

/** The bound prop of an element by name, such as `:search-key-of`. */
function boundProp(element: TemplateElement, names: readonly string[]) {
  return element.props.find(prop => prop.name === 'bind' && 'arg' in prop && prop.arg && 'content' in prop.arg && names.includes(prop.arg.content))
}

/** Whether an element carries the row marker itself. A row of a runtime item binds it, such as `:data-settings-search="itemKey(card.id)"`. */
function hasOwnMarker(element: TemplateElement) {
  return element.props.some(prop => prop.name === SETTINGS_SEARCH_ATTRIBUTE) || !!boundProp(element, [SETTINGS_SEARCH_ATTRIBUTE])
}

/**
 * Whether an element marks rows of runtime items, so its page needs a provider.
 *
 * A shared list component marks its items only when its user asks, with `searchKeyOf?.(item)`. That marker does not count by itself.
 * A usage that passes `:search-key-of` counts instead.
 */
function marksItemRows(element: TemplateElement) {
  const marker = boundProp(element, [SETTINGS_SEARCH_ATTRIBUTE])
  const markerSource = marker && 'exp' in marker && marker.exp && 'content' in marker.exp ? marker.exp.content : ''
  const ownMarker = element.props.some(prop => prop.name === SETTINGS_SEARCH_ATTRIBUTE) || (!!marker && !markerSource.includes('?.('))
  return ownMarker || !!boundProp(element, ['search-key-of', 'searchKeyOf'])
}

/** The `v-if`, `v-else-if`, `v-else`, or `v-show` directive of an element. */
function conditionOf(element: TemplateElement) {
  for (const prop of element.props) {
    if (prop.name === 'if' || prop.name === 'else-if' || prop.name === 'else' || prop.name === 'show') {
      const expression = 'exp' in prop && prop.exp && 'content' in prop.exp ? prop.exp.content : undefined
      return { kind: prop.name, expression }
    }
  }
  return undefined
}

function parseExpression(source: string): { expression: Expression, code: string } | undefined {
  const code = `(${source})`
  try {
    const statement = babelParse(code, { sourceType: 'module', plugins: ['typescript'] }).program.body[0]
    return statement?.type === 'ExpressionStatement' ? { expression: statement.expression, code } : undefined
  }
  catch {
    return undefined
  }
}

/** The marker for keys that the build knows: one string, with the keys separated by spaces. */
function markerOf(keys: string[]) {
  return `'${[...new Set(keys)].join(' ')}'`
}

/** The keys that a template literal can build, or `undefined` when a part is not known. */
function templateKeys(template: TemplateLiteralNode, values: ReadonlyMap<string, string>): string[] | undefined {
  let keys = ['']
  for (const [index, quasi] of template.quasis.entries()) {
    keys = keys.map(key => key + (quasi.value.cooked ?? quasi.value.raw))
    const part = template.expressions[index]
    if (!part)
      continue
    const partValues = valuesOf(part, values)
    if (!partValues)
      return undefined
    keys = keys.flatMap(key => partValues.map(value => key + value))
  }
  return keys
}

/** The strings that a part of a template key can be, or `undefined` when the scan cannot know them. */
function valuesOf(node: TemplateLiteralNode['expressions'][number], values: ReadonlyMap<string, string>): string[] | undefined {
  if (node.type === 'StringLiteral')
    return [node.value]
  if (node.type === 'Identifier') {
    const value = values.get(node.name)
    return value === undefined ? undefined : [value]
  }
  if (node.type === 'ConditionalExpression') {
    const consequent = valuesOf(node.consequent, values)
    const alternate = valuesOf(node.alternate, values)
    return consequent && alternate ? [...consequent, ...alternate] : undefined
  }
  return undefined
}

/**
 * Reads the i18n keys that a template expression shows.
 *
 * Returns:
 * - A {@link ReadName} for `t('key')`, `t(`${PREFIX}.key`)`, a call of a translation helper, or a condition between such calls.
 * - `'unreadable'` for a call that looks like a translation, but whose key the scan cannot know.
 * - `undefined` for anything else, such as data or `t('key', params)`. Those show runtime values, not a fixed setting name.
 */
function readName(expression: Expression, code: string, scope: NameScope): ReadName | 'unreadable' | undefined {
  const source = (node: { start?: number | null, end?: number | null }) => code.slice(node.start ?? 0, node.end ?? 0)
  const isKey = (key: string) => I18N_KEY.test(key)

  if (expression.type === 'ConditionalExpression') {
    const consequent = readName(expression.consequent, code, scope)
    const alternate = readName(expression.alternate, code, scope)
    if (consequent === 'unreadable' || alternate === 'unreadable')
      return 'unreadable'
    if (!consequent || !alternate)
      return undefined
    const keys = consequent.keys && alternate.keys ? [...consequent.keys, ...alternate.keys] : undefined
    const marker = keys
      ? markerOf(keys)
      : consequent.marker && alternate.marker ? `(${source(expression.test)}) ? (${consequent.marker}) : (${alternate.marker})` : undefined
    return { source: source(expression), keys, marker }
  }

  if (expression.type !== 'CallExpression')
    return undefined
  const [argument, ...rest] = expression.arguments
  const callee = expression.callee.type === 'Identifier' ? expression.callee.name : undefined
  if (argument?.type !== 'StringLiteral' && argument?.type !== 'TemplateLiteral')
    return undefined
  if (rest.length)
    return undefined

  if (callee && TRANSLATE.has(callee)) {
    const keys = argument.type === 'StringLiteral' ? [argument.value] : templateKeys(argument, scope.values)
    if (keys && !keys.every(isKey))
      return 'unreadable'
    // A key with a prefix from a prop is known only at runtime, so the marker binds the key expression itself.
    return { source: source(expression), keys, marker: keys ? markerOf(keys) : source(argument) }
  }

  const helper = callee ? scope.helpers.get(callee) : undefined
  if (!helper)
    return 'unreadable'
  const params = argument.type === 'StringLiteral' ? [argument.value] : templateKeys(argument, scope.values)
  const built = params?.map(param => templateKeys(helper.template, new Map([...scope.values, [helper.param, param]])))
  const keys = built?.every(key => key !== undefined) ? built.flat() : undefined
  if (keys && !keys.every(isKey))
    return 'unreadable'
  return { source: source(expression), keys, marker: keys ? markerOf(keys) : undefined }
}

/**
 * Reads the setting names on one element.
 *
 * Use when:
 * - The scan builds the index, and the transform marks the rows. Both use this function, so they always agree.
 *
 * Returns:
 * - The names that the element shows, and the expressions that look like names but cannot be read.
 *   A link to another page (`to`) names that page, not a setting here, so it has no names.
 */
function namesOf(element: TemplateElement, scope: NameScope) {
  const names: ReadName[] = []
  const unreadable: string[] = []
  const read = (expressionSource: string) => {
    const parsed = parseExpression(expressionSource.trim())
    const name = parsed ? readName(parsed.expression, parsed.code, scope) : undefined
    if (name === 'unreadable')
      unreadable.push(expressionSource.trim())
    else if (name)
      names.push(name)
  }

  for (const prop of element.props) {
    const name = prop.name === 'bind' && 'arg' in prop && prop.arg && 'content' in prop.arg ? prop.arg.content : prop.name
    if (name === 'to')
      return { names, unreadable }
  }

  // On a native element, `title` is a hover hint. Only component props name a control.
  if (element.tagType === 1 && !BUTTON.test(pascalCase(element.tag))) {
    for (const prop of element.props) {
      if (prop.name === 'bind' && 'arg' in prop && prop.arg && 'content' in prop.arg && NAME_PROPS.has(prop.arg.content) && prop.exp && 'content' in prop.exp)
        read(prop.exp.content)
    }
  }

  if (NAME_TAGS.test(element.tag)) {
    // Whitespace and comments do not count. One interpolation must be the whole text.
    const content = element.children.filter(child => !(child.type === 3 || (child.type === 2 && !child.content.trim())))
    const only = content.length === 1 ? content[0] : undefined
    if (only?.type === 5 && 'content' in only.content)
      read(only.content.content)
  }

  return { names, unreadable }
}

/** The translation helper that a function declares, such as `(key: string) => t(`prefix.${key}`)`. */
function helperOf(fn: Expression | Statement | null | undefined): TranslationHelper | undefined {
  if (!fn || (fn.type !== 'ArrowFunctionExpression' && fn.type !== 'FunctionExpression' && fn.type !== 'FunctionDeclaration'))
    return undefined
  const [param] = fn.params
  if (param?.type !== 'Identifier')
    return undefined
  const body = fn.body.type === 'BlockStatement'
    ? (fn.body.body.length === 1 && fn.body.body[0].type === 'ReturnStatement' ? fn.body.body[0].argument : undefined)
    : fn.body
  if (body?.type !== 'CallExpression' || body.callee.type !== 'Identifier' || !TRANSLATE.has(body.callee.name))
    return undefined
  const [template] = body.arguments
  return template?.type === 'TemplateLiteral' ? { param: param.name, template } : undefined
}

/** Top-level string constants and translation helpers, which template keys can use. */
function scopeOf(program: ScriptProgram) {
  const values = new Map<string, string>()
  const helpers = new Map<string, TranslationHelper>()
  for (const statement of program.body) {
    const declaration = statement.type === 'ExportNamedDeclaration' ? statement.declaration : statement
    if (declaration?.type === 'FunctionDeclaration' && declaration.id) {
      const helper = helperOf(declaration)
      if (helper)
        helpers.set(declaration.id.name, helper)
      continue
    }
    if (declaration?.type !== 'VariableDeclaration' || declaration.kind !== 'const')
      continue
    for (const declarator of declaration.declarations) {
      if (declarator.id.type !== 'Identifier')
        continue
      const init = declarator.init
      if (init?.type === 'StringLiteral')
        values.set(declarator.id.name, init.value)
      else if (init?.type === 'TemplateLiteral' && init.expressions.length === 0)
        values.set(declarator.id.name, init.quasis[0]?.value.cooked ?? '')
      const helper = helperOf(init)
      if (helper)
        helpers.set(declarator.id.name, helper)
    }
  }
  return { values, helpers }
}

/**
 * The props of a component's usage.
 *
 * - `values`: static string attributes, by prop name. A template key or a condition in the component can use them.
 * - `bound`: props with a bound value, such as `:enabled="x"`. Only the runtime knows them, so they hide the defaults.
 */
interface ComponentUsage {
  values: ReadonlyMap<string, string>
  bound: ReadonlySet<string>
}

const NO_USAGE: ComponentUsage = { values: new Map(), bound: new Set() }

function usageOf(element: TemplateElement): ComponentUsage {
  const values = new Map<string, string>()
  const bound = new Set<string>()
  for (const prop of element.props) {
    if ('value' in prop) {
      if (prop.value && prop.name !== 'class' && prop.name !== 'style')
        values.set(camelCase(prop.name), prop.value.content)
    }
    else if (prop.name === 'bind' && prop.arg && 'content' in prop.arg) {
      bound.add(camelCase(prop.arg.content))
    }
    else if (prop.name === 'model') {
      bound.add(prop.arg && 'content' in prop.arg ? camelCase(prop.arg.content) : 'modelValue')
    }
  }
  return { values, bound }
}

/**
 * Builds the settings search index at build time and marks the searchable rows.
 *
 * Use when:
 * - An app routes the shared settings pages with `vue-router/vite`.
 *
 * Expects:
 * - Pass `extendRoute` to `VueRouter({ extendRoute })` and add `plugin` to the Vite plugins.
 * - A page names a setting with `t('key')` in a `label` or `title` prop of a component, a heading, a label, or a legend.
 *   A key can use a constant of the same file or a static prop as its prefix, such as `t(`${KEY}.enable`)`.
 *
 * Returns:
 * - `extendRoute`, which writes the i18n keys of every setting on a settings page into `meta.searchKeys`.
 *   It follows the components that the page imports, and skips overlays and notices.
 * - `plugin`, which binds the row marker to the same elements, and reports names that the scan cannot read.
 *   A production build fails on such a name. Development only warns.
 *
 * In development, the index of a page updates when the page file changes.
 * A change in a component that a page imports updates the index after a restart.
 */
export function createSettingsSearch() {
  let resolveId: ((id: string, importer: string) => Promise<string | undefined>) | undefined
  let markResolverReady: () => void = () => {}
  const resolverReady = new Promise<void>(resolve => markResolverReady = resolve)
  let failOnUnreadable = false
  /** `import.meta.env` of the app build. Platform checks, such as `RUNTIME_ENVIRONMENT`, are known at build time. */
  const env = new Map<string, unknown>()
  let reportTimer: ReturnType<typeof setTimeout> | undefined
  const reported = new Set<string>()

  const descriptors = new Map<string, Promise<SFCDescriptor | undefined>>()
  const programs = new Map<string, Promise<ScriptProgram | undefined>>()
  const componentScans = new Map<string, ComponentScan>()
  /** Files that the scan reached. Only these files get row markers. */
  const scannedFiles = new Set<string>()
  const unreadableNames = new Map<string, UnreadableName>()
  /** The runtime item provider of each settings route, by route path. */
  const providers = new Map<string, string>()
  /** Pages that mark rows of runtime items but have no provider, so search cannot list those items. */
  const pagesWithoutProvider = new Set<string>()

  function readDescriptor(file: string) {
    let descriptor = descriptors.get(file)
    if (!descriptor) {
      descriptor = readFile(file, 'utf8')
        .then(source => parse(source, { filename: file }).descriptor)
        .catch(() => undefined)
      descriptors.set(file, descriptor)
    }
    return descriptor
  }

  function readProgram(id: string, source?: string) {
    let program = programs.get(id)
    if (!program) {
      program = (source !== undefined ? Promise.resolve(source) : readFile(id, 'utf8'))
        .then(code => babelParse(code, { sourceType: 'module', plugins: ['typescript'] }).program)
        .catch(() => undefined)
      programs.set(id, program)
    }
    return program
  }

  function importsOf(program: ScriptProgram) {
    const imports = new Map<string, ImportBinding>()
    for (const statement of program.body) {
      if (statement.type !== 'ImportDeclaration' || statement.importKind === 'type')
        continue
      for (const specifier of statement.specifiers) {
        if (specifier.type === 'ImportDefaultSpecifier')
          imports.set(specifier.local.name, { source: statement.source.value, imported: 'default' })
        else if (specifier.type === 'ImportSpecifier' && specifier.importKind !== 'type')
          imports.set(specifier.local.name, { source: statement.source.value, imported: specifier.imported.type === 'Identifier' ? specifier.imported.name : specifier.imported.value })
      }
    }
    return imports
  }

  async function resolveFile(source: string, importer: string) {
    await resolverReady
    const resolved = await resolveId?.(source, importer)
    const file = resolved ? stripQuery(resolved) : undefined
    // Dependencies render no setting of their own. They only show the names that a page passes in.
    return file && !file.includes('/node_modules/') ? file : undefined
  }

  /** Follows re-exports, such as `export { default as X } from './x.vue'`, to the component file. */
  async function resolveExport(module: string, name: string, depth = 0): Promise<string | undefined> {
    if (depth > 8)
      return undefined
    const program = await readProgram(module)
    if (!program)
      return undefined

    const imports = importsOf(program)
    for (const statement of program.body) {
      if (statement.type === 'ExportNamedDeclaration') {
        for (const specifier of statement.specifiers) {
          if (specifier.type !== 'ExportSpecifier')
            continue
          const exported = specifier.exported.type === 'Identifier' ? specifier.exported.name : specifier.exported.value
          if (exported !== name)
            continue
          const binding = statement.source
            ? { source: statement.source.value, imported: specifier.local.name }
            : imports.get(specifier.local.name)
          if (binding)
            return resolveBinding(binding, module, depth + 1)
        }
      }
      else if (statement.type === 'ExportAllDeclaration') {
        const target = await resolveFile(statement.source.value, module)
        const found = target && SCRIPT_FILE.test(target) ? await resolveExport(target, name, depth + 1) : undefined
        if (found)
          return found
      }
    }
    return undefined
  }

  async function resolveBinding(binding: ImportBinding, importer: string, depth = 0) {
    const target = await resolveFile(binding.source, importer)
    if (!target)
      return undefined
    if (target.endsWith('.vue'))
      return binding.imported === 'default' ? target : undefined
    return SCRIPT_FILE.test(target) ? resolveExport(target, binding.imported, depth) : undefined
  }

  /**
   * Evaluates top-level `const` declarations whose values the build knows, such as `const isDesktop = isStageTamagotchi()`.
   * Props count too: a prop that the usage does not bind takes its `withDefaults` default.
   */
  async function staticsOf(program: ScriptProgram, context: EvaluationContext, usage: ComponentUsage) {
    const statics = new Map(context.statics)
    for (const statement of program.body) {
      const declaration = statement.type === 'ExportNamedDeclaration' ? statement.declaration : statement
      if (declaration?.type === 'ExpressionStatement')
        await propsOf(declaration.expression, { ...context, statics }, usage, statics)
      if (declaration?.type !== 'VariableDeclaration' || declaration.kind !== 'const')
        continue
      for (const declarator of declaration.declarations) {
        if (declarator.id.type !== 'Identifier' || !declarator.init)
          continue
        const props = await propsOf(declarator.init, { ...context, statics }, usage, statics)
        if (props) {
          statics.set(declarator.id.name, props)
          continue
        }
        const value = await evaluate(declarator.init, { ...context, statics })
        if (value !== UNKNOWN)
          statics.set(declarator.id.name, value)
      }
    }
    return statics
  }

  /**
   * Reads `defineProps()` or `withDefaults(defineProps(), defaults)` as the props of this usage.
   * The template reads props by name, so each known prop also goes into `statics`.
   *
   * Returns:
   * - The props by name, or `undefined` when the expression does not define props.
   */
  async function propsOf(node: Expression, context: EvaluationContext, usage: ComponentUsage, statics: Map<string, unknown>) {
    const isCall = (expression: Expression | undefined, name: string) =>
      expression?.type === 'CallExpression' && expression.callee.type === 'Identifier' && expression.callee.name === name
    const [definition, defaults] = isCall(node, 'withDefaults') && node.type === 'CallExpression' ? node.arguments : [node]
    if (definition?.type !== 'CallExpression' || !isCall(definition, 'defineProps'))
      return undefined

    const props = new Map<string, unknown>(usage.values)
    if (defaults?.type === 'ObjectExpression') {
      for (const property of defaults.properties) {
        if (property.type !== 'ObjectProperty')
          continue
        const name = property.key.type === 'Identifier' ? property.key.name : property.key.type === 'StringLiteral' ? property.key.value : undefined
        // A static value from the usage wins over the default. A factory default, such as `() => []`, is runtime data.
        if (!name || props.has(name) || usage.bound.has(name) || property.value.type === 'ArrowFunctionExpression')
          continue
        const value = await evaluate(property.value as Expression, context)
        if (value !== UNKNOWN)
          props.set(name, value)
      }
    }
    for (const name of usage.bound)
      props.delete(name)
    props.forEach((value, name) => statics.set(name, value))
    return props
  }

  /** The imports, the constants, and the translation helpers of a component's scripts. */
  async function scriptsOf(descriptor: SFCDescriptor, file: string, usage: ComponentUsage = NO_USAGE) {
    const imports = new Map<string, ImportBinding>()
    const helpers = new Map<string, TranslationHelper>()
    let statics: ReadonlyMap<string, unknown> = new Map()
    for (const block of [descriptor.script, descriptor.scriptSetup]) {
      if (!block)
        continue
      const program = await readProgram(`${file}?${block.setup ? 'setup' : 'script'}`, block.content)
      if (!program)
        continue
      for (const [local, binding] of importsOf(program))
        imports.set(local, binding)
      scopeOf(program).helpers.forEach((helper, name) => helpers.set(name, helper))
      statics = await staticsOf(program, { file, statics, imports }, usage)
    }
    const values = new Map([...statics].filter((entry): entry is [string, string] => typeof entry[1] === 'string'))
    return { imports, values, helpers, statics }
  }

  /** Finds an exported function with one returned expression, such as `export function isStageWeb() { return ... }`. */
  async function findExportedFunction(module: string, name: string, depth = 0): Promise<{ expression: Expression, context: EvaluationContext } | undefined> {
    if (depth > 8)
      return undefined
    const program = await readProgram(module)
    if (!program)
      return undefined
    const imports = importsOf(program)
    const context: EvaluationContext = { file: module, statics: new Map(), imports }

    for (const statement of program.body) {
      if (statement.type === 'ExportNamedDeclaration') {
        const declaration = statement.declaration
        if (declaration?.type === 'FunctionDeclaration' && declaration.id?.name === name)
          return returnedExpression(declaration, context)
        if (declaration?.type === 'VariableDeclaration') {
          for (const declarator of declaration.declarations) {
            if (declarator.id.type === 'Identifier' && declarator.id.name === name)
              return returnedExpression(declarator.init, context)
          }
        }
        for (const specifier of statement.specifiers) {
          if (specifier.type !== 'ExportSpecifier')
            continue
          const exported = specifier.exported.type === 'Identifier' ? specifier.exported.name : specifier.exported.value
          if (exported !== name)
            continue
          const binding = statement.source ? { source: statement.source.value, imported: specifier.local.name } : imports.get(specifier.local.name)
          const target = binding ? await resolveFile(binding.source, module) : undefined
          if (binding && target && SCRIPT_FILE.test(target))
            return findExportedFunction(target, binding.imported, depth + 1)
        }
      }
      else if (statement.type === 'ExportAllDeclaration') {
        const target = await resolveFile(statement.source.value, module)
        const found = target && SCRIPT_FILE.test(target) ? await findExportedFunction(target, name, depth + 1) : undefined
        if (found)
          return found
      }
    }
    return undefined
  }

  function returnedExpression(fn: Expression | Statement | null | undefined, context: EvaluationContext) {
    if (!fn || (fn.type !== 'ArrowFunctionExpression' && fn.type !== 'FunctionExpression' && fn.type !== 'FunctionDeclaration') || fn.params.length)
      return undefined
    const body = fn.body.type === 'BlockStatement'
      ? (fn.body.body.length === 1 && fn.body.body[0].type === 'ReturnStatement' ? fn.body.body[0].argument : undefined)
      : fn.body
    return body ? { expression: body, context } : undefined
  }

  /**
   * Evaluates an expression that the build can decide, such as a platform check.
   *
   * Returns:
   * - The value, or {@link UNKNOWN} when the value depends on runtime state, such as a store or a ref.
   */
  async function evaluate(node: Expression, context: EvaluationContext, depth = 0): Promise<unknown> {
    switch (node.type) {
      case 'StringLiteral':
      case 'NumericLiteral':
      case 'BooleanLiteral':
        return node.value
      case 'NullLiteral':
        return null
      case 'TemplateLiteral':
        return node.expressions.length ? UNKNOWN : node.quasis[0]?.value.cooked
      case 'Identifier':
        if (node.name === 'undefined')
          return undefined
        return context.statics.has(node.name) ? context.statics.get(node.name) : UNKNOWN
      case 'MemberExpression': {
        // `import.meta.env.NAME`: a key that the app build does not define is `undefined` at runtime too.
        const isEnv = node.object.type === 'MemberExpression' && node.object.object.type === 'MetaProperty'
          && node.object.property.type === 'Identifier' && node.object.property.name === 'env'
        if (isEnv && node.property.type === 'Identifier')
          return env.get(node.property.name)
        // `props.name`: the props of the usage, with their defaults.
        const owner = node.object.type === 'Identifier' ? context.statics.get(node.object.name) : undefined
        if (owner instanceof Map && node.property.type === 'Identifier' && !node.computed)
          return owner.has(node.property.name) ? owner.get(node.property.name) : UNKNOWN
        return UNKNOWN
      }
      case 'UnaryExpression': {
        if (node.operator !== '!')
          return UNKNOWN
        const value = await evaluate(node.argument, context, depth)
        return value === UNKNOWN ? UNKNOWN : !value
      }
      case 'LogicalExpression': {
        const left = await evaluate(node.left, context, depth)
        if (node.operator === '&&') {
          if (left !== UNKNOWN && !left)
            return left
          const right = await evaluate(node.right, context, depth)
          if (left === UNKNOWN)
            return right !== UNKNOWN && !right ? right : UNKNOWN
          return right
        }
        if (node.operator === '||') {
          if (left !== UNKNOWN && left)
            return left
          const right = await evaluate(node.right, context, depth)
          if (left === UNKNOWN)
            return right !== UNKNOWN && right ? right : UNKNOWN
          return right
        }
        return UNKNOWN
      }
      case 'BinaryExpression': {
        if (!['===', '!==', '==', '!='].includes(node.operator) || node.left.type === 'PrivateName')
          return UNKNOWN
        const left = await evaluate(node.left, context, depth)
        const right = await evaluate(node.right, context, depth)
        if (left === UNKNOWN || right === UNKNOWN)
          return UNKNOWN
        // eslint-disable-next-line eqeqeq
        const equal = node.operator.length === 3 ? left === right : left == right
        return node.operator.startsWith('!') ? !equal : equal
      }
      case 'ConditionalExpression': {
        const test = await evaluate(node.test, context, depth)
        if (test === UNKNOWN)
          return UNKNOWN
        return evaluate(test ? node.consequent : node.alternate, context, depth)
      }
      case 'CallExpression': {
        // `computed(() => value)` has the value of its getter.
        const [getter] = node.arguments
        if (node.callee.type === 'Identifier' && node.callee.name === 'computed' && getter?.type === 'ArrowFunctionExpression' && getter.body.type !== 'BlockStatement')
          return evaluate(getter.body, context, depth)
        // A call of an imported function without arguments, such as `isStageTamagotchi()`, evaluates its returned expression.
        if (node.arguments.length || node.callee.type !== 'Identifier' || depth > 4)
          return UNKNOWN
        const binding = context.imports.get(node.callee.name)
        const module = binding ? await resolveFile(binding.source, context.file) : undefined
        const fn = binding && module && SCRIPT_FILE.test(module) ? await findExportedFunction(module, binding.imported) : undefined
        return fn ? evaluate(fn.expression, fn.context, depth + 1) : UNKNOWN
      }
      case 'TSAsExpression':
      case 'TSNonNullExpression':
      case 'ParenthesizedExpression':
        return evaluate(node.expression, context, depth)
      default:
        return UNKNOWN
    }
  }

  /**
   * Scans one component as it is used.
   * `props` holds the static string props of the usage, because a template key can use one as its prefix.
   */
  async function scanComponent(file: string, usage: ComponentUsage, stack: Set<string>): Promise<ComponentScan> {
    const cacheKey = `${file}\n${JSON.stringify([[...usage.values], [...usage.bound]])}`
    const known = componentScans.get(cacheKey)
    if (known)
      return known
    // A component that contains itself adds nothing new.
    if (stack.has(file))
      return { entries: [], slotsHidden: false, marksItems: false, slotConditions: [] }

    const descriptor = await readDescriptor(file)
    const root = descriptor?.template?.ast
    if (!descriptor || !root)
      return { entries: [], slotsHidden: false, marksItems: false, slotConditions: [] }

    scannedFiles.add(file)
    const { imports, values, helpers, statics } = await scriptsOf(descriptor, file, usage)
    const scope: NameScope = { values: new Map([...usage.values, ...values]), helpers }
    const context: EvaluationContext = { file, statics, imports }
    const path = new Set(stack).add(file)
    const entries: ScanEntry[] = []
    let slots = 0
    let hiddenSlots = 0
    let marksItems = false
    let slotConditions: string[] | undefined

    const decide = async (expression: string | undefined) => {
      const parsed = expression ? parseExpression(expression) : undefined
      return parsed ? evaluate(parsed.expression, context) : UNKNOWN
    }

    const walk = async (children: TemplateChild[], hidden: boolean, conditions: string[]) => {
      // The state of a `v-if` chain: a branch already shows, every branch so far is hidden, or the build cannot tell.
      let chain: 'none' | 'taken' | 'open' | 'unknown' = 'none'
      for (const element of children) {
        if (!isElement(element))
          continue

        const condition = conditionOf(element)
        let shows: unknown = true
        if (!condition || condition.kind === 'show') {
          chain = 'none'
          if (condition)
            shows = await decide(condition.expression)
        }
        else if (condition.kind === 'if' || (condition.kind === 'else-if' && chain === 'open')) {
          shows = await decide(condition.expression)
          chain = shows === UNKNOWN ? 'unknown' : shows ? 'taken' : 'open'
        }
        else if (condition.kind === 'else-if') {
          shows = chain === 'taken' ? false : UNKNOWN
        }
        else {
          shows = chain === 'taken' ? false : chain === 'open' ? true : UNKNOWN
          chain = 'none'
        }
        // A branch that this build never renders, such as a desktop-only row on the web, is not in the index.
        if (shows !== UNKNOWN && !shows)
          continue
        const here = shows === UNKNOWN ? [...conditions, `${file}:${element.loc.start.offset}`] : conditions

        if (element.tag === 'slot') {
          slots++
          if (hidden)
            hiddenSlots++
          const slotName = element.props.find(prop => prop.name === 'name' && 'value' in prop)
          if (!slotConditions && (!slotName || ('value' in slotName && slotName.value?.content === 'default')))
            slotConditions = here
        }

        const hidesHere = hidden || hidesContent(element)
        if (!hidesHere && marksItemRows(element))
          marksItems = true
        if (!hidesHere) {
          const { names, unreadable } = namesOf(element, scope)
          for (const name of names) {
            if (name.keys)
              entries.push(...name.keys.map(key => ({ key, conditions: here })))
            else
              unreadable.push(name.source)
          }
          for (const expression of unreadable) {
            const line = element.loc.start.line
            unreadableNames.set(`${file}:${line}:${expression}`, { file, line, expression })
          }
        }

        let slotsHidden = false
        let childSlotConditions: string[] = []
        if (element.tagType === 1) {
          const binding = imports.get(element.tag) ?? imports.get(pascalCase(element.tag))
          const child = binding ? await resolveBinding(binding, file) : undefined
          if (child) {
            const scan = await scanComponent(child, usageOf(element), path)
            if (!hidesHere) {
              entries.push(...scan.entries.map(entry => ({ key: entry.key, conditions: [...here, ...entry.conditions] })))
              marksItems ||= scan.marksItems
            }
            slotsHidden = scan.slotsHidden
            childSlotConditions = scan.slotConditions
          }
        }

        // The children of a component are its slot content. They are hidden where its slots are,
        // and they show under the same conditions as its default slot, such as an open collapsible section.
        await walk(element.children, hidesHere || slotsHidden, [...here, ...childSlotConditions])
      }
    }
    await walk(root.children, false, [])

    const scan = { entries, slotsHidden: slots > 0 && slots === hiddenSlots, marksItems, slotConditions: slotConditions ?? [] }
    componentScans.set(cacheKey, scan)
    return scan
  }

  function reportUnreadableNames(names = [...unreadableNames.values()]) {
    if (!names.length)
      return undefined
    const lines = names.map(name => `  ${name.file}:${name.line}  ${name.expression}`)
    return `[settings-search] Search cannot read these setting names. Use t('key') with a literal key, or a prefix from a constant or a static prop:\n${lines.join('\n')}`
  }

  function reportPagesWithoutProvider() {
    if (!pagesWithoutProvider.size)
      return undefined
    const lines = [...pagesWithoutProvider].map(file => `  ${file}`)
    return `[settings-search] These pages mark rows of runtime items, but search cannot list the items. Add a sibling <page>.search.ts that exports the provider:\n${lines.join('\n')}`
  }

  /** In development, the scan never ends, so the names are reported once the routes settle. */
  function reportNewUnreadableNamesSoon() {
    if (failOnUnreadable)
      return
    clearTimeout(reportTimer)
    reportTimer = setTimeout(() => {
      const fresh = [...unreadableNames.entries()].filter(([id]) => !reported.has(id))
      fresh.forEach(([id]) => reported.add(id))
      const report = reportUnreadableNames(fresh.map(([, name]) => name))
      if (report)
        console.warn(report)
      const missing = [...pagesWithoutProvider].filter(file => !reported.has(file))
      missing.forEach(file => reported.add(file))
      if (missing.length)
        console.warn(reportPagesWithoutProvider())
    }, 1000)
  }

  const plugin: Plugin = {
    name: 'proj-airi:settings-search',
    enforce: 'pre',
    configResolved(config) {
      failOnUnreadable = config.command === 'build'
      for (const [name, value] of Object.entries(config.env))
        env.set(name, value)
      // `define` holds values as code, such as `"'electron'"`.
      for (const [name, code] of Object.entries(config.define ?? {})) {
        if (!name.startsWith('import.meta.env.') || typeof code !== 'string')
          continue
        const parsed = parseExpression(code)
        const literal = parsed?.expression
        if (literal && (literal.type === 'StringLiteral' || literal.type === 'BooleanLiteral' || literal.type === 'NumericLiteral'))
          env.set(name.slice('import.meta.env.'.length), literal.value)
      }
    },
    buildStart() {
      resolveId = async (id, importer) => (await this.resolve(id, importer, { skipSelf: true }))?.id
      markResolverReady()
    },
    watchChange(id) {
      const file = stripQuery(id)
      descriptors.delete(file)
      for (const key of programs.keys()) {
        if (stripQuery(key) === file)
          programs.delete(key)
      }
      for (const key of componentScans.keys()) {
        if (key.startsWith(`${file}\n`))
          componentScans.delete(key)
      }
    },
    buildEnd() {
      const report = [reportUnreadableNames(), reportPagesWithoutProvider()].filter(Boolean).join('\n')
      if (report && failOnUnreadable)
        this.error(report)
    },
    resolveId(id) {
      return id === PROVIDERS_MODULE ? RESOLVED_PROVIDERS_MODULE : undefined
    },
    async load(id) {
      if (id !== RESOLVED_PROVIDERS_MODULE)
        return undefined
      // The routes are scanned in `buildStart`, before any module loads.
      const entries = [...providers].map(([path, file]) => `  ${JSON.stringify(path)}: () => import(${JSON.stringify(file)}).then(module => module.default),`)
      return `export default {\n${entries.join('\n')}\n}\n`
    },
    async transform(code, id) {
      if (id.includes('?') || !scannedFiles.has(id))
        return undefined
      const descriptor = parse(code, { filename: id }).descriptor
      const root = descriptor.template?.ast
      if (!root)
        return undefined

      // Without the usage, a key with a prefix from a prop is known only at runtime. Its marker binds the key expression.
      const { values, helpers } = await scriptsOf(descriptor, id)
      const output = new MagicString(code)
      for (const element of elementsOf(root.children)) {
        const markers = namesOf(element, { values, helpers }).names.flatMap(name => name.marker ? [name.marker] : [])
        if (!markers.length || hasOwnMarker(element))
          continue
        const marker = markers.length === 1 ? markers[0] : `[${markers.join(', ')}].join(' ')`
        output.appendLeft(element.loc.start.offset + 1 + element.tag.length, ` :${SETTINGS_SEARCH_ATTRIBUTE}="${marker.replaceAll('"', '&quot;')}"`)
      }
      return output.hasChanged() ? { code: output.toString(), map: output.generateMap({ source: id, hires: true }) } : undefined
    },
  }

  async function extendRoute(route: SettingsSearchRouteNode) {
    const file = route.component
    if (!file || !route.fullPath.startsWith('/settings'))
      return

    const scan = await scanComponent(file, NO_USAGE, new Set())
    const providerFile = file.replace(/\.vue$/, '.search.ts')
    const hasProvider = await access(providerFile).then(() => true, () => false)
    if (hasProvider)
      providers.set(route.fullPath, providerFile)
    else if (scan.marksItems)
      pagesWithoutProvider.add(file)

    const entries = scan.entries.filter(entry => entry.key !== route.meta.titleKey)
    // The gate of a conditional setting is the nearest setting before it that shows whenever its section shows,
    // such as the switch that turns it on. Search highlights the gate when the setting itself is not on the page.
    const gates: Record<string, string> = {}
    entries.forEach((entry, index) => {
      if (!entry.conditions.length || gates[entry.key])
        return
      const gate = entries.slice(0, index).findLast(previous =>
        previous.conditions.length < entry.conditions.length
        && previous.conditions.every((condition, position) => entry.conditions[position] === condition))
      if (gate)
        gates[entry.key] = gate.key
    })

    const keys = [...new Set(entries.map(entry => entry.key))]
    if (keys.length)
      route.addToMeta({ searchKeys: keys, ...(Object.keys(gates).length ? { searchGates: gates } : {}) })
    reportNewUnreadableNamesSoon()
  }

  return { plugin, extendRoute }
}
