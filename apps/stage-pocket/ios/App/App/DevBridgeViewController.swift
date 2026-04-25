import UIKit
import Capacitor
import WebKit

class DevBridgeViewController: CAPBridgeViewController {
    private let hostBridgeName = "airiHostBridge"
    private lazy var webSocketBridge = HostWebSocketBridge(
        sessionFactory: URLSessionHostWebSocketSession.init,
        eventSink: { [weak self] payload in
            self?.dispatchWebSocketBridgeEvent(payload)
        }
    )
    private lazy var hostBridgeMessageHandler = WeakScriptMessageHandler(delegate: self)

    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        configureTransparentBackground()
        webView?.allowsBackForwardNavigationGestures = true
        installWebSocketBridge()
    }

    deinit {
        bridge?.webView?.configuration.userContentController.removeScriptMessageHandler(forName: hostBridgeName)
        webSocketBridge.dispose()
    }

    #if DEBUG
    override func viewDidLoad() {
        super.viewDidLoad()
        if let webView = bridge?.webView {
            webView.navigationDelegate = self
            print("[DevBridge] Navigation delegate set for WebView")
        } else {
            print("[DevBridge] Warning: WebView not available in viewDidLoad")
        }
    }
    #endif

    private func installWebSocketBridge() {
        guard let webView = bridge?.webView else {
            print("[HostBridge] Warning: WebView not available during bridge installation")
            return
        }

        webView.configuration.userContentController.add(hostBridgeMessageHandler, name: hostBridgeName)
    }

    private func configureTransparentBackground() {
        view.isOpaque = false
        view.backgroundColor = .clear

        guard let webView = bridge?.webView else {
            return
        }

        webView.isOpaque = false
        webView.backgroundColor = .clear
        webView.scrollView.backgroundColor = .clear
        webView.superview?.backgroundColor = .clear
    }

    private func dispatchWebSocketBridgeEvent(_ payload: String) {
        guard let webView = bridge?.webView else {
            return
        }

        let script = "window.__airiHostBridge?.onNativeMessage(\(payload.javaScriptEscapedStringLiteral))"
        DispatchQueue.main.async {
            webView.evaluateJavaScript(script, completionHandler: nil)
        }
    }
}

extension DevBridgeViewController: WKScriptMessageHandler {
    func userContentController(
        _ userContentController: WKUserContentController,
        didReceive message: WKScriptMessage
    ) {
        guard message.name == hostBridgeName else {
            return
        }

        guard let payload = message.body as? String else {
            print("[HostBridge] Warning: Unsupported message payload: \(type(of: message.body))")
            return
        }

        webSocketBridge.handleCommand(payload)
    }
}

#if DEBUG
private let ngrokSkipHeaderField = "ngrok-skip-browser-warning"

extension DevBridgeViewController: WKNavigationDelegate {
    func webView(
        _ webView: WKWebView,
        decidePolicyFor navigationAction: WKNavigationAction,
        decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
    ) {
        if let url = navigationAction.request.url {
            print("[DevBridge] Navigation request to: \(url.absoluteString)")
        }

        // Free tier ngrok interstitial cannot be dismissed in WKWebView. Reload with skip header.
        if let requestURL = navigationAction.request.url, let host = requestURL.host,
           host.contains("ngrok")
        {
            let existing = navigationAction.request.value(
                forHTTPHeaderField: ngrokSkipHeaderField
            ) ?? ""
            if existing != "true" && existing != "1" {
                var retry = URLRequest(
                    url: requestURL,
                    cachePolicy: .reloadIgnoringLocalCacheData,
                    timeoutInterval: 60.0
                )
                retry.setValue("true", forHTTPHeaderField: ngrokSkipHeaderField)
                if let ref = navigationAction.request.mainDocumentURL {
                    print(
                        "[DevBridge] ngrok: injecting skip interstitial header for: \(ref.absoluteString)"
                    )
                }
                decisionHandler(.cancel)
                webView.load(retry)
                return
            }
        }

        decisionHandler(.allow)
    }

    func webView(
        _ webView: WKWebView,
        didStartProvisionalNavigation navigation: WKNavigation!
    ) {
        print(
            "[DevBridge] didStartProvisional webView.url=\(webView.url?.absoluteString ?? "nil")"
        )
    }

    func webView(
        _ webView: WKWebView,
        didReceive challenge: URLAuthenticationChallenge,
        completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void
    ) {
        let host = challenge.protectionSpace.host
        let authMethod = challenge.protectionSpace.authenticationMethod
        print(
            "[DevBridge] Certificate challenge for host: \(host), method: \(authMethod)"
        )

        if authMethod == NSURLAuthenticationMethodServerTrust {
            if let serverTrust = challenge.protectionSpace.serverTrust {
                print(
                    "[DevBridge] Trusting certificate for development host: \(host)"
                )
                completionHandler(.useCredential, URLCredential(trust: serverTrust))
                return
            } else {
                print(
                    "[DevBridge] Warning: No serverTrust available for host: \(host)"
                )
            }
        }

        print(
            "[DevBridge] Using default certificate handling for host: \(host)"
        )
        completionHandler(.performDefaultHandling, nil)
    }

    func webView(
        _ webView: WKWebView,
        didFailProvisionalNavigation navigation: WKNavigation!,
        withError error: Error
    ) {
        print("[DevBridge] Navigation failed: \(error.localizedDescription)")
        if let nsError = error as NSError? {
            print(
                "[DevBridge] Error domain: \(nsError.domain), code: \(nsError.code)"
            )
            if nsError.code == -1001 {
                print(
                    "[DevBridge] Timeout error - check if Vite server is running and accessible."
                )
            }
            if nsError.code == -1200 {
                print(
                    "[DevBridge] TLS failed (-1200). If the URL uses your Mac LAN IP, add `, https://<that-ip>:8443` to the Caddy site line in dev/caddy/Caddyfile, restart Caddy, and see dev/caddy/README (iOS section)."
                )
            }
        }
    }

    func webView(
        _ webView: WKWebView,
        didFail navigation: WKNavigation!,
        withError error: Error
    ) {
        print("[DevBridge] Navigation didFail: \(error.localizedDescription)")
    }
}
#endif
