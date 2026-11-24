// VoiceChange for Stream Deck: buttons that drive the VoiceChange desktop app through its local
// control API (POST /v1/<command>), kept in sync with the app by its event stream (GET /v1/events).
import streamDeck, { SingletonAction } from '@elgato/streamdeck'
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const ID = 'io.voicechange.desktop'
const UA = 'voicechange-streamdeck/1.0'

function controlFile() {
  if (process.platform === 'darwin') return join(homedir(), 'Library', 'Application Support', ID, 'control.json')
  if (process.platform === 'win32') return join(process.env.APPDATA || join(homedir(), 'AppData', 'Roaming'), ID, 'control.json')
  return join(process.env.XDG_DATA_HOME || join(homedir(), '.local', 'share'), ID, 'control.json')
}

function connection() {
  try {
    const c = JSON.parse(readFileSync(controlFile(), 'utf8'))
    return c.enabled ? { base: `http://127.0.0.1:${c.port}`, token: c.token } : null
  } catch {
    return null
  }
}

async function command(name, args = {}) {
  const c = connection()
  if (!c) throw new Error('VoiceChange: turn on Settings → Other apps')
  const res = await fetch(`${c.base}/v1/${name}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${c.token}`, 'Content-Type': 'application/json', 'User-Agent': UA },
    body: JSON.stringify(args),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    const e = new Error(body.error?.message ?? `HTTP ${res.status}`)
    e.code = body.error?.code
    throw e
  }
  return body
}

// ---- what the app is doing, from /v1/state and the event stream ----
const app = { connected: false, running: false, voice: null, mixerOn: false, recording: false, playing: new Set() }
const listeners = new Set()
const changed = () => listeners.forEach((f) => f())

async function refresh() {
  try {
    const s = await command('state')
    app.running = s.running
    app.voice = s.voice?.id ?? null
    app.mixerOn = !!s.mixer?.on
    app.recording = s.recording
    app.connected = true
  } catch {
    app.connected = false
  }
  changed()
}

async function followEvents() {
  for (;;) {
    const c = connection()
    if (c) {
      try {
        const res = await fetch(`${c.base}/v1/events`, { headers: { Authorization: `Bearer ${c.token}`, 'User-Agent': UA } })
        if (res.ok && res.body) {
          await refresh()
          const dec = new TextDecoder()
          let buf = ''
          for await (const chunk of res.body) {
            buf += dec.decode(chunk, { stream: true })
            let i
            while ((i = buf.indexOf('\n\n')) >= 0) {
              onEvent(buf.slice(0, i))
              buf = buf.slice(i + 2)
            }
          }
        }
      } catch {}
    }
    if (app.connected) {
      app.connected = false
      changed()
    }
    await new Promise((r) => setTimeout(r, 3000)) // the app isn't running (yet): try again
  }
}

function onEvent(block) {
  let name = ''
  let data = ''
  for (const line of block.split('\n')) {
    if (line.startsWith('event: ')) name = line.slice(7)
    else if (line.startsWith('data: ')) data += line.slice(6)
  }
  if (!name) return
  let d = {}
  try {
    d = JSON.parse(data || '{}')
  } catch {}
  if (name === 'voice_changed') app.voice = d.id
  else if (name === 'running_changed') app.running = d.running
  else if (name === 'mixer_changed') app.mixerOn = !!d.on
  else if (name === 'recording_started') app.recording = true
  else if (name === 'recording_stopped' || name === 'recording_saved') app.recording = false
  else return
  changed()
}

/** A press: run it, flash the alert triangle when it fails. */
async function press(ev, fn) {
  try {
    await fn()
  } catch (e) {
    streamDeck.logger.warn(`${ev.action.manifestId}: ${e.message}`)
    await ev.action.showAlert()
  }
}

/** Keeps every visible key of an action in step with the app. */
class Synced extends SingletonAction {
  constructor() {
    super()
    listeners.add(() => this.sync())
  }
  onWillAppear() {
    this.sync()
  }
  sync() {
    for (const a of this.actions) if (a.isKey()) this.show(a).catch(() => {})
  }
  async show() {}
}

