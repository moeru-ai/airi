import AVFAudio
import CoreMedia
import Foundation
import Speech

public typealias AppleSpeechStreamUpdate = @Sendable (NSString?, NSString?, Bool) -> Void

@available(macOS 26.0, *)
private actor AppleSpeechStreamRegistry {
    private var sessions: [String: AppleSpeechStreamSession] = [:]

    func start(
        localeIdentifier: String,
        sampleRate: Int,
        update: @escaping AppleSpeechStreamUpdate
    ) async throws -> String {
        let identifier = UUID().uuidString
        let session = try await AppleSpeechStreamSession(
            localeIdentifier: localeIdentifier,
            sampleRate: sampleRate,
            update: update
        )
        sessions[identifier] = session
        return identifier
    }

    func append(identifier: String, audio: Data) async throws {
        guard let session = sessions[identifier] else {
            throw AppleSpeechError.unknownStream(identifier)
        }

        try await session.append(audio)
    }

    func finish(identifier: String) async throws {
        guard let session = sessions.removeValue(forKey: identifier) else {
            throw AppleSpeechError.unknownStream(identifier)
        }

        try await session.finish()
    }

    func cancel(identifier: String) async {
        guard let session = sessions.removeValue(forKey: identifier) else {
            return
        }

        await session.cancel()
    }
}

@available(macOS 26.0, *)
private actor AppleSpeechStreamSession {
    private struct Segment {
        let range: CMTimeRange
        let text: String
        let isFinal: Bool
    }

    private let analyzer: SpeechAnalyzer
    private let audioFormat: AVAudioFormat
    private let inputContinuation: AsyncStream<AnalyzerInput>.Continuation
    private let inputSequence: AsyncStream<AnalyzerInput>
    private let locale: Locale
    private let transcriber: SpeechTranscriber
    private let update: AppleSpeechStreamUpdate

    private var resultTask: Task<Void, Error>?
    private var segments: [Segment] = []
    private var completed = false
    private var stopped = false

    init(
        localeIdentifier: String,
        sampleRate: Int,
        update: @escaping AppleSpeechStreamUpdate
    ) async throws {
        guard SpeechTranscriber.isAvailable else {
            throw AppleSpeechError.unavailable
        }
        guard sampleRate > 0 else {
            throw AppleSpeechError.invalidSampleRate(sampleRate)
        }

        let requestedLocale = Locale(identifier: localeIdentifier)
        guard let locale = await SpeechTranscriber.supportedLocale(equivalentTo: requestedLocale) else {
            throw AppleSpeechError.unsupportedLocale(localeIdentifier)
        }
        guard let audioFormat = AVAudioFormat(
            commonFormat: .pcmFormatInt16,
            sampleRate: Double(sampleRate),
            channels: 1,
            interleaved: false
        ) else {
            throw AppleSpeechError.invalidSampleRate(sampleRate)
        }

        let transcriber = SpeechTranscriber(locale: locale, preset: .timeIndexedProgressiveTranscription)
        if let installationRequest = try await AssetInventory.assetInstallationRequest(supporting: [transcriber]) {
            try await installationRequest.downloadAndInstall()
        }

        let input = AsyncStream<AnalyzerInput>.makeStream()
        self.analyzer = SpeechAnalyzer(modules: [transcriber])
        self.audioFormat = audioFormat
        self.inputContinuation = input.continuation
        self.inputSequence = input.stream
        self.locale = locale
        self.transcriber = transcriber
        self.update = update

        try await analyzer.prepareToAnalyze(in: audioFormat)
        resultTask = Task { [weak self, transcriber] in
            do {
                for try await result in transcriber.results {
                    try Task.checkCancellation()
                    await self?.accept(result)
                }
            } catch is CancellationError {
                return
            } catch {
                await self?.fail(error)
                throw error
            }
        }
        try await analyzer.start(inputSequence: inputSequence)
    }

    func append(_ audio: Data) throws {
        guard !stopped else {
            throw AppleSpeechError.streamStopped
        }
        guard audio.count.isMultiple(of: MemoryLayout<Int16>.size) else {
            throw AppleSpeechError.invalidPCMByteCount(audio.count)
        }

        let frameCount = audio.count / MemoryLayout<Int16>.size
        guard frameCount > 0 else {
            return
        }
        guard let buffer = AVAudioPCMBuffer(
            pcmFormat: audioFormat,
            frameCapacity: AVAudioFrameCount(frameCount)
        ), let samples = buffer.int16ChannelData?[0] else {
            throw AppleSpeechError.cannotCreatePCMBuffer
        }

        audio.withUnsafeBytes { bytes in
            guard let source = bytes.baseAddress else {
                return
            }
            memcpy(samples, source, audio.count)
        }
        buffer.frameLength = AVAudioFrameCount(frameCount)
        inputContinuation.yield(AnalyzerInput(buffer: buffer))
    }

    func finish() async throws {
        guard !stopped else {
            return
        }

        stopped = true
        inputContinuation.finish()
        do {
            try await analyzer.finalizeAndFinishThroughEndOfInput()
            try await resultTask?.value
            complete()
        } catch {
            fail(error)
            throw error
        }
    }

    func cancel() async {
        guard !stopped else {
            return
        }

        stopped = true
        inputContinuation.finish()
        resultTask?.cancel()
        await analyzer.cancelAndFinishNow()
        complete()
    }

    private func accept(_ result: SpeechTranscriber.Result) {
        let text = String(result.text.characters)
        segments.removeAll { segment in
            rangesOverlap(segment.range, result.range)
                && (result.isFinal || !segment.isFinal)
        }
        if !text.isEmpty {
            segments.append(Segment(range: result.range, text: text, isFinal: result.isFinal))
        }
        segments.sort { CMTimeCompare($0.range.start, $1.range.start) < 0 }

        do {
            let payload: [String: Any] = [
                "durationMilliseconds": milliseconds(result.range.duration),
                "isFinal": result.isFinal,
                "locale": locale.identifier,
                "startMilliseconds": milliseconds(result.range.start),
                "text": segments.map(\.text).joined().trimmingCharacters(in: .whitespacesAndNewlines),
            ]
            update(try jsonString(payload) as NSString, nil, false)
        } catch {
            fail(error)
        }
    }

    private func fail(_ error: Error) {
        guard !completed else {
            return
        }

        completed = true
        stopped = true
        update(nil, String(describing: error) as NSString, true)
    }

    private func complete() {
        guard !completed else {
            return
        }

        completed = true
        update(nil, nil, true)
    }

    private func rangesOverlap(_ left: CMTimeRange, _ right: CMTimeRange) -> Bool {
        CMTimeCompare(left.start, CMTimeRangeGetEnd(right)) < 0
            && CMTimeCompare(right.start, CMTimeRangeGetEnd(left)) < 0
    }

    private func milliseconds(_ time: CMTime) -> Double {
        let seconds = CMTimeGetSeconds(time)
        return seconds.isFinite ? seconds * 1_000 : 0
    }
}

