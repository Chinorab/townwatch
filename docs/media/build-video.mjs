// Assembles docs/media/townwatch-demo.mp4 from the recorded take (record.mjs), the cards, the
// voice-over and its subtitles. Each passage of the take is cut to the length of its narration;
// the live analysis is sped up, and says so on screen.
//   node docs/media/build-video.mjs
import { readFileSync, writeFileSync, mkdirSync, rmSync, linkSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, resolve } from "node:path";

const FFMPEG = process.env.FFMPEG ?? "C:/Users/Anas/AppData/Local/Microsoft/WinGet/Links/ffmpeg.exe";
const M = "docs/media";
const TAKE = join(M, "raw/take");
const WORK = join(M, "work");
const REUSE = Boolean(process.env.REUSE); // keep clips already built in docs/media/work
if (!REUSE) rmSync(WORK, { recursive: true, force: true });
mkdirSync(WORK, { recursive: true });
const ff = (args) => execFileSync(FFMPEG, ["-v", "error", "-y", ...args], { stdio: "inherit" });

// Voice-over cues.
const cues = readFileSync(join(M, "voiceover.srt"), "utf8")
  .replace(/^\uFEFF/, "")
  .split(/\r?\n\s*\r?\n/)
  .map((b) => b.trim().split(/\r?\n/))
  .filter((l) => l.length >= 3)
  .map((l) => {
    const [a, c] = l[1].split(" --> ").map((x) => {
      const [h, m, s] = x.trim().replace(",", ".").split(":");
      return +h * 3600 + +m * 60 + +s;
    });
    return { a, c, text: l.slice(2).join(" ") };
  });
const cueAt = (words) => {
  const c = cues.find((x) => x.text.startsWith(words));
  if (!c) throw new Error(`No cue starts with "${words}"`);
  return c.a;
};

const TITLE = 3.0; // seconds of title card before the voice starts
const BEATS = [
  ["home", "In two hundred"],
  ["search", "Townwatch reads it"],
  ["briefing", "This is Edgecombe"],
  ["citation", "Every sentence links"],
  ["near", "Near you ranks"],
  ["made", "Here is how"],
  ["live", "Now "],
  ["arch", "A small model"],
  ["closing", "Townwatch."],
];
const starts = BEATS.map(([, w]) => cueAt(w));
const voiceEnd = cues.at(-1).c;
const span = (i) => (i + 1 < starts.length ? starts[i + 1] : voiceEnd + 2.5) - starts[i];

const load = (dir) => {
  const j = JSON.parse(readFileSync(join(dir, "take.json"), "utf8"));
  return { dir, marks: j.marks, frames: j.frames.slice().sort((a, b) => a.t - b.t) };
};
const take = load(TAKE);
// The finished briefing of the live place, filmed again after a label fix (record.mjs OUTRO_ONLY).
const outro = load(join(M, "raw/outro"));
const mark = (b, src = take) => {
  const m = src.marks.find((x) => x.beat === b);
  if (!m) throw new Error(`No mark ${b}`);
  return m.t;
};

/** Writes a clip of a take between t0 and t1 (wall-clock seconds), played `speed` times faster:
 *  a constant 30 fps sequence where each output frame shows the screen as it was at that instant. */
function clip(name, t0, t1, speed = 1, label = "", src = take) {
  if (REUSE && existsSync(join(WORK, `${name}.mp4`))) return join(WORK, `${name}.mp4`);
  const { frames } = src;
  const dir = join(WORK, name);
  mkdirSync(dir, { recursive: true });
  const n = Math.max(1, Math.round(((t1 - t0) / speed) * 30));
  let j = 0;
  for (let k = 0; k < n; k++) {
    const tt = t0 + (k / 30) * speed;
    while (j + 1 < frames.length && frames[j + 1].t <= tt) j++;
    linkSync(resolve(src.dir, "frames", frames[j].name), join(dir, `${String(k).padStart(6, "0")}.jpg`));
  }
  const vf = ["scale=1920:1080:flags=lanczos", "format=yuv420p"];
  if (label) vf.push(`drawtext=text='${label}':fontfile='C\\:/Windows/Fonts/segoeui.ttf':fontsize=34:fontcolor=white:box=1:boxcolor=0x16181dcc:boxborderw=18:x=w-tw-60:y=60`);
  ff(["-framerate", "30", "-i", join(dir, "%06d.jpg"), "-vf", vf.join(","), "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-r", "30", join(WORK, `${name}.mp4`)]);
  return join(WORK, `${name}.mp4`);
}

function card(name, png, seconds) {
  if (REUSE && existsSync(join(WORK, `${name}.mp4`))) return join(WORK, `${name}.mp4`);
  ff(["-loop", "1", "-t", seconds.toFixed(3), "-i", join(M, "cards", png), "-vf", "scale=1920:1080,fps=30,format=yuv420p", "-c:v", "libx264", "-preset", "medium", "-crf", "18", join(WORK, `${name}.mp4`)]);
  return join(WORK, `${name}.mp4`);
}

