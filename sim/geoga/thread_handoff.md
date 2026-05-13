# Geoga Thread Handoff

Last updated: 2026-04-29

## Project

- Folder: `/Users/serang_pro16/Documents/[CloudStation]/AI/Game/Geoga`
- GitHub: `https://github.com/SerangMind/geoga.git`
- Branch: `main`
- Latest pushed commit at handoff: `7c4c6e3 Revert gamepad boost to hold behavior`
- Deployment flow: GitHub push triggers Vercel deployment. iPad tests should use the Vercel HTTPS URL in Safari, not the local `127.0.0.1` URL.

## Local Run

```bash
cd "/Users/serang_pro16/Documents/[CloudStation]/AI/Game/Geoga"
npm run serve
```

Local preview:

- Mac: `http://127.0.0.1:4173`
- LAN preview printed by server, currently like `http://192.168.0.51:4173`

For iPad/gamepad testing, prefer the Vercel HTTPS deployment because Safari gamepad support is sensitive to secure context.

## Current App State

- App title: `거가대교 드론`
- Main files:
  - `index.html`
  - `src/main.js`
  - `src/styles.css`
  - `tools/serve.mjs`
  - `sound/*.mp3`
- Current cache-busting version in `index.html`: `20260429r`

## Controls

Keyboard:

- `W/S`: forward/back
- `A/D`: yaw left/right
- `Space/Ctrl`: ascend/descend
- `Shift`: boost while held
- `C`: change camera view
- `1-4`: preset positions

Gamepad:

- Left stick Y: forward/back
- Left stick X: intentionally ignored
- Right stick X: turn/yaw
- Right stick Y: pitch
- Right trigger/R button: ascend
- Left trigger/L button: descend
- A button: boost while held
- B: reset
- X: sound on/off toggle
- Y: camera view change
- D-pad: preset positions

Important: A boost was briefly changed to toggle mode, but it caused lock-up/먹통 reports on iPad. It has been reverted to the previous hold-to-boost behavior in commit `7c4c6e3`.

## Sound UI

- Before sound starts, the top-right control area shows `소리 켜기`.
- When sound is playing, the same area changes to the sound control panel.
- In the sound control panel:
  - `ON` button: turns sound off.
  - Track dropdown: selects current track.
  - `음악`, `드론`, `바람`: volume sliders.
- Background music no longer loops a single track. It plays tracks in order, then returns from the last track to the first.

## Current Music Order

1. Dance Summer Vibe
2. Quiz Countdown
3. Calm Background
4. Gentle Ambient BG
5. Gentle Ambient
6. Beauty Ambient
7. Voice Over Music
8. House Ambient
9. Drone Travel Pop
10. Fly High

## Recent Work Summary

- Added iPad-oriented sound start control.
- Moved sound start button to the top-right sound control position.
- Changed sound control left button from `곡` to `ON`; pressing it turns sound off.
- Removed extra status text from overlay: gamepad status, audio status, and track name are no longer shown in the main status line.
- Reordered music tracks and changed playback to sequential playlist mode.
- Updated title from `거가대로 드론` to `거가대교 드론`.
- Reverted A boost toggle back to hold-to-boost due iPad lock-up reports.

## Gotchas

- After any user-visible change, update the cache query in `index.html` for both CSS and JS, then push to GitHub so Vercel/iPad sees it.
- iPad Safari must be refreshed after Vercel deployment completes.
- Nimbus/controller must be paired to the iPad itself, not to the Mac.
- Avoid using A for anything except hold-to-boost unless testing carefully on iPad; toggle mode caused repeated lock-up reports.
- Do not reintroduce automatic audio start on arbitrary gamepad buttons. A button must not start audio.

## Useful Commands

```bash
node --check src/main.js
git status --short
git log --oneline -8
git add index.html src/main.js src/styles.css
git commit -m "..."
git push
```

## Next Likely Debug Step

If A boost still causes issues, remove gamepad A boost entirely and assign boost to a less conflict-prone button after checking iPad's actual button mapping. A temporary debug display of pressed button indices may help.
