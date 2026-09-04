# ⏱ Screen Time Tracker v3 — Chrome Extension

A production-grade, privacy-first screen-time analytics suite for your browser. Track every site, set goals & limits, dig into insights — and **export your whole dashboard as a single web page** you can host anywhere.

## ✨ Feature highlights

**Tracking engine (background service worker)**
- Per-site time tracking (active tab of the focused window only)
- Hour-of-day attribution (sessions split across hour boundaries)
- Idle detection (60s) with audio-aware exception — video watching keeps counting
- System-sleep / browser-close gap protection — no over-counting
- Daily rollover with yesterday's summary notification
- 90 days of history kept, automatic v1/v2 → v3 data migration

**Popup (quick glance)**
- Today's total with daily-goal progress ring (red when crossed)
- Category chips, top sites with colored bars, vs-yesterday delta
- One-click Dashboard + optional 🌐 web-dashboard redirect

**Dashboard (full analytics app)**
- **Overview** — stat cards, category donut, 7/14/30-day trend with goal line, hourly heatmap
- **Sites** — search, category filters, sorting, sparklines, 14-day per-site history, re-categorization
- **Insights** — week-over-week, productivity score, peak hour, most increased/reduced site, goal streak
- **Settings** — daily goal, alerts, daily summary, site limits, dark/light theme

**Data & web features**
- 🌍 **Export web page** — one self-contained `index.html` with all your data embedded; host it on GitHub Pages/Netlify/USB, it just works (read-only snapshot mode)
- 🌐 **Web redirect** — set your hosted page's URL; the popup gets a one-click 🌐 button
- ⬇️ Backup JSON / ⬆️ Import JSON / 📄 Export CSV
- ⌨️ `Alt+Shift+S` opens the dashboard; right-click icon → Options works too

## 📦 Install (Load unpacked)

1. Download & unzip `screen-time-tracker.zip`
2. Open `chrome://extensions` → enable **Developer mode**
3. **Load unpacked** → select the `screen-time-tracker` folder
4. Pin the icon 📌 — browse normally, data collects itself

## 🌍 Host your own web dashboard (the special feature)

1. Open the dashboard → **Settings → 🌍 Web dashboard → "Export web page"** — you get `index.html`
2. Upload it to any static host:
   - **GitHub Pages**: create a repo → upload `index.html` (replace if it exists) → Settings → Pages → branch `main` / root
   - **Netlify Drop**: drag & drop the file at app.netlify.com/drop
3. Copy your live URL (e.g. `https://user.github.io/screen-time-tracker/`)
4. Paste it into the **Hosted page URL** field — now the popup's 🌐 button redirects there

The exported page is a read-only snapshot: charts, insights and heatmap all work; settings/editing are hidden. Re-export anytime to refresh the data.

## 🔐 Permissions & privacy

| Permission | Why |
|---|---|
| `tabs` | Read the active tab's domain (*"Read your browsing history"* warning) |
| `storage` | Save data locally (`chrome.storage.local`) |
| `idle` + `alarms` | Accurate tracking (idle pause, 1-minute heartbeat) |
| `notifications` | Goal, limit & summary alerts |

**No host permissions. No network calls. No analytics. No accounts.** The only external request is a favicon image (Google's public favicon service) for site icons. Your data never leaves the device unless *you* export it.

## 📁 Files

```
screen-time-tracker/
├── manifest.json      # MV3 config (popup, options, commands)
├── background.js      # tracking engine (service worker)
├── categories.js      # site → category rules (shared)
├── popup.html/.js     # quick-glance popup
├── dashboard.html/.js # full dashboard + web-export engine
├── icons/             # toolbar & store icons
└── LICENSE            # MIT
```

## ⚠️ Notes

- Only `http(s)://` pages counted; `www.` / `m.` stripped
- Incognito not tracked unless you allow the extension there
- Keyboard shortcut can be changed at `chrome://extensions/shortcuts`

MIT © smartstopwach
