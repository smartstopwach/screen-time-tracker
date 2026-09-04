// ── Screen Time Tracker v2 · popup ──────────────────────────────────────────
// If chrome APIs are unavailable (e.g. static preview), the demo markup stays.

(function () {
  'use strict';

  var hasChrome = typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local;
  if (!hasChrome) return;

  var DEFAULTS = {
    dailyGoalMinutes: 240,
    alerts: true,
    dailySummary: true,
    siteLimits: {},
    categoryOverrides: {},
    theme: 'dark',
    webUrl: '',
  };

  var CIRC = 2 * Math.PI * 52;
  var settings = Object.assign({}, DEFAULTS);

  function $(id) { return document.getElementById(id); }

  function keyOf(d) {
    d = d || new Date();
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }

  function fmtTime(secs) {
    secs = Math.round(secs);
    if (secs < 60) return secs + 's';
    var m = Math.floor(secs / 60);
    var h = Math.floor(m / 60);
    if (h > 0) return h + 'h ' + (m % 60) + 'm';
    return m + 'm ' + (secs % 60) + 's';
  }

  function avatarColor(domain) {
    var h = 0;
    for (var i = 0; i < domain.length; i++) h = (h * 31 + domain.charCodeAt(i)) % 360;
    return 'hsl(' + h + ', 55%, 45%)';
  }

  // capture-phase listener: swap broken favicons for letter avatars (CSP-safe)
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

  function faviconHTML(domain) {
    return '<img class="favicon" data-domain="' + domain + '" alt="" ' +
      'src="https://www.google.com/s2/favicons?domain=' +
      encodeURIComponent(domain) + '&sz=64">';
  }

  function siteRow(domain, secs, max, total, rank) {
    var cat = classifySite(domain, settings.categoryOverrides);
    var w = max > 0 ? Math.max(3, Math.round((secs / max) * 100)) : 3;
    return '<div class="row">' +
      '<div class="row-left">' + faviconHTML(domain) +
      '<div class="name-wrap"><div class="name-line"><div class="name">' + domain + '</div>' +
      (rank === 1 ? '<span class="top-chip">TOP</span>' : '') +
      '</div><div class="bar-track"><div class="bar-fill" style="width:' + w +
      '%; background:' + cat.color + '"></div></div></div></div>' +
      '<div class="right"><div class="time">' + fmtTime(secs) + '</div>' +
      '<div class="pct">' + (total > 0 ? Math.round((secs / total) * 100) + '%' : '') + '</div></div></div>';
  }

  async function render() {
    var got;
    try {
      got = await chrome.storage.local.get(['days', 'settings']);
    } catch (_) {
      return;
    }
    settings = Object.assign({}, DEFAULTS, got.settings || {});
    document.documentElement.dataset.theme = settings.theme || 'dark';

    // web dashboard redirect button (only if a URL is configured)
    $('webBtn').style.display = settings.webUrl ? '' : 'none';

    var day = (got.days && got.days[keyOf()] && got.days[keyOf()].sites) || {};
    var entries = Object.keys(day)
      .map(function (d) { return [d, day[d]]; })
      .sort(function (a, b) { return b[1] - a[1]; });
    var totalSecs = entries.reduce(function (s, e) { return s + e[1]; }, 0);

    $('headDate').textContent = new Date().toLocaleDateString(undefined, {
      weekday: 'short', day: 'numeric', month: 'short',
    });

    // ── ring vs daily goal ──
    var goalSecs = (settings.dailyGoalMinutes || 0) * 60;
    var frac = goalSecs > 0 ? Math.min(1, totalSecs / goalSecs) : 1;
    var ring = $('ringFill');
    ring.style.strokeDasharray = CIRC.toFixed(1);
    ring.style.strokeDashoffset = (CIRC * (1 - frac)).toFixed(1);
    ring.style.stroke = (goalSecs > 0 && totalSecs >= goalSecs) ? 'var(--bad)' : '';

    var timeText = totalSecs > 0 ? fmtTime(totalSecs) : '0m';
    $('ringTime').textContent = timeText;
    $('heroTime').textContent = timeText;
    $('ringSub').textContent = goalSecs > 0 ? 'of ' + fmtTime(goalSecs) + ' goal' : 'no goal set';
    $('heroGoal').textContent = goalSecs > 0
      ? Math.round((totalSecs / goalSecs) * 100) + '% of daily goal'
      : 'Set a goal in the dashboard';

    // vs yesterday
    var yd = new Date(); yd.setDate(yd.getDate() - 1);
    var yDay = (got.days && got.days[keyOf(yd)] && got.days[keyOf(yd)].sites) || {};
    var yTotal = 0;
    for (var k in yDay) yTotal += yDay[k];
    var deltaEl = $('heroDelta');
    if (yTotal > 0) {
      var pct = ((totalSecs - yTotal) / yTotal) * 100;
      deltaEl.textContent = (pct >= 0 ? '↑ ' : '↓ ') + Math.abs(Math.round(pct)) + '% vs yesterday';
      deltaEl.className = 'delta ' + (pct > 0 ? 'bad' : 'good'); // less time = good
    } else {
      deltaEl.textContent = '';
    }

    // ── lectures & video time (playing vs paused-on-page) ──
    var dayEntry = (got.days && got.days[keyOf()]) || {};
    var vidMap = dayEntry.video || {};
    var vidSecs = 0;
    for (var vd in vidMap) vidSecs += vidMap[vd];
    if (vidSecs >= 60) {
      var vpMap = dayEntry.vpause || {};
      var vpSecs = 0;
      for (var vp in vpMap) vpSecs += vpMap[vp];
      $('vidRow').style.display = '';
      $('vidText').innerHTML = '<b>' + fmtTime(vidSecs) + '</b> of lectures &amp; video today' +
        (vpSecs >= 60 ? ' · ' + fmtTime(vpSecs) + ' paused' : '');
    } else {
      $('vidRow').style.display = 'none';
    }

    // ── category chips ──
    var byCat = {};
    entries.forEach(function (e) {
      var c = classifySite(e[0], settings.categoryOverrides);
      byCat[c.id] = byCat[c.id] || { cat: c, secs: 0 };
      byCat[c.id].secs += e[1];
    });
    var cats = Object.keys(byCat)
      .map(function (id) { return byCat[id]; })
      .sort(function (a, b) { return b.secs - a.secs; });
    $('catRow').innerHTML = cats.slice(0, 3).map(function (x) {
      return '<span class="chip"><i style="background:' + x.cat.color + '"></i>' +
        x.cat.label + ' · ' + fmtTime(x.secs) + '</span>';
    }).join('');

    // ── top sites ──
    var list = $('list');
    $('listCount').textContent = entries.length + (entries.length === 1 ? ' site' : ' sites');
    if (!entries.length) {
      list.innerHTML = '<div class="empty">No data yet — open a few websites and tracking starts automatically.</div>';
      return;
    }
    var max = entries[0][1];
    list.innerHTML = entries.slice(0, 6).map(function (e, i) {
      return siteRow(e[0], e[1], max, totalSecs, i + 1);
    }).join('');
  }

  $('dashBtn').addEventListener('click', function () {
    chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html') });
  });

  $('webBtn').addEventListener('click', function () {
    if (settings.webUrl) chrome.tabs.create({ url: settings.webUrl });
  });

  chrome.storage.onChanged.addListener(function () { render(); });

  render();
})();
