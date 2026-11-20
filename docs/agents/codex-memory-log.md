# Screenshot Inbox continuity log

## 2026-11-17 · LOCAL-001 · Initial screenshot bridge

- Adopted the separate open-source, no-Linear workflow and implemented the first version in this delivery commit; rationale and protocol are in `docs/design.md`.
- Added a dependency-free Node receiver, private paired Share Sheet Shortcut generation and a separately installable Codex inbox skill.
- Eight automated HTTP/retrieval tests and the skill structure validator passed; native macOS Shortcut upload succeeded with a synthetic PNG and matching source/received hashes.
- Installed the skill locally and opened the received image through Codex's image-viewing tool; actual iPhone Share Sheet delivery remains unverified.
- Config, pairing token, generated Shortcuts and received images remain outside the repository; no background service, hosted backend or automatic chat injection is installed.

## 2026-11-17 · LOCAL-002 · Verify physical-iPhone delivery

- Supersedes LOCAL-001's unverified-phone boundary: the user completed the physical-iPhone Share Sheet flow and a fresh PNG arrived in the receiver inbox.
- The installed skill helper selected the received file and Codex opened the actual image; the full phone-to-Mac-to-Codex path passed for the tested setup.
- Updated README and design verification notes; the initial GitHub CI run also passed on Node 22 and 24.
- The screenshot and pairing details stay private outside the repository; no app code, receiver protocol or account access changed.

## 2026-11-17 · LOCAL-003 · Configurable storage and retention

- Added setup/settings prompts and flags for folder, count, age and date grouping; defaults are Documents/Screenshot Inbox, 20 images and seven days, with date folders enabled.
- Cleanup applies count and age across legacy/date layouts on startup, after uploads and hourly; 23 tests cover retention, settings, concurrency and preservation of unrelated files/symlink targets.
- Replaced the success dialog with a silent response notification and verified the updated native Mac Shortcut upload; installed the updated self-contained skill and retrieved a dated image.
- Moved the two existing local images into Documents date folders, verified equal contents before removing old copies, and restored the receiver at the same address.
- Kept one current Shortcut app entry after privately exporting/removing the obsolete version; Apple connection permission was reapproved by the user. Docs record stopped-receiver timing and manual folder-migration boundaries.

## 2026-11-17 · LOCAL-004 · Native Mac storage preferences

- Added a macOS 14+ SwiftUI preferences app with folder picker, count/age fields and steppers, date grouping, validation, Save/Reload and old-folder feedback; `docs/mac-settings.md` owns the contract.
- Built and installed the local app in the user's Applications folder with ad-hoc signing only; no Apple certificate, account or provisioning asset was created or changed.
- Seven native settings tests and all 23 Node tests passed; native UI saves were read back through the CLI, and the user's 20/seven-day/date-grouped settings were restored after testing.
- Verified folder selection, invalid-input prevention, individually accessible number controls and saved-feedback clearing; the receiver stayed online.
- Documented Apple iCloud syncing and the separate Home Screen/Share Sheet icon capabilities; the personal Codex image stays outside the public source and the Share Sheet glyph remains unchanged.

## 2026-11-17 · LOCAL-005 · Run receiving inside the Mac app

- Bundled the shared Node receiver sources into the app and added automatic launch, readiness/error status, Start/Stop and a menu-bar menu; initial pairing and storage settings remain compatible.
- Window close keeps receiving; Quit waits for owned-child shutdown. EOF and generation checks prevent an orphaned child or stale process callbacks, and occupied ports are never adopted or killed.
- 26 Node and 12 native tests passed for storage, protocol, process lifecycle, restart, conflicts, shutdown and visible diagnostics; `docs/mac-settings.md` records the ownership contract.
- Verified live handoff from the known CLI process, successful app-child uploads, Stop/Start, receiving with the window closed, Quit closing the port and reopen restoring upload success.
- Kept the user's Documents/20/seven-day/date-grouped preferences and existing Shortcut pairing; no login item, daemon, signing credential or unrelated process change was introduced.

## 2026-11-20 · LOCAL-006 · Remove Dock presence

- Version 0.4.1 sets LSUIElement and accessory activation, keeping the existing status menu and interactive Settings window; no login item was added.
- Installed the update and verified Launch Services reports UIElement, all 38 local tests pass, and an upload succeeds with Settings closed.
- Reopening restored ready status and the existing Documents/20/seven-day/date-grouped preferences. System status-icon visibility remains unverified because desktop automation does not expose that surface; details are in `docs/mac-settings.md`.
