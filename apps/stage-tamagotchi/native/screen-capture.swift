import Foundation
import ScreenCaptureKit
import CoreMedia
import CoreVideo

// A single serial queue owns the latest frame and stdout. The parent requests
// frames one at a time, so a slow renderer never queues captured images.
// Mutable frame state is confined to queue; stream is assigned before stdin starts.
final class Capture: NSObject, SCStreamOutput, SCStreamDelegate, @unchecked Sendable {
    let queue = DispatchQueue(label: "airi.screen-capture")
    var latest: CVPixelBuffer?
    var sequence: UInt64 = 0
    var delivered: UInt64 = 0
    var stream: SCStream?

    // Wire format: kind byte, little-endian UInt32 byte count, payload.
    // 0 = ready, 1 = packed RGBA, 2 = UTF-8 error, 3 = no new frame.
    func send(_ kind: UInt8, _ payload: Data = Data()) {
        var packet = Data([kind])
        var length = UInt32(payload.count).littleEndian
        withUnsafeBytes(of: &length) { packet.append(contentsOf: $0) }
        packet.append(payload)
        FileHandle.standardOutput.write(packet)
    }

    func stream(_ stream: SCStream, didStopWithError error: Error) {
        queue.async { self.send(2, Data(error.localizedDescription.utf8)) }
    }

    func stream(_ stream: SCStream, didOutputSampleBuffer sample: CMSampleBuffer, of type: SCStreamOutputType) {
        guard type == .screen,
              let attachments = CMSampleBufferGetSampleAttachmentsArray(sample, createIfNecessary: false) as? [[SCStreamFrameInfo: Any]],
              let status = attachments.first?[.status] as? Int,
              status == SCFrameStatus.complete.rawValue,
              let image = CMSampleBufferGetImageBuffer(sample) else { return }
        latest = image
        sequence &+= 1
    }

    func readFrame() {
        guard let image = latest, delivered != sequence else { send(3); return }
        delivered = sequence
        CVPixelBufferLockBaseAddress(image, .readOnly)
        defer { CVPixelBufferUnlockBaseAddress(image, .readOnly) }
        guard let base = CVPixelBufferGetBaseAddress(image) else { send(3); return }
        let width = CVPixelBufferGetWidth(image)
        let height = CVPixelBufferGetHeight(image)
        let stride = CVPixelBufferGetBytesPerRow(image)
        var pixels = Data(count: width * height * 4)
        pixels.withUnsafeMutableBytes { target in
            let dst = target.bindMemory(to: UInt8.self).baseAddress!
            let src = base.assumingMemoryBound(to: UInt8.self)
            for y in 0..<height {
                for x in 0..<width {
                    let from = y * stride + x * 4
                    let to = (y * width + x) * 4
                    dst[to] = src[from + 2]
                    dst[to + 1] = src[from + 1]
                    dst[to + 2] = src[from]
                    dst[to + 3] = 255
                }
            }
        }
        send(1, pixels)
    }

    func start(displayID: UInt32, windowID: UInt32, width: Int, height: Int, fps: Int) async throws {
        let content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: false)
        guard let display = content.displays.first(where: { $0.displayID == displayID }),
              let window = content.windows.first(where: { $0.windowID == windowID }) else {
            throw NSError(domain: "AIRI", code: 1, userInfo: [NSLocalizedDescriptionKey: "The display or AIRI stage window is unavailable."])
        }
        // Exclusion happens in the compositor: windows beneath AIRI remain in
        // the frame. No silhouette mask or inferred replacement pixels follow.
        let filter = SCContentFilter(display: display, excludingWindows: [window])
        let configuration = SCStreamConfiguration()
        configuration.width = width
        configuration.height = height
        configuration.pixelFormat = kCVPixelFormatType_32BGRA
        configuration.minimumFrameInterval = CMTime(value: 1, timescale: Int32(fps))
        configuration.queueDepth = 3
        configuration.showsCursor = false
        configuration.scalesToFit = true
        configuration.capturesAudio = false
        let stream = SCStream(filter: filter, configuration: configuration, delegate: self)
        self.stream = stream
        try stream.addStreamOutput(self, type: .screen, sampleHandlerQueue: queue)
        try await stream.startCapture()
        queue.async { self.send(0) }
        DispatchQueue.global().async {
            while let command = readLine() {
                if command == "frame" { self.queue.async { self.readFrame() } }
            }
            Task { try? await self.stream?.stopCapture(); exit(0) }
        }
    }
}

// The Electron owner validates these arguments before spawning this helper.
// Initialization errors use the same framed protocol as capture errors.
let capture = Capture()
Task {
    do {
        let args = CommandLine.arguments
        guard args.count == 6,
              let display = UInt32(args[1]), let window = UInt32(args[2]),
              let width = Int(args[3]), let height = Int(args[4]), let fps = Int(args[5]),
              (1...512).contains(width), (1...512).contains(height), (1...30).contains(fps) else {
            throw NSError(domain: "AIRI", code: 2, userInfo: [NSLocalizedDescriptionKey: "Invalid screen capture arguments."])
        }
        try await capture.start(displayID: display, windowID: window, width: width, height: height, fps: fps)
    } catch {
        capture.send(2, Data(error.localizedDescription.utf8))
        exit(1)
    }
}
dispatchMain()
