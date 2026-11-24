#!/usr/bin/env node
// MCP server for the VoiceChange desktop app: lets AI assistants (Claude Code, Claude Desktop, Cursor…)
// change voices, start and stop the voice, record, play soundboard sounds and convert audio files.
// It talks to the app's local control API, so VoiceChange must be running with
// Settings → Other apps switched on.
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { command, convert } from './client.js'
import { readWav, writeWav } from './wav.js'

const server = new McpServer({ name: 'voicechange', version: '1.0.0' })

const text = (v) => ({ content: [{ type: 'text', text: typeof v === 'string' ? v : JSON.stringify(v, null, 2) }] })
const wrap = (fn) => async (args) => {
  try {
    return text(await fn(args ?? {}))
  } catch (e) {
    return { isError: true, content: [{ type: 'text', text: `${e.code ? `[${e.code}] ` : ''}${e.message}` }] }
  }
}
const tool = (name, description, inputSchema, fn, annotations = {}) =>
  server.registerTool(name, { description, inputSchema, annotations }, wrap(fn))

tool('get_state', 'What VoiceChange is doing now: whether the voice is on, which voice, volume, Voice Mixer settings, recording.', {}, () =>
  command('state'), { readOnlyHint: true })

tool(
  'list_voices',
  'All voices in VoiceChange with id, name, category, whether downloaded, and whether locked (Studio voices need a subscription).',
  { query: z.string().optional().describe('only voices whose name or category contains this') },
  async ({ query }) => {
    const { voices } = await command('voice.list')
    const q = query?.toLowerCase()
    return q ? voices.filter((v) => v.name.toLowerCase().includes(q) || v.category?.toLowerCase().includes(q)) : voices
  },
  { readOnlyHint: true },
)

tool(
  'set_voice',
  'Switch to a voice by id or name. A voice that is not downloaded starts downloading and is picked when done. Locked Studio voices fail with "locked" (the app shows its plans).',
  { voice: z.string().describe('voice id or exact name, from list_voices; "natural" is the unchanged voice') },
  ({ voice }) => command('voice.set', { id: voice }),
)

tool('start_voice', 'Turn the voice on (the mic goes through the selected voice to the chosen output).', {}, () => command('voice.start'))
tool('stop_voice', 'Turn the voice off.', {}, () => command('voice.stop'))

tool(
  'set_volume',
  'Set the output volume, 0–200 (100 = unchanged).',
  { volume: z.number().min(0).max(200) },
  ({ volume }) => command('volume.set', { volume }),
)

tool(
  'set_mixer',
  'Change the Voice Mixer, which layers on any voice. Only pass what should change. Turning a setting on switches the Mixer on.',
  {
    on: z.boolean().optional().describe('switch the Mixer layer on or off, keeping its settings'),
    reset: z.boolean().optional().describe('back to flat before applying the rest'),
    pitch: z.number().min(-12).max(12).optional().describe('semitones'),
    size: z.number().min(0.7).max(1.4).optional().describe('formants: 0.7 bigger/deeper … 1.4 smaller'),
    breath: z.number().min(0).max(1).optional(),
    range: z.number().min(0.5).max(2).optional().describe('pitch movement: 0.5 flatter … 2 livelier'),
    robot: z.number().min(0).max(1).optional(),
    grit: z.number().min(0).max(1).optional(),
    retro: z.number().min(0).max(1).optional(),
    wobble: z.number().min(0).max(1).optional(),
    room: z.number().min(0).max(1).optional(),
    echo: z.number().min(0).max(1).optional(),
    crowd: z.number().min(0).max(1).optional(),
    filter: z.enum(['none', 'phone', 'radio', 'megaphone', 'muffled']).optional(),
    whisper: z.boolean().optional(),
    monotone: z.boolean().optional(),
  },
  (a) => command('mixer.set', Object.fromEntries(Object.entries(a).filter(([, v]) => v !== undefined))),
)

tool('start_recording', 'Start recording what the voice sends out (the voice must be on).', {}, () => command('recording.start'))
tool('stop_recording', 'Stop recording; the file is saved to the recordings folder chosen in VoiceChange.', {}, () => command('recording.stop'))

tool(
  'list_sounds',
  'Soundboard sounds: the user\'s board, plus catalog sounds (optionally searched).',
  { query: z.string().optional(), limit: z.number().int().min(1).max(200).optional() },
  (a) => command('sound.list', a),
  { readOnlyHint: true },
)
tool(
  'play_sound',
  'Play a soundboard sound by id or name. With the voice on, it goes out through the voice\'s output (into a call); otherwise only the user hears it.',
  { sound: z.string() },
  ({ sound }) => command('sound.play', { id: sound }),
)
tool('stop_sounds', 'Stop every playing soundboard sound.', {}, () => command('sound.stop_all'))

tool(
  'convert_audio',
  'Convert a WAV file with a VoiceChange voice, on this computer (needs "Use voices on their own audio" on in VoiceChange Settings). Writes a new WAV file.',
  {
    input: z.string().describe('path to a WAV file (speech, any rate; stereo is mixed to mono)'),
    voice: z.string().describe('voice id from list_voices'),
    output: z.string().optional().describe('where to write the result; default: <input>-<voice>.wav'),
  },
  async ({ input, voice, output }) => {
    const src = resolve(input)
    const { samples, rate } = readWav(await readFile(src))
    const t0 = Date.now()
    const out = await convert(samples, rate, voice)
    const dest = resolve(output ?? src.replace(/\.wav$/i, '') + `-${voice}.wav`)
    await writeFile(dest, writeWav(out, rate))
    return { output: dest, seconds: Math.round((samples.length / rate) * 10) / 10, took_seconds: (Date.now() - t0) / 1000 }
  },
)

await server.connect(new StdioServerTransport())
