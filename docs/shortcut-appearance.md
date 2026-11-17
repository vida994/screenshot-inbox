# Shortcuts sync and icons

Checked November 17, 2026 against Apple's public Shortcuts documentation.

## Why it can appear on the iPhone automatically

Apple's Shortcuts iCloud Sync keeps the shortcut collection updated across devices using the same Apple Account when syncing is enabled. Adding, editing or removing a shortcut on the Mac can therefore be reflected on the iPhone. This tool creates/imports a normal Mac Shortcut; it does not install an iPhone application, remotely manage the phone or use its own syncing service. Seeing the Shortcut appear fits that documented behavior; it is not an independent audit of the user's iCloud switches/account.

Source: [Apple: Sync shortcuts on Mac](https://support.apple.com/guide/shortcuts-mac/sync-shortcuts-apdb3a4240b0/mac).

## Which icon can be changed

The documented Shortcuts icon picker changes the shortcut's color and built-in glyph. A custom image can be chosen when adding a shortcut to the iPhone/iPad Home Screen. A Home Screen icon and the Share Sheet/Shortcuts collection glyph are different surfaces; a custom image there does not replace the Share Sheet glyph.

Sources: [Apple: Modify shortcut colors and icons](https://support.apple.com/guide/shortcuts/modify-shortcut-icons-apd5ad5a2128/10.0/ios/27), [Apple: Add a shortcut to the Home Screen](https://support.apple.com/guide/shortcuts/add-a-shortcut-to-the-home-screen-apd735880972/ios).

Screenshot Inbox currently expects a shared image. Running it from the Home Screen with no input does not capture the screen or choose a photo automatically. A useful Home Screen launcher would need a separately defined no-input flow; this delivery does not silently add one or change the tested Share Sheet behavior.

The user requested a Codex logo. A personal copy of the actual icon from the user's installed Codex/ChatGPT app can support a future Home Screen setup, but no OpenAI logo is bundled in this independent utility's public app, source or paired Shortcut. The default Share Sheet glyph remains unchanged rather than promising unsupported custom-image behavior or substituting an approximate logo.
