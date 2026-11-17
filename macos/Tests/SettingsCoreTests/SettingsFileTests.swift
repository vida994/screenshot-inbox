import Foundation
import Testing
@testable import SettingsCore

private struct Fixture {
    let root: URL
    let config: URL
    let inbox: URL

    init() throws {
        root = FileManager.default.temporaryDirectory.appendingPathComponent("screenshot-inbox-native-\(UUID().uuidString)")
        config = root.appendingPathComponent("config.json")
        inbox = root.appendingPathComponent("images")
        try FileManager.default.createDirectory(at: inbox, withIntermediateDirectories: true)
        try write(["inbox": inbox.path, "token": "test-pairing-token", "port": 4827, "host": "test.local", "extra": ["keep": true]])
    }

    func write(_ dictionary: [String: Any]) throws {
        try JSONSerialization.data(withJSONObject: dictionary).write(to: config)
    }

    func dictionary() throws -> [String: Any] {
        try #require(JSONSerialization.jsonObject(with: Data(contentsOf: config)) as? [String: Any])
    }

    func remove() { try? FileManager.default.removeItem(at: root) }
}

@Test func legacyConfigurationGetsCurrentRetentionDefaults() throws {
    let fixture = try Fixture()
    defer { fixture.remove() }
    #expect(try SettingsFile(url: fixture.config).read() == StoragePreferences(inbox: fixture.inbox.path))
}

@Test func savingPreservesConnectionFieldsAndUsesPrivateAtomicFile() throws {
    let fixture = try Fixture()
    defer { fixture.remove() }
    let file = SettingsFile(url: fixture.config)
    let baseline = try file.read()
    var preferences = baseline
    preferences.maxCount = 30
    preferences.maxDays = 14
    preferences.dateFolders = false
    try FileManager.default.setAttributes([.posixPermissions: 0o755], ofItemAtPath: fixture.root.path)
    // A connection update while this window is open must be preserved.
    var external = try fixture.dictionary()
    external["token"] = "new-test-pairing-token"
    external["port"] = 4828
    try fixture.write(external)
    try file.save(preferences, expected: baseline)
    let saved = try fixture.dictionary()
    #expect(saved["token"] as? String == "new-test-pairing-token")
    #expect(saved["port"] as? Int == 4828)
    #expect((saved["extra"] as? [String: Bool])?["keep"] == true)
    #expect(try file.read() == preferences)
    let mode = try #require(FileManager.default.attributesOfItem(atPath: fixture.config.path)[.posixPermissions] as? NSNumber)
    let parentMode = try #require(FileManager.default.attributesOfItem(atPath: fixture.root.path)[.posixPermissions] as? NSNumber)
    #expect(mode.intValue == 0o600)
    #expect(parentMode.intValue == 0o755)
    #expect(try !FileManager.default.contentsOfDirectory(atPath: fixture.root.path).contains { $0.hasPrefix(".settings-") })
}

@Test func invalidRetentionNeverChangesTheSavedConfiguration() throws {
    let fixture = try Fixture()
    defer { fixture.remove() }
    let file = SettingsFile(url: fixture.config)
    let baseline = try file.read()
    let before = try Data(contentsOf: fixture.config)
    for (count, days) in [(0, 7), (20, -1), (10001, 7)] {
        #expect(throws: SettingsError.self) {
            try file.save(StoragePreferences(inbox: fixture.inbox.path, maxCount: count, maxDays: days), expected: baseline)
        }
        #expect(try Data(contentsOf: fixture.config) == before)
    }
}

@Test func staleWindowCannotOverwriteExternalStorageChanges() throws {
    let fixture = try Fixture()
    defer { fixture.remove() }
    let file = SettingsFile(url: fixture.config)
    let baseline = try file.read()
    var external = try fixture.dictionary()
    external["maxCount"] = 5
    try fixture.write(external)
    #expect(throws: SettingsError.self) { try file.save(baseline, expected: baseline) }
    #expect(try file.read().maxCount == 5)
}

@Test func selectingAnotherFolderLeavesOldImagesInPlace() throws {
    let fixture = try Fixture()
    defer { fixture.remove() }
    let file = SettingsFile(url: fixture.config)
    let baseline = try file.read()
    let image = fixture.inbox.appendingPathComponent("existing.png")
    try Data("preserve".utf8).write(to: image)
    var preferences = baseline
    let selected = fixture.root.appendingPathComponent("chosen-folder")
    preferences.inbox = selected.path
    try file.save(preferences, expected: baseline)
    #expect(try Data(contentsOf: image) == Data("preserve".utf8))
    #expect(try FileManager.default.contentsOfDirectory(atPath: selected.path).isEmpty)
    #expect(try file.read().inbox == selected.path)
}

@Test func booleansCannotBeMistakenForIntegerRetentionLimits() throws {
    let fixture = try Fixture()
    defer { fixture.remove() }
    var dictionary = try fixture.dictionary()
    dictionary["maxCount"] = true
    try fixture.write(dictionary)
    #expect(throws: SettingsError.self) { try SettingsFile(url: fixture.config).read() }
    dictionary.removeValue(forKey: "maxCount")
    dictionary["dateFolders"] = 1
    try fixture.write(dictionary)
    #expect(throws: SettingsError.self) { try SettingsFile(url: fixture.config).read() }
}

@Test func missingConfigurationDoesNotCreateAnUnpairedAccount() throws {
    let fixture = try Fixture()
    defer { fixture.remove() }
    let missing = fixture.root.appendingPathComponent("missing.json")
    #expect(throws: SettingsError.self) { try SettingsFile(url: missing).read() }
    #expect(!FileManager.default.fileExists(atPath: missing.path))
}
