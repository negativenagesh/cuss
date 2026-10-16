import Cocoa
import CoreImage
import CoreText
import QuartzCore

// MARK: - Brand

enum Brand {
    static let obsidian = NSColor(calibratedRed: 0.027, green: 0.027, blue: 0.047, alpha: 1)
    static let surface = NSColor(calibratedRed: 0.063, green: 0.067, blue: 0.102, alpha: 1)
    static let grid = NSColor(calibratedRed: 0.094, green: 0.106, blue: 0.173, alpha: 1)
    static let lime = NSColor(calibratedRed: 0.831, green: 1.0, blue: 0.0, alpha: 1)
    static let cyan = NSColor(calibratedRed: 0.0, green: 0.941, blue: 1.0, alpha: 1)
    static let magenta = NSColor(calibratedRed: 1.0, green: 0.165, blue: 0.522, alpha: 1)
    static let bone = NSColor(calibratedRed: 0.957, green: 0.941, blue: 0.918, alpha: 1)
    static let dim = NSColor(calibratedRed: 0.345, green: 0.369, blue: 0.51, alpha: 1)
    static let danger = NSColor(calibratedRed: 1.0, green: 0.22, blue: 0.39, alpha: 1)

    /// Signature easing: MD3 Emphasized Decelerate (entrances). Energetic archetype: 100–250ms, ease-out-expo, 15–30% overshoot.
    static let enter = CAMediaTimingFunction(controlPoints: 0.05, 0.7, 0.1, 1)
    static let expoOut = CAMediaTimingFunction(controlPoints: 0.16, 1, 0.3, 1)
    static let exit = CAMediaTimingFunction(controlPoints: 0.3, 0, 1, 1)

    static func registerFonts() {
        guard let res = Bundle.main.resourceURL else { return }
        for name in ["Unbounded-Variable.ttf", "SpaceMono-Bold.ttf", "SpaceMono-Regular.ttf"] {
            let url = res.appendingPathComponent("fonts/\(name)")
            CTFontManagerRegisterFontsForURL(url as CFURL, .process, nil)
        }
    }

    static func display(_ size: CGFloat) -> NSFont {
        // Unbounded variable font at Black weight (wght axis 0x77676874)
        if let base = NSFont(name: "Unbounded", size: size) ?? NSFont(name: "Unbounded-Regular", size: size) {
            let desc = base.fontDescriptor.addingAttributes([
                NSFontDescriptor.AttributeName(rawValue: "NSCTFontVariationAttribute"): [NSNumber(value: 0x77676874): 900],
            ])
            return NSFont(descriptor: desc, size: size) ?? base
        }
        return NSFont.systemFont(ofSize: size, weight: .black)
    }

    static func mono(_ size: CGFloat, bold: Bool = true) -> NSFont {
        NSFont(name: bold ? "SpaceMono-Bold" : "SpaceMono-Regular", size: size) ?? NSFont.monospacedSystemFont(ofSize: size, weight: bold ? .bold : .regular)
    }
}

// MARK: - Installer engine

struct InstallStep {
    let title: String
    let run: () throws -> String
}

enum InstallError: LocalizedError {
    case message(String)
    var errorDescription: String? { if case let .message(m) = self { return m }; return nil }
}

final class Installer {
    let home = NSHomeDirectory() + "/Library/Application Support/CUSS"
    let appsDir = "/Applications"
    let agentsDir = NSHomeDirectory() + "/Library/LaunchAgents"
    let configDir = NSHomeDirectory() + "/.config/mission-control"
    let fm = FileManager.default
    var payload: URL { Bundle.main.resourceURL!.appendingPathComponent("payload") }

    func sh(_ launchPath: String, _ args: [String]) -> (Int32, String) {
        let t = Process()
        t.launchPath = launchPath
        t.arguments = args
        let p = Pipe()
        t.standardOutput = p
        t.standardError = p
        do { try t.run() } catch { return (-1, String(describing: error)) }
        let data = p.fileHandleForReading.readDataToEndOfFile()
        t.waitUntilExit()
        return (t.terminationStatus, String(data: data, encoding: .utf8) ?? "")
    }

