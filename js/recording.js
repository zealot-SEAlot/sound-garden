/* Recording: capture the canvas plus garden audio for a set number of loops, with the UI hidden. */

const RECORD_LOOP_CHOICES = [1, 2, 4, 8];
const COUNTDOWN_SECONDS = 3;
const RECORD_TAIL_MS = 1500;   // let the last notes ring out after the final loop
const RECORD_FPS = 60;
const RECORD_VIDEO_BPS = 8_000_000;
const RECORDING_TYPES = [
  ['video/webm;codecs=vp9,opus', 'webm'],
  ['video/webm;codecs=vp8,opus', 'webm'],
  ['video/webm', 'webm'],
  ['video/mp4', 'mp4'],
];

let recordLoops = RECORD_LOOP_CHOICES[0];
let recording = null;          // { stage: 'countdown' | 'recording' | 'tail', loops, loopsDone, recorder, timer }
let resultUrl = null;

const recordBtn = document.getElementById('record');
const recordLoopsSelect = document.getElementById('recordLoops');
const countdownEl = document.getElementById('countdown');
const countdownNum = document.getElementById('countdownNum');
const countdownInfo = document.getElementById('countdownInfo');
const resultEl = document.getElementById('result');
const resultVideo = document.getElementById('resultVideo');
const downloadLink = document.getElementById('download');

const recordingType = window.MediaRecorder && canvas.captureStream
  ? RECORDING_TYPES.find(([type]) => MediaRecorder.isTypeSupported(type)) || null
  : null;

const isFinalRecordedLoop = () => recording?.stage === 'recording' && recording.loopsDone + 1 >= recording.loops;

function renderRecordLoopOptions() {
  recordLoopsSelect.replaceChildren(...RECORD_LOOP_CHOICES.map((n) =>
    new Option(`${n} loop${n > 1 ? 's' : ''} · ${n * loopSeconds}s`, String(n))));
  recordLoopsSelect.value = String(recordLoops);
}

function fileStamp(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-`
    + `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

function setRecordingMode(on) {
  document.body.classList.toggle('recording', on);
  relayout();   // gardens fill the whole screen while the UI is hidden
}

function startCountdown() {
  if (recording || !recordingType) return;
  ensureAudio();
  hideHint();
  hideToast();
  closeResult();
  closeInstrumentMenu();
  closeHelp();
  closeLibrary();
  recording = { stage: 'countdown', loops: recordLoops, loopsDone: 0, recorder: null, timer: null };
  setRecordingMode(true);
  setRunning(false);
  phase = 0;
  countdownInfo.textContent = `Recording ${recordLoops} loop${recordLoops > 1 ? 's' : ''} · Esc to stop`;
  countdownEl.hidden = false;
  tickCountdown(COUNTDOWN_SECONDS);
}

function tickCountdown(remaining) {
  if (recording?.stage !== 'countdown') return;
  if (remaining === 0) {
    countdownEl.hidden = true;
    beginRecording();
    return;
  }
  countdownNum.textContent = remaining;
  recording = { ...recording, timer: setTimeout(() => tickCountdown(remaining - 1), 1000) };
}

function beginRecording() {
  const [mimeType, ext] = recordingType;
  try {
    const audioTap = audio.ac.createMediaStreamDestination();
    audio.mix.connect(audioTap);
    const stream = new MediaStream([
      ...canvas.captureStream(RECORD_FPS).getVideoTracks(),
      ...audioTap.stream.getAudioTracks(),
    ]);
    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: RECORD_VIDEO_BPS });
    const chunks = [];
    recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    recorder.onerror = (e) => {
      console.error('Recording error', e.error);
      showToast('Recording hit a problem and stopped early.');
    };
    recorder.onstop = () => finishRecording({ chunks, mimeType, ext, stream, audioTap });
    recording = { ...recording, stage: 'recording', recorder };
    phase = 0;
    recorder.start(1000);
    setRunning(true);
  } catch (err) {
    console.error('Recording could not start', err);
    endRecordingMode();
    showToast("Couldn't start recording in this browser.");
  }
}

function onLoopWrapped() {
  if (recording?.stage !== 'recording') return;
  const loopsDone = recording.loopsDone + 1;
  if (loopsDone < recording.loops) {
    recording = { ...recording, loopsDone };
    return;
  }
  setRunning(false);
  recording = { ...recording, loopsDone, stage: 'tail', timer: setTimeout(stopRecording, RECORD_TAIL_MS) };
}

function stopRecording() {
  if (!recording) return;
  clearTimeout(recording.timer);
  if (recording.recorder && recording.recorder.state !== 'inactive') {
    recording.recorder.stop();   // finishRecording runs from onstop
    return;
  }
  endRecordingMode();
}

function endRecordingMode() {
  recording = null;
  countdownEl.hidden = true;
  setRecordingMode(false);
  setRunning(true);
}

function finishRecording({ chunks, mimeType, ext, stream, audioTap }) {
  stream.getTracks().forEach((track) => track.stop());
  audio.mix.disconnect(audioTap);
  endRecordingMode();
  if (!chunks.length) {
    showToast('Nothing was recorded — try again.');
    return;
  }
  showResult(new Blob(chunks, { type: mimeType.split(';')[0] }), ext);
}

function showResult(blob, ext) {
  closeResult();
  resultUrl = URL.createObjectURL(blob);
  resultVideo.src = resultUrl;
  downloadLink.href = resultUrl;
  downloadLink.download = `sound-garden-${fileStamp()}.${ext}`;
  resultEl.hidden = false;
  setRunning(false);   // keep the gardens quiet while you watch the preview
}

function closeResult() {
  if (resultEl.hidden) return;
  resultVideo.pause();
  resultVideo.removeAttribute('src');
  resultVideo.load();
  URL.revokeObjectURL(resultUrl);
  resultUrl = null;
  resultEl.hidden = true;
  setRunning(true);
}

recordBtn.addEventListener('click', startCountdown);
document.getElementById('closeResult').addEventListener('click', closeResult);
recordLoopsSelect.addEventListener('change', () => {
  recordLoops = Number(recordLoopsSelect.value);
  save();
});
document.addEventListener('visibilitychange', () => {
  if (!document.hidden || !recording) return;
  stopRecording();   // browsers freeze animation in background tabs, which would ruin the video
  showToast('Recording stopped because the tab was hidden. Keep Sound Garden on screen while recording.');
});
if (!recordingType) {
  recordBtn.disabled = true;
  recordLoopsSelect.disabled = true;
  recordBtn.title = "Recording isn't supported in this browser";
}
