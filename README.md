# VoiceChange integrations

Open-source tools that control the [VoiceChange](https://voicechange.io) desktop app, a free
real-time AI voice changer for Discord, OBS and games on Windows, macOS and Linux.

| Folder | What it is |
|---|---|
| [`mcp/`](mcp) | MCP server: AI assistants (Claude, Cursor, …) switch voices, play sounds and convert WAV files |
| [`streamdeck/`](streamdeck) | Stream Deck plugin: one key per voice, voice on/off, Voice Mixer, soundboard, record |
| [`docs/local-api.md`](docs/local-api.md) | The app's local API: HTTP commands, an event stream, and an audio WebSocket |
| [`examples/`](examples) | Small scripts to build your own (Python, curl) |

Everything here talks to the app on your own computer through its local API. Nothing goes over the
internet, and there's no account or key to paste: the tools find the app by themselves.

## Get started

1. Install VoiceChange from [voicechange.io/download](https://voicechange.io/download).
2. Open **Settings → Other apps** and switch on **Allow other apps to control VoiceChange**.
3. Pick a tool below.

### Claude Code, Claude Desktop, Cursor

```bash
git clone https://github.com/voicechangeio/voicechange-integrations
cd voicechange-integrations/mcp && npm install
claude mcp add voicechange -- node "$PWD/index.js"
```

Then ask: *"switch my voice to something deep and turn it on"*, or
*"convert interview.wav with one of my voices"*. More in [`mcp/README.md`](mcp/README.md).

### Stream Deck

See [`streamdeck/README.md`](streamdeck/README.md).

### Your own script

```bash
python3 examples/voicechange.py voices
python3 examples/voicechange.py set "natural"
python3 examples/voicechange.py on
```

Or straight from the shell, see [`examples/curl.sh`](examples/curl.sh). Everything the API can do is
in [`docs/local-api.md`](docs/local-api.md).

## Contributing

Issues and pull requests are welcome, especially new integrations (OBS, Twitch chat, Home Assistant,
AutoHotkey, Raycast, …). Ask for API commands you'd like the app to have in an issue.

The VoiceChange app itself isn't in this repository.

## License

[MIT](LICENSE)
