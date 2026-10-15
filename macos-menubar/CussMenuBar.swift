import Cocoa
import CoreImage
import Foundation

/// CUSS Menu Bar — native NSStatusBar companion for the CUSS Mac Bridge.
/// Works both from a developer checkout and from the self-contained cuss.dmg install
/// (`~/Library/Application Support/CUSS`), resolving paths through ~/.config/mission-control/install.json.
final class AppDelegate: NSObject, NSApplicationDelegate {
    var statusItem: NSStatusItem!
    var bridgeStatusItem: NSMenuItem!
    var expoStatusItem: NSMenuItem!
    var authMenuItem: NSMenuItem!
    var urlMenuItem: NSMenuItem!
    var hudWindow: NSWindow?
    var timer: Timer?

    let configPath = NSHomeDirectory() + "/.config/mission-control/config.json"
    let installPath = NSHomeDirectory() + "/.config/mission-control/install.json"
    let authJsonPath = NSHomeDirectory() + "/.cursor/auth.json"
    let stateDbPath = NSHomeDirectory() + "/Library/Application Support/Cursor/User/globalStorage/state.vscdb"
    let expoPlist = NSHomeDirectory() + "/Library/LaunchAgents/com.cuss.expo.plist"

    /// Installed payload home (from install.json) or the developer checkout fallback.
    var cussHome: String {
        if let data = try? Data(contentsOf: URL(fileURLWithPath: installPath)),
           let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
           let home = json["home"] as? String, FileManager.default.fileExists(atPath: home) {
            return home
        }
        let dev = NSHomeDirectory() + "/Downloads/cuss"
        return FileManager.default.fileExists(atPath: dev) ? dev : NSHomeDirectory() + "/Library/Application Support/CUSS"
    }
    var hasExpo: Bool { FileManager.default.fileExists(atPath: expoPlist) }

