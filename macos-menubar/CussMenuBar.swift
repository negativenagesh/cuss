import Cocoa
import CoreImage
import Foundation

class AppDelegate: NSObject, NSApplicationDelegate {
    var statusItem: NSStatusItem!
    var bridgeStatusItem: NSMenuItem!
    var expoStatusItem: NSMenuItem!
    var authMenuItem: NSMenuItem!
    var urlMenuItem: NSMenuItem!
    var hudWindow: NSWindow?
    var timer: Timer?

    let repoRoot = "/Users/subramanyadattatrayag/Downloads/cuss"
    let configPath = NSHomeDirectory() + "/.config/mission-control/config.json"
    let authJsonPath = NSHomeDirectory() + "/.cursor/auth.json"
    let stateDbPath = NSHomeDirectory() + "/Library/Application Support/Cursor/User/globalStorage/state.vscdb"

    func applicationDidFinishLaunching(_ notification: Notification) {
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        if let button = statusItem.button {
            button.title = "⚡ CUSS"
            button.font = NSFont.monospacedSystemFont(ofSize: 12, weight: .bold)
        }

        let menu = NSMenu()

        bridgeStatusItem = NSMenuItem(title: "● Bridge (4040): Checking…", action: nil, keyEquivalent: "")
        menu.addItem(bridgeStatusItem)

        expoStatusItem = NSMenuItem(title: "● Expo Go (8081): Checking…", action: nil, keyEquivalent: "")
        menu.addItem(expoStatusItem)

        authMenuItem = NSMenuItem(title: "✓ Cursor Auth: Syncing…", action: nil, keyEquivalent: "")
        menu.addItem(authMenuItem)

        urlMenuItem = NSMenuItem(title: "Expo URL: exp://127.0.0.1:8081", action: #selector(copyExpoUrl), keyEquivalent: "e")
        urlMenuItem.target = self
        menu.addItem(urlMenuItem)

        menu.addItem(NSMenuItem.separator())

        let hudItem = NSMenuItem(title: "Show Expo Go QR Code & Control HUD…", action: #selector(showHudWindow), keyEquivalent: "p")
        hudItem.target = self
        menu.addItem(hudItem)

        let copyExpoItem = NSMenuItem(title: "Copy Expo Go URL (exp://…:8081)", action: #selector(copyExpoUrl), keyEquivalent: "u")
        copyExpoItem.target = self
        menu.addItem(copyExpoItem)

        let copyUrlItem = NSMenuItem(title: "Copy Mac Bridge URL (http://…:4040)", action: #selector(copyLanUrl), keyEquivalent: "c")
        copyUrlItem.target = self
        menu.addItem(copyUrlItem)

        let copyTokItem = NSMenuItem(title: "Copy Pairing Token", action: #selector(copyPairingToken), keyEquivalent: "t")
        copyTokItem.target = self
        menu.addItem(copyTokItem)

        menu.addItem(NSMenuItem.separator())

        let syncAuthItem = NSMenuItem(title: "Sync Cursor Desktop Login Now", action: #selector(syncCursorAuthNow), keyEquivalent: "s")
        syncAuthItem.target = self
        menu.addItem(syncAuthItem)

        let restartItem = NSMenuItem(title: "Restart Bridge + Expo Go Background Services", action: #selector(restartServices), keyEquivalent: "r")
        restartItem.target = self
        menu.addItem(restartItem)

        let logsItem = NSMenuItem(title: "View Bridge Logs (/tmp/cuss-bridge.log)", action: #selector(openLogs), keyEquivalent: "l")
        logsItem.target = self
        menu.addItem(logsItem)

        menu.addItem(NSMenuItem.separator())

        let quitItem = NSMenuItem(title: "Quit CUSS Menu Bar", action: #selector(quitApp), keyEquivalent: "q")
        quitItem.target = self
        menu.addItem(quitItem)

        statusItem.menu = menu

        syncCursorAuthSilently()
        refreshStatus()
        timer = Timer.scheduledTimer(timeInterval: 4.0, target: self, selector: #selector(refreshStatus), userInfo: nil, repeats: true)
    }

    func getLanIp() -> String {
        let task = Process()
        task.launchPath = "/sbin/ifconfig"
        let pipe = Pipe()
        task.standardOutput = pipe
        try? task.run()
        let data = pipe.fileHandleForReading.readDataToEndOfFile()
        let out = String(data: data, encoding: .utf8) ?? ""
        for line in out.components(separatedBy: "\n") {
            let trimmed = line.trimmingCharacters(in: .whitespaces)
            if trimmed.hasPrefix("inet ") && !trimmed.contains("127.0.0.1") {
                let parts = trimmed.components(separatedBy: " ")
                if parts.count >= 2 {
                    return parts[1]
                }
            }
        }
        return "127.0.0.1"
    }

    func getPairingToken() -> String {
        guard let data = try? Data(contentsOf: URL(fileURLWithPath: configPath)),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let token = json["pairingToken"] as? String else {
            return ""
        }
        return token
    }

    func queryStateDb(_ key: String) -> String {
        guard FileManager.default.fileExists(atPath: stateDbPath) else { return "" }
        let task = Process()
        task.launchPath = "/usr/bin/sqlite3"
        task.arguments = [stateDbPath, "SELECT value FROM ItemTable WHERE key = '\(key)';"]
        let pipe = Pipe()
        task.standardOutput = pipe
        try? task.run()
        let data = pipe.fileHandleForReading.readDataToEndOfFile()
        return (String(data: data, encoding: .utf8) ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
    }

    func syncCursorAuthSilently() {
        let email = queryStateDb("cursorAuth/cachedEmail")
        let access = queryStateDb("cursorAuth/accessToken")
        let refresh = queryStateDb("cursorAuth/refreshToken")
        if !email.isEmpty {
            DispatchQueue.main.async {
                self.authMenuItem.title = "✓ Cursor: \(email)"
            }
        }
        if !access.isEmpty && !refresh.isEmpty && !FileManager.default.fileExists(atPath: authJsonPath) {
            let cursorDir = NSHomeDirectory() + "/.cursor"
            try? FileManager.default.createDirectory(atPath: cursorDir, withIntermediateDirectories: true)
            let payload: [String: String] = ["accessToken": access, "refreshToken": refresh]
            if let data = try? JSONSerialization.data(withJSONObject: payload, options: [.prettyPrinted]) {
                try? data.write(to: URL(fileURLWithPath: authJsonPath))
                chmod(authJsonPath, 0o600)
            }
        }
    }

    @objc func refreshStatus() {
        let ip = getLanIp()
        urlMenuItem.title = "Expo Go: exp://\(ip):8081 (Click to Copy)"

        // Check Bridge (port 4040)
        if let bridgeUrl = URL(string: "http://127.0.0.1:4040/api/health") {
            URLSession.shared.dataTask(with: bridgeUrl) { _, response, _ in
                let ok = (response as? HTTPURLResponse)?.statusCode == 200
                DispatchQueue.main.async {
                    self.bridgeStatusItem.title = ok
                        ? "● Bridge (4040): ONLINE (http://\(ip):4040)"
                        : "○ Bridge (4040): Starting…"
                }
            }.resume()
        }

        // Check Expo Go Metro Server (port 8081)
        if let expoUrl = URL(string: "http://127.0.0.1:8081/status") {
            URLSession.shared.dataTask(with: expoUrl) { _, response, _ in
                let ok = (response as? HTTPURLResponse)?.statusCode == 200
                DispatchQueue.main.async {
                    self.expoStatusItem.title = ok
                        ? "● Expo Go (8081): ONLINE (exp://\(ip):8081)"
                        : "○ Expo Go (8081): Starting…"
                }
            }.resume()
        }
    }

    @objc func syncCursorAuthNow() {
        let email = queryStateDb("cursorAuth/cachedEmail")
        let access = queryStateDb("cursorAuth/accessToken")
        let refresh = queryStateDb("cursorAuth/refreshToken")
        if !access.isEmpty && !refresh.isEmpty {
            let cursorDir = NSHomeDirectory() + "/.cursor"
            try? FileManager.default.createDirectory(atPath: cursorDir, withIntermediateDirectories: true)
            let payload: [String: String] = ["accessToken": access, "refreshToken": refresh]
            if let data = try? JSONSerialization.data(withJSONObject: payload, options: [.prettyPrinted]) {
                try? data.write(to: URL(fileURLWithPath: authJsonPath))
                chmod(authJsonPath, 0o600)
            }
            authMenuItem.title = "✓ Cursor: \(email.isEmpty ? "Synced" : email)"
        }
    }

    @objc func copyExpoUrl() {
        let ip = getLanIp()
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString("exp://\(ip):8081", forType: .string)
    }

    @objc func copyLanUrl() {
        let ip = getLanIp()
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString("http://\(ip):4040", forType: .string)
    }

    @objc func copyPairingToken() {
        let tok = getPairingToken()
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(tok, forType: .string)
    }

    @objc func restartServices() {
        let task = Process()
        task.launchPath = "/bin/bash"
        task.arguments = ["\(repoRoot)/macos-menubar/build-menubar-app.sh", "--restart-daemons-only"]
        try? task.run()
    }

    @objc func openLogs() {
        NSWorkspace.shared.open(URL(fileURLWithPath: "/tmp/cuss-bridge.log"))
    }

    func generateQrImage(from string: String, size: CGFloat) -> NSImage? {
        guard let data = string.data(using: .utf8),
              let filter = CIFilter(name: "CIQRCodeGenerator") else { return nil }
        filter.setValue(data, forKey: "inputMessage")
        filter.setValue("M", forKey: "inputCorrectionLevel")
        guard let ciImage = filter.outputImage else { return nil }
        let scaleX = size / ciImage.extent.size.width
        let scaleY = size / ciImage.extent.size.height
        let transformed = ciImage.transformed(by: CGAffineTransform(scaleX: scaleX, y: scaleY))
        let rep = NSCIImageRep(ciImage: transformed)
        let nsImage = NSImage(size: rep.size)
        nsImage.addRepresentation(rep)
        return nsImage
    }

    @objc func showHudWindow() {
        let ip = getLanIp()
        let tok = getPairingToken()
        let email = queryStateDb("cursorAuth/cachedEmail")
        let expoUri = "exp://\(ip):8081"

        if hudWindow == nil {
            let win = NSWindow(
                contentRect: NSRect(x: 0, y: 0, width: 520, height: 320),
                styleMask: [.titled, .closable],
                backing: .buffered,
                defer: false
            )
            win.title = "⚡ CUSS // ZERO-TERMINAL MAC MENU BAR HUD"
            win.backgroundColor = NSColor(calibratedRed: 0.04, green: 0.04, blue: 0.07, alpha: 1.0)
            win.center()
            hudWindow = win
        }

        let contentView = NSView(frame: NSRect(x: 0, y: 0, width: 520, height: 320))

        // Left: Scannable Expo Go QR Code
        if let qrImg = generateQrImage(from: expoUri, size: 170) {
            let qrBox = NSView(frame: NSRect(x: 22, y: 74, width: 186, height: 186))
            qrBox.wantsLayer = true
            qrBox.layer?.backgroundColor = NSColor.white.cgColor
            qrBox.layer?.cornerRadius = 12
            let imgView = NSImageView(frame: NSRect(x: 8, y: 8, width: 170, height: 170))
            imgView.image = qrImg
            qrBox.addSubview(imgView)
            contentView.addSubview(qrBox)
        }

        // Right: Telemetry Readout
        let infoText = NSTextField(wrappingLabelWithString: """
        ⚡ CUSS — ZERO-TERMINAL CONTROL DECK

        SCAN QR WITH EXPO GO ON ANDROID:
        \(expoUri)

        MAC BRIDGE (AUTO-PAIRED):
        http://\(ip):4040

        CURSOR ACCOUNT (AUTO-SYNCED):
        \(email.isEmpty ? "Synced (~/.cursor/auth.json)" : email)

        PAIRING TOKEN:
        \(tok)

        Both the Mac Bridge (4040) and Expo Server (8081) run automatically in the background on Mac login — no terminal or `npm start` needed!
        """)
        infoText.font = NSFont.monospacedSystemFont(ofSize: 11.5, weight: .medium)
        infoText.textColor = NSColor(calibratedRed: 0.83, green: 1.0, blue: 0.0, alpha: 1.0)
        infoText.frame = NSRect(x: 226, y: 24, width: 274, height: 270)
        contentView.addSubview(infoText)

        hudWindow?.contentView = contentView
        hudWindow?.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    @objc func quitApp() {
        NSApp.terminate(nil)
    }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.accessory)
app.run()
