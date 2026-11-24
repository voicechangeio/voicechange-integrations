# VoiceChange local API

The VoiceChange desktop app (Windows, macOS, Linux) can be controlled by other programs on the same
computer: scripts, Stream Deck, OBS, bots, AI assistants. It is a small HTTP server inside the app.

- Listens on `127.0.0.1` only, port `59129` (if that port is taken: the next free one up to `59138`).
- **Off by default.** Switch it on in VoiceChange → Settings → **Other apps**.
- Every request needs the token shown in that Settings section.
- Requests that carry a browser `Origin` header are refused, so web pages can't drive the app.

Commands run exactly what a click in the app runs, so the app's window always shows what a script did.

## Finding the app

When the API is on, the app writes a connection file:

| System | Path |
|---|---|
| macOS | `~/Library/Application Support/io.voicechange.desktop/control.json` |
| Windows | `%APPDATA%\io.voicechange.desktop\control.json` |
| Linux | `$XDG_DATA_HOME/io.voicechange.desktop/control.json` (default `~/.local/share/…`) |

```json
{ "enabled": true, "audio": false, "port": 59129, "token": "…" }
```

`audio` is true when **Use voices on their own audio** is also on (see [Audio](#audio)).

`GET /v1` needs no token and answers `{app, version, enabled, audio}`. Use it to tell "the app isn't
running" apart from "the API is switched off".

## Commands

`POST /v1/<command>` with a JSON body and `Authorization: Bearer <token>`.
(Clients that can't set headers may pass `?token=` instead.)

```bash
curl -s -X POST http://127.0.0.1:59129/v1/voice.set \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"id":"natural"}'
```

| Command | Body | Does |
|---|---|---|
| `state` | – | `{running, voice:{id,name}, volume, mixer, recording, latencyMs}` |
| `commands` | – | the commands the app answers right now |
| `voice.list` | – | every voice: id, name, category, downloaded, locked |
| `voice.set` | `{id}` | switch voice by id or name; one that isn't downloaded starts downloading (`downloading: true`) |
| `voice.start` / `voice.stop` / `voice.toggle` | – | turn the voice on / off |
| `volume.set` | `{volume}` | output volume 0–200 (100 = unchanged) |
| `mixer.set` | `{on?, reset?, pitch?, size?, …}` | Voice Mixer: only pass what changes; setting a value switches the Mixer on |
| `recording.start` / `recording.stop` | – | record what the voice sends out (voice must be on) |
| `sound.list` | `{query?, limit?}` | `{board, sounds}`: the user's soundboard and catalog sounds |
| `sound.play` / `sound.stop` | `{id}` | play / stop a soundboard sound (goes into the call while the voice is on) |
| `sound.stop_all` | – | stop every sound |
| `devices.list` | – | input and output devices and the ones in use |

Mixer fields: `pitch` (−12…12 semitones), `size` (0.7…1.4), `range` (0.5…2), `breath`, `robot`,
`grit`, `retro`, `wobble`, `room`, `echo`, `crowd` (0…1), `filter` (`none`, `phone`, `radio`,
`megaphone`, `muffled`), `whisper`, `monotone` (true/false).

Errors come back with an HTTP error status and
`{"error": {"code": "...", "message": "..."}}`. Codes include `locked` (a Studio voice without a
subscription; the app shows its plans), `not_found`, `not_running`, `bad_args`, `unknown_command`,
`timeout`, `failed`.

## Events

`GET /v1/events` (with the token) is a [Server-Sent Events](https://developer.mozilla.org/docs/Web/API/Server-sent_events) stream:

| Event | Data |
|---|---|
| `voice_changed` | `{id, name}` |
| `running_changed` | `{running}` |
| `volume_changed` | `{volume}` |
| `mixer_changed` | the Mixer settings |
| `recording_started` / `recording_stopped` | `{}` |
| `sound_played` | `{id, name}` |
| `level` | `{level}`: output loudness 0–1, about 20 times a second, only with `?level=1` (drives VTuber mouths) |

## Audio

With **Use voices on their own audio** also switched on, the app's voices can convert audio from
other programs, on this computer, separately from the live voice.

1. Open a WebSocket to `ws://127.0.0.1:<port>/v1/audio?voice=<id>&rate=<hz>&token=<token>`.
2. The app answers `{"type":"ready","voice","rate","format":"f32le","channels":1,"latency_ms"}`,
   or `{"type":"error","code","message"}` and closes (`locked`, `not_downloaded`, `bad_args`).
3. Send binary frames of mono float32 little-endian samples at `rate`. Converted frames come back at
   the same rate, `latency_ms` behind.
4. Send `{"type":"flush"}` at the end: the rest comes out, then `{"type":"flushed"}`.

At most two audio sessions run at once; a third gets HTTP 409.