class VoiceAction extends Synced {
  manifestId = 'io.voicechange.streamdeck.voice'
  async show(a) {
    const s = await a.getSettings()
    await a.setTitle(s.name ?? (s.voice ? s.voice : 'Pick a\nvoice'))
    await a.setState(app.connected && s.voice && app.voice === s.voice ? 1 : 0)
  }
  onKeyDown(ev) {
    return press(ev, async () => {
      if (!ev.payload.settings.voice) throw new Error('No voice chosen for this key')
      await command('voice.set', { id: ev.payload.settings.voice })
    })
  }
  async onDidReceiveSettings(ev) {
    // keep the voice's name with the key so the title shows even while the app is closed
    const s = ev.payload.settings
    if (s.voice) {
      try {
        const { voices } = await command('voice.list')
        const v = voices.find((x) => x.id === s.voice)
        if (v && v.name !== s.name) await ev.action.setSettings({ ...s, name: v.name })
      } catch {}
    }
    this.sync()
  }
  async onSendToPlugin(ev) {
    if (ev.payload?.event !== 'getVoices') return
    let items = []
    try {
      const { voices } = await command('voice.list')
      const groups = new Map()
      for (const v of voices) {
        const g = v.category || 'Voices'
        if (!groups.has(g)) groups.set(g, [])
        groups.get(g).push({ label: v.locked ? `${v.name} (Studio)` : v.name, value: v.id })
      }
      items = [...groups].map(([label, children]) => ({ label, children }))
    } catch (e) {
      items = [{ label: `VoiceChange isn't reachable: ${e.message}`, value: '', disabled: true }]
    }
    await streamDeck.ui.sendToPropertyInspector({ event: 'getVoices', items })
  }
}

class PowerAction extends Synced {
  manifestId = 'io.voicechange.streamdeck.power'
  async show(a) {
    await a.setState(app.connected && app.running ? 1 : 0)
  }
  onKeyDown(ev) {
    return press(ev, () => command('voice.toggle'))
  }
}

class MixerAction extends Synced {
  manifestId = 'io.voicechange.streamdeck.mixer'
  async show(a) {
    await a.setState(app.connected && app.mixerOn ? 1 : 0)
  }
  onKeyDown(ev) {
    return press(ev, () => command('mixer.set', { on: !app.mixerOn }))
  }
}

class RecordAction extends Synced {
  manifestId = 'io.voicechange.streamdeck.record'
  async show(a) {
    await a.setState(app.connected && app.recording ? 1 : 0)
  }
  onKeyDown(ev) {
    return press(ev, () => command(app.recording ? 'recording.stop' : 'recording.start'))
  }
}

class SoundAction extends Synced {
  manifestId = 'io.voicechange.streamdeck.sound'
  async show(a) {
    const s = await a.getSettings()
    await a.setTitle(s.name ?? 'Pick a\nsound')
    await a.setState(s.sound && app.playing.has(s.sound) ? 1 : 0)
  }
  onKeyDown(ev) {
    return press(ev, async () => {
      const id = ev.payload.settings.sound
      if (!id) throw new Error('No sound chosen for this key')
      if (app.playing.has(id)) {
        await command('sound.stop', { id })
        app.playing.delete(id)
        return changed()
      }
      const r = await command('sound.play', { id })
      app.playing.add(id)
      changed()
      setTimeout(() => {
        app.playing.delete(id)
        changed()
      }, (r.sound?.seconds ?? 1) * 1000 + 100)
    })
  }
  async onDidReceiveSettings(ev) {
    const s = ev.payload.settings
    if (s.sound && soundNames.has(s.sound) && soundNames.get(s.sound) !== s.name)
      await ev.action.setSettings({ ...s, name: soundNames.get(s.sound) })
    this.sync()
  }
  async onSendToPlugin(ev) {
    if (ev.payload?.event !== 'getSounds') return
    let items = []
    try {
      const r = await command('sound.list', { limit: 200 })
      const opt = (x) => {
        soundNames.set(x.id, x.name)
        return { label: x.name, value: x.id }
      }
      if (r.board.length) items.push({ label: 'My board', children: r.board.map(opt) })
      items.push({ label: 'Popular', children: r.sounds.map(opt) })
    } catch (e) {
      items = [{ label: `VoiceChange isn't reachable: ${e.message}`, value: '', disabled: true }]
    }
    await streamDeck.ui.sendToPropertyInspector({ event: 'getSounds', items })
  }
}
const soundNames = new Map()

streamDeck.actions.registerAction(new VoiceAction())
streamDeck.actions.registerAction(new PowerAction())
streamDeck.actions.registerAction(new MixerAction())
streamDeck.actions.registerAction(new RecordAction())
streamDeck.actions.registerAction(new SoundAction())
streamDeck.connect()
followEvents()
