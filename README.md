# Screenshot Inbox

Send an iPhone screenshot to your Mac, then ask Codex to look at it.

**Screenshot → Share → Send to Codex → “Check my latest phone screenshot.”**

A small Mac app with a receiver, a paired iPhone Shortcut and a Codex skill. No npm dependencies, account, hosted backend or API key required for the transfer.

## Install with Codex

Paste this into a **local Codex chat on your Mac**:

> Install Screenshot Inbox from https://github.com/vida994/screenshot-inbox. Follow its AGENTS.md and walk me through setting up the iPhone Shortcut.

Codex can clone the repo, read [AGENTS.md](AGENTS.md), check the requirements, and run the Mac setup with your permission. You'll add the paired Shortcut in Apple Shortcuts and send a test screenshot from your iPhone. If you already cloned the repo, open a Codex chat in that folder and ask it to install Screenshot Inbox there.

## Requirements

- A Mac with macOS 14+, Git, Node.js 22 or newer, and Apple's Shortcuts app. Node runs the receiver.
- Swift 6+ (Xcode 16+ or compatible Command Line Tools) to build the Mac app once. Check with `swift --version`.
- An iPhone with Shortcuts on the same trusted local network as the Mac. Initial Shortcut signing also needs an internet connection.
- Local Codex with permission to read the inbox and a local image-viewing tool.

## Manual setup

1. **Get the code.** Open Terminal and run:

   ```sh
   git clone https://github.com/vida994/screenshot-inbox.git
   cd screenshot-inbox
   ```

2. **Set up the inbox and build the Mac app.** Run these from the repo folder:

   ```sh
   npm run setup -- --yes
   npm run install-skill
   npm run install:mac
   ```

   There is no `npm install` step. The defaults are **Documents → Screenshot Inbox**, the newest **20 screenshots**, a maximum age of **seven days**, and folders grouped by date. Change them in the Mac app, or run setup without `--yes` to choose them in Terminal.

3. **Start the receiver.** Open **Screenshot Inbox.app** from the path printed by the installer (normally `~/Applications/`), or search for it in Spotlight. Look for **Ready to receive screenshots**. You can close Terminal and the app window. The photo-stack menu bar icon lets you reopen Settings or open the inbox in Finder.

4. **Add Send to Codex to your iPhone.** In Finder, press **⌘⇧G**, paste `~/.config/screenshot-inbox/`, and open **Send to Codex.shortcut**. Click **Add Shortcut**. If Shortcuts iCloud sync is on for both devices, look for **Send to Codex** in Shortcuts on your iPhone. Otherwise, transfer that one setup file to your iPhone and add it there. It contains your Mac address and private pairing token, so keep it private. [Shortcuts sync details](docs/shortcut-appearance.md)

5. **Send a test screenshot.** With the Mac awake and the receiver running, take a screenshot on the iPhone and choose **Share → Send to Codex**. Review Apple's first-use prompts. Look for the **Screenshot saved** notification, or use **Open Inbox Folder** from the Mac menu bar to check the saved file.

6. **Ask Codex to open it.** Start a local Codex chat in the project you're testing. Ask **“Use $screenshot-inbox to open the last screenshot I sent from my iPhone.”** Codex should open the image from the saved folder. If the skill isn't listed, start a fresh chat or restart Codex. You can also run `npm run latest` from the Screenshot Inbox repo to check whether an image arrived.

## Use it

1. Take a screenshot on your iPhone. Mark the issue if useful.
2. Share **one PNG or JPEG** and choose **Send to Codex**. Allow the Shortcut to connect to your Mac if prompted.
3. A brief, silent notification shows the receiver's response. There is no success popup to dismiss. Apple may still ask for connection/notification permissions on first use.
4. In your app's Codex chat, ask it to use **screenshot-inbox** to check your latest phone screenshot and describe the problem.

The skill finds the received file, opens the actual image and uses the current project's code and instructions. It reports the file and received time so you can identify it. If the skill does not appear, start a new chat or restart Codex. You can explicitly mention `$screenshot-inbox` where your Codex client supports skill mentions.

This version has **one inbox**. Codex does not automatically receive a chat attachment, wake up, start fixing things, or identify which project an image belongs to. Cloud Codex sessions cannot read files on your Mac through this tool.

## Where things live

| Item | Default location |
| --- | --- |
| Screenshots | `~/Documents/Screenshot Inbox/YYYY-MM-DD/` |
| Configuration and paired Shortcut | `~/.config/screenshot-inbox/` |
| Installed Codex skill | `~/.agents/skills/screenshot-inbox/` |

Date folders use the Mac's local calendar date. `npm run latest` prints the latest received image's absolute path, time, size and age without printing the token. It searches date folders and older flat inbox files. No login item or independent background service is installed. The Mac app owns its receiver; Quit stops it.

## Storage settings and automatic cleanup

### Mac settings window

Click the photo-stack icon in the menu bar and choose **Settings…**. Change the folder with **Choose Folder…**, edit the screenshot count and maximum age, toggle date grouping, then click **Save Changes**. Invalid values cannot be saved. **Reload** reads the current settings again.

The window needs macOS 14+; building it needs Swift 6+ (Xcode 16+ or compatible Command Line Tools). It uses the existing local configuration and does not display the pairing token. The receiver uses saved storage changes on its next upload or cleanup, without restarting or re-pairing.

