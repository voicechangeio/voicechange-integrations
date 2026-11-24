# VoiceChange for Stream Deck

Buttons for the VoiceChange desktop app:

| Action | Does | Lights up |
|---|---|---|
| Set voice | switches to the chosen voice | while it's the active voice |
| Voice on/off | turns the voice on or off | while the voice is on |
| Voice Mixer on/off | switches the Mixer layer | while the Mixer is on |
| Play sound | plays a soundboard sound (into your call while the voice is on); press again to stop | while it plays |
| Record | starts / stops recording | while recording |

Keys follow the app (a voice picked in the app lights its key) through the app's event stream.
A failed press shows the alert triangle; the reason goes to the plugin log.

Needs VoiceChange running with **Settings → Other apps** switched on. The plugin finds the app through
`control.json` in the app's data folder, so there's nothing to paste.

## Build

```bash
npm install
npm run build      # bundles src/plugin.js into the .sdPlugin folder
npm run link       # installs it into your Stream Deck app for development
npm run pack       # makes io.voicechange.streamdeck.streamDeckPlugin for the Marketplace
```

Stream Deck 7.1+ (runs the plugin on its own Node 24).
