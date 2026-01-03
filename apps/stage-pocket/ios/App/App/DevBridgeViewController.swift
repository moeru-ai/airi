import UIKit
import Capacitor
import WebKit

class DevBridgeViewController: CAPBridgeViewController {

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
}

#if DEBUG
extension DevBridgeViewController: WKNavigationDelegate {
    func webView(
        _ webView: WKWebView,
        decidePolicyFor navigationAction: WKNavigationAction,
        decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
    ) {
        if let url = navigationAction.request.url {
            print("[DevBridge] Navigation request to: \(url.absoluteString)")
        }
        decisionHandler(.allow)
    }

    func webView(
        _ webView: WKWebView,
        didStartProvisionalNavigation navigation: WKNavigation!
    ) {
        print("[DevBridge] Started provisional navigation")
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
