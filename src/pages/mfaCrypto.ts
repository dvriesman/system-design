// Real HOTP (RFC 4226) and TOTP (RFC 6238), synchronous, so the lab can show every intermediate value as the reader
// moves the clock. HMAC-SHA1 is the RFCs' default and what most authenticator apps use. For teaching only: real
// services should use a vetted OTP library.

const rotl = (x: number, n: number) => (x << n) | (x >>> (32 - n))

export function sha1(message: number[]): number[] {
  const h = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476, 0xc3d2e1f0]
  const bytes = [...message, 0x80]
  while (bytes.length % 64 !== 56) bytes.push(0)
  const bitLength = message.length * 8
  const high = Math.floor(bitLength / 2 ** 32)
  for (const word of [high, bitLength >>> 0]) bytes.push((word >>> 24) & 255, (word >>> 16) & 255, (word >>> 8) & 255, word & 255)
  const w = new Array<number>(80)
  for (let chunk = 0; chunk < bytes.length; chunk += 64) {
    for (let i = 0; i < 16; i++) {
      const j = chunk + i * 4
      w[i] = (bytes[j] << 24) | (bytes[j + 1] << 16) | (bytes[j + 2] << 8) | bytes[j + 3]
    }
    for (let i = 16; i < 80; i++) w[i] = rotl(w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16], 1)
    let [a, b, c, d, e] = h
    for (let i = 0; i < 80; i++) {
      const [f, k] = i < 20 ? [(b & c) | (~b & d), 0x5a827999] : i < 40 ? [b ^ c ^ d, 0x6ed9eba1] : i < 60 ? [(b & c) | (b & d) | (c & d), 0x8f1bbcdc] : [b ^ c ^ d, 0xca62c1d6]
      const t = (rotl(a, 5) + f + e + k + w[i]) | 0
      e = d
      d = c
      c = rotl(b, 30)
      b = a
      a = t
    }
    h[0] = (h[0] + a) | 0
    h[1] = (h[1] + b) | 0
    h[2] = (h[2] + c) | 0
    h[3] = (h[3] + d) | 0
    h[4] = (h[4] + e) | 0
  }
  return h.flatMap((x) => [(x >>> 24) & 255, (x >>> 16) & 255, (x >>> 8) & 255, x & 255])
}

export function hmacSha1(key: number[], message: number[]): number[] {
  let k = key.length > 64 ? sha1(key) : [...key]
  while (k.length < 64) k.push(0)
  const inner = sha1([...k.map((b) => b ^ 0x36), ...message])
  return sha1([...k.map((b) => b ^ 0x5c), ...inner])
}

export const hex = (bytes: number[]) => bytes.map((b) => b.toString(16).padStart(2, '0')).join('')
export const ascii = (s: string) => Array.from(s, (c) => c.charCodeAt(0) & 255)

// The counter as 8 bytes, big-endian, as RFC 4226 requires.
export function counterBytes(counter: number): number[] {
  const high = Math.floor(counter / 2 ** 32)
  const low = counter >>> 0
  return [high, low].flatMap((x) => [(x >>> 24) & 255, (x >>> 16) & 255, (x >>> 8) & 255, x & 255])
}

export type HotpTrace = { counter: number; message: number[]; mac: number[]; offset: number; binary: number; code: string }

// RFC 4226: HMAC the counter, take 4 bytes starting at the offset in the last nibble, drop the top bit, keep the last digits.
export function hotp(key: number[], counter: number, digits = 6): HotpTrace {
  const message = counterBytes(counter)
  const mac = hmacSha1(key, message)
  const offset = mac[19] & 0xf
  const binary = ((mac[offset] & 0x7f) << 24) | (mac[offset + 1] << 16) | (mac[offset + 2] << 8) | mac[offset + 3]
  return { counter, message, mac, offset, binary, code: String(binary % 10 ** digits).padStart(digits, '0') }
}

// RFC 6238: the counter is the number of 30-second steps since the Unix epoch.
export const totpStep = (unixSeconds: number, period = 30) => Math.floor(unixSeconds / period)
export const totp = (key: number[], unixSeconds: number, digits = 6, period = 30) => hotp(key, totpStep(unixSeconds, period), digits)

// What a server checks: the current step, and one step either side for clock drift.
export function verifyTotp(key: number[], code: string, unixSeconds: number, window = 1): number | null {
  const now = totpStep(unixSeconds)
  for (let d = -window; d <= window; d++) if (hotp(key, now + d).code === code) return d
  return null
}

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
export function base32(bytes: number[]): string {
  let bits = 0
  let value = 0
  let out = ''
  for (const b of bytes) {
    value = (value << 8) | b
    bits += 8
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31]
  return out
}