    func steps() -> [InstallStep] {
        [
            InstallStep(title: "VERIFYING PAYLOAD") {
                var sys = utsname(); uname(&sys)
                let arch = withUnsafePointer(to: &sys.machine) { $0.withMemoryRebound(to: CChar.self, capacity: 1) { String(cString: $0) } }
                guard arch == "arm64" else { throw InstallError.message("CUSS requires an Apple Silicon Mac (detected \(arch)).") }
                for rel in ["node/bin/node", "bridge/src/main.ts", "bridge/node_modules/.bin/tsx", "bridge/bin/cuss-mac-input", "CUSS Menu.app/Contents/MacOS/CussMenuBar"] {
                    guard self.fm.fileExists(atPath: self.payload.appendingPathComponent(rel).path) else { throw InstallError.message("Payload missing \(rel)") }
                }
                guard self.fm.fileExists(atPath: "/Applications/Cursor.app") else {
                    throw InstallError.message("Cursor.app not found in /Applications. Install Cursor first (cursor.com), then run this installer again.")
                }
                return "arm64 · Cursor.app found"
            },
            InstallStep(title: "STOPPING OLD SERVICES") {
                for label in ["com.cuss.bridge", "com.cuss.menubar", "com.cuss.expo"] {
                    _ = self.sh("/bin/launchctl", ["unload", self.agentsDir + "/\(label).plist"])
                    _ = self.sh("/bin/launchctl", ["bootout", "gui/\(getuid())/\(label)"])
                }
                _ = self.sh("/bin/sh", ["-c", "/usr/sbin/lsof -ti :4040 | xargs kill -9 2>/dev/null || true"])
                _ = self.sh("/usr/bin/pkill", ["-f", "CussMenuBar"])
                return "launch agents unloaded"
            },
            InstallStep(title: "INSTALLING NODE RUNTIME") {
                try self.fm.createDirectory(atPath: self.home, withIntermediateDirectories: true)
                try self.replace(self.payload.appendingPathComponent("node").path, self.home + "/node")
                return "node 22 → ~/Library/Application Support/CUSS/node"
            },
            InstallStep(title: "INSTALLING MAC BRIDGE") {
                try self.replace(self.payload.appendingPathComponent("bridge").path, self.home + "/bridge")
                return "bridge + native helpers installed"
            },
            InstallStep(title: "INSTALLING MENU BAR APP") {
                try self.replace(self.payload.appendingPathComponent("CUSS Menu.app").path, self.appsDir + "/CUSS Menu.app")
                _ = self.sh("/usr/bin/xattr", ["-dr", "com.apple.quarantine", self.appsDir + "/CUSS Menu.app"])
                _ = self.sh("/usr/bin/xattr", ["-dr", "com.apple.quarantine", self.home])
                return "/Applications/CUSS Menu.app"
            },
            InstallStep(title: "WRITING CONFIGURATION") {
                try self.fm.createDirectory(atPath: self.configDir, withIntermediateDirectories: true)
                let cfgPath = self.configDir + "/config.json"
                var cfgObj: [String: Any] = ["port": 4040]
                if let existingData = try? Data(contentsOf: URL(fileURLWithPath: cfgPath)),
                   let existingJson = try? JSONSerialization.jsonObject(with: existingData) as? [String: Any] {
                    cfgObj = existingJson
                }
                if (cfgObj["pairingToken"] as? String ?? "").isEmpty {
                    var bytes = [UInt8](repeating: 0, count: 24)
                    _ = SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes)
                    cfgObj["pairingToken"] = bytes.map { String(format: "%02x", $0) }.joined()
                }
                if cfgObj["port"] == nil { cfgObj["port"] = 4040 }
                let cfgData = try JSONSerialization.data(withJSONObject: cfgObj, options: [.prettyPrinted])
                try cfgData.write(to: URL(fileURLWithPath: cfgPath))
                chmod(cfgPath, 0o600)

                let node = self.home + "/node/bin/node"
                let install: [String: Any] = ["home": self.home, "node": node, "mode": "installed", "version": Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") ?? "0"]
                let data = try JSONSerialization.data(withJSONObject: install, options: [.prettyPrinted])
                try data.write(to: URL(fileURLWithPath: self.configDir + "/install.json"))
                try self.fm.createDirectory(atPath: self.agentsDir, withIntermediateDirectories: true)
                try self.bridgePlist(node: node).write(toFile: self.agentsDir + "/com.cuss.bridge.plist", atomically: true, encoding: .utf8)
                try self.menubarPlist().write(toFile: self.agentsDir + "/com.cuss.menubar.plist", atomically: true, encoding: .utf8)
                return "LaunchAgents written"
            },
            InstallStep(title: "SYNCING CURSOR LOGIN") {
                let db = NSHomeDirectory() + "/Library/Application Support/Cursor/User/globalStorage/state.vscdb"
                guard self.fm.fileExists(atPath: db) else { return "Cursor not signed in yet — sign in from the phone app" }
                func q(_ k: String) -> String { self.sh("/usr/bin/sqlite3", ["-cmd", ".timeout 1000", db, "SELECT value FROM ItemTable WHERE key='\(k)';"]).1.trimmingCharacters(in: .whitespacesAndNewlines) }
                let a = q("cursorAuth/accessToken"), r = q("cursorAuth/refreshToken"), e = q("cursorAuth/cachedEmail")
                guard !a.isEmpty, !r.isEmpty else { return "Cursor not signed in yet — sign in from the phone app" }
                try self.fm.createDirectory(atPath: NSHomeDirectory() + "/.cursor", withIntermediateDirectories: true)
                let data = try JSONSerialization.data(withJSONObject: ["accessToken": a, "refreshToken": r], options: [.prettyPrinted])
                let p = NSHomeDirectory() + "/.cursor/auth.json"
                try data.write(to: URL(fileURLWithPath: p))
                chmod(p, 0o600)
                return e.isEmpty ? "tokens synced" : "signed in as \(e)"
            },
            InstallStep(title: "STARTING BACKGROUND SERVICES") {
                for label in ["com.cuss.bridge", "com.cuss.menubar"] {
                    _ = self.sh("/bin/launchctl", ["enable", "gui/\(getuid())/\(label)"])
                    let r = self.sh("/bin/launchctl", ["bootstrap", "gui/\(getuid())", self.agentsDir + "/\(label).plist"])
                    if r.0 != 0 { _ = self.sh("/bin/launchctl", ["load", "-w", self.agentsDir + "/\(label).plist"]) }
                }
                _ = self.sh("/usr/bin/open", ["-a", "/Applications/CUSS Menu.app"])
                for _ in 0..<45 {
                    if self.healthy() { return "bridge online on port 4040" }
                    usleep(250_000)
                }
                throw InstallError.message("Bridge did not come online. See /tmp/cuss-bridge.log")
            },
        ]
    }

