// ── Screen Time Tracker v2 · background service worker (Manifest V3) ────────
//
// Tracks time per site, per hour-of-day, fires goal/limit alerts,
// and keeps the toolbar badge fresh. All data stays in chrome.storage.local.

const TICK = 'screen-time-tick';
const IDLE_SECONDS = 60;              // no input for 60s => idle
const GAP_LIMIT_MS = 3 * 60 * 1000;   // SW gone longer => system slept / browser closed

const DEFAULT_SETTINGS = {
  dailyGoalMinutes: 240,   // 4h/day; 0 = off
  alerts: true,
  dailySummary: true,      // morning summary of yesterday
  siteLimits: {},          // { domain: minutes }
  categoryOverrides: {},   // { domain: categoryId }
  theme: 'dark',
  webUrl: '',              // hosted web-dashboard URL (redirect button)
};

let state = null;
let settings = Object.assign({}, DEFAULT_SETTINGS);

// ── helpers ──────────────────────────────────────────────────────────────────

function todayKey(d = new Date()) {
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}

function getDomain(url) {
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    let h = u.hostname.toLowerCase();
    for (const p of ['www.', 'm.', 'mobile.']) {
      if (h.startsWith(p)) { h = h.slice(p.length); break; }
    }
    return h || null;
  } catch (_) {
    return null;
  }
}

