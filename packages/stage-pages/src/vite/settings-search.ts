import type { Plugin, ViteDevServer } from 'vite'
import type { SFCDescriptor, SFCTemplateBlock } from 'vue/compiler-sfc'

import { createHash } from 'node:crypto'
import { access, readFile } from 'node:fs/promises'
import { relative, sep } from 'node:path'
import { cwd } from 'node:process'

import { SETTINGS_SEARCH_ATTRIBUTE, SETTINGS_SEARCH_VIEW_EXPORT } from '@proj-airi/stage-shared/settings-search'
import { babelParse, MagicString, parse } from 'vue/compiler-sfc'

type TemplateRoot = NonNullable<SFCTemplateBlock['ast']>
type TemplateChild = TemplateRoot['children'][number]
type TemplateElement = Extract<TemplateChild, { tag: string }>
type ScriptProgram = ReturnType<typeof babelParse>['program']
type Statement = ScriptProgram['body'][number]
type Expression = Extract<Statement, { type: 'ExpressionStatement' }>['expression']
type ObjectMethod = Extract<Extract<Expression, { type: 'ObjectExpression' }>['properties'][number], { type: 'ObjectMethod' }>
type Getter = Extract<Expression, { type: 'ArrowFunctionExpression' | 'FunctionExpression' }> | ObjectMethod

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
 * A runtime condition around a setting: a `v-if`, `v-else`, or `v-show` that the build cannot decide, or a slot of a component
 * that shows its content only in some state, such as a collapsed section.
 *
 * `gates` lists the markers of the rows that control the condition, best first:
 * - the controls whose `v-model` binds a value that the condition reads;
 * - for a slot, the name of the component usage, such as the title of a section.
 */
interface ScanCondition {
  gates: string[]
}

/**
 * A setting or a control that a component renders.
 *
 * `conditions` lists the runtime conditions around it, outermost first. It shows only when all of them hold.
 */
interface ScanEntry {
  key: string
  conditions: ScanCondition[]
}

/** What a component adds to the page that renders it. */
interface ComponentScan {
  /** The settings that the component renders on the page, in document order. */
  entries: ScanEntry[]
  /** The controls that the component renders on the page. The key is the marker of the value that the control binds. */
  controls: ScanEntry[]
  /** Whether the component marks rows of runtime items itself, with a bound `:data-settings-search`. */
  marksItems: boolean
  /**
   * The runtime conditions around each slot, by slot name, such as the `v-if="visible"` of a collapsible section around its default slot.
   * Content passed to a slot shows only when they hold.
   */
  slotConditions: ReadonlyMap<string, ScanCondition[]>
  /** Whether every slot of the component renders inside an overlay or a notice, so content passed to it is not on the page. */
  slotsHidden: boolean
}

/**
 * How a top-level name of a component gets its value. Two names hold the same value when their sources are the same.
 *
 * - `local`: state that the component creates, such as a ref or a computed value. A computed value keeps its getter:
 *   a condition on it depends on every value that the getter reads, and a control bound to it sets the values that the getter returns.
 * - `constant`: a value that never changes, so no control sets it.
 * - `outside`: props and models, which the parent passes in. The scan does not follow them.
 * - `import`: a value that a module exports, the same in every component.
 * - `call`: the result of a call, such as a store, or one field of it. A store is the same in every component.
 */
type SourceBinding
  = | { kind: 'local', getter?: Getter }
    | { kind: 'constant' }
    | { kind: 'outside' }
    | { kind: 'import', binding: ImportBinding }
    | { kind: 'call', callee: ImportBinding | undefined, field?: string }

/**
 * The value that a name holds. `id` is the same in every component that reads the same value.
 * `wholeStore` marks a store itself, which no control binds. Only its fields are values.
 */
interface ValueSource {
  id: string
  wholeStore: boolean
}