    func healthy() -> Bool {
        let sema = DispatchSemaphore(value: 0)
        var ok = false
        var req = URLRequest(url: URL(string: "http://127.0.0.1:4040/api/health")!)
        req.timeoutInterval = 1.5
        URLSession.shared.dataTask(with: req) { _, resp, _ in
            ok = (resp as? HTTPURLResponse)?.statusCode == 200
            sema.signal()
        }.resume()
        _ = sema.wait(timeout: .now() + 2)
        return ok
    }

    func replace(_ src: String, _ dst: String) throws {
        _ = sh("/bin/rm", ["-rf", dst])
        let r = sh("/usr/bin/ditto", [src, dst])
        if r.0 != 0 {
            throw InstallError.message("Failed copying \(dst): \(r.1)")
        }
    }

    func bridgePlist(node: String) -> String {
        """
        <?xml version="1.0" encoding="UTF-8"?>
        <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
        <plist version="1.0"><dict>
          <key>Label</key><string>com.cuss.bridge</string>
          <key>WorkingDirectory</key><string>\(home)/bridge</string>
          <key>EnvironmentVariables</key><dict>
            <key>PATH</key><string>\(home)/node/bin:/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
            <key>CUSS_HELPERS_DIR</key><string>\(home)/bridge/bin</string>
          </dict>
          <key>ProgramArguments</key><array>
            <string>\(node)</string>
            <string>\(home)/bridge/node_modules/.bin/tsx</string>
            <string>\(home)/bridge/src/main.ts</string>
          </array>
          <key>RunAtLoad</key><true/>
          <key>KeepAlive</key><true/>
          <key>StandardOutPath</key><string>/tmp/cuss-bridge.log</string>
          <key>StandardErrorPath</key><string>/tmp/cuss-bridge.log</string>
        </dict></plist>
        """
    }

    func menubarPlist() -> String {
        """
        <?xml version="1.0" encoding="UTF-8"?>
        <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
        <plist version="1.0"><dict>
          <key>Label</key><string>com.cuss.menubar</string>
          <key>ProgramArguments</key><array><string>/Applications/CUSS Menu.app/Contents/MacOS/CussMenuBar</string></array>
          <key>RunAtLoad</key><true/>
          <key>KeepAlive</key><dict><key>SuccessfulExit</key><false/></dict>
        </dict></plist>
        """
    }

    func pairingInfo() -> (ip: String, token: String, link: String) {
        var ip = "127.0.0.1"
        var ifaddr: UnsafeMutablePointer<ifaddrs>?
        if getifaddrs(&ifaddr) == 0, let first = ifaddr {
            defer { freeifaddrs(ifaddr) }
            for ptr in sequence(first: first, next: { $0.pointee.ifa_next }) {
                let flags = Int32(ptr.pointee.ifa_flags)
                guard (flags & IFF_UP) != 0, (flags & IFF_LOOPBACK) == 0, let sa = ptr.pointee.ifa_addr, sa.pointee.sa_family == UInt8(AF_INET) else { continue }
                var host = [CChar](repeating: 0, count: Int(NI_MAXHOST))
                if getnameinfo(sa, socklen_t(sa.pointee.sa_len), &host, socklen_t(host.count), nil, 0, NI_NUMERICHOST) == 0 {
                    let name = String(cString: ptr.pointee.ifa_name)
                    let candidate = String(cString: host)
                    if candidate.hasPrefix("127.") || candidate.hasPrefix("169.254.") { continue }
                    if name == "en0" { ip = candidate; break }
                    if name.hasPrefix("en") && ip == "127.0.0.1" { ip = candidate }
                    if ip == "127.0.0.1" { ip = candidate }
                }
            }
        }
        var token = ""
        if let d = try? Data(contentsOf: URL(fileURLWithPath: configDir + "/config.json")), let j = try? JSONSerialization.jsonObject(with: d) as? [String: Any] {
            token = j["pairingToken"] as? String ?? ""
        }
        var allowed = CharacterSet.urlQueryAllowed
        allowed.remove(charactersIn: "&=+#?")
        let enc = "http://\(ip):4040".addingPercentEncoding(withAllowedCharacters: allowed) ?? "http%3A%2F%2F\(ip)%3A4040"
        return (ip, token, "missioncontrol://pair?url=\(enc)&token=\(token)")
    }
}

// MARK: - Animated installer window

final class InstallerButton: NSButton {
    override var mouseDownCanMoveWindow: Bool { false }
}

