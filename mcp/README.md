# VoiceChange MCP server

Lets AI assistants control the VoiceChange desktop app: change voices, turn the voice on and off,
adjust the Voice Mixer and volume, record, play soundboard sounds, and convert WAV files with a voice.

It talks to the app's local control API, so:

1. Open VoiceChange → Settings → **Other apps** and switch it on.
2. For `convert_audio`, also switch on **Use voices on their own audio**.

The server finds the app by itself through `control.json` in the app's data folder
(override with `VOICECHANGE_CONTROL_FILE`).

## Add it

Claude Code:

```bash
claude mcp add voicechange -- node /path/to/voicechange-mcp/index.js
```

Claude Desktop / Cursor (`mcpServers` in their config):

```json
{ "voicechange": { "command": "node", "args": ["/path/to/voicechange-mcp/index.js"] } }
```

Needs Node 22 or newer.

## Tools

| Tool | Does |
|---|---|
| `get_state` | voice on/off, current voice, volume, mixer, recording |
| `list_voices` | every voice, with `locked` for Studio voices without a subscription |
| `set_voice` | switch voice by id or name (downloads it first if needed) |
| `start_voice` / `stop_voice` | turn the voice on / off |
| `set_volume` | 0–200 |
| `set_mixer` | pitch, size, robot, room, echo, filter, … |
| `start_recording` / `stop_recording` | record what the voice sends out |
| `list_sounds` / `play_sound` / `stop_sounds` | the soundboard |
| `convert_audio` | WAV in → WAV out with a voice, on this computer |