/** The script facts of one component that its template expressions read. */
interface ComponentScope {
  file: string
  bindings: ReadonlyMap<string, SourceBinding>
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
/** The props that bind the value of a control. */
const MODEL_PROPS = new Set(['model-value', 'modelValue'])
/** Calls whose result comes from the parent, not from the component. */
const OUTSIDE_VALUES = new Set(['defineProps', 'withDefaults', 'defineModel'])

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

/** Every element, with its nearest parent element that renders. A `<template>` renders no element of its own. */
function* elementsOf(children: TemplateChild[], parent?: TemplateElement): Generator<{ element: TemplateElement, parent: TemplateElement | undefined }> {
  for (const child of children) {
    if (!isElement(child))
      continue
    yield { element: child, parent }
    yield* elementsOf(child.children, child.tag === 'template' ? parent : child)
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

/** The path of a plain value read, such as `['settings', 'autoSend']` for `settings.autoSend`. `undefined` for any other expression. */
function chainOf(node: Expression): string[] | undefined {
  if (node.type === 'Identifier')
    return [node.name]
  if ((node.type === 'MemberExpression' || node.type === 'OptionalMemberExpression') && !node.computed && node.property.type === 'Identifier') {
    const object = chainOf(node.object)
    return object ? [...object, node.property.name] : undefined
  }
  if (node.type === 'TSNonNullExpression' || node.type === 'TSAsExpression' || node.type === 'ParenthesizedExpression')
    return chainOf(node.expression)
  return undefined
}

/** The value paths that an expression reads, such as `activeProvider` and `supportsModelListing` in `activeProvider && supportsModelListing`. */
function chainsOf(node: Expression, chains: string[][] = []): string[][] {
  const chain = chainOf(node)
  if (chain) {
    chains.push(chain)
    return chains
  }
  switch (node.type) {
    case 'MemberExpression':
    case 'OptionalMemberExpression':
      chainsOf(node.object, chains)
      if (node.computed && node.property.type !== 'PrivateName')
        chainsOf(node.property, chains)
      break
    case 'UnaryExpression':
      chainsOf(node.argument, chains)
      break
    case 'BinaryExpression':
    case 'LogicalExpression':
      if (node.left.type !== 'PrivateName')
        chainsOf(node.left, chains)
      chainsOf(node.right, chains)
      break
    case 'ConditionalExpression':
      chainsOf(node.test, chains)
      chainsOf(node.consequent, chains)
      chainsOf(node.alternate, chains)
      break
    case 'CallExpression':
    case 'OptionalCallExpression':
      // A method call reads its object, such as `providers` in `providers.includes(id)`.
      if (node.callee.type === 'MemberExpression' || node.callee.type === 'OptionalMemberExpression')
        chainsOf(node.callee.object, chains)
      for (const argument of node.arguments) {
        if (argument.type !== 'SpreadElement' && argument.type !== 'ArgumentPlaceholder')
          chainsOf(argument as Expression, chains)
      }
      break
    case 'TemplateLiteral':
      node.expressions.forEach(expression => chainsOf(expression as Expression, chains))
      break
    case 'TSNonNullExpression':
    case 'TSAsExpression':
    case 'ParenthesizedExpression':
      chainsOf(node.expression, chains)
      break
  }
  return chains
}

/** The marker of a value. Every control that binds the value carries it, so a condition that reads the value finds its control. */
function valueMarker(source: string) {
  return `value:${createHash('sha256').update(source).digest('hex').slice(0, 12)}`
}

/** The expressions that bind the value of a control: `v-model` with or without an argument, and `:model-value`. */
function modelExpressionsOf(element: TemplateElement) {
  return element.props.flatMap((prop) => {
    const isModel = prop.name === 'model' || (prop.name === 'bind' && 'arg' in prop && prop.arg && 'content' in prop.arg && MODEL_PROPS.has(prop.arg.content))
    return isModel && 'exp' in prop && prop.exp && 'content' in prop.exp ? [prop.exp.content] : []
  })
}

/** The name of the slot that a `<template #name>` child fills, or `default` for other content. */
function slotNameOf(child: TemplateElement) {
  if (child.tag !== 'template')
    return 'default'
  const directive = child.props.find(prop => prop.name === 'slot')
  return directive && 'arg' in directive && directive.arg && 'content' in directive.arg && directive.arg.isStatic ? directive.arg.content : 'default'
}

/** Whether an expression is a literal, such as `'speech-noop'` or `42`. */
function isLiteral(node: Expression | null | undefined) {
  return node?.type === 'StringLiteral' || node?.type === 'NumericLiteral' || node?.type === 'BooleanLiteral'
    || (node?.type === 'TemplateLiteral' && node.expressions.length === 0)
}

/** The expressions that a getter reads: the returned values, and the tests and values on the way. */
function readsOf(getter: Getter): Expression[] {
  if (getter.body.type !== 'BlockStatement')
    return [getter.body]
  const reads: Expression[] = []
  const visit = (statement: Statement) => {
    if (statement.type === 'ReturnStatement' && statement.argument) {
      reads.push(statement.argument)
    }
    else if (statement.type === 'IfStatement') {
      reads.push(statement.test)
      visit(statement.consequent)
      if (statement.alternate)
        visit(statement.alternate)
    }
    else if (statement.type === 'BlockStatement') {
      statement.body.forEach(visit)
    }
    else if (statement.type === 'VariableDeclaration') {
      statement.declarations.forEach(declarator => declarator.init && reads.push(declarator.init))
    }
  }
  getter.body.body.forEach(visit)
  return reads
}

/** The value paths that an expression can return, such as `model` in `ready && model`. A test, such as `a === b`, returns no value path. */
function resultChainsOf(node: Expression): string[][] {
  const chain = chainOf(node)
  if (chain)
    return [chain]
  if (node.type === 'LogicalExpression')
    return node.operator === '&&' ? resultChainsOf(node.right) : [...resultChainsOf(node.left), ...resultChainsOf(node.right)]
  if (node.type === 'ConditionalExpression')
    return [...resultChainsOf(node.consequent), ...resultChainsOf(node.alternate)]
  if (node.type === 'TSNonNullExpression' || node.type === 'TSAsExpression' || node.type === 'ParenthesizedExpression')
    return resultChainsOf(node.expression)
  return []
}

/** The value paths that a getter returns. */
function returnChainsOf(getter: Getter): string[][] {
  if (getter.body.type !== 'BlockStatement')
    return resultChainsOf(getter.body)
  const chains: string[][] = []
  const visit = (statement: Statement) => {
    if (statement.type === 'ReturnStatement' && statement.argument) {
      chains.push(...resultChainsOf(statement.argument))
    }
    else if (statement.type === 'IfStatement') {
      visit(statement.consequent)
      if (statement.alternate)
        visit(statement.alternate)
    }
    else if (statement.type === 'BlockStatement') {
      statement.body.forEach(visit)
    }
  }
  getter.body.body.forEach(visit)
  return chains
}

/** The getter of `computed(getter)` or `computed({ get, set })`, or `undefined` for another value. */
function computedGetterOf(init: Expression | null | undefined): Getter | undefined {
  if (init?.type !== 'CallExpression' || init.callee.type !== 'Identifier' || init.callee.name !== 'computed')
    return undefined
  const [argument] = init.arguments
  if (argument?.type === 'ArrowFunctionExpression' || argument?.type === 'FunctionExpression')
    return argument
  if (argument?.type !== 'ObjectExpression')
    return undefined
  const get = argument.properties.find(property =>
    (property.type === 'ObjectMethod' || property.type === 'ObjectProperty') && property.key.type === 'Identifier' && property.key.name === 'get')
  if (get?.type === 'ObjectMethod')
    return get
  const value = get?.type === 'ObjectProperty' ? get.value : undefined
  return value?.type === 'ArrowFunctionExpression' || value?.type === 'FunctionExpression' ? value : undefined
}

/** How each top-level name of a script gets its value. */
function bindingsOf(program: ScriptProgram, imports: ReadonlyMap<string, ImportBinding>) {
  const bindings = new Map<string, SourceBinding>()
  for (const [local, binding] of imports)
    bindings.set(local, { kind: 'import', binding })

  const calleeOf = (node: Expression | null | undefined) =>
    node?.type === 'CallExpression' && node.callee.type === 'Identifier' ? node.callee.name : undefined
  for (const statement of program.body) {
    const declaration = statement.type === 'ExportNamedDeclaration' ? statement.declaration : statement
    if (declaration?.type !== 'VariableDeclaration')
      continue
    for (const declarator of declaration.declarations) {
      const init = declarator.init
      const callee = calleeOf(init)
      if (declarator.id.type === 'Identifier') {
        const getter = computedGetterOf(init)
        bindings.set(declarator.id.name, getter
          ? { kind: 'local', getter }
          : isLiteral(init)
            ? { kind: 'constant' }
            : callee && OUTSIDE_VALUES.has(callee)
              ? { kind: 'outside' }
              : callee ? { kind: 'call', callee: imports.get(callee) } : { kind: 'local' })
        continue
      }
      if (declarator.id.type !== 'ObjectPattern')
        continue
      // `const { a } = storeToRefs(store)`, `const { a } = useStore()`, or `const { a } = defineProps()`.
      const source = callee === 'storeToRefs' && init?.type === 'CallExpression' ? init.arguments[0] as Expression | undefined : init
      const sourceCallee = calleeOf(source)
      const base: SourceBinding | undefined = source?.type === 'Identifier'
        ? bindings.get(source.name)
        : sourceCallee && OUTSIDE_VALUES.has(sourceCallee)
          ? { kind: 'outside' }
          : sourceCallee ? { kind: 'call', callee: imports.get(sourceCallee) } : undefined
      for (const property of declarator.id.properties) {
        if (property.type !== 'ObjectProperty' || property.key.type !== 'Identifier')
          continue
        const value = property.value.type === 'AssignmentPattern' ? property.value.left : property.value
        if (value.type !== 'Identifier')
          continue
        bindings.set(value.name, base?.kind === 'outside'
          ? base
          : base?.kind === 'call' && !base.field ? { kind: 'call', callee: base.callee, field: property.key.name } : { kind: 'local' })
      }
    }
  }
  return bindings
}

/**
 * The modules that the provider definitions of a program load as views, such as `views: { hearing: () => import('./hearing-settings.vue') }`.
 * A provider definition is the first argument of `defineProvider()`.
 */
function providerViewImportsOf(program: ScriptProgram) {
  const specifiers: string[] = []
  const visit = (node: unknown) => {
    if (!node || typeof node !== 'object')
      return
    if (Array.isArray(node)) {
      node.forEach(visit)
      return
    }
    const call = node as Expression
    const [definition] = call.type === 'CallExpression' && call.callee.type === 'Identifier' && call.callee.name === 'defineProvider' ? call.arguments : []
    const views = definition?.type === 'ObjectExpression'
      ? definition.properties.find(property => property.type === 'ObjectProperty' && property.key.type === 'Identifier' && property.key.name === 'views')
      : undefined
    if (views?.type === 'ObjectProperty' && views.value.type === 'ObjectExpression') {
      for (const view of views.value.properties) {
        const loader = view.type === 'ObjectProperty' ? view.value : undefined
        const body = loader?.type === 'ArrowFunctionExpression' ? loader.body : undefined
        const [specifier] = body?.type === 'CallExpression' && body.callee.type === 'Import' ? body.arguments : []
        if (specifier?.type === 'StringLiteral')
          specifiers.push(specifier.value)
      }
    }
    for (const [name, child] of Object.entries(node)) {
      if (name !== 'loc' && name !== 'leadingComments' && name !== 'trailingComments')
        visit(child)
    }
  }
  visit(program.body)
  return specifiers
}

/** The marker for keys that the build knows: one string, with the keys separated by spaces, as {@link SETTINGS_SEARCH_ATTRIBUTE} reads it. */
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
 *   A button names an action, not a setting, so the `label` and `title` props of a button component are not names either.
 */
function namesOf(element: TemplateElement, scope: NameScope, isButton: boolean) {
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
  if (element.tagType === 1 && !isButton) {
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
 * The gate of each conditional setting on a page or in a view.
 *
 * The gate is the row that controls the innermost condition of the setting, such as the switch that binds the value
 * that its `v-if` reads, or the section that holds it. Search highlights the gate when the setting itself is not on the page.
 * A control can have a gate of its own, such as a switch inside a collapsed section, so the gates of gates are in the result too.
 */
function gatesOf(entries: readonly ScanEntry[], controls: readonly ScanEntry[]) {
  const present = new Set([...entries, ...controls].map(item => item.key))
  const controlsByKey = Map.groupBy(controls, control => control.key)
  const gateOf = (item: ScanEntry) => {
    for (const condition of item.conditions.toReversed()) {
      const gate = condition.gates.find(key => key !== item.key && present.has(key))
      if (gate)
        return gate
    }
    return undefined
  }
  const gates: Record<string, string> = {}
  const pending = [...entries]
  for (let item = pending.shift(); item; item = pending.shift()) {
    const gate = gates[item.key] ? undefined : gateOf(item)
    if (!gate)
      continue
    gates[item.key] = gate
    pending.push(...controlsByKey.get(gate) ?? [])
  }
  return gates
}

/** The gates of a key, nearest first, following the gate of each gate. */
function gateChainOf(key: string, gates: Readonly<Record<string, string>>) {
  const chain: string[] = []
  for (let gate = gates[key]; gate && !chain.includes(gate); gate = gates[gate])
    chain.push(gate)
  return chain
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
  /** The root of the app build. The value ids use file paths relative to it, so the markers do not depend on the checkout directory. */
  let root = cwd()
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
  /**
   * Components that a provider definition loads as a view. A page renders such a view by provider at runtime,
   * so the page scan cannot reach it. The view gets the marks of its settings, and an export that lists them.
   */
  const providerViews = new Set<string>()
  /** Whether each component is a button, by file. */
  const buttons = new Map<string, Promise<boolean>>()
  /** The value of each top-level name, by file and name. */
  const sources = new Map<string, Promise<ValueSource | undefined>>()
  /** The runtime item provider of each settings route, by route path. */
  const providers = new Map<string, string>()
  /** Pages that mark rows of runtime items but have no provider, so search cannot list those items. */
  const pagesWithoutProvider = new Set<string>()
  /** The settings routes by page file, with whether the page marks runtime rows. A provider file next to the page can come and go. */
  const routesByPage = new Map<string, { path: string, marksItems: boolean }>()
  let server: ViteDevServer | undefined

  /** Records the provider of a route, or the lack of one. In development, the page reloads with the new table. */
  async function updateProvider(path: string, pageFile: string, marksItems: boolean) {
    const providerFile = pageFile.replace(/\.vue$/, '.search.ts')
    const hasProvider = await access(providerFile).then(() => true, () => false)
    const changed = hasProvider ? providers.get(path) !== providerFile : providers.has(path)
    if (hasProvider)
      providers.set(path, providerFile)
    else
      providers.delete(path)
    if (!hasProvider && marksItems)
      pagesWithoutProvider.add(pageFile)
    else
      pagesWithoutProvider.delete(pageFile)

    const module = changed ? server?.moduleGraph.getModuleById(RESOLVED_PROVIDERS_MODULE) : undefined
    if (module) {
      server?.moduleGraph.invalidateModule(module)
      server?.ws.send({ type: 'full-reload' })
    }
  }

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

  /** The imports, the constants, the translation helpers, and the value sources of a component's scripts. */
  async function scriptsOf(descriptor: SFCDescriptor, file: string, usage: ComponentUsage = NO_USAGE) {
    const imports = new Map<string, ImportBinding>()
    const helpers = new Map<string, TranslationHelper>()
    const bindings = new Map<string, SourceBinding>()
    let statics: ReadonlyMap<string, unknown> = new Map()
    for (const block of [descriptor.script, descriptor.scriptSetup]) {
      if (!block)
        continue
      const program = await readProgram(`${file}?${block.setup ? 'setup' : 'script'}`, block.content)
      if (!program)
        continue
      const blockImports = importsOf(program)
      blockImports.forEach((binding, local) => imports.set(local, binding))
      bindingsOf(program, blockImports).forEach((binding, name) => bindings.set(name, binding))
      scopeOf(program).helpers.forEach((helper, name) => helpers.set(name, helper))
      statics = await staticsOf(program, { file, statics, imports }, usage)
    }
    const values = new Map([...statics].filter((entry): entry is [string, string] => typeof entry[1] === 'string'))
    const scope: ComponentScope = { file, bindings }
    return { imports, values, helpers, statics, scope }
  }

  /**
   * Finds the declaration of an export, through re-exports.
   *
   * Returns:
   * - The declaring file, its name there, and the declared function or the initial value, or `undefined` when the export is not found.
   */
  async function declarationOf(module: string, name: string, depth = 0): Promise<{ file: string, name: string, node: Expression | Statement | undefined } | undefined> {
    if (depth > 8)
      return undefined
    const program = await readProgram(module)
    if (!program)
      return undefined
    const imports = importsOf(program)
    const local = (localName: string) => {
      for (const statement of program.body) {
        const declaration = statement.type === 'ExportNamedDeclaration' ? statement.declaration : statement
        if (declaration?.type === 'FunctionDeclaration' && declaration.id?.name === localName)
          return { file: module, name: localName, node: declaration }
        if (declaration?.type !== 'VariableDeclaration')
          continue
        for (const declarator of declaration.declarations) {
          if (declarator.id.type === 'Identifier' && declarator.id.name === localName)
            return { file: module, name: localName, node: declarator.init ?? undefined }
        }
      }
      return undefined
    }

    for (const statement of program.body) {
      if (statement.type === 'ExportNamedDeclaration') {
        const declaration = statement.declaration
        const declared = declaration?.type === 'FunctionDeclaration'
          ? [declaration.id?.name]
          : declaration?.type === 'VariableDeclaration' ? declaration.declarations.map(declarator => declarator.id.type === 'Identifier' ? declarator.id.name : undefined) : []
        if (declared.includes(name))
          return local(name)
        for (const specifier of statement.specifiers) {
          if (specifier.type !== 'ExportSpecifier')
            continue
          const exported = specifier.exported.type === 'Identifier' ? specifier.exported.name : specifier.exported.value
          if (exported !== name)
            continue
          const binding = statement.source ? { source: statement.source.value, imported: specifier.local.name } : imports.get(specifier.local.name)
          if (!binding)
            return local(specifier.local.name)
          const target = await resolveFile(binding.source, module)
          return target && SCRIPT_FILE.test(target) ? declarationOf(target, binding.imported, depth + 1) : undefined
        }
      }
      else if (statement.type === 'ExportAllDeclaration') {
        const target = await resolveFile(statement.source.value, module)
        const found = target && SCRIPT_FILE.test(target) ? await declarationOf(target, name, depth + 1) : undefined
        if (found)
          return found
      }
    }
    return undefined
  }

  /** Finds an exported function with one returned expression, such as `export function isStageWeb() { return ... }`. */
  async function findExportedFunction(module: string, name: string) {
    const declaration = await declarationOf(module, name)
    const program = declaration ? await readProgram(declaration.file) : undefined
    return declaration && program ? returnedExpression(declaration.node, { file: declaration.file, statics: new Map(), imports: importsOf(program) }) : undefined
  }

  /** The declaration that an import names, or `undefined` for a dependency. */
  async function importedDeclaration(binding: ImportBinding, importer: string) {
    const target = await resolveFile(binding.source, importer)
    return target && SCRIPT_FILE.test(target) ? declarationOf(target, binding.imported) : undefined
  }

  /**
   * The value that a top-level name holds, as an id that is the same in every component that reads the same value.
   * A store field is shared. State that a component creates is its own. Props come from outside, so they have no id.
   */
  function sourceOf(name: string, scope: ComponentScope) {
    const idOf = (kind: string, file: string, member: string) => `${kind}:${relative(root, file).split(sep).join('/')}#${member}`
    const cacheKey = `${scope.file}\n${name}`
    let source = sources.get(cacheKey)
    if (!source) {
      source = (async () => {
        const binding = scope.bindings.get(name)
        const local = { id: idOf('local', scope.file, name), wholeStore: false }
        if (!binding || binding.kind === 'outside' || binding.kind === 'constant')
          return undefined
        if (binding.kind === 'local')
          return local
        if (binding.kind === 'import') {
          // Only state that a module creates, such as `export const open = ref(false)`, is shared. A constant or a function is not state.
          const declaration = await importedDeclaration(binding.binding, scope.file)
          return declaration?.node?.type === 'CallExpression' ? { id: idOf('import', declaration.file, declaration.name), wholeStore: false } : undefined
        }
        // A call creates state of the component, such as `ref()`, unless it returns a store.
        const declaration = binding.callee ? await importedDeclaration(binding.callee, scope.file) : undefined
        const node = declaration?.node
        const isStore = node?.type === 'CallExpression' && node.callee.type === 'Identifier' && node.callee.name === 'defineStore'
        if (!declaration || !isStore)
          return local
        return { id: idOf('store', declaration.file, `${declaration.name}${binding.field ? `.${binding.field}` : ''}`), wholeStore: !binding.field }
      })()
      sources.set(cacheKey, source)
    }
    return source
  }

  /**
   * The markers of a value path, longest first. A control of `settings` also controls a condition on `settings.length`.
   * A whole store is not a value that a control binds, so a path into a store keeps at least its field.
   */
  async function valueMarkersOf(chain: string[], scope: ComponentScope, prefixes: boolean) {
    const [root, ...path] = chain
    const source = root ? await sourceOf(root, scope) : undefined
    const shortest = source?.wholeStore ? 1 : 0
    if (!source || path.length < shortest)
      return []
    const lengths = prefixes ? Array.from({ length: path.length - shortest + 1 }, (_, index) => path.length - index) : [path.length]
    return lengths.map(length => valueMarker([source.id, ...path.slice(0, length)].join('.')))
  }

  /**
   * The value paths that a getter of a computed value reads. A script reads a ref as `name.value`, which is `name` in a template.
   * A store is not a ref, so `store.value` stays a field.
   */
  async function scriptChainsOf(scriptChains: string[][], scope: ComponentScope) {
    const chains: string[][] = []
    for (const [root, ...path] of scriptChains) {
      const source = root ? await sourceOf(root, scope) : undefined
      if (root)
        chains.push([root, ...(path[0] === 'value' && !source?.wholeStore ? path.slice(1) : path)])
    }
    return chains
  }

  /**
   * The markers of the values that the expressions of a condition read. A control that binds one of them is the gate.
   * A computed value adds the values that its getter reads, such as the tab behind `isAutoRunTab`.
   */
  async function conditionGates(expressions: string[], scope: ComponentScope) {
    const gates: string[] = []
    const visit = async (chains: string[][], followed: ReadonlySet<string>) => {
      for (const chain of chains) {
        gates.push(...await valueMarkersOf(chain, scope, true))
        const [root] = chain
        const binding = root ? scope.bindings.get(root) : undefined
        if (root && binding?.kind === 'local' && binding.getter && !followed.has(root)) {
          for (const read of readsOf(binding.getter))
            await visit(await scriptChainsOf(chainsOf(read), scope), new Set(followed).add(root))
        }
      }
    }
    for (const expression of expressions) {
      const parsed = parseExpression(expression)
      if (parsed)
        await visit(chainsOf(parsed.expression), new Set())
    }
    return [...new Set(gates)]
  }

  /**
   * The markers of the values that a control binds with `v-model` or `:model-value`.
   * A control bound to a computed value, such as a writable `computed({ get, set })` over a store field, also sets what its getter returns.
   */
  async function controlMarkersOf(element: TemplateElement, scope: ComponentScope) {
    const markers: string[] = []
    for (const expression of modelExpressionsOf(element)) {
      const parsed = parseExpression(expression)
      const chain = parsed ? chainOf(parsed.expression) : undefined
      if (!chain)
        continue
      markers.push(...await valueMarkersOf(chain, scope, false))
      const binding = chain.length === 1 && chain[0] ? scope.bindings.get(chain[0]) : undefined
      const getter = binding?.kind === 'local' ? binding.getter : undefined
      for (const returned of getter ? await scriptChainsOf(returnChainsOf(getter), scope) : [])
        markers.push(...await valueMarkersOf(returned, scope, false))
    }
    return [...new Set(markers)]
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
   * Whether a component is a button: its template has one root element, and that root is a `<button>` or a button component,
   * as `Button` renders `BasicButton`. A component from a dependency is not known, so it is not a button.
   */
  function isButtonComponent(file: string, depth = 0): Promise<boolean> {
    let known = buttons.get(file)
    if (!known) {
      known = (async () => {
        const descriptor = await readDescriptor(file)
        const roots = descriptor?.template?.ast?.children.filter(isElement) ?? []
        const [root] = roots
        if (!descriptor || roots.length !== 1 || !root)
          return false
        if (root.tag === 'button')
          return true
        if (root.tagType !== 1 || depth > 8)
          return false
        const { imports } = await scriptsOf(descriptor, file)
        const binding = imports.get(root.tag) ?? imports.get(pascalCase(root.tag))
        const child = binding ? await resolveBinding(binding, file) : undefined
        return child ? isButtonComponent(child, depth + 1) : false
      })()
      buttons.set(file, known)
    }
    return known
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
    const empty: ComponentScan = { entries: [], controls: [], slotsHidden: false, marksItems: false, slotConditions: new Map() }
    if (stack.has(file))
      return empty

    const descriptor = await readDescriptor(file)
    const root = descriptor?.template?.ast
    if (!descriptor || !root)
      return empty

    scannedFiles.add(file)
    const { imports, values, helpers, statics, scope: valueScope } = await scriptsOf(descriptor, file, usage)
    const scope: NameScope = { values: new Map([...usage.values, ...values]), helpers }
    const context: EvaluationContext = { file, statics, imports }
    const path = new Set(stack).add(file)
    const entries: ScanEntry[] = []
    const controls: ScanEntry[] = []
    let slots = 0
    let hiddenSlots = 0
    let marksItems = false
    const slotConditions = new Map<string, ScanCondition[]>()
    const prefixed = (items: ScanEntry[], conditions: ScanCondition[]) => items.map(item => ({ key: item.key, conditions: [...conditions, ...item.conditions] }))

    const decide = async (expression: string | undefined) => {
      const parsed = expression ? parseExpression(expression) : undefined
      return parsed ? evaluate(parsed.expression, context) : UNKNOWN
    }

    const walk = async (children: TemplateChild[], hidden: boolean, conditions: ScanCondition[]) => {
      // The state of a `v-if` chain: a branch already shows, every branch so far is hidden, or the build cannot tell.
      let chain: 'none' | 'taken' | 'open' | 'unknown' = 'none'
      // The tests of the chain so far. A `v-else` branch depends on the values that they read.
      let chainTests: string[] = []
      for (const element of children) {
        if (!isElement(element))
          continue

        const condition = conditionOf(element)
        const test = condition?.expression ? [condition.expression] : []
        let shows: unknown = true
        let tests: string[] = []
        if (!condition || condition.kind === 'show') {
          chain = 'none'
          chainTests = []
          if (condition) {
            shows = await decide(condition.expression)
            tests = test
          }
        }
        else if (condition.kind === 'if' || (condition.kind === 'else-if' && chain === 'open')) {
          chainTests = condition.kind === 'if' ? test : [...chainTests, ...test]
          tests = chainTests
          shows = await decide(condition.expression)
          chain = shows === UNKNOWN ? 'unknown' : shows ? 'taken' : 'open'
        }
        else if (condition.kind === 'else-if') {
          chainTests = [...chainTests, ...test]
          tests = chainTests
          shows = chain === 'taken' ? false : UNKNOWN
        }
        else {
          tests = chainTests
          shows = chain === 'taken' ? false : chain === 'open' ? true : UNKNOWN
          chain = 'none'
          chainTests = []
        }
        // A branch that this build never renders, such as a desktop-only row on the web, is not in the index.
        if (shows !== UNKNOWN && !shows)
          continue
        const here = shows === UNKNOWN ? [...conditions, { gates: await conditionGates(tests, valueScope) }] : conditions

        if (element.tag === 'slot') {
          slots++
          if (hidden)
            hiddenSlots++
          const nameProp = element.props.find(prop => prop.name === 'name' && 'value' in prop)
          const slotName = nameProp && 'value' in nameProp && nameProp.value ? nameProp.value.content : 'default'
          if (!slotConditions.has(slotName))
            slotConditions.set(slotName, here)
        }

        const hidesHere = hidden || hidesContent(element)
        const binding = element.tagType === 1 ? imports.get(element.tag) ?? imports.get(pascalCase(element.tag)) : undefined
        const child = binding ? await resolveBinding(binding, file) : undefined
        const { names, unreadable } = namesOf(element, scope, child ? await isButtonComponent(child) : false)
        if (!hidesHere) {
          if (marksItemRows(element))
            marksItems = true
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
          for (const key of await controlMarkersOf(element, valueScope))
            controls.push({ key, conditions: here })
        }

        const childScan = child ? await scanComponent(child, usageOf(element), path) : undefined
        if (!childScan) {
          await walk(element.children, hidesHere, here)
          continue
        }
        if (!hidesHere) {
          entries.push(...prefixed(childScan.entries, here))
          controls.push(...prefixed(childScan.controls, here))
          marksItems ||= childScan.marksItems
        }

        // The children of a component fill its slots. They are hidden where its slots are, and they show under the conditions of
        // their slot, such as the default slot of a collapsible section. The name of the component, such as the section title, is
        // the gate of those conditions after the controls that the component itself has.
        const usageGates = names.flatMap(name => name.keys ?? [])
        const slotGroups = new Map<string, TemplateChild[]>()
        for (const slotChild of element.children) {
          const slotName = isElement(slotChild) ? slotNameOf(slotChild) : 'default'
          slotGroups.set(slotName, [...slotGroups.get(slotName) ?? [], slotChild])
        }
        for (const [slotName, group] of slotGroups) {
          const conditionsOfSlot = (childScan.slotConditions.get(slotName) ?? []).map(slotCondition => ({ gates: [...slotCondition.gates, ...usageGates] }))
          await walk(group, hidesHere || childScan.slotsHidden, [...here, ...conditionsOfSlot])
        }
      }
    }
    await walk(root.children, false, [])

    const scan: ComponentScan = { entries, controls, slotsHidden: slots > 0 && slots === hiddenSlots, marksItems, slotConditions }
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
      root = config.root
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
    configureServer(devServer) {
      server = devServer
      // A provider file that appears or goes away changes the table of its page, while the page itself stays the same.
      const onProviderFile = (file: string) => {
        const route = file.endsWith('.search.ts') ? routesByPage.get(file.replace(/\.search\.ts$/, '.vue')) : undefined
        if (route)
          void updateProvider(route.path, file.replace(/\.search\.ts$/, '.vue'), route.marksItems)
      }
      devServer.watcher.on('add', onProviderFile)
      devServer.watcher.on('unlink', onProviderFile)
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
      // A changed module can change what any name reads, such as a store that moved, or what a button renders.
      sources.clear()
      buttons.clear()
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
      // The scans run at the same time, so the insertion order of `providers` changes between builds.
      // Sort by route path, so that two builds of one source give the same chunk.
      const entries = [...providers].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([path, file]) => `  ${JSON.stringify(path)}: () => import(${JSON.stringify(file)}).then(module => module.default),`)
      return `export default {\n${entries.join('\n')}\n}\n`
    },
    async transform(code, id) {
      if (id.includes('?'))
        return undefined
      if (SCRIPT_FILE.test(id)) {
        if (!id.includes('/node_modules/') && code.includes('defineProvider(') && code.includes('views'))
          await registerProviderViews(code, id)
        return undefined
      }
      if (!scannedFiles.has(id) && !providerViews.has(id))
        return undefined
      const descriptor = parse(code, { filename: id }).descriptor
      const root = descriptor.template?.ast
      if (!root)
        return undefined

      // Without the usage, a key with a prefix from a prop is known only at runtime. Its marker binds the key expression.
      // A control also carries the marker of the value that it binds, so a setting that depends on the value finds its gate.
      // Controls from a `v-for`, such as the cards of a radio group, give it to their parent: the group is the control, not its first card.
      const { values, helpers, scope, imports } = await scriptsOf(descriptor, id)
      const markersOf = new Map<TemplateElement, string[]>()
      const add = (element: TemplateElement, markers: string[]) => markersOf.set(element, [...markersOf.get(element) ?? [], ...markers])
      for (const { element, parent } of elementsOf(root.children)) {
        const controls = (await controlMarkersOf(element, scope)).map(marker => `'${marker}'`)
        const repeated = element.props.some(prop => prop.name === 'for')
        add(repeated && parent ? parent : element, controls)
        // A row of a runtime item binds its own marker. Its names are not settings of the page.
        if (!hasOwnMarker(element)) {
          const binding = element.tagType === 1 ? imports.get(element.tag) ?? imports.get(pascalCase(element.tag)) : undefined
          const child = binding ? await resolveBinding(binding, id) : undefined
          const isButton = child ? await isButtonComponent(child) : false
          add(element, namesOf(element, { values, helpers }, isButton).names.flatMap(name => name.marker ? [name.marker] : []))
        }
      }

      const output = new MagicString(code)
      for (const [element, found] of markersOf) {
        const markers = [...new Set(found)]
        if (!markers.length)
          continue
        const own = element.props.find(prop => prop.name === SETTINGS_SEARCH_ATTRIBUTE) ?? boundProp(element, [SETTINGS_SEARCH_ATTRIBUTE])
        const ownMarker = !own ? undefined : 'value' in own ? `'${own.value?.content ?? ''}'` : own.exp && 'content' in own.exp ? `(${own.exp.content})` : undefined
        const all = ownMarker ? [ownMarker, ...markers] : markers
        const attribute = ` :${SETTINGS_SEARCH_ATTRIBUTE}="${(all.length === 1 ? all[0] : `[${all.join(', ')}].join(' ')`).replaceAll('"', '&quot;')}"`
        if (own)
          output.overwrite(own.loc.start.offset, own.loc.end.offset, attribute.trimStart())
        else
          output.appendLeft(element.loc.start.offset + 1 + element.tag.length, attribute)
      }
      if (providerViews.has(id))
        await exportViewEntries(descriptor, id, output)
      return output.hasChanged() ? { code: output.toString(), map: output.generateMap({ source: id, hires: true }) } : undefined
    },
  }

  /** Records the views that the provider definitions of a module load. A view that loaded before, as after an edit, loads again. */
  async function registerProviderViews(code: string, file: string) {
    const program = await readProgram(file, code)
    for (const specifier of program ? providerViewImportsOf(program) : []) {
      const view = await resolveFile(specifier, file)
      if (!view?.endsWith('.vue') || providerViews.has(view))
        continue
      providerViews.add(view)
      const module = server?.moduleGraph.getModuleById(view)
      if (module)
        server?.moduleGraph.invalidateModule(module)
    }
  }

  /** Adds the settings of a provider view to its module as {@link SETTINGS_SEARCH_VIEW_EXPORT}, each with its gates. */
  async function exportViewEntries(descriptor: SFCDescriptor, file: string, output: MagicString) {
    const scan = await scanComponent(file, NO_USAGE, new Set())
    const gates = gatesOf(scan.entries, scan.controls)
    const entries = [...new Set(scan.entries.map(entry => entry.key))].map(key => ({ key, gates: gateChainOf(key, gates) }))
    const exported = `\nexport const ${SETTINGS_SEARCH_VIEW_EXPORT} = ${JSON.stringify(entries)}\n`
    if (descriptor.script) {
      output.appendLeft(descriptor.script.loc.end.offset, exported)
      return
    }
    // A plain script block next to `<script setup>` holds the export. Both blocks need the same language.
    const lang = descriptor.scriptSetup?.lang ? ` lang="${descriptor.scriptSetup.lang}"` : ''
    output.append(`\n<script${lang}>${exported}</script>\n`)
  }

  async function extendRoute(route: SettingsSearchRouteNode) {
    const file = route.component
    if (!file || !route.fullPath.startsWith('/settings'))
      return

    const scan = await scanComponent(file, NO_USAGE, new Set())
    routesByPage.set(file, { path: route.fullPath, marksItems: scan.marksItems })
    await updateProvider(route.fullPath, file, scan.marksItems)

    const entries = scan.entries.filter(entry => entry.key !== route.meta.titleKey)
    const gates = gatesOf(entries, scan.controls)
    const keys = [...new Set(entries.map(entry => entry.key))]
    if (keys.length)
      route.addToMeta({ searchKeys: keys, ...(Object.keys(gates).length ? { searchGates: gates } : {}) })
    reportNewUnreadableNamesSoon()
  }

  return { plugin, extendRoute }
}
