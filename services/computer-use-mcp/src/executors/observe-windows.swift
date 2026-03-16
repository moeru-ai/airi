import AppKit
import CoreGraphics
import Foundation

func boundsDict(_ value: NSDictionary?) -> [String: Int]? {
  guard let value else { return nil }
  var rect = CGRect.zero
  guard CGRectMakeWithDictionaryRepresentation(value, &rect) else { return nil }
  return [
    "x": Int(rect.origin.x.rounded()),
    "y": Int(rect.origin.y.rounded()),
    "width": Int(rect.size.width.rounded()),
    "height": Int(rect.size.height.rounded())
  ]
}

let environment = ProcessInfo.processInfo.environment
let rawInput = environment["COMPUTER_USE_SWIFT_STDIN"] ?? "{}"
let inputData = rawInput.data(using: .utf8) ?? Data()
let input = (try? JSONSerialization.jsonObject(with: inputData)) as? [String: Any] ?? [:]
let limit = (input["limit"] as? Int) ?? 12
let appFilter = ((input["app"] as? String) ?? "").lowercased().trimmingCharacters(in: .whitespacesAndNewlines)
let frontmostAppName = NSWorkspace.shared.frontmostApplication?.localizedName

let options: CGWindowListOption = [.optionOnScreenOnly, .excludeDesktopElements]
let rawWindowInfo = CGWindowListCopyWindowInfo(options, kCGNullWindowID) as? [[String: Any]] ?? []
var windows: [[String: Any]] = []
for window in rawWindowInfo {
  let ownerName = (window[kCGWindowOwnerName as String] as? String) ?? "Unknown"
  if !appFilter.isEmpty && !ownerName.lowercased().contains(appFilter) {
    continue
  }

  let alpha = window[kCGWindowAlpha as String] as? Double ?? 1.0
  let layer = window[kCGWindowLayer as String] as? Int ?? 0
  let windowNumber = window[kCGWindowNumber as String] as? Int ?? 0
  let bounds = boundsDict(window[kCGWindowBounds as String] as? NSDictionary)
  let title = (window[kCGWindowName as String] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines)
  let ownerPid = window[kCGWindowOwnerPID as String] as? Int ?? 0

  if alpha <= 0 || (bounds?["width"] ?? 0) <= 1 || (bounds?["height"] ?? 0) <= 1 {
    continue
  }

  let windowId = windowNumber > 0
    ? "cg:\(windowNumber)"
    : "\(ownerPid):\(layer):\(title ?? ownerName)"

  windows.append([
    "id": windowId,
    "windowNumber": windowNumber,
    "appName": ownerName,
    "title": title as Any,
    "bounds": bounds as Any,
    "ownerPid": ownerPid,
    "layer": layer,
    "isOnScreen": true,
  ])

  if windows.count >= limit {
    break
  }
}

let frontmostWindowTitle = windows.first(where: { ($0["appName"] as? String) == frontmostAppName })?["title"]
let payload: [String: Any] = [
  "frontmostAppName": frontmostAppName as Any,
  "frontmostWindowTitle": frontmostWindowTitle as Any,
  "windows": windows,
  "observedAt": ISO8601DateFormatter().string(from: Date()),
]

let data = try JSONSerialization.data(withJSONObject: payload, options: [])
print(String(data: data, encoding: .utf8)!)