final class InstallerView: NSView {
    let installer = Installer()
    let crest = CALayer()
    let ring = CAShapeLayer()
    let halfRing = CAShapeLayer()
    let arc = CAShapeLayer()
    let bolt = CAShapeLayer()
    let boltShadow = CAShapeLayer()
    var letters: [CATextLayer] = []
    let subtitle = CATextLayer()
    let track = CALayer()
    let fill = CALayer()
    let stepLabel = NSTextField(labelWithString: "")
    let logLabel = NSTextField(wrappingLabelWithString: "")
    let button = InstallerButton(title: "INSTALL CUSS", target: nil, action: nil)
    let qrView = NSImageView()
    let qrCaption = NSTextField(wrappingLabelWithString: "")
    var totalSteps = 1

    override init(frame: NSRect) {
        super.init(frame: frame)
        wantsLayer = true
        layer?.backgroundColor = Brand.obsidian.cgColor
        buildGrid()
        buildCrest()
        buildWordmark()
        buildControls()
    }

    required init?(coder: NSCoder) { fatalError() }

    // Ambient layer: architectural grid + slow drifting gradient glow
    private func buildGrid() {
        let grid = CAShapeLayer()
        let path = CGMutablePath()
        let step: CGFloat = 40
        var x: CGFloat = 0
        while x <= bounds.width { path.move(to: CGPoint(x: x, y: 0)); path.addLine(to: CGPoint(x: x, y: bounds.height)); x += step }
        var y: CGFloat = 0
        while y <= bounds.height { path.move(to: CGPoint(x: 0, y: y)); path.addLine(to: CGPoint(x: bounds.width, y: y)); y += step }
        grid.path = path
        grid.strokeColor = Brand.grid.cgColor
        grid.lineWidth = 1
        grid.opacity = 0.7
        layer?.addSublayer(grid)

        let glow = CAGradientLayer()
        glow.frame = bounds.insetBy(dx: -200, dy: -200)
        glow.type = .radial
        glow.colors = [Brand.lime.withAlphaComponent(0.10).cgColor, Brand.cyan.withAlphaComponent(0.04).cgColor, NSColor.clear.cgColor]
        glow.locations = [0, 0.45, 1]
        glow.startPoint = CGPoint(x: 0.3, y: 0.6)
        glow.endPoint = CGPoint(x: 1, y: 1)
        layer?.addSublayer(glow)
        let drift = CABasicAnimation(keyPath: "startPoint")
        drift.fromValue = CGPoint(x: 0.3, y: 0.6)
        drift.toValue = CGPoint(x: 0.4, y: 0.5)
        drift.duration = 6
        drift.autoreverses = true
        drift.repeatCount = .infinity
        drift.timingFunction = CAMediaTimingFunction(name: .easeInEaseOut)
        glow.add(drift, forKey: "drift")

        // corner brackets (brutalist registration marks)
        func bracket(_ p: CGPoint, _ dx: CGFloat, _ dy: CGFloat, _ color: NSColor) {
            let l = CAShapeLayer()
            let m = CGMutablePath()
            m.move(to: CGPoint(x: p.x, y: p.y + dy * 34)); m.addLine(to: p); m.addLine(to: CGPoint(x: p.x + dx * 34, y: p.y))
            l.path = m; l.strokeColor = color.cgColor; l.fillColor = nil; l.lineWidth = 4; l.lineCap = .square
            layer?.addSublayer(l)
        }
        bracket(CGPoint(x: 22, y: bounds.height - 22), 1, -1, Brand.lime)
        bracket(CGPoint(x: bounds.width - 22, y: bounds.height - 22), -1, -1, Brand.cyan)
        bracket(CGPoint(x: 22, y: 22), 1, 1, Brand.magenta)
        bracket(CGPoint(x: bounds.width - 22, y: 22), -1, 1, Brand.lime)
    }

