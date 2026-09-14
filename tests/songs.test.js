// Checks the song library data. Run from the project folder with: node --test
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// The game's files are plain browser scripts that share globals, so load the ones the songs need into one context.
const SCRIPTS = ['js/audio.js', 'js/garden.js', 'js/songs.js'];

function loadGame() {
  const context = vm.createContext({ console, Math });
  for (const file of SCRIPTS) {
    const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
    vm.runInContext(source, context, { filename: file });
  }
  return (expression) => vm.runInContext(expression, context);
}

const game = loadGame();
const SONGS = game('SONGS');
const parseTrack = game('parseTrack');
const songToGardens = game('songToGardens');
const midiFor = game('midiFor');
const yForMidi = game('yForMidi');

test('the library has songs, each with a unique id', () => {
  assert.ok(SONGS.length > 0);
  assert.equal(new Set(SONGS.map((song) => song.id)).size, SONGS.length);
});

test('bad notes are rejected instead of silently misplaced', () => {
  assert.throws(() => parseTrack('C4 H9'), /Unreadable note/);
  assert.throws(() => parseTrack('C4:0'), /Bad note length/);
  assert.throws(() => yForMidi(61, 'Major'), /isn't playable/);   // C#4 is not in C major
  assert.throws(() => yForMidi(24, 'Major'), /isn't playable/);   // C1 is below the lowest row
});

for (const song of SONGS) {
  test(`${song.title}: fits the garden limits`, () => {
    assert.ok(game('SCALES')[song.scale], `unknown scale "${song.scale}"`);
    assert.ok(song.tracks.length >= 1 && song.tracks.length <= game('MAX_GARDENS'), 'too many or too few tracks');
    assert.ok(song.loopSeconds >= game('MIN_LOOP_SECONDS') && song.loopSeconds <= game('MAX_LOOP_SECONDS'), 'loop length out of range');
  });

  test(`${song.title}: every track fills exactly ${song.beats} beats with a known instrument`, () => {
    for (const track of song.tracks) {
      assert.ok(game('INSTRUMENTS')[track.instrument], `${track.name}: unknown instrument "${track.instrument}"`);
      assert.equal(parseTrack(track.notes).beats, song.beats, `${track.name} has the wrong number of beats`);
    }
  });

  test(`${song.title}: every flower plays the note that was written`, () => {
    game(`scaleName = ${JSON.stringify(song.scale)}`);   // loading a song switches the garden to its scale
    const gardens = songToGardens(song);
    song.tracks.forEach((track, i) => {
      const flowers = [...gardens[i].flowers];
      const written = [...parseTrack(track.notes).events.flatMap((event) => event.midis)].sort((a, b) => a - b);
      const planted = flowers.map((flower) => midiFor(flower.y)).sort((a, b) => a - b);
      assert.deepEqual(planted, written, `${track.name} plays different notes than written`);
      assert.ok(flowers.length <= game('MAX_FLOWERS_PER_GARDEN'), `${track.name} has too many flowers`);
      assert.ok(flowers.every((flower) => flower.x > 0 && flower.x < 1), `${track.name} has a note outside the loop`);
    });
  });
}