    func applicationDidFinishLaunching(_ notification: Notification) {
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        if let button = statusItem.button {
            button.title = "⚡ CUSS"
            button.font = NSFont.monospacedSystemFont(ofSize: 12, weight: .bold)
        }

        let menu = NSMenu()
        bridgeStatusItem = NSMenuItem(title: "○ Bridge (4040): Checking…", action: nil, keyEquivalent: "")
        menu.addItem(bridgeStatusItem)
        expoStatusItem = NSMenuItem(title: "○ Expo Go (8081): Checking…", action: nil, keyEquivalent: "")
        if hasExpo { menu.addItem(expoStatusItem) }
        authMenuItem = NSMenuItem(title: "✓ Cursor Auth: Syncing…", action: nil, keyEquivalent: "")
        menu.addItem(authMenuItem)
        urlMenuItem = NSMenuItem(title: "Bridge: http://…:4040", action: #selector(copyLanUrl), keyEquivalent: "")
        urlMenuItem.target = self
        menu.addItem(urlMenuItem)
        menu.addItem(NSMenuItem.separator())

        add(menu, "Pair Phone — Show QR Code & Control HUD…", #selector(showHudWindow), "p")
        add(menu, "Copy Mac Bridge URL (http://…:4040)", #selector(copyLanUrl), "c")
        add(menu, "Copy Pairing Token", #selector(copyPairingToken), "t")
        if hasExpo { add(menu, "Copy Expo Go URL (exp://…:8081)", #selector(copyExpoUrl), "e") }
        menu.addItem(NSMenuItem.separator())
        add(menu, "Sync Cursor Desktop Login Now", #selector(syncCursorAuthNow), "s")
        add(menu, "Restart Background Services", #selector(restartServices), "r")
        add(menu, "Open Accessibility Settings (for Live Keyboard echo)", #selector(openAccessibility), "")
        add(menu, "View Bridge Logs", #selector(openLogs), "l")
        menu.addItem(NSMenuItem.separator())
        add(menu, "Quit CUSS Menu Bar", #selector(quitApp), "q")
        statusItem.menu = menu

        syncCursorAuth(force: false)
        refreshStatus()
        timer = Timer.scheduledTimer(timeInterval: 4.0, target: self, selector: #selector(refreshStatus), userInfo: nil, repeats: true)
    }

    private func add(_ menu: NSMenu, _ title: String, _ sel: Selector, _ key: String) {
        let item = NSMenuItem(title: title, action: sel, keyEquivalent: key)
        item.target = self
        menu.addItem(item)
    }

    // MARK: - System facts

    func getLanIp() -> String {
        var addr = "127.0.0.1"
        var ifaddr: UnsafeMutablePointer<ifaddrs>?
        guard getifaddrs(&ifaddr) == 0, let first = ifaddr else { return addr }
        defer { freeifaddrs(ifaddr) }
        var preferred: String?
        for ptr in sequence(first: first, next: { $0.pointee.ifa_next }) {
            let flags = Int32(ptr.pointee.ifa_flags)
            guard (flags & IFF_UP) != 0, (flags & IFF_LOOPBACK) == 0, let sa = ptr.pointee.ifa_addr, sa.pointee.sa_family == UInt8(AF_INET) else { continue }
            var host = [CChar](repeating: 0, count: Int(NI_MAXHOST))
            if getnameinfo(sa, socklen_t(sa.pointee.sa_len), &host, socklen_t(host.count), nil, 0, NI_NUMERICHOST) == 0 {
                let name = String(cString: ptr.pointee.ifa_name)
                let ip = String(cString: host)
                if name.hasPrefix("en") && preferred == nil { preferred = ip }
                if addr == "127.0.0.1" { addr = ip }
            }
        }
        return preferred ?? addr
    }

    func getPairingToken() -> String {
        guard let data = try? Data(contentsOf: URL(fileURLWithPath: configPath)),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let token = json["pairingToken"] as? String else { return "" }
        return token
    }

    func pairingDeepLink(ip: String, token: String) -> String {
        let url = "http://\(ip):4040".addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? ""
        return "missioncontrol://pair?url=\(url)&token=\(token)"
    }

    func queryStateDb(_ key: String) -> String {
        guard FileManager.default.fileExists(atPath: stateDbPath) else { return "" }
        let task = Process()
        task.launchPath = "/usr/bin/sqlite3"
        task.arguments = [stateDbPath, "SELECT value FROM ItemTable WHERE key = '\(key)';"]
        let pipe = Pipe()
        task.standardOutput = pipe
        task.standardError = Pipe()
        try? task.run()
        let data = pipe.fileHandleForReading.readDataToEndOfFile()
        return (String(data: data, encoding: .utf8) ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
    }

    func syncCursorAuth(force: Bool) {
        let email = queryStateDb("cursorAuth/cachedEmail")
        let access = queryStateDb("cursorAuth/accessToken")
        let refresh = queryStateDb("cursorAuth/refreshToken")
        if !access.isEmpty && !refresh.isEmpty && (force || !FileManager.default.fileExists(atPath: authJsonPath)) {
            try? FileManager.default.createDirectory(atPath: NSHomeDirectory() + "/.cursor", withIntermediateDirectories: true)
            if let data = try? JSONSerialization.data(withJSONObject: ["accessToken": access, "refreshToken": refresh], options: [.prettyPrinted]) {
                try? data.write(to: URL(fileURLWithPath: authJsonPath))
                chmod(authJsonPath, 0o600)
            }
        }
        DispatchQueue.main.async {
            if !email.isEmpty { self.authMenuItem.title = "✓ Cursor: \(email)" }
            else if FileManager.default.fileExists(atPath: self.authJsonPath) { self.authMenuItem.title = "✓ Cursor: signed in (~/.cursor/auth.json)" }
            else { self.authMenuItem.title = "○ Cursor: sign in from the phone app or open Cursor.app" }
        }
    }

    // MARK: - Status polling

    @objc func refreshStatus() {
        let ip = getLanIp()
        urlMenuItem.title = "Bridge: http://\(ip):4040 (click to copy)"
        probe("http://127.0.0.1:4040/api/health") { ok in
            self.bridgeStatusItem.title = ok ? "● Bridge (4040): ONLINE · http://\(ip):4040" : "○ Bridge (4040): starting…"
            if let b = self.statusItem.button { b.title = ok ? "⚡ CUSS" : "⚡ CUSS ○" }
        }
        if hasExpo {
            probe("http://127.0.0.1:8081/status") { ok in
                self.expoStatusItem.title = ok ? "● Expo Go (8081): ONLINE · exp://\(ip):8081" : "○ Expo Go (8081): starting…"
            }
        }
    }

    private func probe(_ url: String, _ done: @escaping (Bool) -> Void) {
        guard let u = URL(string: url) else { return }
        var req = URLRequest(url: u)
        req.timeoutInterval = 2
        URLSession.shared.dataTask(with: req) { _, response, _ in
            let ok = (response as? HTTPURLResponse)?.statusCode == 200
            DispatchQueue.main.async { done(ok) }
        }.resume()
    }

    // MARK: - Actions

    @objc func syncCursorAuthNow() { syncCursorAuth(force: true) }

    @objc func copyExpoUrl() { copy("exp://\(getLanIp()):8081") }
    @objc func copyLanUrl() { copy("http://\(getLanIp()):4040") }
    @objc func copyPairingToken() { copy(getPairingToken()) }
    private func copy(_ s: String) {
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(s, forType: .string)
    }

    @objc func restartServices() {
        let uid = getuid()
        for label in ["com.cuss.bridge", "com.cuss.expo"] {
            let plist = NSHomeDirectory() + "/Library/LaunchAgents/\(label).plist"
            guard FileManager.default.fileExists(atPath: plist) else { continue }
            let t = Process()
            t.launchPath = "/bin/launchctl"
            t.arguments = ["kickstart", "-k", "gui/\(uid)/\(label)"]
            try? t.run()
        }
    }

    @objc func openAccessibility() {
        if let u = URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility") { NSWorkspace.shared.open(u) }
    }

    @objc func openLogs() { NSWorkspace.shared.open(URL(fileURLWithPath: "/tmp/cuss-bridge.log")) }

    func qrImage(_ string: String, size: CGFloat) -> NSImage? {
        guard let data = string.data(using: .utf8), let filter = CIFilter(name: "CIQRCodeGenerator") else { return nil }
        filter.setValue(data, forKey: "inputMessage")
        filter.setValue("M", forKey: "inputCorrectionLevel")
        guard let ci = filter.outputImage else { return nil }
        let scale = size / ci.extent.size.width
        let rep = NSCIImageRep(ciImage: ci.transformed(by: CGAffineTransform(scaleX: scale, y: scale)))
        let img = NSImage(size: rep.size)
        img.addRepresentation(rep)
        return img
    }

    @objc func showHudWindow() {
        let ip = getLanIp()
        let tok = getPairingToken()
        let email = queryStateDb("cursorAuth/cachedEmail")
        let pairLink = pairingDeepLink(ip: ip, token: tok)
        let expoUri = "exp://\(ip):8081"
        let showExpo = hasExpo

        let W: CGFloat = showExpo ? 760 : 560
        if hudWindow == nil {
            let win = NSWindow(contentRect: NSRect(x: 0, y: 0, width: W, height: 340), styleMask: [.titled, .closable], backing: .buffered, defer: false)
            win.title = "⚡ CUSS // PAIR YOUR PHONE"
            win.backgroundColor = NSColor(calibratedRed: 0.03, green: 0.03, blue: 0.05, alpha: 1.0)
            win.center()
            hudWindow = win
        }
        let content = NSView(frame: NSRect(x: 0, y: 0, width: W, height: 340))

        func qrBox(_ s: String, x: CGFloat, caption: String, color: NSColor) {
            if let img = qrImage(s, size: 170) {
                let box = NSView(frame: NSRect(x: x, y: 96, width: 186, height: 186))
                box.wantsLayer = true
                box.layer?.backgroundColor = NSColor.white.cgColor
                box.layer?.cornerRadius = 12
                let iv = NSImageView(frame: NSRect(x: 8, y: 8, width: 170, height: 170))
                iv.image = img
                box.addSubview(iv)
                content.addSubview(box)
            }
            let cap = NSTextField(wrappingLabelWithString: caption)
            cap.font = NSFont.monospacedSystemFont(ofSize: 10.5, weight: .bold)
            cap.textColor = color
            cap.alignment = .center
            cap.frame = NSRect(x: x - 10, y: 58, width: 206, height: 34)
            content.addSubview(cap)
        }

        qrBox(pairLink, x: 22, caption: "1 · SCAN IN THE CUSS APP\nPAIR WITH THIS MAC", color: NSColor(calibratedRed: 0.83, green: 1.0, blue: 0.0, alpha: 1.0))
        if showExpo {
            qrBox(expoUri, x: 232, caption: "DEV · SCAN WITH EXPO GO\n\(expoUri)", color: NSColor(calibratedRed: 0.0, green: 0.94, blue: 1.0, alpha: 1.0))
        }

        let infoX: CGFloat = showExpo ? 440 : 230
        let info = NSTextField(wrappingLabelWithString: """
        ⚡ CUSS — ZERO-TERMINAL CONTROL DECK

        MAC BRIDGE
        http://\(ip):4040

        PAIRING TOKEN
        \(tok)

        CURSOR ACCOUNT
        \(email.isEmpty ? "sign in from the phone app" : email)

        Bridge runs in the background on login.
        Install cuss.apk on Android, open it, tap
        SCAN, and point at the lime QR code.
        """)
        info.font = NSFont.monospacedSystemFont(ofSize: 11, weight: .medium)
        info.textColor = NSColor(calibratedRed: 0.83, green: 1.0, blue: 0.0, alpha: 1.0)
        info.frame = NSRect(x: infoX, y: 22, width: W - infoX - 20, height: 300)
        content.addSubview(info)

        hudWindow?.setContentSize(NSSize(width: W, height: 340))
        hudWindow?.contentView = content
        hudWindow?.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    @objc func quitApp() { NSApp.terminate(nil) }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.accessory)
app.run()
