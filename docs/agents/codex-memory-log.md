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
