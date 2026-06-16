/**
 * Standalone entry point — mounts the webview-ui.
 *
 * The webview-ui's index.tsx is a self-mounting entry (it calls createRoot
 * directly) and has no exports. We import it for its side effects so Vite
 * can use the standalone index.html as the rollup input while keeping the
 * webview-ui's code untouched.
 */
import '../../../../modules/code/webview-ui/src/index.tsx'
