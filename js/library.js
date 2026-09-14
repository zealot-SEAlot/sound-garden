/* Song library: a panel of premade gardens that play a song. Loading one replaces the current gardens, with undo. */

const libraryButton = document.getElementById('libraryButton');
const libraryPanel = document.getElementById('libraryPanel');
const songListEl = document.getElementById('songList');

function songSummary(song) {
  const count = song.tracks.length;
  return `${song.credit} · ${count} garden${count > 1 ? 's' : ''} · ${song.loopSeconds}s loop`;
}

function makeSongItem(song) {
  const item = document.createElement('li');
  const btn = document.createElement('button');
  const title = document.createElement('span');
  const meta = document.createElement('span');
  const dots = document.createElement('span');
  btn.className = 'song';
  btn.dataset.song = song.id;
  title.className = 'song-title';
  title.textContent = song.title;
  meta.className = 'song-meta';
  meta.textContent = songSummary(song);
  dots.className = 'song-dots';
  dots.setAttribute('aria-hidden', 'true');
  song.tracks.forEach(({ instrument }) => {
    const dot = document.createElement('span');
    dot.className = 'dot';
    dot.style.setProperty('--c', `hsl(${INSTRUMENTS[instrument].hue},85%,65%)`);
    dots.append(dot);
  });
  btn.append(title, meta, dots);
  btn.addEventListener('click', () => loadSong(song));
  item.append(btn);
  return item;
}

function openLibrary() {
  closeInstrumentMenu();
  closeHelp();
  placeBelowTopbar(libraryPanel);
  libraryPanel.hidden = false;
  libraryButton.setAttribute('aria-expanded', 'true');
  songListEl.querySelector('.song')?.focus();
}

function closeLibrary({ focusButton = false } = {}) {
  if (libraryPanel.hidden) return;
  libraryPanel.hidden = true;
  libraryButton.setAttribute('aria-expanded', 'false');
  if (focusButton) libraryButton.focus();
}

function toggleLibrary() {
  if (libraryPanel.hidden) openLibrary(); else closeLibrary();
}

function onSongListKeydown(e) {
  const songs = [...songListEl.querySelectorAll('.song')];
  const index = songs.indexOf(document.activeElement);
  const moves = { ArrowDown: index + 1, ArrowUp: index - 1, Home: 0, End: songs.length - 1 };
  if (!(e.key in moves)) return;
  e.preventDefault();
  songs[(moves[e.key] + songs.length) % songs.length].focus();
}

// Swap in a whole setup (gardens, scale, loop length): used to load a song and to undo that.
function applyGardenSetup(setup) {
  gardens = setup.gardens;
  activeGardenId = setup.activeGardenId;
  scaleName = setup.scaleName;
  loopSeconds = setup.loopSeconds;
  gardens.forEach(setGardenMuted);
  syncMusicControls();
  renderTabs();
  relayout();
  save();
}

function loadSong(song) {
  if (recording) return;
  let songGardens;
  try {
    songGardens = songToGardens(song);
  } catch (err) {
    console.error(`Song "${song.id}" could not be loaded`, err);
    showToast(`Couldn't load “${song.title}”.`);
    return;
  }
  const previous = { gardens, activeGardenId, scaleName, loopSeconds };
  ensureAudio();
  hideHint();
  closeLibrary();
  applyGardenSetup({
    gardens: songGardens, activeGardenId: songGardens[0].id, scaleName: song.scale, loopSeconds: song.loopSeconds,
  });
  phase = 0;   // start the song from its first note
  setRunning(true);
  showToast(`Playing “${song.title}”`, { label: 'Undo', onClick: () => applyGardenSetup(previous) });
}

songListEl.replaceChildren(...SONGS.map(makeSongItem));
songListEl.addEventListener('keydown', onSongListKeydown);
libraryButton.addEventListener('click', toggleLibrary);
