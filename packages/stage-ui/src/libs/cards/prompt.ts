import { BUILTINS } from '@openuidev/lang-core'

import { cardLibrary } from './catalog'

/**
 * How to write a card program: the language, the parts, the built-in functions, and which part fits which data. Tool
 * cards and reply cards share it.
 *
 * OpenUI's own prompt teaches a chat that builds whole apps. It asks the model to call tools, write Mutations, and use
 * charts and forms of another catalog, so a card prompt of its own describes only what a card uses.
 */
export function cardLanguagePrompt() {
  const { components } = cardLibrary.toSpec()
  return [
    '## openui-lang',
    '',
    '- Each statement is on its own line: `name = Expression`. The program starts with `root = Card(...)`.',
    '- An expression is a string in double quotes, a number, true, false, null, a list `[...]`, an object `{...}`, a part `Part(arg1, arg2)`, or the name of another statement.',
    '- Arguments are positional. Leave out optional arguments from the end. `name: value` inside a call does not work.',
    '- Every statement except root must be used by another statement. A statement that nothing uses does not draw.',
    '- `+` adds numbers or joins text. `-`, `*`, `/`, `%`, `==`, `!=`, `>`, `<`, `>=`, `<=`, `&&`, `||`, `!`, and `condition ? a : b` work as in JavaScript.',
    '- `item.field` reads a field. On a list it reads the field of every item, so `data.items.price` is the list of prices. `list[0]` reads one item.',
    '',
    '## Parts',
    '',
    'Arguments marked with ? are optional.',
    '',
    ...Object.values(components).map(part => part.description ? `${part.signature} — ${part.description}` : part.signature),
    '',
    '## Built-in functions',
    '',
    '- `@Each(list, "item", Part(item.field))` makes one part for each item of the list. Write the part inside @Each, because `item` exists only there.',
    ...Object.values(BUILTINS).map(builtin => `- \`@${builtin.signature}\` — ${builtin.description}`),
    '',
    '## Which part fits',
    '',
    '- Several items with the same fields, or a comparison: Table.',
    '- Items that each have their own title, tags, or link: a Stack of Rows.',
    '- The fields of one item: Facts. The numbers that matter most: Stat, several of them in a Grid.',
    '- Amounts of one unit next to each other: Bars. Values over time: Line. A value against its limit: Progress.',
    '- Steps or events in order, for example a schedule or the steps of a recipe: Timeline.',
    '- Text that must stay as it is, for example code or a command output: Code.',
  ].join('\n')
}
