// ── Screen Time Tracker v3 · dashboard ──────────────────────────────────────
// Two modes:
//   • Extension mode — reads/writes chrome.storage.local (live)
//   • Snapshot mode  — window.SCREEN_TIME_DATA is embedded by the
//     "Export web page" feature, so the file works on any static host
//       (GitHub Pages, Netlify, USB stick…). Read-only.

(function () {
  'use strict';

  var EMBED = (typeof window !== 'undefined' && typeof window.SCREEN_TIME_DATA !== 'undefined');
  var hasChrome = typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local;
  if (!EMBED && !hasChrome) return; // static preview keeps its demo markup

  var DEFAULTS = {
    dailyGoalMinutes: 240,
    alerts: true,
    dailySummary: true,
    siteLimits: {},
    categoryOverrides: {},
    theme: 'dark',
    webUrl: '',
  };

  var WD = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

  var ICONS = {
    calendar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/></svg>',
    pie: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 9 9h-9z"/></svg>',
    zap: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2 3 14h7l-1 8 10-12h-7l1-8z"/></svg>',
    moon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>',
    trendUp: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17l6-6 4 4 7-7"/><path d="M14 8h6v6"/></svg>',
    trendDown: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7l6 6 4-4 7 7"/><path d="M14 16h6v-6"/></svg>',
    target: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/></svg>',
    globe: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><ellipse cx="12" cy="12" rx="4.5" ry="9"/></svg>',
    play: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 5v14l12-7z"/></svg>',
  };
  var TITLES = { overview: 'Overview', sites: 'Sites', insights: 'Insights', settings: 'Settings' };

  var settings = Object.assign({}, DEFAULTS);
  var days = {};
  var total = {};

  var activeTab = 'overview';
  var sortMode = 'today';
  var searchText = '';
  var catFilter = 'all';
  var expandedSite = null;
  var barCount = 14;
  var settingsDirty = false;

  var saveTimer = null;
  var renderTimer = null;

  // ── utils ────────────────────────────────────────────────────────────────

  function $(sel, root) { return (root || document).querySelector(sel); }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function keyOf(d) {
    d = d || new Date();
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }

  function dateKeys(n) {
    var a = [];
    for (var i = n - 1; i >= 0; i--) {
      var d = new Date();
      d.setDate(d.getDate() - i);
      a.push(keyOf(d));
    }
    return a;
  }

  function daySites(key) {
    var d = days[key];
    return (d && d.sites) ? d.sites : {};
  }

  function dayHours(key) {
    var d = days[key];
    return (d && d.hours) ? d.hours : new Array(24).fill(0);
  }

  // v3.2 · video (lecture) time: playing seconds + paused-on-page seconds
  function dayVideo(key) {
    var d = days[key];
    return (d && d.video) ? d.video : {};
  }

  function dayVpause(key) {
    var d = days[key];
    return (d && d.vpause) ? d.vpause : {};
  }

  // days of history that actually exist (1..maxN) — keeps averages honest on a
  // fresh install instead of dividing by a full week that never happened
  function trackingSpan(maxN) {
    var first = null;
    for (var k in days) {
      if (sumSites(daySites(k)) > 0 && (!first || k < first)) first = k;
    }
    if (!first) return 1;
    var d0 = new Date(first + 'T00:00:00');
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    var span = Math.floor((today - d0) / 86400000) + 1;
    return Math.max(1, Math.min(maxN, span));
  }

  function sumSites(obj) {
    var s = 0;
    for (var k in obj) s += obj[k];
    return s;
  }

  function fmtTime(secs) {
    secs = Math.round(secs);
    if (secs < 1) return '0m';
    if (secs < 60) return secs + 's';
    var m = Math.floor(secs / 60);
    var h = Math.floor(m / 60);
    if (h > 0) return h + 'h ' + (m % 60) + 'm';
    return m + 'm ' + (secs % 60) + 's';
  }

  function fmtCell(secs) { return secs >= 1 ? fmtTime(secs) : '—'; }

  function fmtAxis(secs) {
    if (secs >= 3600) {
      var h = secs / 3600;
      return (h % 1 === 0 ? h : h.toFixed(1)) + 'h';
    }
    return Math.round(secs / 60) + 'm';
  }

  function hourLabel(i) {
    var h = i % 12 === 0 ? 12 : i % 12;
    return h + (i < 12 ? ' AM' : ' PM');
  }

  function hourShort(i) {
    var h = i % 12 === 0 ? 12 : i % 12;
    return h + (i < 12 ? 'a' : 'p');
  }

  function avatarColor(domain) {
    var h = 0;
    for (var i = 0; i < domain.length; i++) h = (h * 31 + domain.charCodeAt(i)) % 360;
    return 'hsl(' + h + ', 55%, 45%)';
  }

  function faviconHTML(domain) {
    return '<img class="favicon" data-domain="' + esc(domain) + '" alt="" ' +
      'src="https://www.google.com/s2/favicons?domain=' + encodeURIComponent(domain) + '&sz=64">';
  }

  function download(filename, content, mime) {
    var blob = new Blob([content], { type: mime || 'application/octet-stream' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 3000);
  }

  // CSP-safe favicon fallback: swap broken images for letter avatars
  document.addEventListener('error', function (e) {
    var t = e.target;
    if (t && t.tagName === 'IMG' && t.classList.contains('favicon')) {
      var d = document.createElement('div');
      d.className = 'favicon letter';
      d.style.background = avatarColor(t.getAttribute('data-domain') || '?');
      d.textContent = (t.getAttribute('data-domain') || '?').charAt(0).toUpperCase();
      t.replaceWith(d);
    }
  }, true);

  // ── data ─────────────────────────────────────────────────────────────────

  async function loadData() {
    if (EMBED) {
      var std = window.SCREEN_TIME_DATA || {};
      days = std.days || {};
      total = std.total || {};
      settings = Object.assign({}, DEFAULTS, std.settings || {});
      applyTheme(settings.theme || 'dark');
      return;
    }
    var got;
    try {
      got = await chrome.storage.local.get(['days', 'total', 'settings']);
    } catch (_) {
      return;
    }
    days = got.days || {};
    total = got.total || {};
    settings = Object.assign({}, DEFAULTS, got.settings || {});
    applyTheme(settings.theme || 'dark');
  }

  function applyTheme(t) {
    document.documentElement.dataset.theme = t === 'light' ? 'light' : 'dark';
    var lb = $('#themeBtnLabel');
    if (lb) lb.textContent = t === 'light' ? 'Dark mode' : 'Light mode';
  }

  async function setTheme(t) {
    settings.theme = t;
    applyTheme(t);
    await saveSettings();
    if (!EMBED && activeTab === 'settings') renderSettings();
  }

  async function saveSettings() {
    if (EMBED) return; // read-only snapshot
    await chrome.storage.local.set({ settings: settings });
    flashSaved('Saved');
  }

  function flashSaved(msg) {
    var t = $('#toast');
    if (!t) return;
    t.textContent = msg || 'Saved';
    t.classList.add('show');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () { t.classList.remove('show'); }, 1600);
  }

  function hasData() { return Object.keys(total).length > 0; }

  function emptyHTML() {
    var msg = EMBED
      ? 'This snapshot has no data yet.<br>Export again from the extension after browsing to publish your stats.'
      : 'No data yet — open a few websites and the dashboard will fill up automatically.';
    return '<div class="panel"><div class="empty">' + msg + '</div></div>';
  }

  // category totals across a set of day keys
  function catTotals(keys) {
    var by = {};
    keys.forEach(function (k) {
      var s = daySites(k);
      Object.keys(s).forEach(function (d) {
        var c = classifySite(d, settings.categoryOverrides);
        by[c.id] = by[c.id] || { cat: c, secs: 0 };
        by[c.id].secs += s[d];
      });
    });
    return Object.keys(by).map(function (id) { return by[id]; })
      .sort(function (a, b) { return b.secs - a.secs; });
  }

  function catChip(cat) {
    return '<span class="cat-chip" style="--c:' + cat.color + '"><i></i>' + cat.label + '</span>';
  }

  // ── charts ───────────────────────────────────────────────────────────────

  function donutHTML(segs, totalSecs) {
    var C = 439.8; // 2πr, r = 70
    var s = '<svg class="donut" viewBox="0 0 180 180" aria-hidden="true">';
    s += '<circle cx="90" cy="90" r="70" fill="none" stroke-width="24" style="stroke:var(--track)"/>';
    var acc = 0;
    if (totalSecs > 0) {
      segs.forEach(function (g) {
        if (g.frac <= 0) return;
        s += '<circle cx="90" cy="90" r="70" fill="none" stroke="' + g.color +
          '" stroke-width="24" stroke-dasharray="' + (g.frac * C).toFixed(1) + ' ' + C.toFixed(1) +
          '" stroke-dashoffset="' + (-acc * C).toFixed(1) +
          '" transform="rotate(-90 90 90)"><title>' + esc(g.label) + ' · ' + fmtTime(g.secs) +
          ' (' + Math.round(g.frac * 100) + '%)</title></circle>';
        acc += g.frac;
      });
    }
    s += '<text x="90" y="87" text-anchor="middle" font-size="20" font-weight="650" fill="currentColor">' + fmtTime(totalSecs) + '</text>';
    s += '<text x="90" y="107" text-anchor="middle" font-size="10" style="fill:var(--muted)">today</text>';
    return s + '</svg>';
  }

  function barsHTML(n, goalSecs) {
    var keys = dateKeys(n);
    var data = keys.map(function (k) { return { k: k, secs: sumSites(daySites(k)) }; });

    var max = 1800; // at least a 30-minute scale
    data.forEach(function (d) { max = Math.max(max, d.secs); });
    var gmax = goalSecs > 0 ? Math.max(max, goalSecs * 1.05) : max;
    gmax = Math.ceil(gmax / 1800) * 1800; // nice ceiling on 30-min steps

    var grid = [1, 0.75, 0.5, 0.25, 0].map(function (f) {
      return '<div class="grid-line" style="bottom:' + (f * 100) + '%"><span>' + fmtAxis(gmax * f) + '</span></div>';
    }).join('');

    var bars = data.map(function (d, i) {
      var dt = new Date(d.k + 'T00:00:00');
      var lab = n <= 7 ? WD[dt.getDay()] : String(dt.getDate());
      var isToday = i === data.length - 1;
      var h = d.secs > 0 ? Math.max(1.5, (d.secs / gmax) * 100) : 0;
      return '<div class="bar-col"><div class="bar' + (isToday ? ' today' : '') +
        '" style="height:' + h.toFixed(1) + '%" title="' + d.k + ' · ' + fmtTime(d.secs) +
        (isToday ? ' (today)' : '') + '"></div><span class="bar-lab">' + lab + '</span></div>';
    }).join('');

    var goalLine = (goalSecs > 0 && goalSecs <= gmax)
      ? '<div class="goal-line" style="bottom:' + ((goalSecs / gmax) * 100).toFixed(1) +
        '%"><span>goal ' + fmtTime(goalSecs) + '</span></div>'
      : '';

    return '<div class="barchart">' + grid + '<div class="bars">' + bars + '</div>' + goalLine + '</div>';
  }

  function heatHTML() {
    var keys = dateKeys(7);
    var span = trackingSpan(7);
    var hours = new Array(24).fill(0);
    keys.forEach(function (k) {
      var h = dayHours(k);
      for (var i = 0; i < 24; i++) hours[i] += (h[i] || 0);
    });
    var max = Math.max(60, Math.max.apply(null, hours));
    var cells = hours.map(function (v, i) {
      var bg = v > 0 ? 'rgba(59,130,246,' + (0.10 + 0.90 * (v / max)).toFixed(2) + ')' : 'var(--track)';
      return '<div class="heat-cell" style="background:' + bg + '" title="' + hourLabel(i) +
        ' · avg ' + fmtTime(v / span) + '"></div>';
    }).join('');
    var labs = '';
    for (var j = 0; j < 24; j++) labs += '<span>' + (j % 3 === 0 ? hourShort(j) : '') + '</span>';
    return '<div class="heat">' + cells + '</div><div class="heat-labs">' + labs + '</div>';
  }

  function sparkHTML(domain) {
    var k7 = dateKeys(7);
    var vals = k7.map(function (k) { return daySites(k)[domain] || 0; });
    var mx = Math.max(60, Math.max.apply(null, vals));
    var tip = k7.map(function (k, i) { return k.slice(5) + ': ' + fmtTime(vals[i]); }).join('\n');
    var bars = vals.map(function (v) {
      return '<i style="height:' + (v > 0 ? Math.max(6, Math.round((v / mx) * 100)) : 2) + '%"></i>';
    }).join('');
    return '<div class="spark" title="' + esc(tip) + '">' + bars + '</div>';
  }

  // ── overview tab ─────────────────────────────────────────────────────────

  function renderOverview() {
    var body = $('#ov-body');
    if (!hasData()) { body.innerHTML = emptyHTML(); return; }

    var key = keyOf();
    var today = daySites(key);
    var t = sumSites(today);
    var k7 = dateKeys(7);
    var k14 = dateKeys(14);
    var yesterday = sumSites(daySites(k14[12]));

    var entries = Object.keys(today).map(function (d) { return [d, today[d]]; })
      .sort(function (a, b) { return b[1] - a[1]; });

    // ── stat cards ──
    var weekSum = 0;
    k7.forEach(function (k) { weekSum += sumSites(daySites(k)); });

    var span = trackingSpan(7);
    var avgK = span >= 7 ? '7-day average' : 'Daily average';
    var avgS = span >= 7 ? 'per day' : 'per day · day ' + span + ' of tracking';

    var delta;
    if (yesterday > 0) {
      var p = ((t - yesterday) / yesterday) * 100;
      delta = '<div class="d ' + (p > 0 ? 'bad' : 'good') + '">' +
        (p >= 0 ? '↑ ' : '↓ ') + Math.abs(Math.round(p)) + '% vs yesterday</div>';
    } else {
      delta = '<div class="d muted">' + (t > 0 ? 'first day of tracking' : 'waiting for data') + '</div>';
    }

    var top = entries[0];
    var topCat = top ? classifySite(top[0], settings.categoryOverrides) : null;

    var hours = dayHours(key);
    var peak = -1, peakV = -1;
    for (var i = 0; i < 24; i++) if (hours[i] > peakV) { peakV = hours[i]; peak = i; }

    var cards =
      '<div class="cards">' +
      '<div class="card"><div class="k">Today</div><div class="v">' + fmtTime(t) + '</div>' + delta + '</div>' +
      '<div class="card"><div class="k">' + avgK + '</div><div class="v">' + fmtTime(weekSum / span) + '</div><div class="d muted">' + avgS + '</div></div>' +
      '<div class="card"><div class="k">Top site today</div><div class="v">' +
      (top ? '<small>' + top[0] + '</small> · ' + fmtTime(top[1]) : '—') + '</div>' +
      (topCat ? '<div class="d muted">' + topCat.label + '</div>' : '') + '</div>' +
      '<div class="card"><div class="k">Peak hour today</div><div class="v">' +
      (peak >= 0 && peakV >= 60 ? hourLabel(peak) : '—') + '</div>' +
      (peak >= 0 && peakV >= 60 ? '<div class="d muted">' + fmtTime(peakV) + ' in one hour</div>' : '') + '</div>' +
      '</div>';

    // ── donut ──
    var cats = catTotals([key]);
    var catTotal = 0;
    cats.forEach(function (c) { catTotal += c.secs; });
    var top5 = cats.slice(0, 5);
    var restSecs = catTotal - top5.reduce(function (s, c) { return s + c.secs; }, 0);
    var segs = top5.map(function (c) {
      return { label: c.cat.label, color: c.cat.color, secs: c.secs, frac: catTotal > 0 ? c.secs / catTotal : 0 };
    });
    if (restSecs > 0 && catTotal > 0) {
      segs.push({ label: 'Other categories', color: '#8b93a1', secs: restSecs, frac: restSecs / catTotal });
    }
    var legend = segs.map(function (s) {
      return '<div class="legend-item"><span class="dot" style="background:' + s.color + '"></span>' +
        '<span class="lname">' + s.label + '</span><span class="ltime">' + fmtTime(s.secs) + '</span>' +
        '<span class="lpct">' + (catTotal > 0 ? Math.round(s.frac * 100) + '%' : '') + '</span></div>';
    }).join('');

    var goalSecs = (settings.dailyGoalMinutes || 0) * 60;

    var charts =
      '<div class="charts-row">' +
      '<div class="panel"><div class="panel-h"><h3>Today by category</h3></div>' +
      '<div class="donut-wrap">' + donutHTML(segs, catTotal) + '<div class="legend">' + legend + '</div></div></div>' +
      '<div class="panel"><div class="panel-h"><h3>Daily trend</h3><div class="seg">' +
      [7, 14, 30].map(function (n) {
        return '<button type="button" data-n="' + n + '"' + (n === barCount ? ' class="active"' : '') + '>' + n + 'd</button>';
      }).join('') +
      '</div></div>' + barsHTML(barCount, goalSecs) + '</div></div>';

    // ── heatmap ──
    var heat =
      '<div class="panel"><div class="panel-h"><h3>When you are online</h3>' +
      '<div class="heat-legend">less <i style="background:rgba(59,130,246,.15)"></i>' +
      '<i style="background:rgba(59,130,246,.4)"></i><i style="background:rgba(59,130,246,.7)"></i>' +
      '<i style="background:rgba(59,130,246,1)"></i> more &nbsp;·&nbsp; ' +
      (span >= 7 ? '7-day average by hour' : 'average by hour · ' + span + (span > 1 ? ' days' : ' day') + ' of data') +
      '</div></div>' +
      heatHTML() + '</div>';

    // ── top sites ──
    var maxT = entries.length ? entries[0][1] : 0;
    var topRows = entries.slice(0, 6).map(function (e) {
      var c = classifySite(e[0], settings.categoryOverrides);
      var w = maxT > 0 ? Math.max(3, Math.round((e[1] / maxT) * 100)) : 3;
      return '<div class="trow" data-domain="' + esc(e[0]) + '">' + faviconHTML(e[0]) +
        '<div class="tname">' + e[0] + '</div>' +
        '<div class="minibar"><i style="width:' + w + '%; background:' + c.color + '"></i></div>' +
        '<div class="ttime">' + fmtTime(e[1]) + '</div>' +
        '<div class="tpct">' + (t > 0 ? Math.round((e[1] / t) * 100) + '%' : '') + '</div></div>';
    }).join('');

    var topPanel =
      '<div class="panel"><div class="panel-h"><h3>Top sites · Today</h3>' +
      '<span class="sub">click a site for details</span></div>' +
      (topRows || '<div class="empty">Nothing recorded today yet.</div>') + '</div>';

    body.innerHTML = cards + charts + heat + topPanel;
  }

  // ── sites tab ────────────────────────────────────────────────────────────

  function detailHTML(r) {
    var k14 = dateKeys(14);
    var vals = k14.map(function (k) { return daySites(k)[r.d] || 0; });
    var mx = Math.max(60, Math.max.apply(null, vals));
    var bars = vals.map(function (v, i) {
      return '<i style="height:' + (v > 0 ? Math.max(4, (v / mx) * 100) : 0).toFixed(1) +
        '%" title="' + k14[i] + ' · ' + fmtTime(v) + '"></i>';
    }).join('');
    var labs = vals.map(function (_v, i) {
      var dt = new Date(k14[i] + 'T00:00:00');
      return '<span>' + (i % 2 === 0 ? dt.getDate() : '') + '</span>';
    }).join('');

    var cat = classifySite(r.d, settings.categoryOverrides);
    var auto = classifySite(r.d, null);
    var current = (settings.categoryOverrides || {})[r.d];

    var catCtl;
    if (EMBED) {
      catCtl = catChip(cat); // read-only snapshot
    } else {
      var opts = '<option value=""' + (!current ? ' selected' : '') + '>Auto (' + auto.label + ')</option>' +
        CATEGORIES.map(function (c) {
          return '<option value="' + c.id + '"' + (current === c.id ? ' selected' : '') + '>' + c.label + '</option>';
        }).join('');
      catCtl = '<select data-catfor="' + esc(r.d) + '">' + opts + '</select>';
    }

    var lim = (settings.siteLimits || {})[r.d];
    var limitTag = lim
      ? '<span class="limit-tag' + (r.today >= lim * 60 ? ' over' : '') + '">' +
        fmtCell(r.today) + ' / ' + lim + 'm today</span>'
      : '<span class="limit-tag">No daily limit</span>';

    var vWeek = 0, vpWeek = 0;
    dateKeys(7).forEach(function (k) {
      vWeek += (dayVideo(k)[r.d] || 0);
      vpWeek += (dayVpause(k)[r.d] || 0);
    });
    var vidMeta = vWeek >= 60
      ? '<div><label>Video · last 7 days</label><span class="limit-tag">' +
        'played ' + fmtTime(vWeek) + (vpWeek >= 60 ? ' · paused ' + fmtTime(vpWeek) : '') +
        '</span></div>'
      : '';

    return '<div class="srow-detail"><div class="detail-grid">' +
      '<div class="detail-bars"><div class="db-title">Last 14 days</div>' +
      '<div class="db-bars">' + bars + '</div><div class="db-labs">' + labs + '</div></div>' +
      '<div class="detail-meta">' +
      '<div><label>Category</label>' + catCtl + '</div>' +
      '<div><label>Daily limit</label>' + limitTag + '</div>' +
      vidMeta +
      '</div></div></div>';
  }

  function renderSitesTable() {
    var tbl = $('#sitesTable');
    if (!tbl) return;

    var key = keyOf();
    var today = daySites(key);
    var k7 = dateKeys(7);

    var rows = Object.keys(total).filter(function (d) { return total[d] > 0; })
      .map(function (d) {
        var weekS = 0;
        k7.forEach(function (k) { weekS += (daySites(k)[d] || 0); });
        return { d: d, today: today[d] || 0, week: weekS, all: total[d] };
      });

    var q = searchText.trim().toLowerCase();
    var filtered = rows.filter(function (r) {
      if (q && r.d.indexOf(q) === -1) return false;
      if (catFilter !== 'all' &&
        classifySite(r.d, settings.categoryOverrides).id !== catFilter) return false;
      return true;
    });

    filtered.sort(function (a, b) {
      if (sortMode === 'week') return b.week - a.week;
      if (sortMode === 'all') return b.all - a.all;
      return b.today - a.today;
    });

    var maxToday = 0;
    filtered.forEach(function (r) { maxToday = Math.max(maxToday, r.today); });

    var shown = filtered.slice(0, 60);
    var rowHtml = shown.map(function (r) {
      var cat = classifySite(r.d, settings.categoryOverrides);
      var w = maxToday > 0 ? Math.max(2, Math.round((r.today / maxToday) * 100)) : 2;
      var vToday = dayVideo(key)[r.d] || 0;
      var vBadge = vToday >= 60
        ? '<span class="vbadge" title="Video played today: ' + fmtTime(vToday) +
          ' · Paused on page: ' + fmtTime(dayVpause(key)[r.d] || 0) + '">' +
          ICONS.play + fmtTime(vToday) + '</span>'
        : '';
      return '<div class="srow" data-domain="' + esc(r.d) + '">' +
        '<div class="sitecell">' + faviconHTML(r.d) + '<div class="scell">' + r.d + '</div>' + vBadge + '</div>' +
        '<div>' + catChip(cat) + '</div>' +
        '<div class="scell num">' + fmtCell(r.today) + '</div>' +
        '<div class="scell num">' + fmtCell(r.week) + '</div>' +
        '<div class="scell num">' + fmtCell(r.all) + '</div>' +
        '<div><div class="share"><i style="width:' + w + '%; background:' + cat.color + '"></i></div></div>' +
        '<div>' + sparkHTML(r.d) + '</div>' +
        '</div>' + (expandedSite === r.d ? detailHTML(r) : '');
    }).join('');

    var extra = filtered.length > shown.length
      ? '<p class="footnote">Showing top ' + shown.length + ' of ' + filtered.length + ' sites.</p>'
      : '<p class="footnote">Tip: click any row to see a 14-day history, change its category, or check its daily limit.</p>';

    tbl.innerHTML =
      '<div class="stable">' +
      '<div class="srow-h">' +
      '<div>Site</div><div>Category</div>' +
      '<div class="scell" style="text-align:right">Today</div>' +
      '<div class="scell" style="text-align:right">7 days</div>' +
      '<div class="scell" style="text-align:right">All time</div>' +
      '<div>Share today</div><div style="text-align:right">Trend</div>' +
      '</div>' + (rowHtml ||
        '<div class="empty">No sites match your filters.</div>') +
      '</div>' + extra;
  }

  function renderSites() {
    var body = $('#sites-body');
    if (!hasData()) { body.innerHTML = emptyHTML(); return; }

    // keep the search box (and focus) while the user is typing
    var tbl = $('#sitesTable');
    var ae = document.activeElement;
    if (tbl && ae && ae.id === 'siteSearch' && body.contains(ae)) {
      renderSitesTable();
      return;
    }

    var chips = '<span class="chip' + (catFilter === 'all' ? ' active' : '') + '" data-cat="all">All</span>' +
      CATEGORIES.map(function (c) {
        return '<span class="chip' + (catFilter === c.id ? ' active' : '') +
          '" data-cat="' + c.id + '"><i style="background:' + c.color + '"></i>' + c.label + '</span>';
      }).join('');

    var toolbar =
      '<div class="toolbar">' +
      '<input class="search" id="siteSearch" type="text" placeholder="Search sites…" value="' + esc(searchText) + '">' +
      '<div class="chips">' + chips + '</div>' +
      '<select class="sortsel" id="sortSel">' +
      '<option value="today"' + (sortMode === 'today' ? ' selected' : '') + '>Sort: Today</option>' +
      '<option value="week"' + (sortMode === 'week' ? ' selected' : '') + '>Sort: 7 days</option>' +
      '<option value="all"' + (sortMode === 'all' ? ' selected' : '') + '>Sort: All time</option>' +
      '</select></div>';

    body.innerHTML = toolbar + '<div id="sitesTable"></div>';
    renderSitesTable();
  }

  // ── insights tab ─────────────────────────────────────────────────────────

  function renderInsights() {
    var body = $('#ins-body');
    if (!hasData()) { body.innerHTML = emptyHTML(); return; }

    var k7 = dateKeys(7);
    var prev7 = dateKeys(14).slice(0, 7);
    var thisWeek = 0, lastWeek = 0;
    k7.forEach(function (k) { thisWeek += sumSites(daySites(k)); });
    prev7.forEach(function (k) { lastWeek += sumSites(daySites(k)); });

    var cards = [];

    // 1 · week over week
    var s1;
    if (lastWeek > 0) {
      var p = ((thisWeek - lastWeek) / lastWeek) * 100;
      s1 = '<b class="' + (p > 0 ? 'bad' : 'good') + '">' + (p >= 0 ? '+' : '−') +
        Math.abs(Math.round(p)) + '%</b> vs last week (' + fmtTime(lastWeek) + ')';
    } else {
      s1 = thisWeek > 0 ? 'No data for last week to compare' : 'No data yet — keep browsing!';
    }
    var spanW = trackingSpan(7);
    cards.push(['calendar', spanW >= 7 ? 'This week (7 days)' : 'This week so far', fmtTime(thisWeek), s1]);

    // 2 · top category + productivity score
    var cats = catTotals(k7);
    if (cats.length) {
      cards.push(['pie', 'Top category · 7 days', cats[0].cat.label,
        fmtTime(cats[0].secs) + ' — ' + cats[0].cat.label.toLowerCase() + ' leads your screen time']);
    }
    var prodSecs = 0;
    cats.forEach(function (c) {
      if (c.cat.id === 'work' || c.cat.id === 'learning') prodSecs += c.secs;
    });
    if (thisWeek > 0) {
      cards.push(['zap', 'Productivity score', Math.round((prodSecs / thisWeek) * 100) + '%',
        'share of Work + Learning in this week\u2019s screen time']);
    }

    // lectures & video: time players spent playing vs paused on page
    var vid7 = {}, vp7 = {};
    k7.forEach(function (k) {
      var v = dayVideo(k), p = dayVpause(k);
      for (var vd in v) vid7[vd] = (vid7[vd] || 0) + v[vd];
      for (var pd in p) vp7[pd] = (vp7[pd] || 0) + p[pd];
    });
    var vidTotal = 0, vidTop = null;
    for (var vt in vid7) {
      vidTotal += vid7[vt];
      if (!vidTop || vid7[vt] > vid7[vidTop]) vidTop = vt;
    }
    if (vidTotal >= 60) {
      var vpTotal = 0;
      for (var vt2 in vp7) vpTotal += vp7[vt2];
      cards.push(['play', 'Lectures & video time', fmtTime(vidTotal),
        (vidTop ? esc(vidTop) + ' leads · ' : '') + fmtTime(vpTotal) + ' paused on page (7 days)']);
    }

    // 3 · peak hour
    var hours = new Array(24).fill(0);
    k7.forEach(function (k) {
      var h = dayHours(k);
      for (var i = 0; i < 24; i++) hours[i] += (h[i] || 0);
    });
    var pk = 0;
    for (var i2 = 1; i2 < 24; i2++) if (hours[i2] > hours[pk]) pk = i2;
    if (hours[pk] >= 60) {
      cards.push(['moon', 'Peak usage hour', hourLabel(pk) + ' – ' + hourLabel((pk + 1) % 24),
        'avg ' + fmtTime(hours[pk] / spanW) + ' during this hour (daily average)']);
    }

    // 4/5 · most increased / reduced site
    var perSite = {}, perSitePrev = {};
    k7.forEach(function (k) {
      var s = daySites(k);
      for (var d in s) perSite[d] = (perSite[d] || 0) + s[d];
    });
    prev7.forEach(function (k) {
      var s = daySites(k);
      for (var d2 in s) perSitePrev[d2] = (perSitePrev[d2] || 0) + s[d2];
    });
    var inc = null, dec = null;
    Object.keys(perSite).forEach(function (d) {
      if (perSitePrev[d] === undefined) return;
      var diff = perSite[d] - perSitePrev[d];
      if (diff > 300 && (!inc || diff > inc.diff)) inc = { d: d, diff: diff };
      if (diff < -300 && (!dec || diff < dec.diff)) dec = { d: d, diff: diff };
    });
    if (inc) cards.push(['trendUp', 'Most increased', inc.d,
      '<b class="bad">+' + fmtTime(inc.diff) + '</b> more than last week']);
    if (dec) cards.push(['trendDown', 'Most reduced', dec.d,
      '<b class="good">−' + fmtTime(-dec.diff) + '</b> less than last week.']);

    // 6 · goal streak
    var goalSecs = (settings.dailyGoalMinutes || 0) * 60;
    if (goalSecs > 0) {
      var under = 0;
      k7.slice(-spanW).forEach(function (k) {
        if (sumSites(daySites(k)) <= goalSecs) under++;
      });
      cards.push(['target', 'Goal streak', under + ' of ' + spanW + ' days',
        'under your ' + fmtTime(goalSecs) + ' daily goal this week']);
    }

    // 7 · site count
    cards.push(['globe', 'Sites visited', String(Object.keys(perSite).length),
      'distinct sites in the last 7 days']);

    body.innerHTML = '<div class="icards">' + cards.map(function (c) {
      return '<div class="icard"><div class="icard-icon">' + ICONS[c[0]] + '</div><div class="t">' + c[1] +
        '</div><div class="v">' + c[2] + '</div><div class="s">' + c[3] + '</div></div>';
    }).join('') + '</div>';
  }

  // ── export / import (extension mode only) ────────────────────────────────

  async function exportData() {
    var got = await chrome.storage.local.get(['days', 'total', 'settings']);
    var payload = {
      exportedAt: new Date().toISOString(),
      days: got.days,
      total: got.total,
      settings: got.settings,
    };
    download('screen-time-backup-' + keyOf() + '.json',
      JSON.stringify(payload, null, 2), 'application/json');
  }

  function exportCSV() {
    var lines = ['date,domain,seconds,minutes'];
    Object.keys(days).sort().forEach(function (k) {
      var s = daySites(k);
      Object.keys(s).sort().forEach(function (d) {
        lines.push(k + ',' + d + ',' + Math.round(s[d]) + ',' + (s[d] / 60).toFixed(1));
      });
    });
    download('screen-time-' + keyOf() + '.csv', lines.join('\n'), 'text/csv');
  }

  // Web export: one self-contained HTML file with all data embedded —
  //   host it anywhere (GitHub Pages, Netlify…) and it just works, read-only.
  async function exportWeb() {
    flashSaved('Building page…');
    var html = await (await fetch(chrome.runtime.getURL('dashboard.html'))).text();
    var catsJs = await (await fetch(chrome.runtime.getURL('categories.js'))).text();
    var dashJs = await (await fetch(chrome.runtime.getURL('dashboard.js'))).text();
    var got = await chrome.storage.local.get(['days', 'total', 'settings']);

    var payload = {
      exportedAt: new Date().toISOString(),
      days: got.days || {},
      total: got.total || {},
      settings: got.settings || {},
    };
    var dataScript = '<script>\nwindow.SCREEN_TIME_DATA = ' +
      JSON.stringify(payload) + ';\n<\/script>\n';

    // NOTE: closing tags are escaped (<\/script>) so this file can be inlined safely
    html = html
      .replace('<script src="categories.js"><\/script>', '<script>\n' + catsJs + '\n<\/script>')
      .replace('<script src="dashboard.js"><\/script>', dataScript + '<script>\n' + dashJs + '\n<\/script>');

    download('index.html', html, 'text/html');
    flashSaved('index.html ready');
  }

  function armReset(btn, scope) {
    if (!btn) return;
    btn.addEventListener('click', async function () {
      if (btn.dataset.armed !== '1') {
        btn.dataset.armed = '1';
        btn.classList.add('danger-armed');
        btn.textContent = scope === 'today' ? 'Sure? Click again' : 'Erase ALL data?';
        setTimeout(function () {
          btn.dataset.armed = '0';
          btn.classList.remove('danger-armed');
          btn.textContent = scope === 'today' ? 'Reset today' : 'Reset everything';
        }, 3500);
        return;
      }
      try { await chrome.runtime.sendMessage({ type: 'reset', scope: scope }); } catch (_) {}
      await loadData();
      renderAll();
    });
  }

  // ── settings tab ─────────────────────────────────────────────────────────

  function renderSettings() {
    var body = $('#set-body');
    var limits = settings.siteLimits || {};

    var limRows = Object.keys(limits).map(function (d) {
      return '<div class="limit-row"><span class="lr-d">' + esc(d) + '</span>' +
        '<span class="lr-m">' + limits[d] + 'm</span>' +
        '<button type="button" data-rm="' + esc(d) + '" title="Remove">×</button></div>';
    }).join('') || '<p class="footnote">No limits set yet.</p>';

    var tops = Object.keys(total).sort(function (a, b) { return total[b] - total[a]; }).slice(0, 25);
    var dl = '<datalist id="dlSites">' +
      tops.map(function (d) { return '<option value="' + esc(d) + '">'; }).join('') + '</datalist>';

    var inputCss = 'background:var(--panel2); border:1px solid var(--border); border-radius:10px; padding:9px 12px; font-size:12.5px; outline:none;';

    body.innerHTML =
      '<div class="set-grid">' +

      '<div class="panel" style="margin-top:0"><div class="panel-h"><h3>Daily goal &amp; alerts</h3></div>' +
      '<div class="field"><label for="goalInput">Daily screen-time goal (minutes)</label>' +
      '<input id="goalInput" type="number" min="0" max="1440" step="15" value="' + (settings.dailyGoalMinutes || 0) + '">' +
      '<div class="hint">0 = goal off. The toolbar badge turns amber at 75% and red once you cross it.</div></div>' +
      '<div class="switch-row"><span class="sl">Goal &amp; limit alerts</span>' +
      '<span class="switch"><input id="alertsSwitch" type="checkbox"' + (settings.alerts ? ' checked' : '') +
      '><span class="knob"></span></span></div>' +
      '<div class="switch-row"><span class="sl">Daily summary (yesterday recap)</span>' +
      '<span class="switch"><input id="summarySwitch" type="checkbox"' + (settings.dailySummary ? ' checked' : '') +
      '><span class="knob"></span></span></div>' +
      '<div class="hint" style="margin-top:10px">You get one alert per day when the goal or a site limit is crossed, plus a morning recap of yesterday.</div></div>' +

      '<div class="panel" style="margin-top:0"><div class="panel-h"><h3>Site limits</h3></div>' +
      '<div class="field"><label>New limit</label>' +
      '<div class="btn-row" style="align-items:center;flex-wrap:nowrap">' +
      '<input id="limDomain" type="text" list="dlSites" placeholder="youtube.com" style="flex:1;min-width:130px;' + inputCss + '">' +
      '<input id="limMins" type="number" min="1" placeholder="min" style="width:78px;' + inputCss + '">' +
      '<button class="btn primary" id="addLimitBtn" type="button">Add</button></div>' + dl +
      '<div class="hint">You will be notified once per day when a site crosses its limit.</div></div>' +
      '<div style="margin-top:6px">' + limRows + '</div></div>' +

      '<div class="panel" style="margin-top:0"><div class="panel-h"><h3>Web dashboard</h3></div>' +
      '<div class="field"><label for="webUrlInput">Hosted page URL (redirect)</label>' +
      '<div class="btn-row" style="align-items:center;flex-wrap:nowrap">' +
      '<input id="webUrlInput" type="text" placeholder="https://your-site.github.io/screen-time-tracker/" style="flex:1;min-width:200px;' + inputCss + '">' +
      '<button class="btn" id="openWebBtn" type="button">Open</button></div>' +
      '<div class="hint">Export the web page below, upload <b>index.html</b> to your host (GitHub Pages, Netlify…), then paste its URL here. A redirect button appears in the popup.</div></div>' +
      '<div class="btn-row"><button class="btn primary" id="exportWebBtn" type="button">Export web page (index.html)</button></div>' +
      '<div class="hint">Single self-contained HTML file with all your data baked in — works offline, no server needed.</div></div>' +

      '<div class="panel" style="margin-top:0"><div class="panel-h"><h3>Appearance</h3></div>' +
      '<div class="btn-row">' +
      '<button class="btn' + (settings.theme !== 'light' ? ' primary' : '') + '" id="thDark" type="button">Dark</button>' +
      '<button class="btn' + (settings.theme === 'light' ? ' primary' : '') + '" id="thLight" type="button">Light</button></div>' +
      '<div class="hint" style="margin-top:10px">Applies to the popup and the exported web page.</div></div>' +

      '<div class="panel" style="margin-top:0"><div class="panel-h"><h3>Data</h3></div>' +
      '<div class="btn-row">' +
      '<button class="btn" id="exportBtn" type="button">Download JSON</button>' +
      '<button class="btn" id="exportCsvBtn" type="button">Export CSV</button>' +
      '<button class="btn" id="importBtn" type="button">Import JSON</button>' +
      '<input type="file" id="importFile" accept="application/json,.json" style="display:none">' +
      '</div>' +
      '<div class="btn-row" style="margin-top:10px">' +
      '<button class="btn" id="resetTodayBtn" type="button">Reset today</button>' +
      '<button class="btn" id="resetAllBtn" type="button">Reset everything</button></div>' +
      '<p class="footnote">Everything lives in <code>chrome.storage.local</code> on this device — no accounts, no servers, no analytics. JSON backup can be imported back anytime.</p></div>' +
      '</div>';

    $('#goalInput').addEventListener('change', async function () {
      var v = parseInt(this.value, 10);
      if (isNaN(v)) v = 0;
      settings.dailyGoalMinutes = Math.max(0, Math.min(1440, v));
      await saveSettings();
    });

    $('#alertsSwitch').addEventListener('change', async function () {
      settings.alerts = this.checked;
      await saveSettings();
    });

    $('#summarySwitch').addEventListener('change', async function () {
      settings.dailySummary = this.checked;
      await saveSettings();
    });

    $('#addLimitBtn').addEventListener('click', async function () {
      var d = ($('#limDomain').value || '').trim().toLowerCase().replace(/^www\./, '');
      var m = parseInt($('#limMins').value, 10);
      if (!d || !(m > 0)) return;
      settings.siteLimits = Object.assign({}, settings.siteLimits);
      settings.siteLimits[d] = m;
      await saveSettings();
      renderSettings();
    });

    var rms = body.querySelectorAll('button[data-rm]');
    Array.prototype.forEach.call(rms, function (b) {
      b.addEventListener('click', async function () {
        settings.siteLimits = Object.assign({}, settings.siteLimits);
        delete settings.siteLimits[b.dataset.rm];
        await saveSettings();
        renderSettings();
      });
    });

    $('#webUrlInput').addEventListener('change', async function () {
      settings.webUrl = this.value.trim();
      await saveSettings();
    });

    $('#openWebBtn').addEventListener('click', function () {
      if (settings.webUrl) chrome.tabs.create({ url: settings.webUrl });
      else flashSaved('Paste a URL first');
    });

    $('#exportWebBtn').addEventListener('click', function () { exportWeb(); });

    $('#thDark').addEventListener('click', function () { setTheme('dark'); });
    $('#thLight').addEventListener('click', function () { setTheme('light'); });

    $('#exportBtn').addEventListener('click', exportData);
    $('#exportCsvBtn').addEventListener('click', exportCSV);

    $('#importBtn').addEventListener('click', function () { $('#importFile').click(); });
    $('#importFile').addEventListener('change', function () {
      var f = this.files && this.files[0];
      if (!f) return;
      var reader = new FileReader();
      reader.onload = async function () {
        try {
          var data = JSON.parse(reader.result);
          if (!data || typeof data !== 'object' || (!data.days && !data.total)) {
            flashSaved('Invalid backup file');
            return;
          }
          await chrome.runtime.sendMessage({
            type: 'import',
            days: data.days || {},
            total: data.total || {},
            settings: data.settings,
          });
          flashSaved('Imported');
          setTimeout(async function () { await loadData(); renderAll(); }, 400);
        } catch (_) {
          flashSaved('Import failed');
        }
      };
      reader.readAsText(f);
      this.value = '';
    });

    armReset($('#resetTodayBtn'), 'today');
    armReset($('#resetAllBtn'), 'all');
  }

  function renderSettingsMaybe() {
    var sb = $('#set-body');
    var ae = document.activeElement;
    if (sb && ae && sb.contains(ae) && ae.tagName === 'INPUT') {
      settingsDirty = true; // re-render when the input loses focus
      return;
    }
    renderSettings();
  }

  // ── tabs ─────────────────────────────────────────────────────────────────

  function setTab(t) {
    if (EMBED && t === 'settings') t = 'overview';
    activeTab = t;
    Array.prototype.forEach.call(document.querySelectorAll('.nav-btn'), function (b) {
      b.classList.toggle('active', b.dataset.tab === t);
    });
    Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (s) {
      s.classList.toggle('active', s.id === 'tab-' + t);
    });
    $('#topTitle').textContent = TITLES[t] || t;
    renderActive();
  }

  function renderActive() {
    if (activeTab === 'overview') renderOverview();
    else if (activeTab === 'sites') renderSites();
    else if (activeTab === 'insights') renderInsights();
    else renderSettingsMaybe();
  }

  function renderAll() {
    renderOverview();
    renderSites();
    renderInsights();
    if (activeTab === 'settings') renderSettingsMaybe();
  }

  // ── events ───────────────────────────────────────────────────────────────

  function wireEvents() {
    // sidebar nav
    Array.prototype.forEach.call(document.querySelectorAll('.nav-btn'), function (b) {
      b.addEventListener('click', function () { setTab(b.dataset.tab); });
    });
    $('#themeBtn').addEventListener('click', function () {
      setTheme(settings.theme === 'light' ? 'dark' : 'light');
    });

    // overview: range buttons + click-through to sites
    $('#ov-body').addEventListener('click', function (e) {
      var segBtn = e.target.closest('button[data-n]');
      if (segBtn) {
        barCount = parseInt(segBtn.dataset.n, 10);
        renderOverview();
        return;
      }
      var trow = e.target.closest('.trow');
      if (trow && trow.dataset.domain) {
        expandedSite = trow.dataset.domain;
        setTab('sites');
      }
    });

    // sites: search / filters / sort / expand / category change
    $('#sites-body').addEventListener('input', function (e) {
      if (e.target.id === 'siteSearch') {
        searchText = e.target.value;
        renderSitesTable();
      }
    });
    $('#sites-body').addEventListener('click', function (e) {
      var chip = e.target.closest('.chip[data-cat]');
      if (chip) {
        catFilter = chip.dataset.cat;
        renderSites();
        return;
      }
      if (e.target.closest('select')) return;
      var row = e.target.closest('.srow');
      if (row && row.dataset.domain) {
        expandedSite = (expandedSite === row.dataset.domain) ? null : row.dataset.domain;
        renderSitesTable();
      }
    });
    $('#sites-body').addEventListener('change', function (e) {
      if (e.target.id === 'sortSel') {
        sortMode = e.target.value;
        renderSites();
        return;
      }
      var sel = e.target.closest('select[data-catfor]');
      if (sel) {
        var d = sel.dataset.catfor;
        var ov = Object.assign({}, settings.categoryOverrides || {});
        if (sel.value) ov[d] = sel.value; else delete ov[d];
        settings.categoryOverrides = ov;
        saveSettings().then(renderAll);
      }
    });

    // settings: re-render once the user stops typing (storage ticks)
    $('#set-body').addEventListener('focusout', function () {
      setTimeout(function () {
        var sb = $('#set-body');
        var ae = document.activeElement;
        if (settingsDirty && !(sb.contains(ae) && ae.tagName === 'INPUT')) {
          settingsDirty = false;
          renderSettings();
        }
      }, 60);
    });

    // live updates from the service worker (once a minute)
    if (!EMBED) {
      chrome.storage.onChanged.addListener(function (changes, area) {
        if (area !== 'local') return;
        if (!changes.days && !changes.total && !changes.settings) return;
        clearTimeout(renderTimer);
        renderTimer = setTimeout(function () {
          loadData().then(renderAll);
        }, 300);
      });
    }
  }

  // ── init ─────────────────────────────────────────────────────────────────

  $('#topDate').textContent = new Date().toLocaleDateString(undefined, {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  if (EMBED) {
    // snapshot mode: hide editing UI, show provenance
    var setNav = document.querySelector('.nav-btn[data-tab="settings"]');
    if (setNav) setNav.style.display = 'none';
    var when = window.SCREEN_TIME_DATA.exportedAt
      ? new Date(window.SCREEN_TIME_DATA.exportedAt) : new Date();
    $('#topDate').textContent = 'Snapshot · ' +
      when.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
    var sn = document.querySelector('.side-note');
    if (sn) sn.innerHTML = 'Read-only snapshot · ' + when.toLocaleString() +
      '<br>Exported from Screen Time Tracker';
  }

  var toast = document.createElement('div');
  toast.id = 'toast';
  toast.className = 'saved-flash toast';
  toast.textContent = 'Saved';
  document.body.appendChild(toast);

  wireEvents();
  loadData().then(renderAll);
})();
