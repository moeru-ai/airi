import Foundation
import WebKit

final class WeakScriptMessageHandler: NSObject, WKScriptMessageHandler {
    weak var delegate: WKScriptMessageHandler?

    init(delegate: WKScriptMessageHandler) {
        self.delegate = delegate
        super.init()
    }

    func userContentController(
        _ userContentController: WKUserContentController,
        didReceive message: WKScriptMessage
    ) {
        delegate?.userContentController(userContentController, didReceive: message)
    }
}

extension String {
    var javaScriptEscapedStringLiteral: String {
        let json = try? JSONSerialization.data(withJSONObject: [self])
        guard let json else {
            return "\"\""
        }

        let serialized = String(bytes: json, encoding: .utf8) ?? "[\"\"]"
        return String(serialized.dropFirst().dropLast())
    }
}
