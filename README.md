# 🌙 Sound Garden

A little musical toy for your browser. Plant glowing flowers on a night sky, and a moonbeam sweeps across to play them on a loop. Add more gardens and they all play together.

**▶ Play it: https://nathanflorencecasas-create.github.io/sound-garden/**

## How to play

- **Pick an instrument** from the menu at the bottom (or press **1–4**). Each has its own colour and petal count:
  🟡 Bell · 🩷 Marimba · 🩵 Harp · 🟣 Flute
- **Click** anywhere in a garden to plant a flower. Higher flowers sing higher notes. Each garden holds up to 300 flowers.
- **Drag** a flower to move it, even into another garden. Drag it out of the gardens (or right-click it) to pull it up.
- **Space** pauses and resumes. **Loop**, **Scale** and **🔊 Volume** sit next to the play button. Volume only changes your speakers; recordings always stay at full level.

## Gardens

Press **＋** in the top bar to add a garden (up to 8). The screen splits so each garden gets its own space, and they all play in sync on the same loop. Click a tab or a garden to make it active: **✨ Surprise** and **Clear** in its corner apply to that garden. Close a tab with **×**, and undo right after if you change your mind.

## Recording

**⏺ Record** (top right, or press **R**) captures your gardens as a video. Choose 1, 2, 4 or 8 loops; after a 3-2-1 countdown the controls hide and it records exactly that many loops from the start. Press **Esc** to stop early, then preview and download the clip. Keep the tab on screen while recording.

Your gardens are saved in your browser, so they're still there when you come back.

## Run it locally

No install or build step. Download the project (**Code → Download ZIP**), unzip it, and open `index.html` in any modern browser (turn your sound on).

## Project layout

| File | What it does |
|---|---|
| `index.html` | Page structure |
| `styles.css` | Look and layout |
| `js/audio.js` | Scales, instrument sounds, volume |
| `js/garden.js` | Gardens, flowers, loop timing, split-screen layout, saving |
| `js/draw.js` | Drawing the sky, gardens and flowers |
| `js/recording.js` | Video recording |
| `js/ui.js` | Tabs, menus, controls, mouse and keyboard input |

## Built with

Plain HTML, CSS, and JavaScript: the Canvas API for the visuals, the Web Audio API for sound, and MediaRecorder for recording.