private func jsonString(_ value: [String: Any]) throws -> String {
    let data = try JSONSerialization.data(withJSONObject: value, options: [.sortedKeys])
    guard let json = String(data: data, encoding: .utf8) else {
        throw AppleSpeechError.invalidJSON
    }
    return json
}

@available(macOS 26.0, *)
@objc public final class AppleSpeechBridge: NSObject {
    private static let streamRegistry = AppleSpeechStreamRegistry()

    @objc public static func getCapabilities(
        completion: @escaping (NSString?, NSString?) -> Void
    ) {
        Task {
            guard SpeechTranscriber.isAvailable else {
                completeJSON(
                    [
                        "available": false,
                        "installedLocales": [],
                        "reason": "SpeechTranscriber is unavailable on this Mac.",
                        "supportedLocales": [],
                    ],
                    completion: completion
                )
                return
            }

            let supportedLocales = await SpeechTranscriber.supportedLocales
            let installedLocales = await SpeechTranscriber.installedLocales
            completeJSON(
                [
                    "available": true,
                    "installedLocales": installedLocales.map(\.identifier).sorted(),
                    "supportedLocales": supportedLocales.map(\.identifier).sorted(),
                ],
                completion: completion
            )
        }
    }

    @objc public static func transcribeFile(
        _ path: NSString,
        localeIdentifier: NSString,
        completion: @escaping (NSString?, NSString?) -> Void
    ) {
        Task {
            do {
                let result = try await transcribeFile(
                    path: path as String,
                    localeIdentifier: localeIdentifier as String
                )
                completeJSON(result, completion: completion)
            } catch {
                completion(nil, String(describing: error) as NSString)
            }
        }
    }

    @objc public static func transcribeAudio(
        _ audio: NSData,
        localeIdentifier: NSString,
        fileExtension: NSString,
        completion: @escaping (NSString?, NSString?) -> Void
    ) {
        Task {
            let safeExtension = (fileExtension as String).filter { $0.isLetter || $0.isNumber }
            let temporaryURL = FileManager.default.temporaryDirectory
                .appendingPathComponent(UUID().uuidString)
                .appendingPathExtension(safeExtension.isEmpty ? "wav" : safeExtension)

            do {
                try (audio as Data).write(to: temporaryURL, options: .atomic)
                defer { try? FileManager.default.removeItem(at: temporaryURL) }
                let result = try await transcribeFile(
                    path: temporaryURL.path,
                    localeIdentifier: localeIdentifier as String
                )
                completeJSON(result, completion: completion)
            } catch {
                completion(nil, String(describing: error) as NSString)
            }
        }
    }

