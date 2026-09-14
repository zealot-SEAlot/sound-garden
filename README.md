# 🌙 Sound Garden

A little musical toy for your browser. Plant glowing flowers on a night sky, and a moonbeam sweeps across to play them on a loop. Add more gardens and they all play together, or load a song from the library.

**▶ Play it: https://nathanflorencecasas-create.github.io/sound-garden/**

## How to play

- **Pick an instrument** from the menu at the bottom (or press **1–8**). Each has its own colour and petal count:
  Bell (gold) · Marimba (pink) · Harp (teal) · Flute (violet) · Piano (blue) · Kalimba (green) · Strings (magenta) · Bass (lime, plays an octave lower)
- **Click** anywhere in a garden to plant a flower. Higher flowers sing higher notes. Each garden holds up to 300 flowers.
- **Drag** a flower to move it, even into another garden. Drag it out of the gardens (or right-click it) to pull it up.
- **Space** pauses and resumes. **Loop** (4–32 seconds), **Scale** and **Volume** sit next to the play button; click the speaker icon to mute everything. Volume only changes your speakers; recordings always stay at full level.
- Press **?** (or the help button in the top bar) to see every keyboard shortcut.

## Song library

Open **Library** in the top bar (or press **L**) and pick a song. It replaces your gardens with ready-made ones that play it, and you can undo right after. Each part gets its own garden, so you can mute the melody and sing along. The current songs, all public domain:

- Twinkle Twinkle Little Star
- Mary Had a Little Lamb
- Frère Jacques, as a three-voice round
- Ode to Joy
- Jingle Bells (chorus)

To add a song, add an entry to `SONGS` in `js/songs.js`. Notes are written like `C4 E4:2 - G3+B3:4`: a note and octave (C4 is middle C), `:beats` for its length, `-` for a rest and `+` for a chord.

## Gardens

Press **＋** in the top bar to add a garden (up to 8). The screen splits so each garden gets its own space, and they all play in sync on the same loop.

- Click a tab or a garden to make it active: **Surprise** and **Clear** in its corner apply to that garden.
- The **speaker button** on each tab mutes that garden (or press **M** for the active one). Muted gardens dim and stay silent, including in recordings.
- Close a tab with **×**, and undo right after if you change your mind.

## Recording

**Record** (top right, or press **R**) captures your gardens as a video. Choose 1, 2, 4 or 8 loops; after a 3-2-1 countdown the controls hide and it records exactly that many loops from the start. Press **Esc** to stop early, then preview and download the clip. Keep the tab on screen while recording.

Your gardens are saved in your browser, so they're still there when you come back.

## Run it locally

No install or build step. Download the project (**Code → Download ZIP**), unzip it, and open `index.html` in any modern browser (turn your sound on).

## Run the tests

With [Node.js](https://nodejs.org/) 18 or newer, run this from the project folder:

```bash
node --test
```

The tests check the song library: every song fits the garden limits, every part has the right number of beats, and every flower plays exactly the note that was written.

## Project layout

| File | What it does |
|---|---|
| `index.html` | Page structure and icons |
| `styles.css` | Look and layout |
| `js/audio.js` | Scales, instrument sounds, volume, per-garden mute |
| `js/garden.js` | Gardens, flowers, loop timing, split-screen layout, saving |
| `js/draw.js` | Drawing the sky, gardens and flowers |
| `js/recording.js` | Video recording |
| `js/tabs.js` | Garden tabs: add, remove, mute, and the active garden's actions |
| `js/songs.js` | Song library data and the note format |
| `js/library.js` | The library panel and loading songs |
| `js/ui.js` | Menus, controls, shortcuts, mouse and keyboard input |

## Built with

Plain HTML, CSS, and JavaScript: the Canvas API for the visuals, the Web Audio API for sound, and MediaRecorder for recording.
