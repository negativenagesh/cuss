
import Foundation
import CoreGraphics
import ApplicationServices
import AppKit

let args = CommandLine.arguments
let displayId = CGMainDisplayID()
let width = Double(CGDisplayPixelsWide(displayId))
let height = Double(CGDisplayPixelsHigh(displayId))
let eventSource = CGEventSource(stateID: .combinedSessionState)

if args.count < 2 || args[1] == "info" {
    print("\(Int(width))x\(Int(height))")
    exit(0)
}

func jsonString(_ s: String) -> String {
    let d = try! JSONSerialization.data(withJSONObject: [s])
    let arr = String(data: d, encoding: .utf8)!
    return String(arr.dropFirst().dropLast())
}

/// Accessibility snapshot of the focused UI element (role, value, secure/multiline flags).
/// Powers the phone's "focused-field echo" + secure-field lock + field-aware Enter.
var promptedForAccessibility = false
func focusedElementJSON() -> String {
    var trusted = AXIsProcessTrusted()
    if !trusted && !promptedForAccessibility {
        // First use after install: ask macOS to show the "allow node to control this computer" dialog once.
        promptedForAccessibility = true
        let opts = [kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: true] as CFDictionary
        trusted = AXIsProcessTrustedWithOptions(opts)
    }
    var out: [String: Any] = ["trusted": trusted]
    if let front = NSWorkspace.shared.frontmostApplication {
        out["app"] = front.localizedName ?? ""
        out["bundleId"] = front.bundleIdentifier ?? ""
        out["pid"] = Int(front.processIdentifier)
    }
    guard trusted else {
        let d = try! JSONSerialization.data(withJSONObject: out)
        return String(data: d, encoding: .utf8)!
    }
    var focusedRef: CFTypeRef?
    var r: AXError = .noValue
    if let front = NSWorkspace.shared.frontmostApplication {
        let appEl = AXUIElementCreateApplication(front.processIdentifier)
        // Electron/Chromium (Cursor, Chrome, Slack, VS Code) only expose their AX tree once a client opts in.
        AXUIElementSetAttributeValue(appEl, "AXManualAccessibility" as CFString, kCFBooleanTrue)
        AXUIElementSetAttributeValue(appEl, "AXEnhancedUserInterface" as CFString, kCFBooleanTrue)
        r = AXUIElementCopyAttributeValue(appEl, kAXFocusedUIElementAttribute as CFString, &focusedRef)
        var tries = 0
        while (r != .success || focusedRef == nil) && tries < 3 {
            usleep(80000)
            r = AXUIElementCopyAttributeValue(appEl, kAXFocusedUIElementAttribute as CFString, &focusedRef)
            tries += 1
        }
        // Chromium reports the whole AXWebArea when focus is inside web content; drill into it.
        if r == .success, let wa = focusedRef {
            var waRole: CFTypeRef?
            if AXUIElementCopyAttributeValue(wa as! AXUIElement, kAXRoleAttribute as CFString, &waRole) == .success, (waRole as? String) == "AXWebArea" {
                var inner: CFTypeRef?
                if AXUIElementCopyAttributeValue(wa as! AXUIElement, kAXFocusedUIElementAttribute as CFString, &inner) == .success, let inner = inner {
                    focusedRef = inner
                }
            }
        }
        if r != .success || focusedRef == nil {
            var winRef: CFTypeRef?
            if AXUIElementCopyAttributeValue(appEl, kAXFocusedWindowAttribute as CFString, &winRef) == .success, let winRef = winRef {
                r = AXUIElementCopyAttributeValue(winRef as! AXUIElement, kAXFocusedUIElementAttribute as CFString, &focusedRef)
            }
        }
    }
    if r != .success || focusedRef == nil {
        let sys = AXUIElementCreateSystemWide()
        r = AXUIElementCopyAttributeValue(sys, kAXFocusedUIElementAttribute as CFString, &focusedRef)
    }
    if r == .success, let focusedRef = focusedRef {
        let el = focusedRef as! AXUIElement
        func attr(_ name: String) -> Any? {
            var v: CFTypeRef?
            return AXUIElementCopyAttributeValue(el, name as CFString, &v) == .success ? v : nil
        }
        let role = (attr(kAXRoleAttribute as String) as? String) ?? ""
        let subrole = (attr(kAXSubroleAttribute as String) as? String) ?? ""
        out["role"] = role
        out["subrole"] = subrole
        out["title"] = (attr(kAXTitleAttribute as String) as? String) ?? ""
        out["placeholder"] = (attr(kAXPlaceholderValueAttribute as String) as? String) ?? ""
        out["description"] = (attr(kAXDescriptionAttribute as String) as? String) ?? ""
        let secure = role == (kAXTextFieldRole as String) && subrole == (kAXSecureTextFieldSubrole as String)
        out["secure"] = secure
        let editableRoles: Set<String> = [kAXTextFieldRole as String, kAXTextAreaRole as String, kAXComboBoxRole as String, "AXSearchField", "AXWebArea"]
        var editable = editableRoles.contains(role)
        var settable: DarwinBoolean = false
        if AXUIElementIsAttributeSettable(el, kAXValueAttribute as CFString, &settable) == .success, settable.boolValue { editable = true }
        out["editable"] = editable
        out["multiline"] = role == (kAXTextAreaRole as String) || role == "AXWebArea"
        if !secure, let value = attr(kAXValueAttribute as String) as? String {
            let max = 600
            if value.count > max {
                out["value"] = String(value.suffix(max))
                out["valueTruncated"] = true
                out["valueLength"] = value.count
            } else {
                out["value"] = value
                out["valueLength"] = value.count
            }
        }
        if let rangeVal = attr(kAXSelectedTextRangeAttribute as String) {
            var range = CFRange()
            if AXValueGetValue(rangeVal as! AXValue, .cfRange, &range) {
                out["selectionStart"] = range.location
                out["selectionLength"] = range.length
            }
        }
        if let line = attr("AXInsertionPointLineNumber") as? Int, line >= 0, line < 1_000_000 { out["line"] = line }
    } else {
        out["role"] = ""
        out["editable"] = false
        out["axError"] = Int(r.rawValue)
    }
    let d = try! JSONSerialization.data(withJSONObject: out)
    return String(data: d, encoding: .utf8)!
}

