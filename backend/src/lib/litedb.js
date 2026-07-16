// Minimal read-only LiteDB v5 parser — just enough to extract every document
// from a LubeLogger database file. Verified against real LubeLogger data.
//
// File layout: 8192-byte pages. Page 0 (header) carries a BSON doc mapping
// collection name -> collection page id. Data pages (type 4) belong to a
// collection via colID in the page header; their footer slots point at data
// blocks, which chain via a next-block address when a document spans blocks.

const PAGE_SIZE = 8192

function parseBson(b, base = 0) {
  const len = b.readInt32LE(base)
  const doc = {}
  let o = base + 4
  const end = base + len - 1
  while (o < end) {
    const type = b[o]; o += 1
    const ks = o
    while (b[o] !== 0) o++
    const key = b.toString('utf8', ks, o); o += 1
    let val
    switch (type) {
      case 0x01: val = b.readDoubleLE(o); o += 8; break
      case 0x02: { const l = b.readInt32LE(o); o += 4; val = b.toString('utf8', o, o + l - 1); o += l; break }
      case 0x03: { const l = b.readInt32LE(o); val = parseBson(b, o); o += l; break }
      case 0x04: { const l = b.readInt32LE(o); val = Object.values(parseBson(b, o)); o += l; break }
      case 0x05: { const l = b.readInt32LE(o); o += 5; val = b.subarray(o, o + l); o += l; break }
      case 0x07: val = b.toString('hex', o, o + 12); o += 12; break
      case 0x08: val = b[o] === 1; o += 1; break
      case 0x09: val = new Date(Number(b.readBigInt64LE(o))); o += 8; break
      case 0x0A: val = null; break
      case 0x10: val = b.readInt32LE(o); o += 4; break
      case 0x12: val = Number(b.readBigInt64LE(o)); o += 8; break
      case 0x13: { // .NET decimal: lo/mid/hi 96-bit int + flags (scale, sign)
        const lo = b.readUInt32LE(o), mid = b.readUInt32LE(o + 4), hi = b.readUInt32LE(o + 8), flags = b.readUInt32LE(o + 12)
        const scale = (flags >> 16) & 0xFF
        const sign = (flags & 0x80000000) ? -1 : 1
        val = sign * Number((BigInt(hi) << 64n) + (BigInt(mid) << 32n) + BigInt(lo)) / Math.pow(10, scale)
        o += 16; break
      }
      default: throw new Error(`Unsupported BSON type 0x${type.toString(16)} (key "${key}")`)
    }
    doc[key] = val
  }
  return doc
}

// The header page stores the collections doc at a fixed area; scan for the
// first parseable BSON doc after the page header to stay version-tolerant.
function readCollections(buf) {
  for (let s = 32; s < PAGE_SIZE - 4; s++) {
    const l = buf.readInt32LE(s)
    if (l < 5 || l > 4000 || s + l > PAGE_SIZE || buf[s + l - 1] !== 0) continue
    try {
      const d = parseBson(buf, s)
      const vals = Object.values(d)
      if (vals.length > 0 && vals.every((v) => Number.isInteger(v) && v > 0)) return d
    } catch { /* keep scanning */ }
  }
  return {}
}

export function readLiteDb(buf) {
  if (buf.toString('latin1', 32, 59) !== '** This is a LiteDB file **') {
    throw new Error('Not a LiteDB file')
  }
  const collections = readCollections(buf)
  const colName = new Map(Object.entries(collections).map(([name, pageId]) => [pageId, name]))

  // Collect all data blocks across data pages.
  const blocks = new Map() // "pageId:index" -> block
  const nPages = Math.floor(buf.length / PAGE_SIZE)
  for (let p = 0; p < nPages; p++) {
    const off = p * PAGE_SIZE
    if (buf[off + 4] !== 4) continue // data pages only
    const pageId = buf.readUInt32LE(off)
    const colId = buf.readUInt32LE(off + 19)
    const highestIndex = buf[off + 30]
    if (highestIndex === 0xFF) continue
    for (let i = 0; i <= highestIndex; i++) {
      const so = off + PAGE_SIZE - (i + 1) * 4
      const len = buf.readUInt16LE(so)
      const pos = buf.readUInt16LE(so + 2)
      if (len === 0 && pos === 0) continue
      const bp = off + pos
      const nextPg = buf.readUInt32LE(bp + 1)
      blocks.set(`${pageId}:${i}`, {
        extend: buf[bp],
        next: nextPg === 0xFFFFFFFF ? null : `${nextPg}:${buf[bp + 5]}`,
        content: buf.subarray(bp + 6, bp + len),
        colId,
      })
    }
  }

  // Assemble chains that start at extend=0 blocks into documents.
  const docs = {}
  for (const name of Object.keys(collections)) docs[name] = []
  for (const blk of blocks.values()) {
    if (blk.extend !== 0) continue
    const parts = [blk.content]
    const seen = new Set()
    let n = blk.next
    while (n) {
      if (seen.has(n)) throw new Error(`Cyclic data block chain (${n})`)
      seen.add(n)
      const nb = blocks.get(n)
      if (!nb) throw new Error(`Dangling data block chain (${n})`)
      parts.push(nb.content)
      n = nb.next
    }
    const name = colName.get(blk.colId)
    if (!name) continue // orphan page from a dropped collection
    docs[name].push(parseBson(Buffer.concat(parts), 0))
  }
  for (const name of Object.keys(docs)) docs[name].sort((a, b) => (a._id ?? 0) - (b._id ?? 0))
  return { collections, docs }
}
