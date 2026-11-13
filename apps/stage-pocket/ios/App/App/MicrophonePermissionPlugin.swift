import AVFoundation
import Capacitor
import Foundation

/// Reads the microphone permission of the app from the system, without a prompt.
/// Capacitor grants each capture request of the web view, so this permission is the only one that applies.
@objc(MicrophonePermissionPlugin)
final class MicrophonePermissionPlugin: CAPPlugin, CAPBridgedPlugin {
    let identifier = "MicrophonePermissionPlugin"
    let jsName = "MicrophonePermission"
    let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "checkPermission", returnType: CAPPluginReturnPromise)
    ]

    @objc func checkPermission(_ call: CAPPluginCall) {
        call.resolve(["granted": isGranted()])
    }

    private func isGranted() -> Bool {
        if #available(iOS 17.0, *) {
            return AVAudioApplication.shared.recordPermission == .granted
        }
        return AVAudioSession.sharedInstance().recordPermission == .granted
    }
}