/// Type arbitrary Unicode text into the focused Mac window (Cursor, Chrome, Slack, Terminal, ...).
/// Newlines become a real Return key press so Enter submits forms/chats exactly like a physical keyboard.
func typeUnicode(_ text: String) {
    for ch in text {
        if ch == "\n" || ch == "\r" {
            pressKey(36, flags: [])
            continue
        }
        if ch == "\t" {
            pressKey(48, flags: [])
            continue
        }
        var units = Array(String(ch).utf16)
        if let down = CGEvent(keyboardEventSource: eventSource, virtualKey: 0, keyDown: true),
           let up = CGEvent(keyboardEventSource: eventSource, virtualKey: 0, keyDown: false) {
            down.keyboardSetUnicodeString(stringLength: units.count, unicodeString: &units)
            up.keyboardSetUnicodeString(stringLength: units.count, unicodeString: &units)
            down.post(tap: .cghidEventTap)
            up.post(tap: .cghidEventTap)
            usleep(1200)
        }
    }
}

func pressKey(_ code: CGKeyCode, flags: CGEventFlags) {
    if let down = CGEvent(keyboardEventSource: eventSource, virtualKey: code, keyDown: true),
       let up = CGEvent(keyboardEventSource: eventSource, virtualKey: code, keyDown: false) {
        down.flags = flags
        up.flags = flags
        down.post(tap: .cghidEventTap)
        usleep(6000)
        up.post(tap: .cghidEventTap)
        usleep(4000)
    }
}

func parseFlags(_ s: String) -> CGEventFlags {
    var f: CGEventFlags = []
    for part in s.lowercased().split(separator: ",") {
        switch part {
        case "cmd", "command": f.insert(.maskCommand)
        case "shift": f.insert(.maskShift)
        case "alt", "option": f.insert(.maskAlternate)
        case "ctrl", "control": f.insert(.maskControl)
        default: break
        }
    }
    return f
}

func mouseLocation() -> CGPoint {
    return CGEvent(source: nil)?.location ?? CGPoint(x: width / 2, y: height / 2)
}

var dragging = false

func mouseEvent(_ type: CGEventType, _ pt: CGPoint, button: CGMouseButton = .left) {
    CGEvent(mouseEventSource: eventSource, mouseType: type, mouseCursorPosition: pt, mouseButton: button)?.post(tap: .cghidEventTap)
}

