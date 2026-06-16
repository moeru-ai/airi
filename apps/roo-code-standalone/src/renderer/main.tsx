/**
 * Standalone entry point — re-exports the webview-ui's App.
 *
 * The webview-ui's index.tsx is the real React entry. We re-export it
 * here so Vite can use the standalone index.html as the rollup input
 * while keeping the webview-ui's code untouched.
 */
export { default } from '../../../../modules/code/webview-ui/src/index.tsx'