function fmtShort(secs) {
  secs = Math.round(secs);
  const m = Math.floor(secs / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return h + 'h ' + (m % 60) + 'm';
  return m + 'm';
}

function newDay() {
  return { sites: {}, hours: new Array(24).fill(0) };
}

// makes sure a day entry is in v2 shape { sites, hours } (migrates v1 on the fly)
function ensureDay(key) {
  let day = state.days[key];
  if (!day || typeof day !== 'object' || !day.sites) {
    day = (day && typeof day === 'object') ? { sites: day, hours: new Array(24).fill(0) } : newDay();
    state.days[key] = day;
  }
  if (!Array.isArray(day.hours) || day.hours.length !== 24) {
    day.hours = new Array(24).fill(0);
  }
  return day;
}

// ── state ────────────────────────────────────────────────────────────────────

async function loadState() {
  const got = await chrome.storage.local.get(['days', 'total', 'lastDate', 'current', 'lastTick', 'alertsSent', 'lastDay']);
  state = {
    days: got.days || {},
    total: got.total || {},
    lastDate: got.lastDate || todayKey(),
    current: (got.current && got.current.start) ? got.current : null,
    lastTick: got.lastTick || null,
    alertsSent: got.alertsSent || {},
    lastDay: got.lastDay || null,
  };
  // v1 → v2 migration (days were { domain: secs }, now { sites, hours })
  for (const key of Object.keys(state.days)) ensureDay(key);
  // keep last 90 days only
  const keys = Object.keys(state.days).sort();
  while (keys.length > 90) delete state.days[keys.shift()];
}

async function loadSettings() {
  const got = await chrome.storage.local.get('settings');
  settings = Object.assign({}, DEFAULT_SETTINGS, got.settings || {});
}

async function persist() {
  state.lastDate = todayKey();
  await chrome.storage.local.set({
    days: state.days,
    total: state.total,
    lastDate: state.lastDate,
    current: state.current,
    lastTick: state.lastTick,
    alertsSent: state.alertsSent,
    lastDay: state.lastDay,
  });
}

// ── time accounting ──────────────────────────────────────────────────────────

// split a session across hour-of-day buckets (handles midnight too)
function addHoursSplit(startTs, endTs) {
  let t = startTs;
  while (t < endTs - 1) {
    const d = new Date(t);
    const h = d.getHours();
    const hourEnd = d.setMinutes(60, 0, 0); // next hour boundary (ms)
    const segEnd = Math.min(endTs, hourEnd);
    const entry = ensureDay(todayKey(new Date(t)));
    entry.hours[h] += (segEnd - t) / 1000;
    t = segEnd;
  }
}

function addTime(domain, secs, startTs, endTs) {
  if (!domain || !(secs > 0)) return;
  const entry = ensureDay(todayKey());
  entry.sites[domain] = (entry.sites[domain] || 0) + secs;
  state.total[domain] = (state.total[domain] || 0) + secs;
  if (startTs && endTs && endTs > startTs) addHoursSplit(startTs, endTs);
}

async function commit(now = Date.now()) {
  const cur = state.current;
  state.current = null;
  if (!cur) return;
  addTime(cur.domain, (now - cur.start) / 1000, cur.start, now);
}

function activeTab() {
  return chrome.tabs.query({ active: true, lastFocusedWindow: true }).then((t) => (t && t[0]));
}

async function focusedWindowTab() {
  try {
    const win = await chrome.windows.getLastFocused({ populate: true });
    if (!win || !win.focused) return null;
    return (win.tabs || []).find((t) => t.active) || null;
  } catch (_) {
    return null;
  }
}

// ── main logic: what is the user looking at right now? ─────────────────────

async function refresh() {
  if (!state) return;
  const now = Date.now();

  // SW was gone suspiciously long => laptop slept / browser was closed.
  // Credit the old session only up to lastTick + 1 min (no over-counting).
  if (state.current && state.lastTick && now - state.lastTick > GAP_LIMIT_MS) {
    const cur = state.current;
    state.current = null;
    const endTs = Math.min(now, state.lastTick + 60_000);
    const credit = Math.max(0, (endTs - cur.start) / 1000);
    addTime(cur.domain, credit, cur.start, endTs);
  }
  state.lastTick = now;

  // idle/locked? keep counting only if the tab is playing audio (video/music)
  const idleState = await chrome.idle.queryState(IDLE_SECONDS);
  if (idleState !== 'active') {
    const t = await activeTab();
    if (!t || !t.audible) return finish();
  }

  // only the focused window counts
  const tab = await focusedWindowTab();
  if (!tab) return finish();

  const domain = getDomain(tab.url);
  if (!(state.current && state.current.domain === domain)) {
    await commit();
    if (domain) state.current = { domain, start: Date.now() };
  }
  return finish();
}

async function finish() {
  await checkDayRollover();
  await persist();
  await updateBadge();
  await checkAlerts();
}

// new day? => send yesterday's summary (if enabled and there was usage)
async function checkDayRollover() {
  const key = todayKey();
  if (state.lastDay && state.lastDay !== key) {
    const y = state.days[state.lastDay];
    if (y && y.sites && settings.dailySummary) {
      let t = 0;
      for (const d in y.sites) t += y.sites[d];
      if (t >= 60) {
        let top = null;
        for (const d in y.sites) if (!top || y.sites[d] > y.sites[top]) top = d;
        notify('Yesterday: ' + fmtShort(t) + ' online' +
          (top ? ' · top site: ' + top + ' (' + fmtShort(y.sites[top]) + ')' : ''));
      }
    }
  }
  state.lastDay = key;
}

// ── badge ────────────────────────────────────────────────────────────────────

async function updateBadge() {
  const entry = state.days[todayKey()];
  let s = 0;
  if (entry) for (const k in entry.sites) s += entry.sites[k];

  let text = '';
  if (s >= 60) {
    const m = Math.floor(s / 60);
    if (m < 60) text = m + 'm';
    else {
      const h = m / 60;
      text = (h >= 10 ? Math.round(h) : Math.round(h * 10) / 10) + 'h';
    }
  }

  // traffic-light colour vs daily goal
  const goalSecs = (settings.dailyGoalMinutes || 0) * 60;
  let color = '#3b82f6';
  if (goalSecs > 0) {
    if (s >= goalSecs) color = '#ef4444';
    else if (s >= goalSecs * 0.75) color = '#f59e0b';
  }

  try {
    await chrome.action.setBadgeText({ text });
    await chrome.action.setBadgeBackgroundColor({ color });
    if (chrome.action.setBadgeTextColor) {
      await chrome.action.setBadgeTextColor({ color: '#ffffff' });
    }
  } catch (_) {
    /* ignore */
  }
}

// ── alerts (goal + per-site limits), once per day each ─────────────────────

function notify(message) {
  try {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icons/icon128.png'),
      title: 'Screen Time Tracker',
      message: message,
    });
  } catch (_) {
    /* ignore */
  }
}

