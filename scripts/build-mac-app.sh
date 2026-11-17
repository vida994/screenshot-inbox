#!/bin/bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_PATH="$PROJECT_DIR/dist/Screenshot Inbox.app"
APP_ID="com.vida994.screenshot-inbox.settings"

swift build --package-path "$PROJECT_DIR/macos" -c release --product ScreenshotInboxSettings
BIN_PATH="$(swift build --package-path "$PROJECT_DIR/macos" -c release --show-bin-path)"
mkdir -p "$APP_PATH/Contents/MacOS"
cp "$BIN_PATH/ScreenshotInboxSettings" "$APP_PATH/Contents/MacOS/ScreenshotInboxSettings"
cat > "$APP_PATH/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleIdentifier</key><string>com.vida994.screenshot-inbox.settings</string>
<key>CFBundleName</key><string>Screenshot Inbox</string>
<key>CFBundleDisplayName</key><string>Screenshot Inbox</string>
<key>CFBundleExecutable</key><string>ScreenshotInboxSettings</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleShortVersionString</key><string>0.3.0</string>
<key>CFBundleVersion</key><string>3</string>
<key>LSMinimumSystemVersion</key><string>14.0</string>
<key>NSHighResolutionCapable</key><true/>
<key>LSApplicationCategoryType</key><string>public.app-category.developer-tools</string>
</dict></plist>
PLIST
# Ad-hoc local signing uses no Apple account, certificate or provisioning asset.
codesign --force --sign - --timestamp=none "$APP_PATH"

if [[ "${1:-}" == "--install" ]]; then
  INSTALL_PATH="$HOME/Applications/Screenshot Inbox.app"
  if [[ -e "$INSTALL_PATH" ]]; then
    EXISTING_ID="$(/usr/libexec/PlistBuddy -c 'Print CFBundleIdentifier' "$INSTALL_PATH/Contents/Info.plist" 2>/dev/null || true)"
    if [[ "$EXISTING_ID" != "$APP_ID" ]]; then
      echo "Another app already exists at $INSTALL_PATH; refusing to replace it." >&2
      exit 1
    fi
  fi
  mkdir -p "$HOME/Applications"
  ditto "$APP_PATH" "$INSTALL_PATH"
  echo "Installed: $INSTALL_PATH"
else
  echo "Built: $APP_PATH"
fi