    @objc public static func startStreaming(
        localeIdentifier: NSString,
        sampleRate: Int,
        update: @escaping AppleSpeechStreamUpdate,
        completion: @escaping (NSString?, NSString?) -> Void
    ) {
        let locale = localeIdentifier as String
        Task {
            do {
                let identifier = try await streamRegistry.start(
                    localeIdentifier: locale,
                    sampleRate: sampleRate,
                    update: update
                )
                completion(identifier as NSString, nil)
            } catch {
                completion(nil, String(describing: error) as NSString)
            }
        }
    }

    @objc public static func appendStreamingAudio(
        sessionIdentifier: NSString,
        audio: NSData,
        completion: @escaping (NSString?, NSString?) -> Void
    ) {
        let identifier = sessionIdentifier as String
        let audioData = audio as Data
        Task {
            do {
                try await streamRegistry.append(
                    identifier: identifier,
                    audio: audioData
                )
                completion("{}" as NSString, nil)
            } catch {
                completion(nil, String(describing: error) as NSString)
            }
        }
    }

    @objc public static func finishStreaming(
        sessionIdentifier: NSString,
        completion: @escaping (NSString?, NSString?) -> Void
    ) {
        let identifier = sessionIdentifier as String
        Task {
            do {
                try await streamRegistry.finish(identifier: identifier)
                completion("{}" as NSString, nil)
            } catch {
                completion(nil, String(describing: error) as NSString)
            }
        }
    }

    @objc public static func cancelStreaming(
        sessionIdentifier: NSString,
        completion: @escaping (NSString?, NSString?) -> Void
    ) {
        let identifier = sessionIdentifier as String
        Task {
            await streamRegistry.cancel(identifier: identifier)
            completion("{}" as NSString, nil)
        }
    }

    private static func transcribeFile(
        path: String,
        localeIdentifier: String
    ) async throws -> [String: Any] {
        guard SpeechTranscriber.isAvailable else {
            throw AppleSpeechError.unavailable
        }

        let requestedLocale = Locale(identifier: localeIdentifier)
        guard let locale = await SpeechTranscriber.supportedLocale(equivalentTo: requestedLocale) else {
            throw AppleSpeechError.unsupportedLocale(localeIdentifier)
        }

        let transcriber = SpeechTranscriber(locale: locale, preset: .transcription)
        if let installationRequest = try await AssetInventory.assetInstallationRequest(supporting: [transcriber]) {
            try await installationRequest.downloadAndInstall()
        }

        let file = try AVAudioFile(forReading: URL(fileURLWithPath: path))
        let analyzer = SpeechAnalyzer(modules: [transcriber])
        let startedAt = ContinuousClock.now
        let resultTask = Task { () throws -> [String] in
            var segments: [String] = []
            for try await result in transcriber.results where result.isFinal {
                let text = String(result.text.characters).trimmingCharacters(in: .whitespacesAndNewlines)
                if !text.isEmpty {
                    segments.append(text)
                }
            }
            return segments
        }
        defer { resultTask.cancel() }

        let lastSampleTime = try await analyzer.analyzeSequence(from: file)
        if let lastSampleTime {
            try await analyzer.finalizeAndFinish(through: lastSampleTime)
        } else {
            await analyzer.cancelAndFinishNow()
        }

        let segments = try await resultTask.value
        let duration = startedAt.duration(to: .now).components
        let durationMilliseconds = Double(duration.seconds) * 1_000
            + Double(duration.attoseconds) / 1_000_000_000_000_000
        return [
            "durationMilliseconds": durationMilliseconds,
            "isFinal": true,
            "locale": locale.identifier,
            "text": segments.joined(separator: " "),
        ]
    }

    private static func completeJSON(
        _ value: [String: Any],
        completion: @escaping (NSString?, NSString?) -> Void
    ) {
        do {
            completion(try jsonString(value) as NSString, nil)
        } catch {
            completion(nil, String(describing: error) as NSString)
        }
    }
}

private enum AppleSpeechError: LocalizedError {
    case cannotCreatePCMBuffer
    case invalidPCMByteCount(Int)
    case invalidJSON
    case invalidSampleRate(Int)
    case streamStopped
    case unknownStream(String)
    case unavailable
    case unsupportedLocale(String)

    var errorDescription: String? {
        switch self {
        case .cannotCreatePCMBuffer:
            return "Apple Speech could not create a PCM audio buffer."
        case let .invalidPCMByteCount(count):
            return "Apple Speech received \(count) PCM bytes. The byte count must be even."
        case .invalidJSON:
            return "Apple Speech returned a result that cannot be encoded as JSON."
        case let .invalidSampleRate(sampleRate):
            return "Apple Speech received invalid sample rate \(sampleRate)."
        case .streamStopped:
            return "Apple Speech received audio after the stream stopped."
        case let .unknownStream(identifier):
            return "Apple Speech stream \(identifier) does not exist."
        case .unavailable:
            return "SpeechTranscriber is unavailable on this Mac."
        case let .unsupportedLocale(locale):
            return "Apple Speech does not support locale \(locale)."
        }
    }
}
