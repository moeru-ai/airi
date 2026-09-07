import AuthenticationServices
import Capacitor
import Foundation

@objc(WebAuthenticationPlugin)
final class WebAuthenticationPlugin: CAPPlugin, CAPBridgedPlugin {
    let identifier = "WebAuthenticationPlugin"
    let jsName = "WebAuthentication"
    let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "authenticate", returnType: CAPPluginReturnPromise)
    ]

    private var activeCall: CAPPluginCall?
    private var authenticationSession: ASWebAuthenticationSession?

    @objc func authenticate(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            self?.startAuthentication(call)
        }
    }

    private func startAuthentication(_ call: CAPPluginCall) {
        guard activeCall == nil else {
            call.reject("An authentication session is already active.", "AUTHENTICATION_IN_PROGRESS")
            return
        }

        guard let urlValue = call.getString("url"),
              let url = URL(string: urlValue),
              ["http", "https"].contains(url.scheme?.lowercased() ?? "") else {
            call.reject("The authentication URL is invalid.", "INVALID_URL")
            return
        }

        guard let callbackScheme = call.getString("callbackScheme"), !callbackScheme.isEmpty else {
            call.reject("The callback scheme is missing.", "INVALID_CALLBACK_SCHEME")
            return
        }

        activeCall = call
        let session = ASWebAuthenticationSession(
            url: url,
            callbackURLScheme: callbackScheme
        ) { [weak self] callbackURL, error in
            DispatchQueue.main.async {
                self?.finishAuthentication(callbackURL: callbackURL, error: error)
            }
        }
        session.presentationContextProvider = self
        authenticationSession = session

        if !session.start() {
            finishAuthentication(
                callbackURL: nil,
                error: WebAuthenticationError.sessionDidNotStart
            )
        }
    }

    private func finishAuthentication(callbackURL: URL?, error: Error?) {
        guard let call = activeCall else {
            return
        }

        activeCall = nil
        authenticationSession = nil

        if let callbackURL {
            call.resolve(["callbackUrl": callbackURL.absoluteString])
            return
        }

        if let sessionError = error as? ASWebAuthenticationSessionError,
           sessionError.code == .canceledLogin {
            call.resolve()
            return
        }

        call.reject(
            error?.localizedDescription ?? "The authentication session failed.",
            "AUTHENTICATION_FAILED",
            error
        )
    }
}

extension WebAuthenticationPlugin: ASWebAuthenticationPresentationContextProviding {
    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        return bridge?.viewController?.view.window ?? ASPresentationAnchor()
    }
}

private enum WebAuthenticationError: LocalizedError {
    case sessionDidNotStart

    var errorDescription: String? {
        return "The authentication session did not start."
    }
}
