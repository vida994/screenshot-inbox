import AppKit
import SwiftUI
import SettingsCore
import ReceiverSupport

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
    let receiver = ReceiverController()
    var openSettings: (() -> Void)?
    private var isQuitting = false

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.accessory)
        DispatchQueue.main.async {
            self.showWindow(center: true)
            self.receiver.start()
        }
    }

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        showWindow()
        return true
    }

    private func showWindow(center: Bool = false) {
        guard let window = NSApp.windows.first(where: { $0.identifier?.rawValue == "settings" || $0.title == "Screenshot Inbox" }) else {
            openSettings?()
            return
        }
        window.setContentSize(NSSize(width: 560, height: 700))
        if center { window.center() }
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { false }

    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
        guard receiver.ownedProcessID != nil else { return .terminateNow }
        if !isQuitting {
            isQuitting = true
            receiver.stop { DispatchQueue.main.async { NSApp.reply(toApplicationShouldTerminate: true) } }
        }
        return .terminateLater
    }
}

@main
struct ScreenshotInboxSettingsApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate

    var body: some Scene {
        Window("Screenshot Inbox", id: "settings") {
            SettingsRoot(delegate: appDelegate)
        }
        .defaultSize(width: 560, height: 700)
        .windowResizability(.contentSize)
        .commands { CommandGroup(replacing: .newItem) {} }
        MenuBarExtra("Screenshot Inbox", systemImage: "photo.stack") {
            ReceiverMenu(receiver: appDelegate.receiver)
        }
    }
}

@MainActor
struct SettingsRoot: View {
    @Environment(\.openWindow) private var openWindow
    let delegate: AppDelegate

    var body: some View {
        SettingsView(receiver: delegate.receiver)
            .onAppear {
                delegate.openSettings = {
                    openWindow(id: "settings")
                    NSApp.activate(ignoringOtherApps: true)
                }
            }
    }
}

@MainActor
struct SettingsView: View {
    let receiver: ReceiverController
    @State private var folder = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Documents/Screenshot Inbox")
    @State private var count = "20"
    @State private var days = "7"
    @State private var dateFolders = true
    @State private var baseline: StoragePreferences?
    @State private var error: String?
    @State private var status: String?
    private let settings = SettingsFile()

    private var preferences: StoragePreferences? {
        guard let count = Int(count), let days = Int(days) else { return nil }
        let value = StoragePreferences(inbox: folder.path, maxCount: count, maxDays: days, dateFolders: dateFolders)
        guard (try? value.validate()) != nil else { return nil }
        return value
    }

