// Minimal WAV reading (PCM 16/24/32-bit, float 32; any channels → mono) and writing (float 32).

export function readWav(buf) {
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') throw new Error('Not a WAV file')
  let at = 12
  let fmt = null
  while (at + 8 <= buf.length) {
    const id = buf.toString('ascii', at, at + 4)
    const size = buf.readUInt32LE(at + 4)
    const body = at + 8
    if (id === 'fmt ') {
      let format = buf.readUInt16LE(body)
      const channels = buf.readUInt16LE(body + 2)
      const rate = buf.readUInt32LE(body + 4)
      const bits = buf.readUInt16LE(body + 14)
      if (format === 0xfffe && size >= 40) format = buf.readUInt16LE(body + 24) // extensible: sub format
      fmt = { format, channels, rate, bits }
    } else if (id === 'data') {
      if (!fmt) throw new Error('WAV has no format chunk')
      const { format, channels, rate, bits } = fmt
      const bytes = bits / 8
      const end = Math.min(buf.length, body + size)
      const frames = Math.floor((end - body) / (bytes * channels))
      const out = new Float32Array(frames)
      for (let i = 0; i < frames; i++) {
        let sum = 0
        for (let c = 0; c < channels; c++) {
          const p = body + (i * channels + c) * bytes
          let v
          if (format === 3 && bits === 32) v = buf.readFloatLE(p)
          else if (format === 1 && bits === 16) v = buf.readInt16LE(p) / 32768
          else if (format === 1 && bits === 24) v = buf.readIntLE(p, 3) / 8388608
          else if (format === 1 && bits === 32) v = buf.readInt32LE(p) / 2147483648
          else if (format === 1 && bits === 8) v = (buf[p] - 128) / 128
          else throw new Error(`Unsupported WAV format (${format}, ${bits}-bit)`)
          sum += v
        }
        out[i] = sum / channels
      }
      return { samples: out, rate }
    }
    at = body + size + (size % 2)
  }
  throw new Error('WAV has no audio data')
}

export function writeWav(samples, rate) {
  const data = samples.length * 4
  const b = Buffer.alloc(44 + data)
  b.write('RIFF', 0, 'ascii')
  b.writeUInt32LE(36 + data, 4)
  b.write('WAVE', 8, 'ascii')
  b.write('fmt ', 12, 'ascii')
  b.writeUInt32LE(16, 16)
  b.writeUInt16LE(3, 20) // float
  b.writeUInt16LE(1, 22)
  b.writeUInt32LE(rate, 24)
  b.writeUInt32LE(rate * 4, 28)
  b.writeUInt16LE(4, 32)
  b.writeUInt16LE(32, 34)
  b.write('data', 36, 'ascii')
  b.writeUInt32LE(data, 40)
  for (let i = 0; i < samples.length; i++) b.writeFloatLE(samples[i], 44 + i * 4)
  return b
}