const parts = [card("00-title", "01-title.png", TITLE)];
const screen = ["home", "search", "briefing", "citation", "near", "made"];
const nextMark = { home: "search", search: "briefing", briefing: "citation", citation: "near", near: "made", made: "live" };
BEATS.forEach(([beat], i) => {
  const want = span(i);
  if (screen.includes(beat)) {
    const t0 = mark(beat);
    const next = take.marks.some((m) => m.beat === nextMark[beat]) ? nextMark[beat] : "end";
    const have = mark(next) - t0;
    // Fit the footage to the narration: hold the last frame if it is short, speed up gently if long.
    const speed = have > want ? Math.min(have / want, 1.6) : 1;
    const t1 = t0 + want * speed;
    parts.push(clip(`${String(i + 1).padStart(2, "0")}-${beat}`, t0, t1, speed));
  } else if (beat === "live") {
    const a = mark("live"), r = mark("live-running"), d = mark("live-done");
    const intro = r - a, outroLen = 9;
    const middle = Math.max(want - intro - outroLen, 6);
    parts.push(clip("07a-live", a, r));
    const factor = (d - r) / middle;
    parts.push(clip("07b-live", r, d, factor, `Sped up ${Math.round(factor)}x`));
    parts.push(clip("07c-live", mark("outro", outro), mark("outro", outro) + outroLen, 1, "", outro));
  } else if (beat === "arch") {
    parts.push(card("08-arch", "03-architecture.png", want));
  } else if (beat === "closing") {
    parts.push(card("09-closing", "04-closing.png", want));
  }
});

// Concatenate, then lay the voice and the subtitles (shifted by the title card) over it.
writeFileSync(join(WORK, "parts.txt"), parts.map((p) => `file '${resolve(p).replace(/\\/g, "/")}'`).join("\n"));
ff(["-f", "concat", "-safe", "0", "-i", join(WORK, "parts.txt"), "-c", "copy", join(WORK, "silent.mp4")]);

const fmt = (t) => {
  const ms = Math.round(t * 1000);
  const h = Math.floor(ms / 3_600_000), m = Math.floor(ms / 60_000) % 60, s = Math.floor(ms / 1000) % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(ms % 1000).padStart(3, "0")}`;
};
// Screen footage may not line up exactly with the cue starts: re-time cues to each beat's start.
const beatStartOut = [];
{
  let t = TITLE;
  const lengths = parts.slice(1).map((p) => +execFileSync(FFMPEG.replace("ffmpeg.exe", "ffprobe.exe"), ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", p]).toString());
  // parts after the title: one per beat, except live (3 parts).
  let k = 0;
  for (const [beat] of BEATS) {
    beatStartOut.push(t);
    const n = beat === "live" ? 3 : 1;
    for (let j = 0; j < n; j++) t += lengths[k++];
  }
}
const shifted = cues.map((c, i) => {
  const b = starts.findLastIndex((s) => s <= c.a + 1e-6);
  const delta = beatStartOut[b] - starts[b];
  return `${i + 1}\n${fmt(c.a + delta)} --> ${fmt(c.c + delta)}\n${c.text}\n`;
});
writeFileSync(join(WORK, "subs.srt"), shifted.join("\n"));

// Voice: one piece per beat, padded with silence to the beat's length, joined end to end.
const probe = (f) => +execFileSync(FFMPEG.replace("ffmpeg.exe", "ffprobe.exe"), ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]).toString();
const pieces = [join(WORK, "a-title.wav")];
ff(["-f", "lavfi", "-t", String(TITLE), "-i", "anullsrc=r=24000:cl=mono", pieces[0]]);
BEATS.forEach((_, b) => {
  const from = starts[b], to = b + 1 < starts.length ? starts[b + 1] : voiceEnd + 0.3;
  const len = (b + 1 < beatStartOut.length ? beatStartOut[b + 1] : probe(join(WORK, "silent.mp4"))) - beatStartOut[b];
  const out = join(WORK, `a-${b}.wav`);
  ff(["-i", join(M, "voiceover.mp3"), "-af", `atrim=${from.toFixed(3)}:${to.toFixed(3)},asetpts=PTS-STARTPTS,apad,atrim=0:${len.toFixed(3)}`, "-ar", "24000", "-ac", "1", out]);
  pieces.push(out);
});
writeFileSync(join(WORK, "audio.txt"), pieces.map((p) => `file '${resolve(p).replace(/\\/g, "/")}'`).join("\n"));
ff(["-f", "concat", "-safe", "0", "-i", join(WORK, "audio.txt"), join(WORK, "voice.wav")]);
const silentLength = +execFileSync(FFMPEG.replace("ffmpeg.exe", "ffprobe.exe"), ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", join(WORK, "silent.mp4")]).toString();
const subs = resolve(WORK, "subs.srt").replace(/\\/g, "/").replace(":", "\\:");
ff([
  "-i", join(WORK, "silent.mp4"), "-i", join(WORK, "voice.wav"),
  "-filter_complex", `[0:v]subtitles='${subs}':force_style='FontName=Segoe UI,FontSize=13,PrimaryColour=&H00FFFFFF,BackColour=&H18161816,BorderStyle=4,Outline=0,Shadow=0,MarginV=10'[vout]`,
  "-map", "[vout]", "-map", "1:a", "-c:v", "libx264", "-preset", "medium", "-crf", "19", "-c:a", "aac", "-b:a", "160k", "-t", String(silentLength),
  join(M, "townwatch-demo.mp4"),
]);
const total = +execFileSync(FFMPEG.replace("ffmpeg.exe", "ffprobe.exe"), ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", join(M, "townwatch-demo.mp4")]).toString();
console.log(`docs/media/townwatch-demo.mp4: ${total.toFixed(1)} s`);