    // Hero: the crest draws itself on (primary), rings spin (ambient), bolt lands with overshoot (secondary)
    private func buildCrest() {
        let size: CGFloat = 230
        crest.frame = CGRect(x: 70, y: bounds.height / 2 - size / 2 + 10, width: size, height: size)
        layer?.addSublayer(crest)
        let c = CGPoint(x: size / 2, y: size / 2)
        let R = size * 0.42

        ring.path = CGPath(ellipseIn: CGRect(x: c.x - R, y: c.y - R, width: 2 * R, height: 2 * R), transform: nil)
        ring.strokeColor = Brand.cyan.withAlphaComponent(0.7).cgColor
        ring.fillColor = nil
        ring.lineWidth = 3
        ring.lineDashPattern = [5, 11]
        ring.frame = crest.bounds
        ring.opacity = 0
        crest.addSublayer(ring)

        let r2 = R * 0.82
        halfRing.path = CGPath(ellipseIn: CGRect(x: c.x - r2, y: c.y - r2, width: 2 * r2, height: 2 * r2), transform: nil)
        halfRing.strokeColor = Brand.magenta.cgColor
        halfRing.fillColor = nil
        halfRing.lineWidth = 3
        halfRing.lineDashPattern = [7, 9]
        halfRing.strokeStart = 0.5
        halfRing.strokeEnd = 1.0
        halfRing.frame = crest.bounds
        halfRing.opacity = 0
        crest.addSublayer(halfRing)

        let arcPath = CGMutablePath()
        arcPath.addArc(center: c, radius: r2, startAngle: .pi, endAngle: 0, clockwise: true)
        arc.path = arcPath
        arc.strokeColor = Brand.lime.cgColor
        arc.fillColor = nil
        arc.lineWidth = 5
        arc.lineCap = .round
        arc.frame = crest.bounds
        arc.strokeEnd = 0
        arc.shadowColor = Brand.lime.cgColor
        arc.shadowRadius = 12
        arc.shadowOpacity = 0.8
        crest.addSublayer(arc)

        let s = R * 1.25
        let pts: [(CGFloat, CGFloat)] = [(0.58, 0.02), (0.22, 0.56), (0.47, 0.56), (0.40, 0.98), (0.78, 0.42), (0.53, 0.42), (0.62, 0.02)]
        let bp = CGMutablePath()
        for (i, p) in pts.enumerated() {
            let pt = CGPoint(x: c.x - s / 2 + p.0 * s, y: c.y + s / 2 - p.1 * s)
            if i == 0 { bp.move(to: pt) } else { bp.addLine(to: pt) }
        }
        bp.closeSubpath()
        boltShadow.path = bp
        boltShadow.fillColor = Brand.magenta.cgColor
        boltShadow.frame = crest.bounds.offsetBy(dx: 5, dy: -5)
        boltShadow.opacity = 0
        crest.addSublayer(boltShadow)
        bolt.path = bp
        bolt.fillColor = Brand.lime.cgColor
        bolt.strokeColor = Brand.lime.cgColor
        bolt.lineWidth = 3
        bolt.lineJoin = .round
        bolt.frame = crest.bounds
        bolt.opacity = 0
        bolt.shadowColor = Brand.lime.cgColor
        bolt.shadowRadius = 18
        bolt.shadowOpacity = 0.9
        crest.addSublayer(bolt)
    }

    private func buildWordmark() {
        let x0: CGFloat = 340
        let baseY = bounds.height / 2 + 36
        var x = x0
        for ch in "CUSS" {
            let t = CATextLayer()
            t.string = String(ch)
            t.font = Brand.display(84)
            t.fontSize = 84
            t.foregroundColor = Brand.lime.cgColor
            t.alignmentMode = .left
            t.contentsScale = 2
            t.frame = CGRect(x: x, y: baseY, width: 86, height: 100)
            t.opacity = 0
            t.shadowColor = Brand.magenta.cgColor
            t.shadowOffset = CGSize(width: 5, height: -5)
            t.shadowOpacity = 1
            t.shadowRadius = 0
            layer?.addSublayer(t)
            letters.append(t)
            x += 82
        }
        subtitle.string = "CYBERNETIC UMBILICAL STUDIO & SYNTH"
        subtitle.font = Brand.mono(12)
        subtitle.fontSize = 12
        subtitle.foregroundColor = Brand.cyan.cgColor
        subtitle.contentsScale = 2
        subtitle.frame = CGRect(x: x0 + 4, y: baseY - 26, width: 420, height: 18)
        subtitle.opacity = 0
        layer?.addSublayer(subtitle)
    }

    private func buildControls() {
        let x0: CGFloat = 344
        track.frame = CGRect(x: x0, y: bounds.height / 2 - 40, width: 380, height: 6)
        track.backgroundColor = Brand.surface.cgColor
        track.cornerRadius = 3
        track.opacity = 0
        layer?.addSublayer(track)
        fill.frame = CGRect(x: 0, y: 0, width: 0, height: 6)
        fill.backgroundColor = Brand.lime.cgColor
        fill.cornerRadius = 3
        fill.shadowColor = Brand.lime.cgColor
        fill.shadowRadius = 8
        fill.shadowOpacity = 0.9
        track.addSublayer(fill)

        stepLabel.font = Brand.mono(11)
        stepLabel.textColor = Brand.lime
        stepLabel.frame = NSRect(x: x0, y: bounds.height / 2 - 66, width: 380, height: 18)
        stepLabel.alphaValue = 0
        addSubview(stepLabel)

        logLabel.font = Brand.mono(10.5, bold: false)
        logLabel.textColor = Brand.dim
        logLabel.frame = NSRect(x: x0, y: bounds.height / 2 - 150, width: 380, height: 78)
        logLabel.alphaValue = 0
        logLabel.maximumNumberOfLines = 5
        addSubview(logLabel)

        button.isBordered = false
        button.wantsLayer = true
        button.layer?.backgroundColor = Brand.lime.cgColor
        button.layer?.cornerRadius = 12
        button.attributedTitle = NSAttributedString(string: "INSTALL CUSS", attributes: [.font: Brand.mono(13), .foregroundColor: Brand.obsidian, .kern: 2])
        button.frame = NSRect(x: x0, y: bounds.height / 2 - 96, width: 200, height: 44)
        button.alphaValue = 1
        button.target = self
        button.action = #selector(primaryAction)
        addSubview(button)

        qrView.frame = NSRect(x: 72, y: bounds.height / 2 - 118, width: 226, height: 226)
        qrView.wantsLayer = true
        qrView.layer?.backgroundColor = NSColor.white.cgColor
        qrView.layer?.cornerRadius = 14
        qrView.imageScaling = .scaleProportionallyUpOrDown
        qrView.alphaValue = 0
        addSubview(qrView)
        qrCaption.font = Brand.mono(10)
        qrCaption.textColor = Brand.lime
        qrCaption.alignment = .center
        qrCaption.frame = NSRect(x: 52, y: bounds.height / 2 - 160, width: 266, height: 36)
        qrCaption.alphaValue = 0
        addSubview(qrCaption)
    }

