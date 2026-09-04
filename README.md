# ⏱ Screen Time Tracker

**Professional Chrome extension + web dashboard that tracks how long you spend on every website.**

🌍 **Live web dashboard:** https://smartstopwach.github.io/screen-time-tracker/

> 100% private — all data stays on your device. The live page above is a read-only *snapshot* exported from the extension (currently empty — replace `index.html` with your own export to publish your stats).

---

## ✨ What it does

| | |
|---|---|
| 📊 **Full analytics dashboard** | Overview, Sites, Insights & Settings tabs |
| 🌐 **Site-wise tracking** | time per site, per day, per hour of day |
| 🗂 **Auto categories** | Work · Social · Entertainment · Learning · Shopping · News · Search (200+ domain rules, fully re-mappable) |
| 🎯 **Daily goal** | progress ring, goal line on charts, traffic-light badge |
| 🔔 **Smart alerts** | goal & per-site limit notifications, daily yesterday-recap |
| 📈 **Trends** | 7/14/30-day charts, per-site sparklines & 14-day histories |
| 🕒 **Hourly heatmap** | see *when* you're online |
| 💡 **Insights** | week-over-week, productivity score, peak hour, most increased/reduced site, goal streak |
| 🌍 **Web export** | one click → single-file `index.html` with all data embedded — host it anywhere (that's the live page above) |
| 🌐 **Redirect button** | set your hosted URL → popup gets a one-click 🌐 redirect |
| 💾 **Data freedom** | JSON backup/restore, CSV export, dark/light theme, `Alt+Shift+S` shortcut |

## 📦 Install the extension

1. Download / clone this repo
2. Open `chrome://extensions` → enable **Developer mode**
3. **Load unpacked** → select the `extension/` folder
4. Pin the icon 📌 and browse normally — data collects itself

## 🌍 Publish your own data page

1. In the extension: **Dashboard → Settings → 🌍 Web dashboard → Export web page** → get `index.html`
2. Replace `index.html` in this repo (GitHub web UI: *Add file → Upload files*) and commit
3. Your live page updates automatically: **https://smartstopwach.github.io/screen-time-tracker/**
4. Paste that URL into the extension's *Hosted page URL* field → the popup's 🌐 button redirects there

The exported page is fully self-contained (inline CSS/JS + embedded data) — it also works on Netlify, Vercel, or even opened from a USB stick.

## 🔐 Privacy

- All data in `chrome.storage.local` — **no servers, no accounts, no analytics**
- No host permissions; the only network request is a favicon image (Google's public favicon service)
- You control exports: JSON backup, CSV, or the web snapshot — nothing leaves the device unless you export it

## 🛠 Tech

- Chrome Manifest V3 service worker with idle/audio-aware tracking, hour-level attribution, and sleep-gap protection
- Zero dependencies — hand-rolled SVG/DOM charts, system font stack
- Single codebase runs in two modes: **live** (extension) and **snapshot** (exported page)

```
extension/   ← load this folder in Chrome (Manifest V3)
index.html   ← live web dashboard (re-export & replace to update)
```

## 📄 License

MIT © smartstopwach
