# Native Mac settings window

Adopted November 17, 2026: the user requested a small Mac window for choosing the screenshot folder, screenshot count, maximum age and date grouping without opening Terminal for routine settings changes.

## User flow

Run `npm run install:mac` once after the existing setup. This creates `Screenshot Inbox.app` under the current user's Applications folder. Open it from Finder or Spotlight; the app shows the currently saved folder and retention limits. A native folder picker chooses a directory. Number fields and steppers edit the limits; a switch controls date grouping. Save Changes is enabled only for valid, changed preferences. Reload rereads disk state. Closing the last window quits only this companion app.

The app requires macOS 14+. The build requires Swift 6+ and uses a small Swift package without third-party dependencies. The app is built for the current Mac's architecture and ad-hoc signed locally; no Apple account, certificate, profile or registration is created or changed. This is not a notarized or universal downloadable release. The Node receiver still runs separately; this delivery does not introduce a menu-bar daemon, background service, login item or GUI pairing wizard.

## Files and state

- `macos/Sources/SettingsCore/SettingsFile.swift` reads/writes the same config as the receiver and CLI. It preserves connection credentials, host/port and unknown keys from fresh disk data. UI code never renders the token.
- `macos/Sources/ScreenshotInboxSettings/App.swift` owns the editable view state. It uses native SwiftUI controls and an AppKit `NSOpenPanel`, including accessibility names/identifiers, keyboard Save/Close/Reload actions, inline validation, saved/error feedback and an explicit old-folder boundary.
- Count/day validation matches the CLI: whole numbers from 1 to 10,000. JSON booleans cannot be interpreted as integer limits. A date-grouping preference must be a JSON boolean.
- A stale window refuses to overwrite storage settings changed by another editor and asks for Reload. Fresh connection-only changes are preserved during a storage save.
- Config writes publish by atomic rename from an exclusive 0600 temporary file. The app does not chmod existing parent directories or retain a token in its own preferences. A custom `SCREENSHOT_INBOX_CONFIG` environment variable follows the CLI convention.
- GUI folder changes do not move existing screenshots or change receiver lifecycle. They affect the next upload/cleanup, matching the existing reload behavior. The GUI is a storage preferences editor, not a new receiver or Codex client.
- The build script packages the native executable and Info.plist in ignored `dist/`. Installation only replaces an existing app at the target path if its bundle ID matches this utility.

## Verification

Seven native Swift tests cover legacy defaults, preservation of credentials/unknown keys, config permissions and atomic-temp cleanup, invalid values, external storage-edit conflicts, manual folder changes, strict JSON types and missing configuration. The existing 23 Node tests cover the receiver/storage contract.

The runtime check uses the actual installed app: open the folder picker, select another folder without saving, confirm the old-images message and Reload the saved path; enter zero and confirm Save is disabled; save a temporary increase in count/age and a grouping change, read those changes through the CLI, then restore the user's 20/seven-day/date-grouped settings. A full-size native capture verifies the rendered form as well as the semantic accessibility tree. The first pass caught inaccessible combined number controls and a background-window picker issue; both were fixed before delivery.

The live receiver remains running throughout native app testing. Its next accepted upload must still use the configured folder and be retrievable by the installed Codex skill. Native testing does not independently establish other macOS versions, iCloud state or custom iPhone Home Screen icon installation.
