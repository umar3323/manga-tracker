'use strict';

const $ = id => document.getElementById(id)

// ── Helpers ───────────────────────────────────────────────────────────────
function setStatus(connected, sub) {
  const dot   = $('status-dot')
  const label = $('status-label')
  const subEl = $('status-sub')

  dot.className = 'dot ' + (connected ? 'green' : 'red')
  label.textContent = connected ? 'Connected to YOMU' : 'Not connected'
  if (sub) subEl.textContent = sub

  $('btn-connect').classList.toggle('hidden', connected)
  $('btn-disconnect').classList.toggle('hidden', !connected)
}

function fmtTime(mins) {
  if (mins < 60) return `${mins}`
  return `${Math.floor(mins / 60)}h ${mins % 60}m`
}

// ── Renderers (called on load and on live storage changes) ────────────────
function renderStats(stats) {
  if (!stats) return
  // Bug (a) fix: total_watch_minutes is now a fractional float — round at display time
  $('stat-min').textContent    = fmtTime(Math.round(stats.total_watch_minutes || 0))
  $('stat-ep').textContent     = stats.episodes_completed || 0
  $('stat-titles').textContent = (stats.titles_seen || []).length

  const sites = stats.sites_used || []
  if (sites.length > 0) {
    const sitesSection = $('section-sites')
    sitesSection.classList.remove('hidden')
    const list = $('sites-list')
    list.textContent = ''
    sites.forEach(s => {
      const chip = document.createElement('span')
      chip.className = 'site-chip'
      chip.textContent = s
      list.appendChild(chip)
    })
  }
}

function renderLastTracked(data) {
  if (!data) return
  const nowSection = $('section-now')
  nowSection.classList.remove('hidden')
  $('np-title').textContent = data.title + (data.episode != null ? ` · Ep. ${data.episode}` : '')
  const ago = Math.round((Date.now() - new Date(data.receivedAt).getTime()) / 60000)
  $('np-meta').textContent = `${data.site} · ${ago < 1 ? 'just now' : ago + 'm ago'}`
}

// ── Load data ─────────────────────────────────────────────────────────────
chrome.runtime.sendMessage({ type: 'GET_STATUS' }, res => {
  setStatus(res?.connected || false)
})

chrome.runtime.sendMessage({ type: 'GET_LAST_TRACKED' }, renderLastTracked)

chrome.runtime.sendMessage({ type: 'GET_SESSION_STATS' }, renderStats)

// ── Bug (d) fix: live stats via chrome.storage.onChanged ─────────────────
// Subscribe to storage changes so the popup updates while open, without
// requiring a close + reopen. Unsubscription is automatic when popup closes.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return
  if (changes.yomu_session_stats?.newValue) {
    renderStats(changes.yomu_session_stats.newValue)
  }
  if (changes.yomu_last_tracked?.newValue) {
    renderLastTracked(changes.yomu_last_tracked.newValue)
  }
})

// ── Buttons ───────────────────────────────────────────────────────────────
$('btn-connect').addEventListener('click', () => {
  // NOTE: Chrome always closes the popup when a new tab opens — this is
  // browser-enforced and cannot be prevented. The connection happens via
  // the content script running on the YOMU tab; open the popup again
  // after visiting YOMU to see the green connected status.
  $('status-sub').textContent = 'Opening YOMU… click this icon again after the page loads.'
  chrome.tabs.create({ url: 'https://manga-tracker-hazel.vercel.app' })
})

$('btn-disconnect').addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'DISCONNECT' }, () => {
    setStatus(false, 'Disconnected. Visit YOMU to reconnect.')
  })
})
