import Foundation
import Testing
import Darwin
@testable import ReceiverSupport

@Suite(.serialized) @MainActor
struct ReceiverControllerTests {
    private var script: URL {
        URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent().appendingPathComponent("desktop.mjs")
    }

    private func unusedPort() throws -> Int {
        let descriptor = Darwin.socket(AF_INET, SOCK_STREAM, 0)
        defer { Darwin.close(descriptor) }
        var address = sockaddr_in()
        address.sin_len = UInt8(MemoryLayout<sockaddr_in>.size)
        address.sin_family = sa_family_t(AF_INET)
        address.sin_addr.s_addr = inet_addr("127.0.0.1")
        let bound = withUnsafePointer(to: &address) {
            $0.withMemoryRebound(to: sockaddr.self, capacity: 1) { Darwin.bind(descriptor, $0, socklen_t(MemoryLayout<sockaddr_in>.size)) }
        }
        try #require(bound == 0)
        var length = socklen_t(MemoryLayout<sockaddr_in>.size)
        let result = withUnsafeMutablePointer(to: &address) {
            $0.withMemoryRebound(to: sockaddr.self, capacity: 1) { getsockname(descriptor, $0, &length) }
        }
        try #require(result == 0)
        return Int(UInt16(bigEndian: address.sin_port))
    }

    private func config(port: Int) throws -> (URL, URL) {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent("screenshot-inbox-process-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        let file = root.appendingPathComponent("config.json")
        try JSONSerialization.data(withJSONObject: ["inbox": root.appendingPathComponent("images").path, "port": port, "token": "test-only-token", "host": "test.local"]).write(to: file)
        return (root, file)
    }

    private func waitFor(_ condition: @MainActor () -> Bool) async throws {
        let deadline = Date().addingTimeInterval(8)
        while !condition() && Date() < deadline { try await Task.sleep(for: .milliseconds(20)) }
        try #require(condition())
    }

    private func upload(port: Int) async throws -> Int {
        var request = URLRequest(url: URL(string: "http://127.0.0.1:\(port)/upload")!)
        request.httpMethod = "POST"
        request.setValue("Bearer test-only-token", forHTTPHeaderField: "Authorization")
        request.httpBody = Data(base64Encoded: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=")
        let (_, response) = try await URLSession.shared.data(for: request)
        return try #require(response as? HTTPURLResponse).statusCode
    }

    @Test func startAcceptUploadStopAndRestartWithoutDuplicateChildren() async throws {
        let port = try unusedPort()
        let (root, file) = try config(port: port)
        defer { try? FileManager.default.removeItem(at: root) }
        let controller = ReceiverController(script: script, config: file)
        defer { controller.stop() }
        controller.start()
        try await waitFor { controller.state == .running }
        let pid = try #require(controller.ownedProcessID)
        controller.start()
        #expect(controller.ownedProcessID == pid)
        #expect(try await upload(port: port) == 201)
        controller.stop()
        try await waitFor { controller.state == .stopped }
        #expect(controller.ownedProcessID == nil)
        controller.start()
        try await waitFor { controller.state == .running }
        #expect(controller.ownedProcessID != pid)
        #expect(try await upload(port: port) == 201)
        controller.stop()
        try await waitFor { controller.state == .stopped }
    }

    @Test func occupiedPortDoesNotStopOrAdoptAnotherReceiver() async throws {
        let port = try unusedPort()
        let (root, file) = try config(port: port)
        defer { try? FileManager.default.removeItem(at: root) }
        let first = ReceiverController(script: script, config: file)
        let second = ReceiverController(script: script, config: file)
        defer { first.stop(); second.stop() }
        first.start()
        try await waitFor { first.state == .running }
        let firstPID = first.ownedProcessID
        second.start()
        try await waitFor { second.state == .portInUse && second.ownedProcessID == nil }
        second.stop()
        #expect(first.state == .running)
        #expect(first.ownedProcessID == firstPID)
        #expect(try await upload(port: port) == 201)
        first.stop()
        try await waitFor { first.state == .stopped }
    }

    @Test func missingRuntimeFailsWithoutStartingAChild() throws {
        let (root, file) = try config(port: unusedPort())
        defer { try? FileManager.default.removeItem(at: root) }
        let controller = ReceiverController(script: root.appendingPathComponent("missing.mjs"), config: file)
        controller.start()
        #expect(controller.ownedProcessID == nil)
        guard case .failed = controller.state else { Issue.record("Missing runtime should fail visibly"); return }
    }

    @Test func quitCallbackRunsAfterTheOwnedReceiverStops() async throws {
        let (root, file) = try config(port: unusedPort())
        defer { try? FileManager.default.removeItem(at: root) }
        let controller = ReceiverController(script: script, config: file)
        defer { controller.stop() }
        controller.start()
        try await waitFor { controller.state == .running }
        var completed = false
        controller.stop { completed = true }
        try await waitFor { completed }
        #expect(controller.state == .stopped)
        #expect(controller.ownedProcessID == nil)
    }

    @Test func storageFailureIsVisibleWithoutExposingRawDiagnostics() async throws {
        let port = try unusedPort()
        let (root, file) = try config(port: port)
        defer { try? FileManager.default.removeItem(at: root) }
        try Data("not a folder".utf8).write(to: root.appendingPathComponent("images"))
        let controller = ReceiverController(script: script, config: file)
        defer { controller.stop() }
        controller.start()
        try await waitFor { controller.state == .running && controller.storageWarning }
        #expect(try await upload(port: port) == 500)
        controller.stop()
        try await waitFor { controller.state == .stopped }
    }
}
