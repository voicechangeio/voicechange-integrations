// A small client for the VoiceChange desktop app's local control API (docs/control-api.md in the app).
// Finds the app through control.json in its data folder: { enabled, audio, port, token }.
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const ID = 'io.voicechange.desktop'

export function controlFile() {
  if (process.env.VOICECHANGE_CONTROL_FILE) return process.env.VOICECHANGE_CONTROL_FILE
  if (process.platform === 'darwin') return join(homedir(), 'Library', 'Application Support', ID, 'control.json')
  if (process.platform === 'win32') return join(process.env.APPDATA || join(homedir(), 'AppData', 'Roaming'), ID, 'control.json')
  return join(process.env.XDG_DATA_HOME || join(homedir(), '.local', 'share'), ID, 'control.json')
}

export class VoiceChangeError extends Error {
  constructor(code, message) {
    super(message)
    this.code = code
  }
}

function connection() {
  let c
  try {
    c = JSON.parse(readFileSync(controlFile(), 'utf8'))
  } catch {
    throw new VoiceChangeError(
      'not_set_up',
      'VoiceChange control is not set up. Open VoiceChange → Settings → Other apps and switch it on.',
    )
  }
  if (!c.enabled) throw new VoiceChangeError('disabled', 'Control from other apps is off. Turn it on in VoiceChange → Settings → Other apps.')
  return { base: `http://127.0.0.1:${c.port}`, token: c.token, audio: !!c.audio, port: c.port }
}

const UA = 'voicechange-mcp/1.0'

/** Runs a command (POST /v1/<name>) and returns its JSON answer. */
export async function command(name, args = {}) {
  const { base, token } = connection()
  let res
  try {
    res = await fetch(`${base}/v1/${name}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'User-Agent': UA },
      body: JSON.stringify(args),
    })
  } catch {
    throw new VoiceChangeError('not_running', 'VoiceChange is not running. Open the app and try again.')
  }
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new VoiceChangeError(body.error?.code ?? 'failed', body.error?.message ?? `HTTP ${res.status}`)
  return body
}

/** Converts mono float32 samples with a voice through the app's audio WebSocket. */
export async function convert(samples, rate, voice) {
  const { port, token, audio } = connection()
  if (!audio)
    throw new VoiceChangeError('audio_disabled', 'Using voices on other audio is off. Turn on "Use voices on their own audio" in VoiceChange → Settings → Other apps.')
  const url = `ws://127.0.0.1:${port}/v1/audio?voice=${encodeURIComponent(voice)}&rate=${rate}&token=${encodeURIComponent(token)}`
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url)
    ws.binaryType = 'arraybuffer'
    const parts = []
    let latencyMs = 0
    let done = false
    const finish = (err, out) => {
      if (done) return
      done = true
      try {
        ws.close()
      } catch {}
      err ? reject(err) : resolve(out)
    }
    ws.onerror = () => finish(new VoiceChangeError('not_running', 'Could not reach VoiceChange (is it running, with "Use voices on their own audio" on?)'))
    ws.onclose = () => finish(new VoiceChangeError('closed', 'VoiceChange closed the audio session'))
    ws.onmessage = (e) => {
      if (typeof e.data === 'string') {
        const m = JSON.parse(e.data)
        if (m.type === 'ready') {
          latencyMs = m.latency_ms ?? 0
          // 100 ms frames, like a live stream would send
          const step = Math.round(rate / 10)
          for (let i = 0; i < samples.length; i += step) ws.send(samples.slice(i, i + step).buffer)
          ws.send(JSON.stringify({ type: 'flush' }))
        } else if (m.type === 'flushed') {
          const n = parts.reduce((a, p) => a + p.length, 0)
          const out = new Float32Array(n)
          let at = 0
          for (const p of parts) {
            out.set(p, at)
            at += p.length
          }
          // drop the voice's delay so the result lines up with the input
          const skip = Math.min(out.length, Math.round((latencyMs / 1000) * rate))
          finish(null, out.subarray(skip, skip + samples.length))
        } else if (m.type === 'error') {
          finish(new VoiceChangeError(m.code, m.message))
        }
      } else {
        parts.push(new Float32Array(e.data))
      }
    }
  })
}
