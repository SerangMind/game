# Geoga Bridge Free Flight

Standalone Three.js flythrough scene rebuilt from the Geoga Bridge references in `D:\AI\Game\Images`.

## Run

```powershell
cd D:\AI\Game\Geoga
npm install
npm run serve
```

Open [http://127.0.0.1:4173](http://127.0.0.1:4173).

## Controls

- `W/S`: throttle
- `A/D`: yaw
- `Mouse`: pitch and roll after click-to-capture
- `Space/Ctrl`: ascend and descend
- `Shift`: boost
- `C`: cycle view mode
- `1..4`: jump to curated flythrough presets
- `R`: reset to preset 2

## Test

```powershell
npm run playtest
```

Outputs:

- `tests/playtest-report.json`
- `tests/playtest-shot.png`

## Deploy To Vercel

This project is a static site. No build step is required.

### Recommended Vercel settings

- Framework Preset: `Other`
- Root Directory: `.`
- Build Command: leave empty
- Output Directory: leave empty
- Install Command: leave empty

### Notes

- `vercel.json` is included for static delivery headers.
- `.vercelignore` excludes local-only folders such as `node_modules`, `tests`, and `tools`.
- Pointer lock and mouse capture work normally on Vercel because the site is served over HTTPS.
