import net from 'net'
import { getDb } from './db/index.js'

// Turn free-form input ("https://Milemarker.example.com:443/, .lan") into a
// clean list of hostnames: lowercase, no scheme, port, or path.
export function parseHostList(value) {
  return String(value || '')
    .split(/[\s,]+/)
    .map((s) => s.trim().toLowerCase()
      .replace(/^[a-z]+:\/\//, '')
      .replace(/\/.*$/, '')
      .replace(/:\d+$/, ''))
    .filter(Boolean)
}

const envHosts = parseHostList(process.env.ALLOWED_HOSTS)

function settingsHosts() {
  try {
    const row = getDb().prepare("SELECT value FROM settings WHERE key = 'allowed_hosts'").get()
    return parseHostList(row?.value)
  } catch {
    return []
  }
}

export function isHostAllowed(host) {
  const bare = host.replace(/^\[|\]$/g, '') // [::1] → ::1
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) return true
  if (net.isIP(bare) !== 0) return true
  const list = [...envHosts, ...settingsHosts()]
  return list.some((h) =>
    h === '*' || (h.startsWith('.') ? host === h.slice(1) || host.endsWith(h) : host === h))
}

const escape = (s) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

// Shown to browsers instead of a bare JSON error, so the fix is discoverable.
export function blockedPage(host) {
  const h = escape(host)
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>MileMarker: hostname not allowed</title>
<style>body{font:16px/1.5 system-ui,sans-serif;max-width:34rem;margin:4rem auto;padding:0 1.25rem;color:#09090b}
code{background:#f4f4f5;padding:.1em .35em;border-radius:4px}@media(prefers-color-scheme:dark){body{background:#09090b;color:#fafafa}code{background:#27272a}}</style>
</head><body>
<h1 style="font-size:1.4rem">Allow <code>${h}</code> in MileMarker</h1>
<p>MileMarker only answers to hostnames you've approved. This protects your data from other websites, since MileMarker has no login by default.</p>
<ol>
<li>Open MileMarker by its IP address, for example <code>http://192.168.1.10:3002</code>.</li>
<li>Go to <b>Settings → Network</b> and add <code>${h}</code>.</li>
<li>Reload this page.</li>
</ol>
<p style="color:#71717a;font-size:.9rem">You can also set the <code>ALLOWED_HOSTS</code> container variable instead.</p>
</body></html>`
}
