# Screenshot Inbox

Send an iPhone screenshot to your Mac, then ask Codex to look at it.

**Screenshot → Share → Send to Codex → “Check my latest phone screenshot.”**

A tiny Mac receiver, a paired iPhone Shortcut and a Codex skill. No npm dependencies, account, hosted backend or API key required for the transfer.

## Requirements

- A Mac with Node.js 22 or newer and Apple's Shortcuts app.
- An iPhone with Shortcuts, on the same trusted local network as the Mac.
- Local Codex with permission to read the inbox and a local image-viewing tool.

## Setup

```sh
git clone https://github.com/vida994/screenshot-inbox.git
cd screenshot-inbox
npm run setup
npm run install-skill
npm start
```

There is no `npm install` step. Keep the receiver terminal running while testing.

Setup generates a private pairing token and a signed **Send to Codex.shortcut** in `~/.config/screenshot-inbox/`. It preserves the token on repeat runs. Open that file on the Mac and click **Add Shortcut**. With Shortcuts iCloud sync enabled, it should appear on the iPhone too. Otherwise, transfer the paired Shortcut to your iPhone once and add it there. No screenshot transfer through AirDrop is needed after setup.

The generated Shortcut contains your Mac address and pairing token. Do not put it in a public repository or share it with other users; each user runs setup for their own Mac.

## Use it

1. Take a screenshot on your iPhone. Mark the issue if useful.
2. Share **one PNG or JPEG** and choose **Send to Codex**. Allow the Shortcut to connect to your Mac if prompted.
3. Wait for the saved-file confirmation.
4. In your app's Codex chat, ask it to use **screenshot-inbox** to check your latest phone screenshot and describe the problem.

The skill finds the received file, opens the actual image and uses the current project's code and instructions. It reports the file and received time so you can identify it. If the skill does not appear, start a new chat or restart Codex. You can explicitly mention `$screenshot-inbox` where your Codex client supports skill mentions.

This version has **one inbox**. Codex does not automatically receive a chat attachment, wake up, start fixing things, or identify which project an image belongs to. Cloud Codex sessions cannot read files on your Mac through this tool.

## Where things live

| Item | Default location |
| --- | --- |
| Screenshots | `~/Pictures/Screenshot Inbox/` |
| Configuration and paired Shortcut | `~/.config/screenshot-inbox/` |
| Installed Codex skill | `~/.agents/skills/screenshot-inbox/` |

`npm run latest` prints the latest received image's absolute path, time, size and age without printing the token. Images remain until you delete them. No background service is installed; stop the receiver with Ctrl+C.

## Connection problems

- **No connection:** keep the Mac awake and the receiver running. Both devices need the same network. Guest Wi-Fi, device isolation and VPNs can prevent a connection. If macOS asks, allow Node's incoming local connection.
- **Mac hostname doesn't resolve:** rerun `npm run setup -- --host 192.168.1.23` with your Mac's actual LAN address, then replace the old paired Shortcut on your devices. An IP address can change when you change networks.
- **Port already in use:** stop the other receiver or choose another port with `npm run setup -- --port 4828`. Replace the old Shortcut and restart the receiver after changing connection settings.
- **Empty/unsupported input:** run from the image's Share Sheet with one PNG or JPEG. HEIC, video, PDFs and multipart form uploads are unsupported.
- **Custom inbox:** `npm run setup -- --inbox "/absolute/path/to/inbox"`.
- **Custom config:** set `SCREENSHOT_INBOX_CONFIG` consistently for setup, receiver and skill helper.

The receiver uses token-authenticated **plain HTTP on your local network**. Use it only on a trusted network; do not expose the port to the internet. It does not serve screenshots back over HTTP. Transfer is direct to your Mac; asking Codex to inspect an image uses your existing Codex service and data settings.

## Development and verification

```sh
npm test
```

Tests exercise real HTTP uploads, byte-preserving storage, authentication, limits, concurrent delivery and the installed skill's retrieval logic. [Design and verification notes](docs/design.md) describe the protocol and remaining device check. [Implementation decisions](deviations.md) record scope choices.

This is an independent utility, not an official OpenAI product. MIT licensed.
