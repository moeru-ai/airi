import AuthenticationServices
import Capacitor
import Foundation
import UIKit

@objc(AiriNativeAuthPlugin)
class AiriNativeAuthPlugin: CAPPlugin, CAPBridgedPlugin, ASWebAuthenticationPresentationContextProviding {
    let identifier = "AiriNativeAuthPlugin"
    let jsName = "AiriNativeAuth"

    let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "authenticate", returnType: CAPPluginReturnPromise)
    ]

    private var session: ASWebAuthenticationSession?

    @objc func authenticate(_ call: CAPPluginCall) {
        guard let urlString = call.getString("url"),
              let callbackScheme = call.getString("callbackScheme")
        else {
            call.reject("MISSING_ARGUMENTS", "url and callbackScheme are required")
            return
        }

        guard let url = URL(string: urlString) else {
            call.reject("INVALID_URL", "url must be a valid URL")
            return
        }

        DispatchQueue.main.async {
            guard self.session == nil else {
                call.reject("AUTH_IN_PROGRESS", "An authentication session is already in progress")
                return
            }

            let session = ASWebAuthenticationSession(
                url: url,
                callbackURLScheme: callbackScheme
            ) { [weak self] callbackURL, error in
                self?.session = nil

                if let callbackURL {
                    call.resolve(["callbackUrl": callbackURL.absoluteString])
                    return
                }

                if let authError = error as? ASWebAuthenticationSessionError,
                   authError.code == .canceledLogin
                {
                    call.reject("USER_CANCELLED", "The authentication session was cancelled")
                    return
                }

                call.reject("AUTH_FAILED", error?.localizedDescription ?? "Authentication failed")
            }

            session.presentationContextProvider = self
            session.prefersEphemeralWebBrowserSession = false
            self.session = session

            if !session.start() {
                self.session = nil
                call.reject("AUTH_START_FAILED", "Failed to start authentication session")
            }
        }
    }

    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        if let window = bridge?.viewController?.view.window {
            return window
        }

        return UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap(\.windows)
            .first { $0.isKeyWindow } ?? ASPresentationAnchor()
    }
}