/// Persistent daemon: reads one command per line from stdin so every phone keystroke lands in ~1ms.
///   type <base64-utf8>  key <keycode> [cmd,shift,alt,ctrl]  backspace <count>  focus
///   moverel <dx> <dy>  down  up  clickhere  rightclickhere  scroll <dy> [dx]
if args[1] == "daemon" {
    setvbuf(stdout, nil, _IOLBF, 0)
    while let line = readLine() {
        let parts = line.split(separator: " ", maxSplits: 3).map(String.init)
        guard let cmd = parts.first else { continue }
        if cmd == "type", parts.count >= 2, let data = Data(base64Encoded: parts[1]), let text = String(data: data, encoding: .utf8) {
            typeUnicode(text)
            print("OK type \(text.count)")
        } else if cmd == "key", parts.count >= 2, let code = UInt16(parts[1]) {
            pressKey(CGKeyCode(code), flags: parts.count >= 3 ? parseFlags(parts[2]) : [])
            print("OK key \(code)")
        } else if cmd == "backspace" {
            let n = parts.count >= 2 ? (Int(parts[1]) ?? 1) : 1
            for _ in 0..<max(1, min(n, 500)) { pressKey(51, flags: []) }
            print("OK backspace \(n)")
        } else if cmd == "focus" {
            print("FOCUS " + focusedElementJSON())
        } else if cmd == "moverel", parts.count >= 3 {
            let dx = Double(parts[1]) ?? 0
            let dy = Double(parts[2]) ?? 0
            let cur = mouseLocation()
            let pt = CGPoint(x: max(0, min(width - 1, cur.x + dx)), y: max(0, min(height - 1, cur.y + dy)))
            mouseEvent(dragging ? .leftMouseDragged : .mouseMoved, pt)
            print("OK moverel \(Int(pt.x)),\(Int(pt.y))")
        } else if cmd == "down" {
            dragging = true
            mouseEvent(.leftMouseDown, mouseLocation())
            print("OK down")
        } else if cmd == "up" {
            dragging = false
            mouseEvent(.leftMouseUp, mouseLocation())
            print("OK up")
        } else if cmd == "clickhere" {
            let pt = mouseLocation()
            mouseEvent(.leftMouseDown, pt); usleep(14000); mouseEvent(.leftMouseUp, pt)
            print("OK clickhere \(Int(pt.x)),\(Int(pt.y))")
        } else if cmd == "rightclickhere" {
            let pt = mouseLocation()
            mouseEvent(.rightMouseDown, pt, button: .right); usleep(14000); mouseEvent(.rightMouseUp, pt, button: .right)
            print("OK rightclickhere")
        } else if cmd == "scroll", parts.count >= 2 {
            let dy = Int32(parts[1]) ?? -5
            let dx = parts.count >= 3 ? (Int32(parts[2]) ?? 0) : 0
            CGEvent(scrollWheelEvent2Source: eventSource, units: .pixel, wheelCount: 2, wheel1: dy, wheel2: dx, wheel3: 0)?.post(tap: .cghidEventTap)
            print("OK scroll \(dy)")
        } else if cmd == "ping" {
            print("PONG")
        } else {
            print("ERR unknown")
        }
    }
    exit(0)
}

let mode = args[1]
if (mode == "click" || mode == "doubleclick" || mode == "rightclick" || mode == "move") && args.count >= 4 {
    let nx = max(0.0, min(1.0, Double(args[2]) ?? 0.5))
    let ny = max(0.0, min(1.0, Double(args[3]) ?? 0.5))
    let pt = CGPoint(x: nx * width, y: ny * height)
    if let moveEvt = CGEvent(mouseEventSource: nil, mouseType: .mouseMoved, mouseCursorPosition: pt, mouseButton: .left) {
        moveEvt.post(tap: .cghidEventTap)
    }
    if mode == "click" {
        usleep(12000)
        CGEvent(mouseEventSource: nil, mouseType: .leftMouseDown, mouseCursorPosition: pt, mouseButton: .left)?.post(tap: .cghidEventTap)
        usleep(18000)
        CGEvent(mouseEventSource: nil, mouseType: .leftMouseUp, mouseCursorPosition: pt, mouseButton: .left)?.post(tap: .cghidEventTap)
    } else if mode == "doubleclick" {
        usleep(12000)
        if let d1 = CGEvent(mouseEventSource: nil, mouseType: .leftMouseDown, mouseCursorPosition: pt, mouseButton: .left),
           let u1 = CGEvent(mouseEventSource: nil, mouseType: .leftMouseUp, mouseCursorPosition: pt, mouseButton: .left),
           let d2 = CGEvent(mouseEventSource: nil, mouseType: .leftMouseDown, mouseCursorPosition: pt, mouseButton: .left),
           let u2 = CGEvent(mouseEventSource: nil, mouseType: .leftMouseUp, mouseCursorPosition: pt, mouseButton: .left) {
            d1.setIntegerValueField(.mouseEventClickState, value: 1)
            u1.setIntegerValueField(.mouseEventClickState, value: 1)
            d2.setIntegerValueField(.mouseEventClickState, value: 2)
            u2.setIntegerValueField(.mouseEventClickState, value: 2)
            d1.post(tap: .cghidEventTap)
            u1.post(tap: .cghidEventTap)
            usleep(25000)
            d2.post(tap: .cghidEventTap)
            u2.post(tap: .cghidEventTap)
        }
    } else if mode == "rightclick" {
        usleep(12000)
        CGEvent(mouseEventSource: nil, mouseType: .rightMouseDown, mouseCursorPosition: pt, mouseButton: .right)?.post(tap: .cghidEventTap)
        usleep(18000)
        CGEvent(mouseEventSource: nil, mouseType: .rightMouseUp, mouseCursorPosition: pt, mouseButton: .right)?.post(tap: .cghidEventTap)
    }
    print("OK \(Int(pt.x)),\(Int(pt.y))")
} else if mode == "scroll" && args.count >= 3 {
    let dy = Int32(args[2]) ?? -5
    if let scrollEvt = CGEvent(scrollWheelEvent2Source: nil, units: .line, wheelCount: 1, wheel1: dy, wheel2: 0, wheel3: 0) {
        scrollEvt.post(tap: .cghidEventTap)
    }
    print("OK scroll \(dy)")
}