The app starts receiving when it opens and runs from a small photo-stack icon in the top-right menu bar, without a Dock or Command-Tab entry. Use **Start Receiver** / **Stop Receiver** in the window or menu-bar menu. Closing the window keeps receiving active; use the menu-bar **Settings…** item or reopen the app from Finder/Spotlight to return. **Quit Screenshot Inbox** in the menu-bar menu stops its receiver. An occupied port is reported without stopping or adopting another process. Receiver diagnostics appear as a generic warning in the window.

Choose **Open Inbox Folder** from the menu bar to open your saved screenshot folder in Finder.

The receiver code is bundled inside the app, so it does not depend on keeping the checkout open or in the same location. Node.js 22+ must remain installed. Initial pairing still uses setup; there is no login item or automatic startup after restarting the Mac. Quit the app before reinstalling an update. If Screenshot Inbox is already installed in the shared `/Applications` folder, the installer updates that copy.

Changing the folder leaves existing images in their previous location; the window explains that before saving. It does not migrate or delete the old folder. [Mac app design and verification](docs/mac-settings.md) covers installation, privacy and build boundaries.

### Terminal settings

The original terminal flow remains available: run `npm run settings` to answer the preference questions, or set them directly:

```sh
npm run settings -- --inbox "$HOME/Documents/Screenshot Inbox" --max-count 20 --max-days 7 --date-folders true
```

If you prefer the receiver in Terminal, use `npm start` instead of the app and stop it with Ctrl+C. Do not run both receivers on the same port.

The receiver keeps at most the newest **20 screenshots across the whole inbox**, and expires any older than **seven days**, even if fewer than 20 remain. Both limits apply together. Cleanup runs at startup, after each saved upload and hourly while the receiver is running. If the Mac is asleep or the receiver is stopped, overdue files are removed on the next cleanup. You can also run `npm run cleanup` to apply the saved limits immediately.

Cleanup only considers Screenshot Inbox's exact generated filenames in the selected root and its immediate date folders. It does not traverse other folders or symlinks, and never recursively deletes directories. Empty date folders are removed only when cleanup empties them. Other files and original iPhone photos remain untouched. If cleanup fails, the receiver logs the failure and preserves a successfully saved upload.

Storage changes apply on the next upload/cleanup without re-pairing. Count/day limits must be positive whole numbers. Switching date grouping affects new uploads; both layouts remain readable. **Changing the folder does not automatically move old files:** they remain in the previous folder and are no longer covered by cleanup. Move any images you want to keep into the new folder separately, preserving their generated filenames.

## Update an existing installation

Pull the latest code into your existing checkout. Quit **Screenshot Inbox** from its menu, then reinstall and reopen it:

```sh
npm run install:mac
```

Your saved location, retention, and pairing carry forward. To refresh a copy of the skill previously installed by this repo, run:

```sh
npm run install-skill -- --update
```

Regenerate the Shortcut with `npm run setup -- --yes` only if you need a new copy, you're replacing an old Shortcut that shows a success popup, or you've changed the receiver address. Add the regenerated file and choose **Replace** if prompted. Check that one current **Send to Codex** appears. Apple may ask for connection permission again after replacement. Restart the receiver after changing its host or port.

## Connection problems

- **Shortcut signing failed:** check internet access and that Apple Shortcuts opens on the Mac, then retry the same setup command. A 503 means the signing service is temporarily unavailable. Setup has already saved the configuration and will reuse the pairing token on retry. You can still install the Mac app and Codex skill while waiting for a signed Shortcut.
- **No connection:** keep the Mac awake and the app's receiver running. Both devices need the same network. Guest Wi-Fi, device isolation and VPNs can prevent a connection. If macOS asks, allow Node's incoming local connection.
- **Mac hostname doesn't resolve:** rerun `npm run setup -- --host 192.168.1.23` with your Mac's actual LAN address, then replace the old paired Shortcut on your devices. An IP address can change when you change networks.
- **Port already in use:** stop your earlier Terminal receiver, then click Start Receiver in the app. The app never kills an unknown port owner. Alternatively choose another port with `npm run setup -- --port 4828`, replace the paired Shortcut and restart receiving after changing connection settings.
- **Empty/unsupported input:** run from the image's Share Sheet with one PNG or JPEG. HEIC, video, PDFs and multipart form uploads are unsupported.
- **Custom inbox:** `npm run setup -- --inbox "/absolute/path/to/inbox"`.
- **Custom config:** set `SCREENSHOT_INBOX_CONFIG` consistently for setup, receiver and skill helper.

The receiver uses token-authenticated **plain HTTP on your local network**. Use it only on a trusted network; do not expose the port to the internet. It does not serve screenshots back over HTTP. Transfer is direct to your Mac; asking Codex to inspect an image uses your existing Codex service and data settings.

## Development and verification

```sh
npm test
```

Tests exercise real HTTP uploads, byte-preserving storage, authentication, limits, concurrent delivery and the installed skill's retrieval logic. A physical-iPhone Share Sheet upload followed by Codex image inspection was verified November 17, 2026. [Design and verification notes](docs/design.md) describe the protocol and test boundaries. [Implementation decisions](deviations.md) record scope choices.

This is an independent utility, not an official OpenAI product. MIT licensed.

For why a Mac Shortcut appears on an iPhone and the limits of custom icons, see [Shortcuts sync and appearance](docs/shortcut-appearance.md).
