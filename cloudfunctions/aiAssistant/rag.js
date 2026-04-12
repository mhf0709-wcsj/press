const crypto = require('crypto')

function buildVector(text, dim = 256) {
  const v = new Array(dim).fill(0)
  const s = String(text || '').toLowerCase()
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    v[(c * 131 + i * 17) % dim] += 1
  }
  const words = s.split(/[^a-z0-9\u4e00-\u9fa5]+/).filter(Boolean)
  for (let i = 0; i < words.length; i++) {
    const h = hashToInt(words[i])
    v[h % dim] += 2
    if (i + 1 < words.length) {
      const bi = words[i] + '_' + words[i + 1]
      v[hashToInt(bi) % dim] += 3
    }
  }
  return normalize(v)
}

function cosine(a, b) {
  let dot = 0
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i]
  return dot
}

function normalize(v) {
  let norm = 0
  for (let i = 0; i < v.length; i++) norm += v[i] * v[i]
  norm = Math.sqrt(norm) || 1
  return v.map(x => x / norm)
}

function hashToInt(s) {
  const h = crypto.createHash('md5').update(String(s)).digest()
  return h.readUInt32BE(0)
}

function chunkText(text, maxLen = 320) {
  const lines = String(text || '').split('\n').map(l => l.trim()).filter(Boolean)
  const chunks = []
  let buf = ''
  for (const line of lines) {
    if (!buf) {
      buf = line
    } else if ((buf + ' ' + line).length <= maxLen) {
      buf += ' ' + line
    } else {
      chunks.push(buf)
      buf = line
    }
  }
  if (buf) chunks.push(buf)
  return chunks
}

function formatDateTime(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  const hh = String(date.getHours()).padStart(2, '0')
  const mm = String(date.getMinutes()).padStart(2, '0')
  const ss = String(date.getSeconds()).padStart(2, '0')
  return `${y}-${m}-${d} ${hh}:${mm}:${ss}`
}

module.exports = {
  buildVector,
  cosine,
  chunkText,
  formatDateTime
}