    // MARK: Intro choreography (hero first, same-direction entrances, stagger < 500ms)

    func playIntro() {
        // 0ms ambient rings fade + eternal slow spin
        fade(ring, to: 1, delay: 0.0, dur: 0.5)
        fade(halfRing, to: 1, delay: 0.1, dur: 0.5)
        spin(ring, duration: 28, clockwise: true)
        spin(halfRing, duration: 20, clockwise: false)
        // 120ms lime arc draws on
        let draw = CABasicAnimation(keyPath: "strokeEnd")
        draw.fromValue = 0; draw.toValue = 1; draw.duration = 0.62; draw.beginTime = CACurrentMediaTime() + 0.12
        draw.timingFunction = Brand.enter; draw.fillMode = .forwards; draw.isRemovedOnCompletion = false
        arc.add(draw, forKey: "draw")
        // 380ms bolt lands with 18% overshoot (Energetic), shadow follows 60ms later
        let land = CAKeyframeAnimation(keyPath: "transform.scale")
        land.values = [0.3, 1.18, 0.96, 1.0]; land.keyTimes = [0, 0.55, 0.8, 1]
        land.duration = 0.42; land.beginTime = CACurrentMediaTime() + 0.38
        land.timingFunctions = [Brand.expoOut, Brand.expoOut, Brand.enter]
        land.fillMode = .backwards
        bolt.add(land, forKey: "land")
        fade(bolt, to: 1, delay: 0.38, dur: 0.18)
        fade(boltShadow, to: 1, delay: 0.46, dur: 0.2)
        let shadowLand = CABasicAnimation(keyPath: "transform.translation.x")
        shadowLand.fromValue = -6; shadowLand.toValue = 0; shadowLand.duration = 0.3; shadowLand.beginTime = CACurrentMediaTime() + 0.46
        shadowLand.timingFunction = Brand.enter; shadowLand.fillMode = .backwards
        boltShadow.add(shadowLand, forKey: "shadowLand")
        // breathing glow (ambient, sine)
        let breathe = CABasicAnimation(keyPath: "shadowRadius")
        breathe.fromValue = 14; breathe.toValue = 26; breathe.duration = 1.6; breathe.autoreverses = true; breathe.repeatCount = .infinity
        breathe.timingFunction = CAMediaTimingFunction(name: .easeInEaseOut); breathe.beginTime = CACurrentMediaTime() + 0.9
        bolt.add(breathe, forKey: "breathe")

        // 520ms wordmark rises letter by letter (60ms stagger → 180ms total)
        for (i, l) in letters.enumerated() {
            let d = 0.52 + Double(i) * 0.06
            fade(l, to: 1, delay: d, dur: 0.18)
            let rise = CASpringAnimation(keyPath: "transform.translation.y")
            rise.fromValue = -42; rise.toValue = 0; rise.mass = 0.8; rise.stiffness = 260; rise.damping = 16; rise.initialVelocity = 2
            rise.duration = rise.settlingDuration; rise.beginTime = CACurrentMediaTime() + d; rise.fillMode = .backwards
            l.add(rise, forKey: "rise")
        }
        fade(subtitle, to: 1, delay: 0.84, dur: 0.3)
        // 1000ms CTA appears (gentle, decelerate)
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
            NSAnimationContext.runAnimationGroup { ctx in
                ctx.duration = 0.3
                ctx.timingFunction = Brand.enter
                self.button.animator().alphaValue = 1
            }
            self.pulseButton()
        }
    }

    private func pulseButton() {
        let p = CABasicAnimation(keyPath: "shadowOpacity")
        button.layer?.shadowColor = Brand.lime.cgColor
        button.layer?.shadowRadius = 16
        p.fromValue = 0.25; p.toValue = 0.8; p.duration = 1.2; p.autoreverses = true; p.repeatCount = .infinity
        p.timingFunction = CAMediaTimingFunction(name: .easeInEaseOut)
        button.layer?.add(p, forKey: "pulse")
    }

    private func fade(_ l: CALayer, to: Float, delay: Double, dur: Double) {
        let a = CABasicAnimation(keyPath: "opacity")
        a.fromValue = l.opacity; a.toValue = to; a.duration = dur; a.beginTime = CACurrentMediaTime() + delay
        a.timingFunction = Brand.enter; a.fillMode = .both; a.isRemovedOnCompletion = false
        l.add(a, forKey: "fade")
        l.opacity = to
    }

    private func spin(_ l: CALayer, duration: Double, clockwise: Bool) {
        let r = CABasicAnimation(keyPath: "transform.rotation.z")
        r.fromValue = 0; r.toValue = (clockwise ? -1 : 1) * Double.pi * 2; r.duration = duration; r.repeatCount = .infinity
        l.add(r, forKey: "spin")
    }

    // MARK: Install flow

    var finished = false

    @objc func primaryAction() {
        if finished { NSApp.terminate(nil); return }
        // Anticipation → squash → settle (Disney), then disable
        let squash = CAKeyframeAnimation(keyPath: "transform.scale")
        squash.values = [1, 0.96, 1.04, 1]; squash.keyTimes = [0, 0.3, 0.7, 1]; squash.duration = 0.22
        button.layer?.add(squash, forKey: "press")
        button.isEnabled = false
        button.layer?.removeAnimation(forKey: "pulse")
        NSAnimationContext.runAnimationGroup { ctx in
            ctx.duration = 0.25; ctx.timingFunction = Brand.exit
            button.animator().alphaValue = 0
            stepLabel.animator().alphaValue = 1
            logLabel.animator().alphaValue = 1
        }
        fade(track, to: 1, delay: 0, dur: 0.25)
        let steps = installer.steps()
        totalSteps = steps.count
        DispatchQueue.global(qos: .userInitiated).async { self.run(steps) }
    }

    private func run(_ steps: [InstallStep]) {
        var log: [String] = []
        for (i, step) in steps.enumerated() {
            DispatchQueue.main.async { self.setStep(i, step.title) }
            do {
                let detail = try step.run()
                log.append("✓ \(step.title.lowercased()) — \(detail)")
            } catch {
                log.append("✗ \(step.title.lowercased()) — \(error.localizedDescription)")
                DispatchQueue.main.async { self.fail(log, message: error.localizedDescription) }
                return
            }
            DispatchQueue.main.async { self.logLabel.stringValue = log.suffix(5).joined(separator: "\n") }
            usleep(140_000)
        }
        DispatchQueue.main.async { self.success(log) }
    }

    private func setStep(_ i: Int, _ title: String) {
        stepLabel.stringValue = "\(String(format: "%02d", i + 1))/\(String(format: "%02d", totalSteps)) // \(title)"
        let w = track.bounds.width * CGFloat(i + 1) / CGFloat(totalSteps)
        let a = CABasicAnimation(keyPath: "bounds.size.width")
        a.fromValue = fill.bounds.width; a.toValue = w; a.duration = 0.35; a.timingFunction = Brand.enter
        fill.add(a, forKey: "grow")
        fill.frame = CGRect(x: 0, y: 0, width: w, height: 6)
        // step label pop (light weight: 5-15% overshoot)
        let pop = CAKeyframeAnimation(keyPath: "transform.translation.y")
        pop.values = [6, -2, 0]; pop.keyTimes = [0, 0.6, 1]; pop.duration = 0.2; pop.timingFunction = Brand.expoOut
        stepLabel.layer?.add(pop, forKey: "pop")
    }

    private func fail(_ log: [String], message: String) {
        finished = true
        fill.backgroundColor = Brand.danger.cgColor
        fill.shadowColor = Brand.danger.cgColor
        stepLabel.textColor = Brand.danger
        stepLabel.stringValue = "INSTALL FAILED"
        logLabel.textColor = Brand.bone
        logLabel.stringValue = message + "\n\n" + log.suffix(3).joined(separator: "\n")
        // firm error shake (no overshoot), 3 oscillations ±12px
        let shake = CAKeyframeAnimation(keyPath: "transform.translation.x")
        shake.values = [0, -12, 12, -8, 8, 0]; shake.duration = 0.36; shake.timingFunction = CAMediaTimingFunction(name: .easeInEaseOut)
        layer?.add(shake, forKey: "shake")
        button.attributedTitle = NSAttributedString(string: "CLOSE", attributes: [.font: Brand.mono(13), .foregroundColor: Brand.obsidian, .kern: 2])
        button.layer?.backgroundColor = Brand.danger.cgColor
        button.isEnabled = true
        button.frame.origin.y = bounds.height / 2 - 200
        NSAnimationContext.runAnimationGroup { ctx in ctx.duration = 0.3; button.animator().alphaValue = 1 }
    }

    private func success(_ log: [String]) {
        finished = true
        stepLabel.stringValue = "INSTALLED · ⚡ CUSS IS LIVE IN YOUR MENU BAR"
        logLabel.textColor = Brand.bone
        let info = installer.pairingInfo()
        logLabel.stringValue = "Bridge  http://\(info.ip):4040\nToken   \(info.token)\n\nOpen cuss.apk on your phone → SCAN → point at the QR.\nFor Live Keyboard echo + screen mirror, allow Accessibility\nand Screen Recording for “node” when macOS asks."
        logLabel.maximumNumberOfLines = 8
        logLabel.frame = NSRect(x: 344, y: bounds.height / 2 - 182, width: 400, height: 110)

        // crest exits stage-left (accelerate), QR enters from the same side (decelerate)
        let out = CABasicAnimation(keyPath: "transform.translation.x")
        out.fromValue = 0; out.toValue = -40; out.duration = 0.25; out.timingFunction = Brand.exit; out.fillMode = .forwards; out.isRemovedOnCompletion = false
        crest.add(out, forKey: "out")
        fade(crest, to: 0, delay: 0, dur: 0.22)
        qrView.image = qrImage(info.link, size: 220)
        qrCaption.stringValue = "SCAN IN THE CUSS APP TO PAIR\n\(info.ip):4040"
        NSAnimationContext.runAnimationGroup { ctx in
            ctx.duration = 0.32; ctx.timingFunction = Brand.enter
            qrView.animator().alphaValue = 1
            qrCaption.animator().alphaValue = 1
        }
        let qrIn = CASpringAnimation(keyPath: "transform.scale")
        qrIn.fromValue = 0.82; qrIn.toValue = 1; qrIn.stiffness = 240; qrIn.damping = 15; qrIn.mass = 0.8; qrIn.duration = qrIn.settlingDuration
        qrView.layer?.add(qrIn, forKey: "in")

        button.attributedTitle = NSAttributedString(string: "DONE", attributes: [.font: Brand.mono(13), .foregroundColor: Brand.obsidian, .kern: 2])
        button.isEnabled = true
        button.frame.origin.y = bounds.height / 2 - 236
        NSAnimationContext.runAnimationGroup { ctx in ctx.duration = 0.3; ctx.timingFunction = Brand.enter; button.animator().alphaValue = 1 }
        burst()
        NSSound(named: "Glass")?.play()
    }

    /// Success burst (ambient layer): brand-colored particles from the wordmark.
    private func burst() {
        let e = CAEmitterLayer()
        e.emitterPosition = CGPoint(x: 500, y: bounds.height / 2 + 80)
        e.emitterShape = .point
        e.renderMode = .additive
        e.birthRate = 1
        e.emitterCells = [Brand.lime, Brand.cyan, Brand.magenta].map { color in
            let c = CAEmitterCell()
            c.birthRate = 90
            c.lifetime = 1.4
            c.velocity = 260
            c.velocityRange = 120
            c.emissionRange = .pi * 2
            c.yAcceleration = -420
            c.scale = 0.08
            c.scaleRange = 0.05
            c.scaleSpeed = -0.04
            c.alphaSpeed = -0.8
            c.spin = 3
            c.spinRange = 4
            c.contents = particleImage(color)
            return c
        }
        layer?.addSublayer(e)
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) { e.birthRate = 0 }
        DispatchQueue.main.asyncAfter(deadline: .now() + 2.2) { e.removeFromSuperlayer() }
    }

    private func particleImage(_ color: NSColor) -> CGImage? {
        let img = NSImage(size: NSSize(width: 24, height: 24), flipped: false) { rect in
            color.setFill()
            NSBezierPath(roundedRect: rect.insetBy(dx: 4, dy: 4), xRadius: 3, yRadius: 3).fill()
            return true
        }
        return img.cgImage(forProposedRect: nil, context: nil, hints: nil)
    }

    private func qrImage(_ string: String, size: CGFloat) -> NSImage? {
        guard let data = string.data(using: .utf8), let f = CIFilter(name: "CIQRCodeGenerator") else { return nil }
        f.setValue(data, forKey: "inputMessage")
        f.setValue("M", forKey: "inputCorrectionLevel")
        guard let rawCi = f.outputImage else { return nil }
        let colorFilter = CIFilter(name: "CIFalseColor")
        colorFilter?.setValue(rawCi, forKey: kCIInputImageKey)
        colorFilter?.setValue(CIColor(red: 0, green: 0, blue: 0, alpha: 1), forKey: "inputColor0")
        colorFilter?.setValue(CIColor(red: 1, green: 1, blue: 1, alpha: 1), forKey: "inputColor1")
        let ci = colorFilter?.outputImage ?? rawCi
        let extent = ci.extent.integral
        guard extent.width > 0 else { return nil }
        let intScale = max(10, Int(ceil((size * 2.0) / extent.width)))
        let scaled = ci.samplingNearest().transformed(by: CGAffineTransform(scaleX: CGFloat(intScale), y: CGFloat(intScale)))
        let ctx = CIContext(options: [.useSoftwareRenderer: false])
        guard let cg = ctx.createCGImage(scaled, from: scaled.extent.integral) else { return nil }
        return NSImage(cgImage: cg, size: NSSize(width: size, height: size))
    }
}

final class AppDelegate: NSObject, NSApplicationDelegate {
    var window: NSWindow!
    func applicationDidFinishLaunching(_ notification: Notification) {
        Brand.registerFonts()
        let frame = NSRect(x: 0, y: 0, width: 780, height: 500)
        window = NSWindow(contentRect: frame, styleMask: [.titled, .closable, .fullSizeContentView], backing: .buffered, defer: false)
        window.titlebarAppearsTransparent = true
        window.titleVisibility = .hidden
        window.backgroundColor = Brand.obsidian
        window.isMovableByWindowBackground = true
        window.appearance = NSAppearance(named: .darkAqua)
        let view = InstallerView(frame: frame)
        window.contentView = view
        window.center()
        window.makeKeyAndOrderFront(nil)
        window.orderFrontRegardless()
        if #available(macOS 14.0, *) {
            NSApp.activate()
        } else {
            NSApp.activate(ignoringOtherApps: true)
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) { view.playIntro() }
    }
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.regular)
app.run()
