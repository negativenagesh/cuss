import Cocoa
import Foundation

class AppDelegate: NSObject, NSApplicationDelegate {
    var statusItem: NSStatusItem!
    var statusMenuItem: NSMenuItem!
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

        statusMenuItem = NSMenuItem(title: "● Bridge: Checking…", action: nil, keyEquivalent: "")
        menu.addItem(statusMenuItem)

        authMenuItem = NSMenuItem(title: "✓ Cursor Auth: Syncing…", action: nil, keyEquivalent: "")
        menu.addItem(authMenuItem)

        urlMenuItem = NSMenuItem(title: "LAN: http://127.0.0.1:4040", action: #selector(copyLanUrl), keyEquivalent: "u")
        urlMenuItem.target = self
        menu.addItem(urlMenuItem)

        menu.addItem(NSMenuItem.separator())

        let hudItem = NSMenuItem(title: "Open CUSS Pairing & Control HUD…", action: #selector(showHudWindow), keyEquivalent: "p")
        hudItem.target = self
        menu.addItem(hudItem)

        let copyUrlItem = NSMenuItem(title: "Copy Mac LAN URL", action: #selector(copyLanUrl), keyEquivalent: "c")
        copyUrlItem.target = self
        menu.addItem(copyUrlItem)

        let copyTokItem = NSMenuItem(title: "Copy Pairing Token", action: #selector(copyPairingToken), keyEquivalent: "t")
        copyTokItem.target = self
        menu.addItem(copyTokItem)

        menu.addItem(NSMenuItem.separator())

        let syncAuthItem = NSMenuItem(title: "Sync Cursor Desktop Login (Zero-Terminal)", action: #selector(syncCursorAuthNow), keyEquivalent: "s")
        syncAuthItem.target = self
        menu.addItem(syncAuthItem)

        let restartItem = NSMenuItem(title: "Restart CUSS Bridge Service (Port 4040)", action: #selector(restartBridge), keyEquivalent: "r")
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
        urlMenuItem.title = "LAN URL: http://\(ip):4040 (Click to Copy)"

        guard let url = URL(string: "http://127.0.0.1:4040/api/health") else { return }
        let task = URLSession.shared.dataTask(with: url) { data, response, error in
            let ok = (response as? HTTPURLResponse)?.statusCode == 200
            DispatchQueue.main.async {
                if ok {
                    self.statusItem.button?.title = "⚡ CUSS"
                    self.statusMenuItem.title = "● Bridge: ONLINE (Port 4040)"
                } else {
                    self.statusItem.button?.title = "○ CUSS"
                    self.statusMenuItem.title = "○ Bridge: Starting automatically…"
                    self.ensureBridgeRunning()
                }
            }
        }
        task.resume()
    }

    func ensureBridgeRunning() {
        let task = Process()
        task.launchPath = "/bin/bash"
        task.arguments = ["\(repoRoot)/start-cuss.sh", "--install-service"]
        try? task.run()
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

    @objc func restartBridge() {
        ensureBridgeRunning()
        DispatchQueue.main.asyncAfter(deadline: .now() + 2.0) {
            self.refreshStatus()
        }
    }

    @objc func openLogs() {
        NSWorkspace.shared.open(URL(fileURLWithPath: "/tmp/cuss-bridge.log"))
    }

    @objc func showHudWindow() {
        let ip = getLanIp()
        let tok = getPairingToken()
        let email = queryStateDb("cursorAuth/cachedEmail")

        if hudWindow == nil {
            let win = NSWindow(
                contentRect: NSRect(x: 0, y: 0, width: 460, height: 260),
                styleMask: [.titled, .closable],
                backing: .buffered,
                defer: false
            )
            win.title = "CUSS // MAC MENU BAR CONTROL DECK"
            win.backgroundColor = NSColor(calibratedRed: 0.04, green: 0.04, blue: 0.07, alpha: 1.0)
            win.center()
            hudWindow = win
        }

        let contentView = NSView(frame: NSRect(x: 0, y: 0, width: 460, height: 260))
        let label = NSTextField(wrappingLabelWithString: """
        ⚡ CUSS — CYBERNETIC UMBILICAL STUDIO (MAC MENU BAR)

        • Bridge Status:   ONLINE (Auto-Managed via launchd)
        • Cursor Account:  \(email.isEmpty ? "Synced via ~/.cursor/auth.json" : email)
        • Mac LAN URL:     http://\(ip):4040
        • Pairing Token:   \(tok)

        Your Android phone auto-detects http://\(ip):4040 over Wi-Fi and syncs your Cursor login automatically with zero terminal commands needed.
        """)
        label.font = NSFont.monospacedSystemFont(ofSize: 12, weight: .medium)
        label.textColor = NSColor(calibratedRed: 0.83, green: 1.0, blue: 0.0, alpha: 1.0)
        label.frame = NSRect(x: 22, y: 20, width: 416, height: 220)
        contentView.addSubview(label)

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
