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
