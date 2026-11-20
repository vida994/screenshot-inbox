# Implementation decisions

## November 17, 2026 · Initial version

- The discussion proposed a Mac inbox and a Codex skill but did not specify a transfer protocol. Chose a raw authenticated HTTP upload on a trusted local network because it works with native Shortcuts and needs no hosted service or dependencies. Plain HTTP and the trusted-network limit are explicit in the README.
- The proposed skill could otherwise require an absolute checkout path. Kept its retrieval helper self-contained and installed a copy in the standard user skill directory. Receiver and skill share this helper's source in the checkout.
- Kept the receiver in a foreground terminal instead of installing a persistent service. The first version's lifecycle stays visible and reversible.
- The initial version accepts one PNG/JPEG at a time. It does not add format conversion, app selection, image history UI or automatic chat injection.
- Skill validation initially lacked the host Python's `yaml` package. Used an isolated temporary `uv` environment for the validator instead of adding a runtime dependency to the product.

## November 17, 2026 · Configurable storage and retention

- The user approved a notification, retention of the latest 20 images for at most seven days, a Documents default and configurable location/date grouping. Kept onboarding and settings in the terminal to avoid adding a web service UI to the small utility.
- The initial design used modification time to find the latest screenshot. Changed to the generated receipt timestamp because copying to a new folder or touching an old file must not reset its age or make it appear newest.
- Existing installations keep their folder by default. General settings changes do not migrate files automatically; the CLI reports where old images remain. The user's two existing test images were separately relocated and hash-verified while their receiver was stopped, then the receiver was restored on the same address.
- Parent directories for custom config paths may be shared locations. Removed the initial setup's chmod of an existing parent; only newly created directories and config/Shortcut files get private permissions.
- No persistent cleanup service was added. Cleanup runs with the receiver and has an explicit CLI command; sleep/stopped-process timing is documented.
- Native Shortcut replacement left a renamed older entry during this run. Initially keeping that entry as an in-app backup confused the user. Exported it as a private personal-backup file, removed the obsolete app entry and verified only one current Send to Codex remained. Future updates should leave one active app entry, with any restorable backup outside the app.

## November 17, 2026 · Native settings companion

- The user approved a small Mac settings window. Chose a local SwiftUI/Swift-package companion installed in the user's Applications folder; it edits existing storage preferences without taking over the receiver or adding a background service.
- The first native runtime pass found that combined labeled content hid number fields from accessibility and a folder-picker action could have no key window when opened in the background. Exposed the controls individually and added explicit window presentation/fallback selection before delivery.
- The user also requested a Codex logo for the Shortcut. Apple's documented picker supports glyph/color changes and custom Home Screen images as separate surfaces. Kept the tested Share Sheet behavior intact and prepared only a personal icon asset; no official logo or unsupported custom-image promise was added to the public project.
- GUI verification temporarily increased count/age and disabled date grouping, then restored the user's existing folder, 20-image/seven-day limits and date grouping. No old screenshot was deleted for UI testing.

## November 17, 2026 · App-owned receiver

- The user authorized running the receiver inside the Mac app. Reused the existing tested Node implementation as a bundled-source child rather than duplicating the HTTP/storage protocol in Swift. Node remains installed; no Terminal window or checkout location is required at runtime.
- Chose automatic start on app launch, explicit Start/Stop, continued receiving after window close and graceful shutdown on Quit. No login item, independent daemon or unbounded restart behavior was added.
- A port conflict is not proof that another process is our receiver. The app reports it without adopting or terminating the owner. The root verified the existing session's PID/cwd and stopped only that known CLI process for the one-time live handoff.
- Stop closes a lifetime pipe instead of writing into a possibly closed pipe, avoiding a broken-pipe signal race. The same EOF path shuts the child down when the app exits unexpectedly. Typed exit codes preserve port/config errors even if process exit races stdout delivery.
- macOS permits some loopback/wildcard bind combinations. The port-conflict test was calibrated to occupy the same wildcard interface as the actual receiver.
- With Terminal removed from daily use, backend errors need visible feedback. The native window shows a generic warning for receiver diagnostics, and upload failures refer to folder permissions rather than a terminal log.
- Runtime discovery prefers the Node path recorded at build time, then the current PATH, then Homebrew fallbacks, so managed Node installations are not shadowed by an older common-path binary.

## November 20, 2026 · Menu bar presentation

- The user expects Raycast-style background access without a Dock icon. Kept the existing status menu and settings flow; changed the bundle to LSUIElement and removed regular activation in favor of accessory activation. No login item or app-icon artwork was added.
- The desktop automation surface exposes the settings window but not the system status icons. A running receiver does not prove that the user can see its menu-bar icon; keep that visibility check separate from process and upload checks.

## November 20, 2026 · Open inbox from the menu bar

- Open the saved inbox root so the action works with either storage layout and reflects folder changes made in Settings or the CLI.
- The live build was moved to `/Applications` while investigating Bartender. The installer now updates that matching bundle in place so an update cannot accidentally recreate a second install in the personal Applications folder.