    private var hasChanges: Bool { preferences != baseline }
    private var folderChanged: Bool { baseline.map { $0.inbox != folder.path } ?? false }
    private var dateExample: String {
        let parts = Calendar.current.dateComponents([.year, .month, .day], from: Date())
        return String(format: "%04d-%02d-%02d", parts.year ?? 2000, parts.month ?? 1, parts.day ?? 1)
    }

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 12) {
                Image(systemName: "photo.stack")
                    .font(.system(size: 28, weight: .medium))
                    .foregroundStyle(.tint)
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 4) {
                    Text("Screenshot Inbox").font(.title2.weight(.semibold))
                    Text("Choose where screenshots live and how long to keep them.")
                        .font(.callout).foregroundStyle(.secondary)
                }
                Spacer()
            }
            .padding(.horizontal, 24).padding(.top, 22).padding(.bottom, 8)

            Form {
                Section("Receiver") {
                    ReceiverStatusView(receiver: receiver)
                }
                Section("Storage") {
                    VStack(alignment: .leading, spacing: 10) {
                        HStack {
                            Label(folder.lastPathComponent, systemImage: "folder")
                                .fontWeight(.medium)
                            Spacer()
                            Button("Choose Folder…", action: chooseFolder)
                                .accessibilityIdentifier("choose-folder")
                        }
                        Text(folder.path).font(.caption).foregroundStyle(.secondary)
                            .textSelection(.enabled).lineLimit(2)
                            .accessibilityIdentifier("folder-path")
                        Button("Open in Finder") { NSWorkspace.shared.open(folder) }
                            .buttonStyle(.link)
                        if folderChanged {
                            Text("Existing screenshots will stay in the previous folder.")
                                .font(.caption).foregroundStyle(.secondary)
                        }
                    }
                    .padding(.vertical, 5)
                }

                Section("Automatic cleanup") {
                    numberRow("Keep latest", unit: "screenshots", value: $count, fallback: 20, identifier: "screenshot-count")
                    numberRow("Maximum age", unit: "days", value: $days, fallback: 7, identifier: "retention-days")
                    Text("Screenshots are removed when either limit is reached. Cleanup runs after uploads and hourly while the receiver is running.")
                        .font(.caption).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
                }

                Section {
                    Toggle("Group screenshots into date folders", isOn: $dateFolders)
                        .accessibilityIdentifier("date-folders")
                    Text("For example: \(dateExample)/")
                        .font(.caption).foregroundStyle(.secondary)
                }
            }
            .formStyle(.grouped)
            .disabled(baseline == nil)

            VStack(alignment: .leading, spacing: 10) {
                if let error {
                    Label(error, systemImage: "exclamationmark.circle.fill")
                        .font(.callout).foregroundStyle(.red)
                        .accessibilityIdentifier("settings-error")
                } else if preferences == nil && baseline != nil {
                    Text("Enter whole numbers from 1 to 10,000 for both limits.")
                        .font(.callout).foregroundStyle(.red)
                        .accessibilityIdentifier("validation-error")
                } else if let status {
                    Label(status, systemImage: "checkmark.circle.fill")
                        .font(.callout).foregroundStyle(.secondary)
                        .accessibilityIdentifier("settings-status")
                }
                HStack {
                    Button("Reload", action: load).keyboardShortcut("r")
                    Spacer()
                    Button("Close") {
                        NSApp.windows.first(where: { $0.identifier?.rawValue == "settings" || $0.title == "Screenshot Inbox" })?.close()
                    }
                        .keyboardShortcut(.cancelAction)
                    Button("Save Changes", action: save)
                        .keyboardShortcut(.defaultAction)
                        .disabled(preferences == nil || baseline == nil || !hasChanges)
                        .accessibilityIdentifier("save-settings")
                }
            }
            .padding(20)
        }
        .frame(width: 560, height: 700)
        .background(.background)
        .task { load() }
        .onChange(of: folder) { _, _ in clearFeedback() }
        .onChange(of: count) { _, _ in clearFeedback() }
        .onChange(of: days) { _, _ in clearFeedback() }
        .onChange(of: dateFolders) { _, _ in clearFeedback() }
    }

    private func numberRow(_ title: String, unit: String, value: Binding<String>, fallback: Int, identifier: String) -> some View {
        HStack(spacing: 8) {
            Text(title)
            Spacer()
            TextField(title, text: value).labelsHidden()
                .frame(width: 56).multilineTextAlignment(.trailing)
                .accessibilityLabel(title)
                .accessibilityIdentifier(identifier)
            Text(unit).foregroundStyle(.secondary).frame(width: 80, alignment: .leading)
            Stepper(title, value: Binding(
                get: { Int(value.wrappedValue) ?? fallback },
                set: { value.wrappedValue = String($0) }
            ), in: 1...10000)
            .labelsHidden().fixedSize()
            .accessibilityLabel(title)
        }
        .accessibilityElement(children: .contain)
    }

    private func clearFeedback() {
        status = nil
        error = nil
    }

    private func load() {
        do {
            let current = try settings.read()
            folder = URL(fileURLWithPath: current.inbox)
            count = String(current.maxCount)
            days = String(current.maxDays)
            dateFolders = current.dateFolders
            baseline = current
            error = nil
            status = nil
        } catch {
            baseline = nil
            self.error = (error as? SettingsError)?.localizedDescription ?? "Could not read settings. Check the Screenshot Inbox configuration."
        }
    }

    private func save() {
        guard let preferences, let baseline else { return }
        do {
            let changedFolder = folderChanged
            try settings.save(preferences, expected: baseline)
            self.baseline = preferences
            error = nil
            status = changedFolder
                ? "Saved. Existing images remain in the previous folder."
                : "Saved. Your next screenshots will use these settings."
        } catch {
            self.error = (error as? SettingsError)?.localizedDescription ?? "Could not save settings. Check folder permissions."
        }
    }

    private func chooseFolder() {
        let panel = NSOpenPanel()
        panel.title = "Choose Screenshot Folder"
        panel.prompt = "Choose Folder"
        panel.canChooseFiles = false
        panel.canChooseDirectories = true
        panel.canCreateDirectories = true
        panel.allowsMultipleSelection = false
        panel.directoryURL = folder
        guard let window = NSApp.keyWindow ?? NSApp.windows.first(where: { $0.identifier?.rawValue == "settings" || $0.title == "Screenshot Inbox" }) else { return }
        panel.beginSheetModal(for: window) { response in
            if response == .OK, let selected = panel.url {
                folder = selected
                status = nil
                error = nil
            }
        }
    }
}
