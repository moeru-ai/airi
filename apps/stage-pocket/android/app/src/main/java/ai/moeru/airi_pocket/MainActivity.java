package ai.moeru.airi_pocket;

import android.net.Uri;
import android.net.http.SslError;
import android.webkit.SslErrorHandler;
import android.webkit.WebView;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;
import com.getcapacitor.Logger;

public class MainActivity extends BridgeActivity {

    @Override
    protected void load() {
        super.load();

        if (bridge == null || !bridge.isDevMode()) {
            return;
        }

        bridge.setWebViewClient(new DebugTlsBypassWebViewClient(bridge));
    }

    private static final class DebugTlsBypassWebViewClient extends BridgeWebViewClient {

        private final Bridge bridge;

        private DebugTlsBypassWebViewClient(Bridge bridge) {
            super(bridge);
            this.bridge = bridge;
        }

        @Override
        public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) {
            if (shouldBypassDevServerCertificate(error)) {
                Logger.warn("Bypassing TLS certificate validation for debug dev server: " + error.getUrl());
                handler.proceed();
                return;
            }

            super.onReceivedSslError(view, handler, error);
        }

        // NOTICE: Android WebView rejects the self-signed HTTPS cert used by the debug dev server.
        // Keep this bypass debug-only and scoped to the configured dev server origin.
        private boolean shouldBypassDevServerCertificate(SslError error) {
            if (error == null) {
                return false;
            }

            String serverUrl = bridge.getServerUrl();
            String errorUrl = error.getUrl();
            if (serverUrl == null || serverUrl.isEmpty() || errorUrl == null || errorUrl.isEmpty()) {
                return false;
            }

            Uri serverUri = Uri.parse(serverUrl);
            Uri errorUri = Uri.parse(errorUrl);
            if (!"https".equalsIgnoreCase(serverUri.getScheme())) {
                return false;
            }

            return serverUri.getHost().equalsIgnoreCase(errorUri.getHost()) && normalizePort(serverUri) == normalizePort(errorUri);
        }

        private int normalizePort(Uri uri) {
            int port = uri.getPort();
            if (port != -1) {
                return port;
            }

            if ("https".equalsIgnoreCase(uri.getScheme())) {
                return 443;
            }

            if ("http".equalsIgnoreCase(uri.getScheme())) {
                return 80;
            }

            return -1;
        }
    }
}
