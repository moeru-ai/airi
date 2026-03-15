import { name } from '../package.json'

console.warn(`The entrypoint you imported for ${name} doesn't have any exports. Try importing ${name}/pages instead.`)
