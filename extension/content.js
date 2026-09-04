// ── Screen Time Tracker v3.2 · content script ───────────────────────────────
// Watches <video> elements on the page and reports the play/pause state to
// the background worker, so time a lecture spends PLAYING is tracked
// separately from time spent on the page with it PAUSED.

(function () {
  'use strict';

  var HB_MS = 25000;     // re-send state at most every 25s (heals SW restarts)
  var CHECK_MS = 5000;   // look for player changes this often
  var lastSent = '';
  var lastSentAt = 0;

  // only "substantial" videos count: a lecture/class (>= 1 min) or a live
  // stream (duration Infinity/NaN) — tiny ad or preview players are ignored
  function substantial(v) {
    if (!v) return false;
    var dur = v.duration;
    return !isFinite(dur) || dur >= 60;
  }

  function state() {
    var vids = Array.prototype.slice.call(document.querySelectorAll('video'));
    var playing = false;
    var paused = false;
    vids.forEach(function (v) {
      if (!substantial(v)) return;
      if (!v.paused && !v.ended) playing = true;
      else paused = true;
    });
    if (playing) return 'play';
    if (paused) return 'pause';
    return 'none';
  }

  function send(s, force) {
    var now = Date.now();
    if (!force && s === lastSent && now - lastSentAt < HB_MS) return;
    lastSent = s;
    lastSentAt = now;
    try {
      chrome.runtime.sendMessage({ type: 'vid', s: s }, function () {
        void chrome.runtime.lastError; // extension reloaded — ignore
      });
    } catch (_) {
      /* context invalidated — the page will get a fresh script on reload */
    }
  }

  function tick() {
    var s = state();
    if (s === 'none' && lastSent === 'none') return; // quiet pages stay quiet
    send(s);
  }

  // media events do not bubble, but they do pass through the capture phase
  ['play', 'playing', 'pause', 'ended', 'emptied'].forEach(function (ev) {
    document.addEventListener(ev, function () { setTimeout(tick, 60); }, true);
  });
  document.addEventListener('visibilitychange', tick, true);
  window.addEventListener('pagehide', function () { send('none', true); });

  setInterval(tick, CHECK_MS);
  tick();
})();