async function checkAlerts() {
  if (!settings.alerts) return;
  const key = todayKey();
  const entry = state.days[key];
  if (!entry) return;

  let dayTotal = 0;
  for (const d in entry.sites) dayTotal += entry.sites[d];

  const sent = (state.alertsSent && state.alertsSent[key]) || {};
  let changed = false;

  const goalMins = settings.dailyGoalMinutes || 0;
  if (goalMins > 0 && dayTotal >= goalMins * 60 && !sent.goal) {
    sent.goal = true;
    changed = true;
    notify('Daily goal reached — ' + fmtShort(dayTotal) + ' of ' +
      fmtShort(goalMins * 60) + ' spent online today.');
  }

  const limits = settings.siteLimits || {};
  for (const domain of Object.keys(limits)) {
    const limitMins = limits[domain];
    const used = entry.sites[domain] || 0;
    if (limitMins > 0 && used >= limitMins * 60 && !sent['limit:' + domain]) {
      sent['limit:' + domain] = true;
      changed = true;
      notify('Site limit reached — ' + domain + ': ' + fmtShort(used) +
        ' of ' + fmtShort(limitMins * 60) + ' today.');
    }
  }

  if (changed) {
    state.alertsSent = { [key]: sent }; // keep only today's flags
    await persist();
  }
}

// ── init + events ────────────────────────────────────────────────────────────

const ready = (async () => {
  await loadState();
  await loadSettings();
  try { await chrome.idle.setDetectionInterval(IDLE_SECONDS); } catch (_) {}
  await chrome.alarms.clear(TICK);
  await chrome.alarms.create(TICK, { periodInMinutes: 1 });
  await refresh();
})();

chrome.runtime.onInstalled.addListener(() => {
  ready.then(() => chrome.alarms.create(TICK, { periodInMinutes: 1 }));
});

chrome.runtime.onStartup.addListener(() => {
  ready.then(refresh);
});

chrome.tabs.onActivated.addListener(() => {
  ready.then(refresh);
});

chrome.tabs.onUpdated.addListener((_tabId, change) => {
  if (change.url || change.status === 'complete' || 'audible' in change) {
    ready.then(refresh);
  }
});

chrome.windows.onFocusChanged.addListener((windowId) => {
  ready.then(() => {
    if (windowId === chrome.windows.WINDOW_ID_NONE) {
      return commit().then(persist).then(updateBadge);
    }
    return refresh();
  });
});

chrome.idle.onStateChanged.addListener(() => {
  ready.then(refresh);
});

chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === TICK) ready.then(refresh);
});

// settings changed from dashboard/popup => refresh cache + badge colour
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes.settings) return;
  settings = Object.assign({}, DEFAULT_SETTINGS, changes.settings.newValue || {});
  ready.then(updateBadge);
});

// messages from popup / dashboard
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.type === 'refresh') {
    ready.then(refresh);
  }
  if (msg && msg.type === 'reset') {
    ready.then(async () => {
      if (msg.scope === 'today') {
        delete state.days[todayKey()];
      } else {
        state.days = {};
        state.total = {};
      }
      await persist();
      await updateBadge();
      await refresh();
    });
  }
  if (msg && msg.type === 'import') {
    ready.then(async () => {
      try {
        if (msg.days && typeof msg.days === 'object') {
          for (const k of Object.keys(msg.days)) ensureDay(k); // normalize shapes
          state.days = msg.days;
        }
        if (msg.total && typeof msg.total === 'object') state.total = msg.total;
        if (msg.settings && typeof msg.settings === 'object') {
          settings = Object.assign({}, DEFAULT_SETTINGS, msg.settings);
          await chrome.storage.local.set({ settings });
        }
        await persist();
        await updateBadge();
        await refresh();
      } catch (_) {
        /* ignore bad imports */
      }
    });
  }
  sendResponse({ ok: true });
});

// keyboard shortcut: open (or focus) the dashboard
chrome.commands.onCommand.addListener((command) => {
  if (command !== 'open-dashboard') return;
  ready.then(async () => {
    const url = chrome.runtime.getURL('dashboard.html');
    try {
      const tabs = await chrome.tabs.query({ url: url + '*' });
      if (tabs && tabs.length) {
        await chrome.tabs.update(tabs[0].id, { active: true });
        if (tabs[0].windowId) await chrome.windows.update(tabs[0].windowId, { focused: true });
        return;
      }
    } catch (_) {
      /* fall through */
    }
    chrome.tabs.create({ url });
  });
});
