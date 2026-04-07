import Foundation
import Security

final class URLSessionHostWebSocketSession: NSObject, HostWebSocketSession {
    private let url: URL
    private let emit: (HostWebSocketEvent) -> Void
    private lazy var session = URLSession(configuration: .default, delegate: self, delegateQueue: nil)
    private lazy var task = session.webSocketTask(with: url)
    private var closed = false

    init(url: String, emit: @escaping (HostWebSocketEvent) -> Void) throws {
        guard let parsedURL = URL(string: url) else {
            throw HostWebSocketSessionError.invalidURL(url)
        }

        guard isSupportedWebSocketURL(parsedURL) else {
            throw HostWebSocketSessionError.unsupportedScheme(parsedURL.scheme)
        }

        self.url = parsedURL
        self.emit = emit
        super.init()

        print("[URLSessionHostWebSocketSession] start url=\(parsedURL.absoluteString)")
        task.resume()
        receiveNextMessage()
    }

    deinit {
        session.invalidateAndCancel()
    }

    func send(text: String) {
        task.send(.string(text)) { [emit] error in
            guard let error else {
                return
            }

            emit(.error(describeWebSocketError(error)))
        }
    }

    func close(code: Int?, reason: String?) {
        print("[URLSessionHostWebSocketSession] close code=\(String(describing: code)) reason=\(String(describing: reason)) url=\(url.absoluteString)")
        let closeCode = code.flatMap(URLSessionWebSocketTask.CloseCode.init(rawValue:))
            ?? .normalClosure
        task.cancel(with: closeCode, reason: reason?.data(using: .utf8))
    }

    private func receiveNextMessage() {
        task.receive { [weak self] result in
            guard let self else {
                return
            }

            switch result {
            case .success(.string(let text)):
                self.emit(.message(text))
                self.receiveNextMessage()
            case .success(.data):
                self.emit(.error("Binary frames are not supported"))
                self.receiveNextMessage()
            case .failure:
                break
            @unknown default:
                break
            }
        }
    }

    private func closeIfNeeded(code: Int?, reason: String?) {
        guard !closed else {
            return
        }

        closed = true
        emit(.close(code, reason))
        session.invalidateAndCancel()
    }
}

extension URLSessionHostWebSocketSession: URLSessionWebSocketDelegate, URLSessionTaskDelegate {
    func urlSession(
        _ session: URLSession,
        webSocketTask: URLSessionWebSocketTask,
        didOpenWithProtocol negotiatedProtocol: String?
    ) {
        print("[URLSessionHostWebSocketSession] didOpen url=\(url.absoluteString) protocol=\(negotiatedProtocol ?? "nil")")
        emit(.open)
    }

    func urlSession(
        _ session: URLSession,
        webSocketTask: URLSessionWebSocketTask,
        didCloseWith closeCode: URLSessionWebSocketTask.CloseCode,
        reason: Data?
    ) {
        let resolvedReason = reason.flatMap { String(data: $0, encoding: .utf8) }
        print("[URLSessionHostWebSocketSession] didClose url=\(url.absoluteString) code=\(closeCode.rawValue) reason=\(resolvedReason ?? "nil")")
        closeIfNeeded(code: Int(closeCode.rawValue), reason: resolvedReason)
    }

    func urlSession(
        _ session: URLSession,
        task: URLSessionTask,
        didCompleteWithError error: Error?
    ) {
        guard let error else {
            return
        }

        if isCancelledWebSocketError(error) {
            print("[URLSessionHostWebSocketSession] didComplete cancelled url=\(url.absoluteString)")
            closeIfNeeded(code: nil, reason: nil)
            return
        }

        let message = describeWebSocketError(error)
        print("[URLSessionHostWebSocketSession] didComplete error url=\(url.absoluteString) message=\(message)")
        emit(.error(message))
        closeIfNeeded(code: nil, reason: message)
    }

    func urlSession(
        _ session: URLSession,
        didReceive challenge: URLAuthenticationChallenge,
        completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void
    ) {
        print("[URLSessionHostWebSocketSession] challenge host=\(challenge.protectionSpace.host) method=\(challenge.protectionSpace.authenticationMethod)")
        guard challenge.protectionSpace.authenticationMethod == NSURLAuthenticationMethodServerTrust,
              let trust = challenge.protectionSpace.serverTrust else {
            completionHandler(.performDefaultHandling, nil)
            return
        }

        var trustError: CFError?
        if SecTrustEvaluateWithError(trust, &trustError) {
            print("[URLSessionHostWebSocketSession] challenge accepted by system host=\(challenge.protectionSpace.host)")
            completionHandler(.useCredential, URLCredential(trust: trust))
            return
        }

        if trustLooksLikeAiriServerCertificate(trust) {
            print("[URLSessionHostWebSocketSession] challenge accepted by AIRI fallback host=\(challenge.protectionSpace.host)")
            completionHandler(.useCredential, URLCredential(trust: trust))
            return
        }

        print("[URLSessionHostWebSocketSession] challenge rejected host=\(challenge.protectionSpace.host) trustError=\(String(describing: trustError))")
        completionHandler(.cancelAuthenticationChallenge, nil)
    }
}

private enum HostWebSocketSessionError: LocalizedError {
    case invalidURL(String)
    case unsupportedScheme(String?)

    var errorDescription: String? {
        switch self {
        case .invalidURL(let url):
            return "Invalid websocket url: \(url)"
        case .unsupportedScheme(let scheme):
            return "Unsupported websocket url scheme: \(scheme ?? "nil")"
        }
    }
}

private func isSupportedWebSocketURL(_ url: URL) -> Bool {
    guard let scheme = url.scheme?.lowercased() else {
        return false
    }

    return scheme == "ws" || scheme == "wss"
}

private func describeWebSocketError(_ error: Error) -> String {
    let nsError = error as NSError
    var details = ["\(nsError.localizedDescription) [\(nsError.domain):\(nsError.code)]"]

    if let failingURL = nsError.userInfo[NSURLErrorFailingURLErrorKey] as? URL {
        details.append("url=\(failingURL.absoluteString)")
    } else if let failingURL = nsError.userInfo[NSURLErrorFailingURLStringErrorKey] as? String {
        details.append("url=\(failingURL)")
    }

    if let failureReason = nsError.localizedFailureReason, !failureReason.isEmpty {
        details.append("reason=\(failureReason)")
    }

    if let recoverySuggestion = nsError.localizedRecoverySuggestion, !recoverySuggestion.isEmpty {
        details.append("suggestion=\(recoverySuggestion)")
    }

    return details.joined(separator: " ")
}

private func isCancelledWebSocketError(_ error: Error) -> Bool {
    let nsError = error as NSError
    return nsError.domain == NSURLErrorDomain && nsError.code == NSURLErrorCancelled
}

private func trustLooksLikeAiriServerCertificate(_ trust: SecTrust) -> Bool {
    guard let leaf = SecTrustGetCertificateAtIndex(trust, 0),
          certificateSummary(leaf) == "localhost" else {
        return false
    }

    let issuerIndex = SecTrustGetCertificateCount(trust) - 1
    guard issuerIndex >= 1,
          let issuer = SecTrustGetCertificateAtIndex(trust, issuerIndex) else {
        return false
    }

    return certificateSummary(issuer) == "AIRI"
}

private func certificateSummary(_ certificate: SecCertificate) -> String? {
    SecCertificateCopySubjectSummary(certificate) as String?
}
