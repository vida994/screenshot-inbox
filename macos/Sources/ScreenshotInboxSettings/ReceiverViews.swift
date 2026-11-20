import AppKit
import SwiftUI
import ReceiverSupport
import SettingsCore

extension ReceiverState {
    var title: String {
        switch self {
        case .stopped: "Receiver stopped"
        case .starting: "Starting receiver…"
        case .running: "Ready to receive screenshots"
        case .stopping: "Stopping receiver…"
        case .portInUse: "Port is already in use"
        case .failed: "Receiver unavailable"
        }
    }

    var detail: String {
        switch self {
        case .stopped: "Start it to receive screenshots from your iPhone."
        case .starting: "Connecting to your local screenshot inbox."
        case .running: "Your iPhone can send screenshots on the same Wi-Fi."
        case .stopping: "Finishing current uploads before stopping."
        case .portInUse: "Another process is using the port. Stop it before starting here."
        case .failed(let message): message
        }
    }

    var color: Color {
        switch self {
        case .running: .green
        case .starting, .stopping: .orange
        case .failed, .portInUse: .red
        case .stopped: .secondary
        }
    }
}

@MainActor
struct ReceiverStatusView: View {
    let receiver: ReceiverController

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 10) {
                Circle().fill(receiver.state.color).frame(width: 8, height: 8).accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 4) {
                    Text(receiver.state.title).fontWeight(.medium).accessibilityIdentifier("receiver-status")
                    Text(receiver.state.detail).font(.caption).foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 10)
                if receiver.canStop {
                    Button("Stop Receiver") { receiver.stop() }
                        .accessibilityIdentifier("stop-receiver")
                } else {
                    Button("Start Receiver") { receiver.start() }
                        .disabled(!receiver.canStart)
                        .accessibilityIdentifier("start-receiver")
                }
            }
            Text("Closing this window keeps the app in your menu bar. Quit the app to stop its receiver.")
                .font(.caption).foregroundStyle(.secondary)
            if receiver.storageWarning {
                Label("The receiver reported a problem. Check folder permissions or restart it.", systemImage: "exclamationmark.triangle")
                    .font(.caption).foregroundStyle(.orange)
                    .accessibilityIdentifier("receiver-warning")
            }
        }
        .padding(.vertical, 4)
    }
}

@MainActor
struct ReceiverMenu: View {
    @Environment(\.openWindow) private var openWindow
    let receiver: ReceiverController

    var body: some View {
        Text(receiver.state.title)
        Divider()
        Button("Open Inbox Folder", action: openInbox)
        Button("Settings…") {
            openWindow(id: "settings")
            NSApp.activate(ignoringOtherApps: true)
        }
        if receiver.canStop {
            Button("Stop Receiver") { receiver.stop() }
        } else {
            Button("Start Receiver") { receiver.start() }.disabled(!receiver.canStart)
        }
        Divider()
        Button("Quit Screenshot Inbox") { NSApp.terminate(nil) }
    }

    private func openInbox() {
        guard let preferences = try? SettingsFile().read() else {
            showInboxError("Check your saved inbox location in Screenshot Inbox Settings.")
            return
        }
        let folder = URL(fileURLWithPath: preferences.inbox, isDirectory: true)
        var isDirectory: ObjCBool = false
        guard FileManager.default.fileExists(atPath: folder.path, isDirectory: &isDirectory),
              isDirectory.boolValue, NSWorkspace.shared.open(folder) else {
            showInboxError("Check that the saved inbox folder still exists and is accessible.")
            return
        }
    }

    private func showInboxError(_ message: String) {
        let alert = NSAlert()
        alert.messageText = "Couldn’t open the inbox folder"
        alert.informativeText = message
        alert.addButton(withTitle: "OK")
        NSApp.activate(ignoringOtherApps: true)
        alert.runModal()
    }
}
