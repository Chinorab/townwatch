// Assembles docs/media/townwatch-demo.mp4 from the recorded take (record.mjs), the cards, the
// voice-over and its subtitles. Each passage of the take is cut to the length of its narration;
// the live analysis is sped up, and says so on screen.
//   node docs/media/build-video.mjs
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, resolve } from "node:path";

const FFMPEG = process.env.FFMPEG ?? "C:/Users/Anas/AppData/Local/Microsoft/WinGet/Links/ffmpeg.exe";
const M = "docs/media";
const TAKE = join(M, "raw/take");
const WORK = join(M, "work");
rmSync(WORK, { recursive: true, force: true });
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

const take = JSON.parse(readFileSync(join(TAKE, "take.json"), "utf8"));
const frames = take.frames.slice().sort((a, b) => a.t - b.t);
const mark = (b) => {
  const m = take.marks.find((x) => x.beat === b);
  if (!m) throw new Error(`No mark ${b}`);
  return m.t;
};

/** Writes a clip of the take between t0 and t1 (wall-clock seconds), played `speed` times faster. */
function clip(name, t0, t1, speed = 1, label = "") {
  const list = [];
  const inside = frames.filter((f) => f.t >= t0 && f.t < t1);
  const before = frames.filter((f) => f.t < t0).at(-1);
  const seq = before ? [{ ...before, t: t0 }, ...inside] : inside;
  seq.forEach((f, i) => {
    const next = i + 1 < seq.length ? seq[i + 1].t : t1;
    list.push(`file '${resolve(TAKE, "frames", f.name).replace(/\\/g, "/")}'`, `duration ${((next - f.t) / speed).toFixed(4)}`);
  });
  list.push(`file '${resolve(TAKE, "frames", seq.at(-1).name).replace(/\\/g, "/")}'`);
  const txt = join(WORK, `${name}.txt`);
  writeFileSync(txt, list.join("\n"));
  const vf = ["scale=1920:1080:flags=lanczos", "fps=30", "format=yuv420p"];
  if (label) vf.push(`drawtext=text='${label}':fontfile='C\\:/Windows/Fonts/segoeui.ttf':fontsize=34:fontcolor=white:box=1:boxcolor=0x16181dcc:boxborderw=18:x=w-tw-60:y=60`);
  ff(["-f", "concat", "-safe", "0", "-i", txt, "-vf", vf.join(","), "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-r", "30", join(WORK, `${name}.mp4`)]);
  return join(WORK, `${name}.mp4`);
}

function card(name, png, seconds) {
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
    const intro = r - a, outro = 6;
    const middle = Math.max(want - intro - outro, 6);
    parts.push(clip("07a-live", a, r));
    const factor = (d - r) / middle;
    parts.push(clip("07b-live", r, d, factor, `Sped up ${Math.round(factor)}x`));
    parts.push(clip("07c-live", d, d + outro));
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

// Voice: each beat's audio placed at its beat start.
const filters = [];
const inputs = [];
BEATS.forEach((_, b) => {
  const from = starts[b], to = b + 1 < starts.length ? starts[b + 1] : voiceEnd + 0.5;
  filters.push(`[1:a]atrim=${from.toFixed(3)}:${to.toFixed(3)},asetpts=PTS-STARTPTS,adelay=${Math.round(beatStartOut[b] * 1000)}|${Math.round(beatStartOut[b] * 1000)}[a${b}]`);
  inputs.push(`[a${b}]`);
});
filters.push(`${inputs.join("")}amix=inputs=${inputs.length}:normalize=0[aout]`);
const subs = resolve(WORK, "subs.srt").replace(/\\/g, "/").replace(":", "\\:");
ff([
  "-i", join(WORK, "silent.mp4"), "-i", join(M, "voiceover.mp3"),
  "-filter_complex", `${filters.join(";")};[0:v]subtitles='${subs}':force_style='FontName=Segoe UI,FontSize=17,PrimaryColour=&H00FFFFFF,BackColour=&H99161816,BorderStyle=4,Outline=0,Shadow=0,MarginV=36'[vout]`,
  "-map", "[vout]", "-map", "[aout]", "-c:v", "libx264", "-preset", "medium", "-crf", "19", "-c:a", "aac", "-b:a", "160k", "-shortest",
  join(M, "townwatch-demo.mp4"),
]);
const total = +execFileSync(FFMPEG.replace("ffmpeg.exe", "ffprobe.exe"), ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", join(M, "townwatch-demo.mp4")]).toString();
console.log(`docs/media/townwatch-demo.mp4: ${total.toFixed(1)} s`);
