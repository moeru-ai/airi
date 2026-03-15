import ApplicationServices
import AppKit
import Foundation

struct AXNodeJSON: Encodable {
  let role: String
  let title: String?
  let value: String?
  let description: String?
  let enabled: Bool?
  let focused: Bool?
  let bounds: BoundsJSON?
  let children: [AXNodeJSON]
}

struct BoundsJSON: Encodable {
  let x: Int
  let y: Int
  let width: Int
  let height: Int
}

struct OutputJSON: Encodable {
  let pid: Int32
  let appName: String
  let root: AXNodeJSON?
  let truncated: Bool
}

func getStringAttr(_ element: AXUIElement, _ attr: String) -> String? {
  var value: AnyObject?
  guard AXUIElementCopyAttributeValue(element, attr as CFString, &value) == .success else { return nil }
  return value as? String
}

func getBoolAttr(_ element: AXUIElement, _ attr: String) -> Bool? {
  var value: AnyObject?
  guard AXUIElementCopyAttributeValue(element, attr as CFString, &value) == .success else { return nil }
  if let num = value as? NSNumber { return num.boolValue }
  return nil
}

func getBounds(_ element: AXUIElement) -> BoundsJSON? {
  var posValue: AnyObject?
  var sizeValue: AnyObject?
  guard AXUIElementCopyAttributeValue(element, kAXPositionAttribute as String as CFString, &posValue) == .success,
        AXUIElementCopyAttributeValue(element, kAXSizeAttribute as String as CFString, &sizeValue) == .success
  else { return nil }

  let posType = AXValueGetType(posValue as! AXValue)
  let sizeType = AXValueGetType(sizeValue as! AXValue)
  guard posType == .cgPoint, sizeType == .cgSize else { return nil }

  var point = CGPoint.zero
  var size = CGSize.zero
  AXValueGetValue(posValue as! AXValue, .cgPoint, &point)
  AXValueGetValue(sizeValue as! AXValue, .cgSize, &size)

  return BoundsJSON(
    x: Int(point.x.rounded()),
    y: Int(point.y.rounded()),
    width: Int(size.width.rounded()),
    height: Int(size.height.rounded())
  )
}

func walkTree(_ element: AXUIElement, depth: Int, maxDepth: Int, nodeCount: inout Int, maxNodes: Int, verbose: Bool) -> AXNodeJSON? {
  if depth > maxDepth || nodeCount >= maxNodes { return nil }
  nodeCount += 1

  let role = getStringAttr(element, kAXRoleAttribute as String) ?? ""
  let title = getStringAttr(element, kAXTitleAttribute as String)
  let valueStr: String? = {
    var raw: AnyObject?
    guard AXUIElementCopyAttributeValue(element, kAXValueAttribute as String as CFString, &raw) == .success else { return nil }
    if let s = raw as? String { return s.count > 500 ? String(s.prefix(500)) : s }
    if let n = raw as? NSNumber { return n.stringValue }
    return nil
  }()
  let desc = getStringAttr(element, kAXDescriptionAttribute as String)

  if !verbose && role.isEmpty && title == nil && desc == nil && valueStr == nil {
    return nil
  }

  let enabled = getBoolAttr(element, kAXEnabledAttribute as String)
  let focused = getBoolAttr(element, kAXFocusedAttribute as String)
  let bounds = getBounds(element)

  var childNodes: [AXNodeJSON] = []
  var childrenRef: AnyObject?
  if AXUIElementCopyAttributeValue(element, kAXChildrenAttribute as String as CFString, &childrenRef) == .success,
     let children = childrenRef as? [AXUIElement] {
    for child in children {
      if let childNode = walkTree(child, depth: depth + 1, maxDepth: maxDepth, nodeCount: &nodeCount, maxNodes: maxNodes, verbose: verbose) {
        childNodes.append(childNode)
      }
    }
  }

  return AXNodeJSON(
    role: role,
    title: title,
    value: valueStr,
    description: desc,
    enabled: enabled,
    focused: focused,
    bounds: bounds,
    children: childNodes
  )
}

let environment = ProcessInfo.processInfo.environment
let rawInput = environment["COMPUTER_USE_SWIFT_STDIN"] ?? "{}"
let inputData = rawInput.data(using: .utf8) ?? Data()
let input = (try? JSONSerialization.jsonObject(with: inputData)) as? [String: Any] ?? [:]

let maxDepth = (input["maxDepth"] as? Int) ?? 15
let maxNodes = (input["maxNodes"] as? Int) ?? 2000
let verbose = (input["verbose"] as? Bool) ?? false
let targetPid: Int32? = (input["pid"] as? Int).map { Int32($0) }

let pid: Int32
let appName: String

if let targetPid {
  pid = targetPid
  let app = NSRunningApplication(processIdentifier: targetPid)
  appName = app?.localizedName ?? "pid:\(targetPid)"
} else {
  guard let frontApp = NSWorkspace.shared.frontmostApplication else {
    let output = OutputJSON(pid: 0, appName: "unknown", root: nil, truncated: false)
    let data = try JSONEncoder().encode(output)
    print(String(data: data, encoding: .utf8)!)
    exit(0)
  }
  pid = frontApp.processIdentifier
  appName = frontApp.localizedName ?? "unknown"
}

let appElement = AXUIElementCreateApplication(pid)
var nodeCount = 0
let root = walkTree(appElement, depth: 0, maxDepth: maxDepth, nodeCount: &nodeCount, maxNodes: maxNodes, verbose: verbose)

let output = OutputJSON(pid: pid, appName: appName, root: root, truncated: nodeCount >= maxNodes)
let encoder = JSONEncoder()
let data = try encoder.encode(output)
print(String(data: data, encoding: .utf8)!)
