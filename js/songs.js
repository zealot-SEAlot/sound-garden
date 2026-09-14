/* Song library data, and turning a song's notes into garden flowers. Every song here is in the public domain. */

// Each track becomes one garden. Notes are written like "C4 E4:2 - G3+B3:4":
// a note name with its octave (C4 is middle C), ":beats" for its length (1 if left out), "-" for a rest,
// and "+" to stack a chord. Rows cover C3 to B5 in the song's scale; Bass sounds an octave below what is written.
const SONG_LEAD_IN_BEATS = 0.25;   // nudges every note off the pane's left edge; the song keeps its timing
const NOTE_PATTERN = /^([A-G])([#b]?)(\d)$/;
const NOTE_SEMITONES = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

const FRERE_JACQUES = 'C4 D4 E4 C4 C4 D4 E4 C4 E4 F4 G4:2 E4 F4 G4:2 '
  + 'G4:0.5 A4:0.5 G4:0.5 F4:0.5 E4 C4 G4:0.5 A4:0.5 G4:0.5 F4:0.5 E4 C4 C4 G3 C4:2 C4 G3 C4:2';

const SONGS = [
  {
    id: 'twinkle',
    title: 'Twinkle Twinkle Little Star',
    credit: 'Traditional',
    scale: 'Major',
    beats: 48,
    loopSeconds: 24,
    tracks: [
      {
        name: 'Melody',
        instrument: 'piano',
        notes: 'C4 C4 G4 G4 A4 A4 G4:2 F4 F4 E4 E4 D4 D4 C4:2 G4 G4 F4 F4 E4 E4 D4:2 '
          + 'G4 G4 F4 F4 E4 E4 D4:2 C4 C4 G4 G4 A4 A4 G4:2 F4 F4 E4 E4 D4 D4 C4:2',
      },
      {
        name: 'Bass',
        instrument: 'bass',
        notes: 'C3:2 C3:2 F3:2 C3:2 F3:2 C3:2 G3:2 C3:2 C3:2 F3:2 C3:2 G3:2 '
          + 'C3:2 F3:2 C3:2 G3:2 C3:2 C3:2 F3:2 C3:2 F3:2 C3:2 G3:2 C3:2',
      },
    ],
  },
  {
    id: 'mary',
    title: 'Mary Had a Little Lamb',
    credit: 'Traditional',
    scale: 'Major',
    beats: 32,
    loopSeconds: 16,
    tracks: [
      {
        name: 'Melody',
        instrument: 'bell',
        notes: 'E4 D4 C4 D4 E4 E4 E4:2 D4 D4 D4:2 E4 G4 G4:2 E4 D4 C4 D4 E4 E4 E4 E4 D4 D4 E4 D4 C4:4',
      },
      { name: 'Bass', instrument: 'bass', notes: 'C3:4 C3:4 G3:4 C3:4 C3:4 C3:4 G3:4 C3:4' },
    ],
  },
  {
    id: 'frere-jacques',
    title: 'Frère Jacques (round)',
    credit: 'Traditional',
    scale: 'Major',
    beats: 32,
    loopSeconds: 16,
    tracks: [   // a round: every voice sings the same tune, each one entering two bars after the last
      { name: 'Voice 1', instrument: 'kalimba', notes: FRERE_JACQUES },
      { name: 'Voice 2', instrument: 'marimba', notes: FRERE_JACQUES, offsetBeats: 8 },
      { name: 'Voice 3', instrument: 'harp', notes: FRERE_JACQUES, offsetBeats: 16 },
    ],
  },
  {
    id: 'ode-to-joy',
    title: 'Ode to Joy',
    credit: 'Ludwig van Beethoven',
    scale: 'Major',
    beats: 32,
    loopSeconds: 16,
    tracks: [
      {
        name: 'Melody',
        instrument: 'flute',
        notes: 'E4 E4 F4 G4 G4 F4 E4 D4 C4 C4 D4 E4 E4:1.5 D4:0.5 D4:2 '
          + 'E4 E4 F4 G4 G4 F4 E4 D4 C4 C4 D4 E4 D4:1.5 C4:0.5 C4:2',
      },
      {
        name: 'Chords',
        instrument: 'strings',
        notes: 'C4+E4:4 G3+B3:4 C4+E4:4 G3+B3:4 C4+E4:4 G3+B3:4 C4+E4:4 G3+B3:2 C4+E4:2',
      },
    ],
  },
  {
    id: 'jingle-bells',
    title: 'Jingle Bells (chorus)',
    credit: 'James Lord Pierpont',
    scale: 'Major',
    beats: 64,
    loopSeconds: 32,
    tracks: [
      {
        name: 'Melody',
        instrument: 'bell',
        notes: 'E4 E4 E4:2 E4 E4 E4:2 E4 G4 C4:1.5 D4:0.5 E4:4 F4 F4 F4:1.5 F4:0.5 F4 E4 E4 E4:0.5 E4:0.5 '
          + 'E4 D4 D4 E4 D4:2 G4:2 E4 E4 E4:2 E4 E4 E4:2 E4 G4 C4:1.5 D4:0.5 E4:4 '
          + 'F4 F4 F4 F4 F4 E4 E4 E4:0.5 E4:0.5 G4 G4 F4 D4 C4:4',
      },
      {
        name: 'Bass',
        instrument: 'bass',
        notes: 'C3:4 C3:4 C3:4 C3:4 F3:4 C3:4 D3:4 G3:4 C3:4 C3:4 C3:4 C3:4 F3:4 C3:4 G3:4 C3:4',
      },
    ],
  },
];

function midiFromName(name) {
  const match = NOTE_PATTERN.exec(name);
  if (!match) throw new Error(`Unreadable note "${name}"`);
  const [, letter, accidental, octave] = match;
  const shift = accidental === '#' ? 1 : accidental === 'b' ? -1 : 0;
  return 12 * (Number(octave) + 1) + NOTE_SEMITONES[letter] + shift;
}

// The inverse of midiFor() in audio.js: the garden height whose row plays this note in the given scale.
function yForMidi(midi, scale) {
  const steps = SCALES[scale];
  const rows = steps.length * OCTAVES;
  const offset = midi - BASE_MIDI;
  const degree = steps.indexOf(((offset % 12) + 12) % 12);
  const fromBottom = Math.floor(offset / 12) * steps.length + degree;
  if (degree === -1 || fromBottom < 0 || fromBottom >= rows) {
    throw new Error(`Note ${midi} isn't playable in the ${scale} garden`);
  }
  return (rows - 1 - fromBottom + 0.5) / rows;
}

function parseTrack(notes) {
  const events = [];
  let beat = 0;
  for (const token of notes.trim().split(/\s+/)) {
    const [pitch, length = '1'] = token.split(':');
    const beats = Number(length);
    if (!(beats > 0)) throw new Error(`Bad note length in "${token}"`);
    if (pitch !== '-') events.push({ beat, midis: pitch.split('+').map(midiFromName) });
    beat += beats;
  }
  return { events, beats: beat };
}

function songToGardens(song) {
  return song.tracks.map((track) => {
    const { events } = parseTrack(track.notes);
    const offset = track.offsetBeats || 0;
    const flowers = events.flatMap(({ beat, midis }) => {
      const x = (((beat + offset) % song.beats) + SONG_LEAD_IN_BEATS) / song.beats;
      return midis.map((midi) => makeFlower(x, yForMidi(midi, song.scale), track.instrument));
    });
    return makeGarden(track.name, flowers);
  });
}
