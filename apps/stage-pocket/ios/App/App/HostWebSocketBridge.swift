import Foundation

protocol HostWebSocketSession {
    func send(text: String)
    func close(code: Int?, reason: String?)
}

enum HostWebSocketEvent {
    case open
    case message(String)
    case error(String)
    case close(Int?, String?)
}

private struct HostBridgeCommand: Decodable {
    let kind: String
    let id: String
    let url: String?
    let data: String?
    let code: Int?
    let reason: String?
}

private struct HostBridgeEventPayload: Encodable {
    let kind: String
    let id: String
    let data: String?
    let message: String?
    let code: Int?
    let reason: String?
}

final class HostWebSocketBridge {
    typealias SessionFactory =
        (_ url: String, _ emit: @escaping (HostWebSocketEvent) -> Void) throws -> HostWebSocketSession

    private let sessionFactory: SessionFactory
    private let eventSink: (String) -> Void
    private var sessions: [String: HostWebSocketSession] = [:]
    private let decoder = JSONDecoder()
    private let encoder = JSONEncoder()

    init(
        sessionFactory: @escaping SessionFactory,
        eventSink: @escaping (String) -> Void
    ) {
        self.sessionFactory = sessionFactory
        self.eventSink = eventSink
    }

    func handleCommand(_ payload: String) {
        guard let data = payload.data(using: .utf8) else {
            return
        }

        guard let command = try? decoder.decode(HostBridgeCommand.self, from: data) else {
            return
        }

        DispatchQueue.main.async {
            switch command.kind {
            case "connect":
                self.handleConnect(command)
            case "send":
                self.handleSend(command)
            case "close":
                self.handleClose(command)
            default:
                break
            }
        }
    }

    func dispose() {
        DispatchQueue.main.async {
            self.sessions.values.forEach { $0.close(code: nil, reason: "Bridge disposed") }
            self.sessions.removeAll()
        }
    }

    private func handleConnect(_ command: HostBridgeCommand) {
        guard let url = command.url else {
            emitEvent(kind: "error", id: command.id, message: "Missing websocket url")
            emitEvent(kind: "close", id: command.id, reason: "Missing websocket url")
            return
        }

        print("[HostWebSocketBridge] connect id=\(command.id) url=\(url)")

        do {
            let session = try sessionFactory(url) { [weak self] event in
                self?.handleSessionEvent(id: command.id, event: event)
            }
            sessions[command.id] = session
        } catch {
            print("[HostWebSocketBridge] connect failed id=\(command.id) error=\(error.localizedDescription)")
            let message = error.localizedDescription
            emitEvent(kind: "error", id: command.id, message: message)
            emitEvent(kind: "close", id: command.id, reason: message)
        }
    }

    private func handleSend(_ command: HostBridgeCommand) {
        guard let data = command.data else {
            return
        }

        sessions[command.id]?.send(text: data)
    }

    private func handleClose(_ command: HostBridgeCommand) {
        sessions[command.id]?.close(code: command.code, reason: command.reason)
    }

    private func handleSessionEvent(id: String, event: HostWebSocketEvent) {
        DispatchQueue.main.async {
            print("[HostWebSocketBridge] event id=\(id) \(String(describing: event))")
            switch event {
            case .open:
                self.emitEvent(kind: "open", id: id)
            case .message(let data):
                self.emitEvent(kind: "message", id: id, data: data)
            case .error(let message):
                self.emitEvent(kind: "error", id: id, message: message)
            case .close(let code, let reason):
                self.sessions.removeValue(forKey: id)
                self.emitEvent(kind: "close", id: id, code: code, reason: reason)
            }
        }
    }

    private func emitEvent(
        kind: String,
        id: String,
        data: String? = nil,
        message: String? = nil,
        code: Int? = nil,
        reason: String? = nil
    ) {
        let payload = HostBridgeEventPayload(
            kind: kind,
            id: id,
            data: data,
            message: message,
            code: code,
            reason: reason
        )

        guard let encoded = try? encoder.encode(payload),
              let string = String(data: encoded, encoding: .utf8) else {
            return
        }

        eventSink(string)
    }
}
