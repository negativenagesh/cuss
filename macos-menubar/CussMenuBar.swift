import Cocoa
import CoreImage
import Foundation

/// Pixel-exact QR view that renders a CGImage with `.none` interpolation inside a generous white quiet zone.
final class CrispQRView: NSView {
    var cgImage: CGImage? {
        didSet { needsDisplay = true }
    }
    var quietZone: CGFloat = 16

    override var isOpaque: Bool { true }

    override func draw(_ dirtyRect: NSRect) {
        guard let ctx = NSGraphicsContext.current?.cgContext else { return }
        ctx.saveGState()
        let path = CGPath(roundedRect: bounds, cornerWidth: 14, cornerHeight: 14, transform: nil)
        ctx.addPath(path)
        ctx.clip()
        ctx.setFillColor(CGColor(red: 1, green: 1, blue: 1, alpha: 1))
        ctx.fill(bounds)

        if let img = cgImage {
            ctx.interpolationQuality = .none
            ctx.setShouldAntialias(false)
            let qrRect = bounds.insetBy(dx: quietZone, dy: quietZone).integral
            ctx.draw(img, in: qrRect)
        }
        ctx.restoreGState()
    }
}

/// CUSS Menu Bar — native NSStatusBar companion for the CUSS Mac Bridge.
/// Works both from a developer checkout and from the self-contained cuss.dmg install
/// (`~/Library/Application Support/CUSS`), resolving paths through ~/.config/mission-control/install.json.
final class AppDelegate: NSObject, NSApplicationDelegate, NSWindowDelegate {
    var statusItem: NSStatusItem!
    var bridgeStatusItem: NSMenuItem!
    var expoStatusItem: NSMenuItem!
    var authMenuItem: NSMenuItem!
    var urlMenuItem: NSMenuItem!
    var hudWindow: NSWindow?
    var timer: Timer?

    /// Which QR code is currently displayed in the single-QR high-contrast HUD:
    /// 0 = CUSS App Pairing QR (`missioncontrol://pair?...`)
    /// 1 = Expo Go QR (`exp://<ip>:8081`)
    /// 2 = Universal Phone Camera HTTP QR (`http://<ip>:4040/api/pair?token=...`)
    var qrMode: Int = 0
    var cachedEmail: String = ""
    let ciContext = CIContext(options: [.useSoftwareRenderer: false])

