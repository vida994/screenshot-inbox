# First version: screenshot delivery to local Codex

Approved scope, November 17, 2026: build a separate open-source repository for the simplest useful replacement for screenshot → AirDrop → Downloads → drag into chat. No Linear. This version is one phone workflow, one Mac and one inbox.

## Components and data flow

1. `npm run setup` creates the Mac config, a 256-bit random pairing token and a paired Share Sheet Shortcut. Apple's `shortcuts sign` makes the generated file importable. The user adds it to Shortcuts and brings it to the iPhone through their own sync or one-time transfer.
2. `npm start` runs a Node.js HTTP receiver on port 4827 on all IPv4 interfaces, so the iPhone can connect on the LAN. This is a foreground command, without a launch agent, server account or cloud relay.
3. The Shortcut receives one shared image and sends its bytes in a `POST /upload` request with `Authorization: Bearer <local-token>`. It displays the receiver's actual response rather than an unconditional success message.
4. The receiver checks auth, size and PNG/JPEG signatures. It chooses its own timestamp/UUID filename, writes privately to a temporary file and renames only after the whole upload is written. The client cannot choose a storage path. This is signature validation, not a complete image decoder or antivirus scanner.
5. The skill's standalone helper reads the configured inbox, ignores symlinks/unfinished files and selects the latest received image by modification time. It returns metadata without the token. The agent must open the image with its local image-viewing tool.

## Contract

- Maximum image body: 20 MiB, including chunked requests. Eight concurrent connections; 30-second request timeout.
- Raw PNG or JPEG bodies only. No JSON/base64 upload envelope, multipart, HEIC, video, multiple-image batch or automatic format conversion.
- HTTP 201 means a complete file was saved. Responses: 401 invalid/missing auth or browser Origin, 404 unsupported route/method, 413 oversized body, 415 unrecognized image signature, 500 storage failure.
- No unauthenticated health/read/list/download endpoint, CORS support, client-supplied filenames or access to the user's source code over the receiver.
- Authenticated plain HTTP is appropriate only on a trusted LAN. There is no TLS or internet-facing deployment in this version.
- Stored config/paired Shortcut permissions: 0600; private state directory: 0700. Generated state and received images are outside the checkout and ignored defensively by Git.
- Images stay on disk until manually deleted. Transfer is local; model-side image processing follows the user's existing Codex account/settings.
- Inbox receipt does not inject a message into a running chat. The user invokes the workflow. The skill checks screenshot age and project ambiguity before code edits.

## Setup and support boundaries

The checked-in skill installs by copying its self-contained directory to `~/.agents/skills/screenshot-inbox`. Installation never replaces an existing skill automatically. Node.js 22+ is required. Setup/signing requires macOS; test execution does not. The Shortcut uses Apple's native Share Sheet and Get Contents of URL actions. No Swift app, app signing certificate, iOS deployment, MCP server or npm publication is needed.

The initial repository build and open-source publication were authorized together. The personal receiver pairing, screenshots and device details are not public deliverables.

## Verification

- `npm test`: real HTTP server tests, including successful upload and image retrieval, invalid tokens, browser-origin rejection, unsupported input, Content-Length and chunked size limits, concurrent uploads, newest-file selection, symlink exclusion, empty inbox and no HTTP read route.
- Local setup must successfully produce a signed Shortcut; inspect its imported native actions and run it with a synthetic PNG on macOS to exercise Apple's request serialization and response display.
- The generated Shortcut's macOS run is separate evidence from a real-iPhone Share Sheet upload. The latter requires the user to run it on their phone; do not claim it from Mac or curl tests.
- Skill structure validation is separate from live Codex selection. Retrieval and actual image opening must be observed independently.

Observed November 17, 2026: all eight automated tests passed. Setup produced an Apple-signed Shortcut; it imported successfully with Images/Share Sheet input, an HTTP upload and result display. Running the native macOS Shortcut with a synthetic 390×844 PNG completed after its local-connection permission was approved. The receiver saved the image, the installed standalone skill helper selected it, and Codex opened it with the image-viewing tool. Source and received SHA-256 hashes matched. The skill validator passed in an isolated environment.

The real-device check also passed November 17: the user ran Send to Codex from their physical iPhone and confirmed completion. A new 2,401,471-byte PNG arrived, the installed skill helper selected that fresh file, and Codex opened and visually inspected it. This verifies the phone-to-Mac-to-Codex path for that device/network setup. GitHub's initial CI run passed on Node 22 and 24. The private screenshot and pairing details are not included in the repository. Other iOS versions, networks and multiple-image sharing are not established by this test.

## Sources checked November 17, 2026

- [Apple: Shortcuts API requests](https://support.apple.com/guide/shortcuts/apd58d46713f/ios): native POST request with a File request body.
- [Apple: Share Sheet input types](https://support.apple.com/guide/shortcuts/input-types-apd7644168e1/ios): shared image input.
- `shortcuts help sign` and `shortcuts help run` on the build Mac: supported signing and CLI input options.
- [OpenAI: Build skills](https://learn.chatgpt.com/docs/build-skills): local skill discovery, optional scripts and explicit/implicit invocation.
- [shortcut-lib request serialization](https://github.com/findlaywebb/shortcut-lib/blob/main/src/shortcut_lib/schema/actions/download_url.py): implementation reference for Apple's undocumented property-list parameter encoding. No library code or dependency is bundled.
