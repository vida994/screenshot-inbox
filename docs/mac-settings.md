# Native Mac settings window

Adopted November 17, 2026: the user requested a small Mac window for choosing the screenshot folder, screenshot count, maximum age and date grouping without opening Terminal for routine settings changes.

## User flow

Run `npm run install:mac` once after the existing setup. This creates `Screenshot Inbox.app` under the current user's Applications folder. Open it from Finder or Spotlight; the app starts its receiver and shows the currently saved folder and retention limits. A native folder picker chooses a directory. Number fields and steppers edit the limits; a switch controls date grouping. Save Changes is enabled only for valid, changed preferences. Reload rereads disk state.

Adopted November 17, 2026: the app also owns receiver lifecycle. Start/Stop controls are in the window and a menu-bar menu. Closing the window keeps the app and receiver running; Settings or reopening the app restores the window. Quit gracefully stops the app's owned child. Opening the app again starts receiving automatically. There is no login item, separate service, remote control or receiver that intentionally survives app exit.

The app requires macOS 14+. The build requires Swift 6+ and uses a small Swift package without third-party dependencies. The app is built for the current Mac's architecture and ad-hoc signed locally; no Apple account, certificate, profile or registration is created or changed. This is not a notarized or universal downloadable release. The tested Node receiver runs as an app-owned child using bundled JavaScript; Node.js 22+ remains an installed dependency. No background daemon, login item or GUI pairing wizard is installed.

## Files and state

- `macos/Sources/SettingsCore/SettingsFile.swift` reads/writes the same config as the receiver and CLI. It preserves connection credentials, host/port and unknown keys from fresh disk data. UI code never renders the token.
- `macos/Sources/ScreenshotInboxSettings/App.swift` owns the editable view state. It uses native SwiftUI controls and an AppKit `NSOpenPanel`, including accessibility names/identifiers, keyboard Save/Close/Reload actions, inline validation, saved/error feedback and an explicit old-folder boundary.
- Count/day validation matches the CLI: whole numbers from 1 to 10,000. JSON booleans cannot be interpreted as integer limits. A date-grouping preference must be a JSON boolean.
- A stale window refuses to overwrite storage settings changed by another editor and asks for Reload. Fresh connection-only changes are preserved during a storage save.
- Config writes publish by atomic rename from an exclusive 0600 temporary file. The app does not chmod existing parent directories or retain a token in its own preferences. A custom `SCREENSHOT_INBOX_CONFIG` environment variable follows the CLI convention.
- GUI folder changes do not move existing screenshots. They affect the next upload/cleanup, matching the existing reload behavior. Storage controls and receiver lifecycle controls are separate; this app is not a Codex client.
- The build script packages the native executable and Info.plist in ignored `dist/`. Installation only replaces an existing app at the target path if its bundle ID matches this utility.

## Verification

Seven native Swift tests cover legacy defaults, preservation of credentials/unknown keys, config permissions and atomic-temp cleanup, invalid values, external storage-edit conflicts, manual folder changes, strict JSON types and missing configuration. The existing 23 Node tests cover the receiver/storage contract.

The runtime check uses the actual installed app: open the folder picker, select another folder without saving, confirm the old-images message and Reload the saved path; enter zero and confirm Save is disabled; save a temporary increase in count/age and a grouping change, read those changes through the CLI, then restore the user's 20/seven-day/date-grouped settings. A full-size native capture verifies the rendered form as well as the semantic accessibility tree. The first pass caught inaccessible combined number controls and a background-window picker issue; both were fixed before delivery.

Native testing does not independently establish other macOS versions, iCloud state or custom iPhone Home Screen icon installation.

## Receiver ownership and packaging

- `ReceiverSupport/ReceiverController.swift` starts an explicit Node executable with bundled `desktop.mjs`. The build records the available Node path; common Homebrew paths/PATH provide fallbacks. A minimal child environment contains HOME, PATH, TMPDIR, LANG and the config path, never the pairing token as an argument.
- `src/runtime.mjs` is shared by desktop and CLI entrypoints and uses the same server/storage code. The bundle contains those JavaScript modules and the config helper; it does not reference the checkout at runtime. No Node binary is redistributed.
- A private stdout protocol reports actual listen readiness and typed startup errors. An occupied port fails visibly without probing, adopting or killing its owner. Missing setup, runtime or Node dependency fails visibly. Raw stderr is drained and represented by a generic warning rather than exposing raw diagnostics/credentials in the window.
- The app retains the exact Process object and generation ID for its child. Stop closes the child's lifetime stdin pipe; EOF also stops the receiver after an app crash. The server allows up to five seconds for current connections before closing them. A six/eight-second termination fallback can signal only that still-owned Process; stale callbacks cannot affect a restarted child.
- Quit defers application termination until owned-child shutdown completes. Closing settings does not quit because the menu-bar scene remains available. No auto-restart loop or unknown-process kill is implemented.
- The installer refuses to overwrite the running app. Quit first so bundled sources and the native binary are replaced together while inactive. The existing pairing, address and storage preferences are preserved.

The receiver-host delivery passed 26 Node tests and 12 native tests (seven config, five process lifecycle/storage warning). Live app checks verified port-conflict status against the existing CLI receiver, then a scoped handoff to an app child, successful uploads, Stop/Start, an upload with the settings window closed, Quit closing the port with no remaining child, and reopen restoring successful receiving. The user's Documents/20/seven-day/date-folder settings stayed unchanged. The installed Codex helper still retrieved the received image. The new host was tested through native Mac uploads; the earlier physical-iPhone check remains the separate evidence for the unchanged Shortcut/HTTP transport.