    let configDir = NSHomeDirectory() + "/.config/mission-control"
    let configPath = NSHomeDirectory() + "/.config/mission-control/config.json"
    let tunnelPath = NSHomeDirectory() + "/.config/mission-control/tunnel.json"
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
    var hasExpo: Bool {
        FileManager.default.fileExists(atPath: expoPlist) ||
        FileManager.default.fileExists(atPath: cussHome + "/mobile/package.json")
    }

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
        add(menu, "Copy Worldwide Tunnel URL (5G / Any Network)", #selector(copyTunnelUrl), "w")
        add(menu, "Copy Pairing Token", #selector(copyPairingToken), "t")
        if hasExpo { add(menu, "Copy Expo Go URL (exp://…:8081)", #selector(copyExpoUrl), "e") }
        menu.addItem(NSMenuItem.separator())
        add(menu, "Enable Lid-Closed Clamshell Awake Mode…", #selector(enableLidClosedAwake), "")
        add(menu, "Restore Normal Mac Lid Sleep…", #selector(disableLidClosedAwake), "")
        add(menu, "Sync Cursor Desktop Login Now", #selector(syncCursorAuthNow), "s")
        add(menu, "Restart Background Services", #selector(restartServices), "r")
        add(menu, "Open Accessibility Settings (for Live Keyboard echo)", #selector(openAccessibility), "")
        add(menu, "View Bridge Logs", #selector(openLogs), "l")
        menu.addItem(NSMenuItem.separator())
        add(menu, "Quit CUSS & Stop Background Services", #selector(quitAllServices), "")
        add(menu, "Quit CUSS Menu Bar", #selector(quitApp), "q")
        statusItem.menu = menu

        _ = getPairingToken()
        syncCursorAuth(force: false)
        refreshStatus()
        let t = Timer(timeInterval: 4.0, target: self, selector: #selector(refreshStatus), userInfo: nil, repeats: true)
        RunLoop.main.add(t, forMode: .common)
        timer = t
    }

    private func add(_ menu: NSMenu, _ title: String, _ sel: Selector, _ key: String) {
        let item = NSMenuItem(title: title, action: sel, keyEquivalent: key)
        item.target = self
        menu.addItem(item)
    }

    // MARK: - System facts

    func getLanIp() -> String {
        var en0Ip: String?
        var otherEnIp: String?
        var fallbackIp: String?
        var ifaddr: UnsafeMutablePointer<ifaddrs>?
        guard getifaddrs(&ifaddr) == 0, let first = ifaddr else { return "127.0.0.1" }
        defer { freeifaddrs(ifaddr) }

        for ptr in sequence(first: first, next: { $0.pointee.ifa_next }) {
            let flags = Int32(ptr.pointee.ifa_flags)
            guard (flags & IFF_UP) != 0,
                  (flags & IFF_LOOPBACK) == 0,
                  let sa = ptr.pointee.ifa_addr,
                  sa.pointee.sa_family == UInt8(AF_INET) else { continue }
            var host = [CChar](repeating: 0, count: Int(NI_MAXHOST))
            if getnameinfo(sa, socklen_t(sa.pointee.sa_len), &host, socklen_t(host.count), nil, 0, NI_NUMERICHOST) == 0 {
                let name = String(cString: ptr.pointee.ifa_name)
                let ip = String(cString: host)
                if ip.hasPrefix("127.") || ip.hasPrefix("169.254.") { continue }
                if name == "en0" && en0Ip == nil {
                    en0Ip = ip
                } else if name.hasPrefix("en") && otherEnIp == nil {
                    otherEnIp = ip
                } else if fallbackIp == nil {
                    fallbackIp = ip
                }
            }
        }
        return en0Ip ?? otherEnIp ?? fallbackIp ?? "127.0.0.1"
    }

    func getTailscaleIp() -> String? {
        var ifaddr: UnsafeMutablePointer<ifaddrs>?
        guard getifaddrs(&ifaddr) == 0, let first = ifaddr else { return nil }
        defer { freeifaddrs(ifaddr) }
        for ptr in sequence(first: first, next: { $0.pointee.ifa_next }) {
            let flags = Int32(ptr.pointee.ifa_flags)
            guard (flags & IFF_UP) != 0,
                  (flags & IFF_LOOPBACK) == 0,
                  let sa = ptr.pointee.ifa_addr,
                  sa.pointee.sa_family == UInt8(AF_INET) else { continue }
            var host = [CChar](repeating: 0, count: Int(NI_MAXHOST))
            if getnameinfo(sa, socklen_t(sa.pointee.sa_len), &host, socklen_t(host.count), nil, 0, NI_NUMERICHOST) == 0 {
                let ip = String(cString: host)
                if ip.hasPrefix("100.") { return ip }
            }
        }
        return nil
    }

    /// Reads the pairing token from ~/.config/mission-control/config.json, generating and saving one if missing.
    func getPairingToken() -> String {
        if let data = try? Data(contentsOf: URL(fileURLWithPath: configPath)),
           let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
           let token = json["pairingToken"] as? String,
           !token.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return token.trimmingCharacters(in: .whitespacesAndNewlines)
        }
        var bytes = [UInt8](repeating: 0, count: 24)
        _ = SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes)
        let generated = bytes.map { String(format: "%02x", $0) }.joined()
        try? FileManager.default.createDirectory(atPath: configDir, withIntermediateDirectories: true)
        var obj: [String: Any] = ["port": 4040, "pairingToken": generated]
        if let data = try? Data(contentsOf: URL(fileURLWithPath: configPath)),
           let existing = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
            obj = existing
            obj["pairingToken"] = generated
            if obj["port"] == nil { obj["port"] = 4040 }
        }
        if let out = try? JSONSerialization.data(withJSONObject: obj, options: [.prettyPrinted]) {
            try? out.write(to: URL(fileURLWithPath: configPath))
            chmod(configPath, 0o600)
        }
        return generated
    }

    func getTunnelUrl() -> String? {
        guard let data = try? Data(contentsOf: URL(fileURLWithPath: tunnelPath)),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let url = json["tunnelUrl"] as? String,
              url.hasPrefix("https://") else { return nil }
        return url
    }

    func pairingDeepLink(ip: String, token: String) -> String {
        var allowed = CharacterSet.urlQueryAllowed
        allowed.remove(charactersIn: "&=+#?")
        let lan = "http://\(ip):4040"
        let encLan = lan.addingPercentEncoding(withAllowedCharacters: allowed) ?? "http%3A%2F%2F\(ip)%3A4040"
        if let tun = getTunnelUrl(),
           let encTun = tun.addingPercentEncoding(withAllowedCharacters: allowed) {
            return "missioncontrol://pair?url=\(encLan)&tunnel=\(encTun)&token=\(token)"
        }
        return "missioncontrol://pair?url=\(encLan)&token=\(token)"
    }

    func universalHttpPairLink(ip: String, token: String) -> String {
        if let tun = getTunnelUrl() {
            return "\(tun)/api/pair?token=\(token)"
        }
        return "http://\(ip):4040/api/pair?token=\(token)"
    }

    func queryStateDb(_ key: String) -> String {
        guard FileManager.default.fileExists(atPath: stateDbPath) else { return "" }
        let task = Process()
        task.launchPath = "/usr/bin/sqlite3"
        task.arguments = ["-cmd", ".timeout 400", stateDbPath, "SELECT value FROM ItemTable WHERE key = '\(key)';"]
        let pipe = Pipe()
        task.standardOutput = pipe
        task.standardError = Pipe()
        do {
            try task.run()
        } catch {
            return ""
        }
        let data = pipe.fileHandleForReading.readDataToEndOfFile()
        task.waitUntilExit()
        return (String(data: data, encoding: .utf8) ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
    }

    func syncCursorAuth(force: Bool) {
        DispatchQueue.global(qos: .utility).async {
            let email = self.queryStateDb("cursorAuth/cachedEmail")
            let access = self.queryStateDb("cursorAuth/accessToken")
            let refresh = self.queryStateDb("cursorAuth/refreshToken")
            if !access.isEmpty && !refresh.isEmpty && (force || !FileManager.default.fileExists(atPath: self.authJsonPath)) {
                try? FileManager.default.createDirectory(atPath: NSHomeDirectory() + "/.cursor", withIntermediateDirectories: true)
                if let data = try? JSONSerialization.data(withJSONObject: ["accessToken": access, "refreshToken": refresh], options: [.prettyPrinted]) {
                    try? data.write(to: URL(fileURLWithPath: self.authJsonPath))
                    chmod(self.authJsonPath, 0o600)
                }
            }
            DispatchQueue.main.async {
                if !email.isEmpty {
                    self.cachedEmail = email
                    self.authMenuItem.title = "✓ Cursor: \(email)"
                } else if FileManager.default.fileExists(atPath: self.authJsonPath) {
                    self.authMenuItem.title = "✓ Cursor: signed in (~/.cursor/auth.json)"
                } else {
                    self.authMenuItem.title = "○ Cursor: sign in from the phone app or open Cursor.app"
                }
            }
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
    @objc func copyTunnelUrl() { copy(getTunnelUrl() ?? "http://\(getLanIp()):4040") }
    @objc func copyPairingToken() { copy(getPairingToken()) }
    @objc func copyDeepLink() {
        let ip = getLanIp()
        let tok = getPairingToken()
        copy(pairingDeepLink(ip: ip, token: tok))
    }

    @objc func enableLidClosedAwake() {
        let t = Process()
        t.launchPath = "/usr/bin/osascript"
        t.arguments = ["-e", "do shell script \"/usr/bin/pmset -a disablesleep 1\" with administrator privileges"]
        try? t.run()
    }

    @objc func disableLidClosedAwake() {
        let t = Process()
        t.launchPath = "/usr/bin/osascript"
        t.arguments = ["-e", "do shell script \"/usr/bin/pmset -a disablesleep 0\" with administrator privileges"]
        try? t.run()
    }

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

    /// Produces a razor-sharp, pure black-on-white rasterized CGImage for QR scanning with zero interpolation blur.
    func qrCGImage(_ string: String, targetDimension: CGFloat = 440) -> CGImage? {
        guard let data = string.data(using: .utf8),
              let filter = CIFilter(name: "CIQRCodeGenerator") else { return nil }
        filter.setValue(data, forKey: "inputMessage")
        filter.setValue("M", forKey: "inputCorrectionLevel")
        guard let rawCi = filter.outputImage else { return nil }

        let colorFilter = CIFilter(name: "CIFalseColor")
        colorFilter?.setValue(rawCi, forKey: kCIInputImageKey)
        colorFilter?.setValue(CIColor(red: 0, green: 0, blue: 0, alpha: 1), forKey: "inputColor0")
        colorFilter?.setValue(CIColor(red: 1, green: 1, blue: 1, alpha: 1), forKey: "inputColor1")
        let coloredCi = colorFilter?.outputImage ?? rawCi

        let extent = coloredCi.extent.integral
        guard extent.width > 0, extent.height > 0 else { return nil }
        let intScale = max(10, Int(ceil(targetDimension / extent.width)))
        let scaledCi = coloredCi
            .samplingNearest()
            .transformed(by: CGAffineTransform(scaleX: CGFloat(intScale), y: CGFloat(intScale)))
        return ciContext.createCGImage(scaledCi, from: scaledCi.extent.integral)
    }

    @objc func selectQrModeCuss() {
        qrMode = 0
        renderHudContents()
    }

    @objc func selectQrModeExpo() {
        qrMode = 1
        renderHudContents()
    }

    @objc func selectQrModeCamera() {
        qrMode = 2
        renderHudContents()
    }

    @objc func refreshHudNow() {
        syncCursorAuth(force: false)
        renderHudContents()
    }

    func windowWillClose(_ notification: Notification) {
        // Keep hudWindow reusable (isReleasedWhenClosed = false)
    }

    @objc func showHudWindow() {
        let W: CGFloat = 680
        let H: CGFloat = 410
        if hudWindow == nil {
            let win = NSWindow(
                contentRect: NSRect(x: 0, y: 0, width: W, height: H),
                styleMask: [.titled, .closable],
                backing: .buffered,
                defer: false
            )
            win.title = "⚡ CUSS // PAIR YOUR PHONE"
            win.backgroundColor = NSColor(calibratedRed: 0.03, green: 0.03, blue: 0.05, alpha: 1.0)
            win.isReleasedWhenClosed = false
            win.isMovableByWindowBackground = true
            win.level = .floating
            win.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .moveToActiveSpace]
            win.delegate = self
            win.center()
            hudWindow = win
        }

        renderHudContents()

        // Present immediately and re-assert on next main runloop tick after NSMenu finishes closing
        presentHudWindowNow()
        DispatchQueue.main.async {
            self.presentHudWindowNow()
        }
    }

    private func presentHudWindowNow() {
        guard let win = hudWindow else { return }
        if !win.isVisible {
            win.center()
        }
        if #available(macOS 14.0, *) {
            NSApp.activate()
        } else {
            NSApp.activate(ignoringOtherApps: true)
        }
        win.makeKeyAndOrderFront(nil)
        win.orderFrontRegardless()
    }

    private func makeActionButton(title: String, frame: NSRect, active: Bool, accent: NSColor, action: Selector) -> NSButton {
        let btn = NSButton(frame: frame)
        btn.isBordered = false
        btn.wantsLayer = true
        btn.layer?.cornerRadius = 8
        btn.layer?.borderWidth = 1.5
        btn.layer?.borderColor = accent.cgColor
        btn.layer?.backgroundColor = active
            ? accent.cgColor
            : NSColor(calibratedRed: 0.07, green: 0.08, blue: 0.12, alpha: 1.0).cgColor
        let fg = active ? NSColor(calibratedRed: 0.03, green: 0.03, blue: 0.05, alpha: 1.0) : accent
        btn.attributedTitle = NSAttributedString(
            string: title,
            attributes: [
                .font: NSFont.monospacedSystemFont(ofSize: 10.5, weight: .bold),
                .foregroundColor: fg,
            ]
        )
        btn.target = self
        btn.action = action
        return btn
    }

    func renderHudContents() {
        guard let win = hudWindow else { return }
        let W: CGFloat = 680
        let H: CGFloat = 410
        let ip = getLanIp()
        let tailscaleIp = getTailscaleIp()
        let tok = getPairingToken()
        let pairLink = pairingDeepLink(ip: ip, token: tok)
        let expoUri = "exp://\(ip):8081"
        let httpPairUri = universalHttpPairLink(ip: ip, token: tok)

        let lime = NSColor(calibratedRed: 0.83, green: 1.0, blue: 0.0, alpha: 1.0)
        let cyan = NSColor(calibratedRed: 0.0, green: 0.94, blue: 1.0, alpha: 1.0)
        let bone = NSColor(calibratedRed: 0.96, green: 0.94, blue: 0.92, alpha: 1.0)
        let muted = NSColor(calibratedRed: 0.58, green: 0.62, blue: 0.75, alpha: 1.0)

        let content = NSView(frame: NSRect(x: 0, y: 0, width: W, height: H))
        content.wantsLayer = true
        content.layer?.backgroundColor = NSColor(calibratedRed: 0.03, green: 0.03, blue: 0.05, alpha: 1.0).cgColor

        // Mode switcher tabs at top so only ONE large high-contrast QR is shown at a time (prevents dual-QR camera confusion)
        let tabY: CGFloat = H - 46
        content.addSubview(makeActionButton(
            title: "1 · CUSS APP QR",
            frame: NSRect(x: 24, y: tabY, width: 142, height: 28),
            active: qrMode == 0,
            accent: lime,
            action: #selector(selectQrModeCuss)
        ))
        content.addSubview(makeActionButton(
            title: "2 · EXPO GO QR",
            frame: NSRect(x: 174, y: tabY, width: 136, height: 28),
            active: qrMode == 1,
            accent: cyan,
            action: #selector(selectQrModeExpo)
        ))
        content.addSubview(makeActionButton(
            title: "3 · PHONE CAMERA",
            frame: NSRect(x: 318, y: tabY, width: 148, height: 28),
            active: qrMode == 2,
            accent: lime,
            action: #selector(selectQrModeCamera)
        ))
        content.addSubview(makeActionButton(
            title: "↻ REFRESH",
            frame: NSRect(x: W - 116, y: tabY, width: 92, height: 28),
            active: false,
            accent: cyan,
            action: #selector(refreshHudNow)
        ))

        let activePayload: String
        let activeCaption: String
        let activeColor: NSColor
        switch qrMode {
        case 1:
            activePayload = expoUri
            activeCaption = "EXPO GO QR · SCAN IN EXPO GO OR CAMERA\n\(expoUri)"
            activeColor = cyan
        case 2:
            activePayload = httpPairUri
            activeCaption = "UNIVERSAL CAMERA QR · OPENS EXPO GO OR CUSS\n\(httpPairUri)"
            activeColor = lime
        default:
            activePayload = pairLink
            activeCaption = "CUSS APP PAIRING QR · SCAN IN CUSS APP\nhttp://\(ip):4040"
            activeColor = lime
        }

        // Large single 248x248 pure-white quiet-zone QR box (zero blur, integer module scaling)
        let qrBoxSize: CGFloat = 248
        let qrView = CrispQRView(frame: NSRect(x: 24, y: 94, width: qrBoxSize, height: qrBoxSize))
        qrView.quietZone = 18
        qrView.cgImage = qrCGImage(activePayload, targetDimension: 480)
        content.addSubview(qrView)

        let cap = NSTextField(wrappingLabelWithString: activeCaption)
        cap.font = NSFont.monospacedSystemFont(ofSize: 10, weight: .bold)
        cap.textColor = activeColor
        cap.alignment = .center
        cap.frame = NSRect(x: 16, y: 46, width: qrBoxSize + 16, height: 40)
        content.addSubview(cap)

        // Right-hand telemetry & quick-copy controls
        let infoX: CGFloat = 296
        let infoW: CGFloat = W - infoX - 24

        let header = NSTextField(labelWithString: "⚡ CUSS — ZERO-TERMINAL CONTROL DECK")
        header.font = NSFont.monospacedSystemFont(ofSize: 12.5, weight: .bold)
        header.textColor = lime
        header.frame = NSRect(x: infoX, y: 318, width: infoW, height: 22)
        content.addSubview(header)

        let tunnelUrl = getTunnelUrl()
        let tunnelLine = "\nWORLDWIDE TUNNEL (ANY NETWORK / 5G)\n\(tunnelUrl ?? "connecting worldwide tunnel…")"
        let tailscaleLine = tailscaleIp != nil ? "\nTAILSCALE BRIDGE\nhttp://\(tailscaleIp!):4040" : ""
        let details = NSTextField(wrappingLabelWithString: """
        MAC BRIDGE (LAN WI-FI)
        http://\(ip):4040\(tunnelLine)\(tailscaleLine)

        EXPO GO DEV SERVER
        \(expoUri)

        PAIRING TOKEN
        \(tok)

        CURSOR ACCOUNT
        \(cachedEmail.isEmpty ? "sign in from the phone app" : cachedEmail)
        """)
        details.isSelectable = true
        details.font = NSFont.monospacedSystemFont(ofSize: 11, weight: .medium)
        details.textColor = bone
        details.frame = NSRect(x: infoX, y: 146, width: infoW, height: 166)
        content.addSubview(details)

        let hint = NSTextField(wrappingLabelWithString: """
        TIP: Inside the CUSS mobile app, tap PAIRING / SCAN QR and point at ANY of the 3 QR tabs above — CUSS recognizes all three formats automatically!
        """)
        hint.font = NSFont.monospacedSystemFont(ofSize: 10, weight: .regular)
        hint.textColor = muted
        hint.frame = NSRect(x: infoX, y: 92, width: infoW, height: 48)
        content.addSubview(hint)

        // Quick copy buttons inside the HUD
        content.addSubview(makeActionButton(
            title: "COPY BRIDGE URL",
            frame: NSRect(x: infoX, y: 50, width: 168, height: 30),
            active: false,
            accent: lime,
            action: #selector(copyLanUrl)
        ))
        content.addSubview(makeActionButton(
            title: "COPY TOKEN",
            frame: NSRect(x: infoX + 178, y: 50, width: 168, height: 30),
            active: false,
            accent: cyan,
            action: #selector(copyPairingToken)
        ))

        win.setContentSize(NSSize(width: W, height: H))
        win.contentView = content
    }

    @objc func quitApp() {
        timer?.invalidate()
        hudWindow?.close()
        if let item = statusItem {
            NSStatusBar.system.removeStatusItem(item)
        }
        let plist = NSHomeDirectory() + "/Library/LaunchAgents/com.cuss.menubar.plist"
        let uid = getuid()
        let t = Process()
        t.launchPath = "/bin/sh"
        t.arguments = [
            "-c",
            "(/bin/launchctl unload '\(plist)' >/dev/null 2>&1; /bin/launchctl bootout gui/\(uid)/com.cuss.menubar >/dev/null 2>&1) &",
        ]
        try? t.run()
        exit(0)
    }

    @objc func quitAllServices() {
        timer?.invalidate()
        hudWindow?.close()
        if let item = statusItem {
            NSStatusBar.system.removeStatusItem(item)
        }
        let agentsDir = NSHomeDirectory() + "/Library/LaunchAgents"
        let uid = getuid()
        let t = Process()
        t.launchPath = "/bin/sh"
        t.arguments = [
            "-c",
            "for lbl in com.cuss.bridge com.cuss.expo com.cuss.menubar; do /bin/launchctl unload '\(agentsDir)/'$lbl'.plist' >/dev/null 2>&1; /bin/launchctl bootout gui/\(uid)/$lbl >/dev/null 2>&1; done; /usr/sbin/lsof -ti :4040 | xargs kill -9 2>/dev/null || true; /usr/sbin/lsof -ti :8081 | xargs kill -9 2>/dev/null || true",
        ]
        try? t.run()
        exit(0)
    }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.accessory)
app.run()
