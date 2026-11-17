import Foundation
import Observation
import Darwin
import SettingsCore

public enum ReceiverState: Equatable, Sendable {
    case stopped, starting, running, stopping, portInUse
    case failed(String)
}

@Observable @MainActor
public final class ReceiverController {
    public private(set) var state: ReceiverState = .stopped
    public private(set) var ownedProcessID: Int32?
    public private(set) var storageWarning = false
    public var canStart: Bool { child == nil && state != .stopping && state != .starting }
    public var canStop: Bool { child != nil && state != .stopping && state != .portInUse }

    private let script: URL?
    private let node: URL?
    private let config: URL
    private var child: Process?
    private var input: Pipe?
    private var output: Pipe?
    private var errors: Pipe?
    private var generation: UUID?
    private var buffer = Data()
    private var stopRequested = false
    private var stopCallbacks: [@MainActor () -> Void] = []

    public init(script: URL? = Bundle.main.resourceURL?.appendingPathComponent("receiver/desktop.mjs"), node: URL? = ReceiverController.findNode(), config: URL = SettingsFile.defaultURL) {
        self.script = script
        self.node = node
        self.config = config
    }

    public static func findNode() -> URL? {
        let bundledPath = Bundle.main.object(forInfoDictionaryKey: "ScreenshotInboxNodePath") as? String
        let paths = [bundledPath].compactMap { $0 }
            + (ProcessInfo.processInfo.environment["PATH"] ?? "").split(separator: ":").map { String($0) + "/node" }
            + ["/opt/homebrew/bin/node", "/usr/local/bin/node"]
        return paths.first(where: { FileManager.default.isExecutableFile(atPath: $0) }).map { URL(fileURLWithPath: $0) }
    }

    public func start() {
        guard canStart else { return }
        do { _ = try SettingsFile(url: config).read() }
        catch { state = .failed("Set up Screenshot Inbox on this Mac first."); return }
        guard let script, FileManager.default.fileExists(atPath: script.path) else {
            state = .failed("Receiver files are missing. Reinstall Screenshot Inbox."); return
        }
        guard let node, FileManager.default.isExecutableFile(atPath: node.path) else {
            state = .failed("Node.js 22 or newer is required. Install it and rebuild the app."); return
        }
        let process = Process()
        let stdin = Pipe()
        let stdout = Pipe()
        let stderr = Pipe()
        let id = UUID()
        generation = id
        buffer.removeAll()
        stopRequested = false
        storageWarning = false
        process.executableURL = node
        process.arguments = [script.path]
        process.currentDirectoryURL = script.deletingLastPathComponent()
        process.environment = [
            "HOME": FileManager.default.homeDirectoryForCurrentUser.path,
            "PATH": node.deletingLastPathComponent().path + ":/usr/bin:/bin:/usr/sbin:/sbin",
            "TMPDIR": NSTemporaryDirectory(),
            "LANG": ProcessInfo.processInfo.environment["LANG"] ?? "en_US.UTF-8",
            "SCREENSHOT_INBOX_CONFIG": config.path
        ]
        process.standardInput = stdin
        process.standardOutput = stdout
        process.standardError = stderr
        stdout.fileHandleForReading.readabilityHandler = { [weak self] handle in
            let data = handle.availableData
            if data.isEmpty { return }
            Task { @MainActor [weak self] in self?.receive(data, generation: id) }
        }
        // Drain diagnostics without displaying paths, payloads or credentials in the UI.
        stderr.fileHandleForReading.readabilityHandler = { [weak self] handle in
            let data = handle.availableData
            guard !data.isEmpty else { return }
            Task { @MainActor [weak self] in
                guard let self, self.generation == id else { return }
                self.storageWarning = true
            }
        }
        process.terminationHandler = { [weak self] process in
            let code = process.terminationStatus
            Task { @MainActor [weak self] in self?.didExit(code, generation: id) }
        }
        input = stdin
        output = stdout
        errors = stderr
        child = process
        state = .starting
        do {
            try process.run()
            ownedProcessID = process.processIdentifier
        } catch {
            releaseChild()
            state = .failed("Could not launch the receiver. Check the Node installation.")
        }
    }

    public func stop(onStopped: (@MainActor () -> Void)? = nil) {
        if let onStopped { stopCallbacks.append(onStopped) }
        guard let child, child.isRunning else {
            releaseChild()
            state = .stopped
            finishStop()
            return
        }
        if stopRequested { return }
        stopRequested = true
        state = .stopping
        // Closing the lifetime pipe requests graceful shutdown without a broken-pipe write race.
        try? input?.fileHandleForWriting.close()
        let id = generation
        // Only this Process instance may be terminated; never adopt or kill a port owner.
        Task { @MainActor [weak self] in
            try? await Task.sleep(for: .seconds(6))
            guard let self, self.generation == id, let process = self.child, process.isRunning else { return }
            process.terminate()
            try? await Task.sleep(for: .seconds(2))
            guard self.generation == id, process.isRunning else { return }
            Darwin.kill(process.processIdentifier, SIGKILL)
        }
    }

    private func receive(_ data: Data, generation id: UUID) {
        guard generation == id else { return }
        buffer.append(data)
        if buffer.count > 65536 { buffer.removeAll(); return }
        while let newline = buffer.firstIndex(of: 10) {
            let line = buffer.prefix(upTo: newline)
            buffer.removeSubrange(...newline)
            guard let event = try? JSONSerialization.jsonObject(with: line) as? [String: Any] else { continue }
            switch event["event"] as? String {
            case "ready": if !stopRequested { state = .running }
            case "error":
                if event["code"] as? String == "EADDRINUSE" { state = .portInUse }
                else if event["code"] as? String == "NODE_VERSION" { state = .failed("Node.js 22 or newer is required.") }
                else if event["code"] as? String == "CONFIG" { state = .failed("Check the Screenshot Inbox setup before starting.") }
                else { state = .failed("The receiver could not start. Check its network permissions.") }
            default: break
            }
        }
    }

    private func didExit(_ code: Int32, generation id: UUID) {
        guard generation == id else { return }
        let wasStopped = stopRequested
        releaseChild()
        if wasStopped { state = .stopped }
        else if code == 98 { state = .portInUse }
        else if code == 64 { state = .failed("Node.js 22 or newer is required.") }
        else if code == 78 { state = .failed("Check the Screenshot Inbox setup before starting.") }
        else if state == .running || state == .starting {
            state = .failed("The receiver stopped unexpectedly. Start it again to continue.")
        }
        finishStop()
    }

    private func releaseChild() {
        output?.fileHandleForReading.readabilityHandler = nil
        errors?.fileHandleForReading.readabilityHandler = nil
        try? input?.fileHandleForWriting.close()
        try? output?.fileHandleForReading.close()
        try? errors?.fileHandleForReading.close()
        child = nil
        input = nil
        output = nil
        errors = nil
        generation = nil
        ownedProcessID = nil
    }

    private func finishStop() {
        let callbacks = stopCallbacks
        stopCallbacks.removeAll()
        for callback in callbacks { callback() }
    }
}
