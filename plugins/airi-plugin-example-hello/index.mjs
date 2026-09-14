// Example drop-in AIRI plugin.
//
// How it works:
// - Every folder under the AIRI plugin directory that contains an
//   `extension.airi.json` manifest is a plugin.
// - The host imports the entrypoint declared in the manifest and calls
//   `setup()` on the exported extension.
// - The object shape below matches `defineExtension({ id, setup })` from
//   `@proj-airi/plugin-sdk`. This example avoids that import on purpose so it
//   also loads from a packaged app, where the plugin folder cannot resolve
//   workspace packages. Bundle dependencies into the entrypoint when you need
//   them, or install `node_modules` inside the plugin folder.

export default {
  id: 'airi-plugin-example-hello',
  setup() {
    console.info('[airi-plugin-example-hello] setup')
  },
}
