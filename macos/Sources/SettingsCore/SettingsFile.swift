import Foundation
import CoreFoundation
import Darwin

public enum SettingsError: LocalizedError {
    case needsSetup
    case invalid(String)
    case changedElsewhere
    case cannotWrite

    public var errorDescription: String? {
        switch self {
        case .needsSetup: "Set up Screenshot Inbox on this Mac before changing its settings."
        case .invalid(let message): message
        case .changedElsewhere: "Settings changed elsewhere. Reload them before saving."
        case .cannotWrite: "Could not save settings. Check that the selected folder and configuration are writable."
        }
    }
}

public struct StoragePreferences: Equatable, Sendable {
    public var inbox: String
    public var maxCount: Int
    public var maxDays: Int
    public var dateFolders: Bool

    public init(inbox: String, maxCount: Int = 20, maxDays: Int = 7, dateFolders: Bool = true) {
        self.inbox = inbox
        self.maxCount = maxCount
        self.maxDays = maxDays
        self.dateFolders = dateFolders
    }

    public func validate() throws {
        guard inbox.hasPrefix("/") else { throw SettingsError.invalid("Choose an absolute screenshot folder.") }
        guard (1...10000).contains(maxCount) else { throw SettingsError.invalid("Screenshot count must be a whole number from 1 to 10,000.") }
        guard (1...10000).contains(maxDays) else { throw SettingsError.invalid("Maximum age must be a whole number from 1 to 10,000 days.") }
    }

    fileprivate init(dictionary: [String: Any]) throws {
        guard let inbox = dictionary["inbox"] as? String else { throw SettingsError.needsSetup }
        self.inbox = inbox
        maxCount = try Self.integer(dictionary["maxCount"], fallback: 20)
        maxDays = try Self.integer(dictionary["maxDays"], fallback: 7)
        if let value = dictionary["dateFolders"] {
            guard let number = value as? NSNumber, CFGetTypeID(number) == CFBooleanGetTypeID() else {
                throw SettingsError.invalid("Date grouping must be on or off.")
            }
            dateFolders = number.boolValue
        } else { dateFolders = true }
        try validate()
    }

    private static func integer(_ value: Any?, fallback: Int) throws -> Int {
        guard let value else { return fallback }
        guard let number = value as? NSNumber,
              CFGetTypeID(number) != CFBooleanGetTypeID(),
              number.doubleValue.isFinite,
              number.doubleValue.rounded() == number.doubleValue,
              (1...10000).contains(number.doubleValue) else {
            throw SettingsError.invalid("Retention limits must be whole numbers from 1 to 10,000.")
        }
        return number.intValue
    }
}

public struct SettingsFile: Sendable {
    public let url: URL

    public init(url: URL = Self.defaultURL) { self.url = url }

    public static var defaultURL: URL {
        if let custom = ProcessInfo.processInfo.environment["SCREENSHOT_INBOX_CONFIG"], !custom.isEmpty {
            return URL(fileURLWithPath: custom)
        }
        return FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent(".config/screenshot-inbox/config.json")
    }

    private func dictionary() throws -> [String: Any] {
        guard FileManager.default.fileExists(atPath: url.path) else { throw SettingsError.needsSetup }
        guard let dictionary = try JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [String: Any],
              let token = dictionary["token"] as? String, !token.isEmpty,
              let port = dictionary["port"] as? NSNumber,
              CFGetTypeID(port) != CFBooleanGetTypeID(),
              port.doubleValue.rounded() == port.doubleValue,
              (1...65535).contains(port.intValue) else { throw SettingsError.needsSetup }
        return dictionary
    }

    public func read() throws -> StoragePreferences { try StoragePreferences(dictionary: dictionary()) }

    public func save(_ preferences: StoragePreferences, expected: StoragePreferences) throws {
        try preferences.validate()
        // Read fresh data to preserve pairing/connection fields and unrelated settings.
        var current = try dictionary()
        guard try StoragePreferences(dictionary: current) == expected else { throw SettingsError.changedElsewhere }
        current["inbox"] = preferences.inbox
        current["maxCount"] = preferences.maxCount
        current["maxDays"] = preferences.maxDays
        current["dateFolders"] = preferences.dateFolders
        try FileManager.default.createDirectory(at: URL(fileURLWithPath: preferences.inbox), withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
        let data = try JSONSerialization.data(withJSONObject: current, options: [.prettyPrinted, .sortedKeys])
        try writePrivately(data)
    }

    private func writePrivately(_ data: Data) throws {
        let temporary = url.deletingLastPathComponent().appendingPathComponent(".settings-\(UUID().uuidString).tmp")
        let descriptor = Darwin.open(temporary.path, O_WRONLY | O_CREAT | O_EXCL, S_IRUSR | S_IWUSR)
        guard descriptor >= 0 else { throw SettingsError.cannotWrite }
        let handle = FileHandle(fileDescriptor: descriptor, closeOnDealloc: true)
        defer { try? FileManager.default.removeItem(at: temporary) }
        do {
            try handle.write(contentsOf: data)
            try handle.synchronize()
            try handle.close()
            guard Darwin.rename(temporary.path, url.path) == 0 else { throw SettingsError.cannotWrite }
        } catch {
            try? handle.close()
            throw SettingsError.cannotWrite
        }
    }
}
