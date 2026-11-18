// Render reel.html frame by frame with Chromium and encode an Instagram Reel (1080x1920, H.264 + AAC).
//
//   node tools/render.mjs                       -> build/reel.mp4 (with music)
//   node tools/render.mjs --stills 0.5,3,8      -> build/still-<t>.png only (quick look at chosen moments)
//   node tools/render.mjs --fps 30 --out build/x.mp4 --audio build/music.wav
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const fps = Number(arg("fps", 30));
const out = path.resolve(root, arg("out", "build/reel.mp4"));
const audio = arg("audio", "build/music.wav");
const stills = arg("stills", null);
// --master: near-lossless file for archiving/editing (bigger); default: Instagram-friendly size
const master = process.argv.includes("--master");
const vq = master ? ["-crf", "12", "-preset", "slower", "-tune", "film"] : ["-crf", "20", "-maxrate", "10M", "-bufsize", "20M", "-preset", "slow"];
mkdirSync(path.join(root, "build"), { recursive: true });

const browser = await chromium.launch({ args: ["--force-color-profile=srgb", "--disable-lcd-text"] });
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
page.on("pageerror", (e) => { console.error("page error:", e.message); process.exitCode = 1; });
const pageFile = arg("page", "reel.html");
await page.goto("file://" + path.join(root, pageFile));
await page.evaluate(async () => {
  await window.ready;
  const fams = ["900 40px Vazir", "700 40px Vazir", "400 40px Vazir", "200 40px Vazir", "40px Lalezar", "700 40px Bodoni",
    "italic 400 40px Bodoni", "400 40px Bodoni", "700 40px Manrope", "400 40px Manrope"];
  await Promise.all(fams.map((f) => document.fonts.load(f, "سودا ab")));
});
const duration = await page.evaluate(() => window.DURATION);

const shoot = async (t, type = "jpeg") => {
  await page.evaluate((x) => window.renderAt(x), t);
  return page.screenshot(type === "png" ? { type } : { type, quality: 94 });
};

if (stills) {
  for (const s of stills.split(",").map(Number)) {
    const file = path.join(root, `build/${arg("prefix", "still")}-${s.toFixed(2)}.png`);
    await page.evaluate((x) => window.renderAt(x), s);
    await page.screenshot({ path: file });
    console.log(file);
  }
  await browser.close();
  process.exit(process.exitCode ?? 0);
}

const frames = Math.round(duration * fps);
const ff = spawn("ffmpeg", [
  "-hide_banner", "-loglevel", "error", "-y",
  "-f", "image2pipe", "-framerate", String(fps), "-c:v", "mjpeg", "-i", "-",
  ...(audio !== "none" ? ["-i", path.resolve(root, audio)] : []),
  "-map", "0:v", ...(audio !== "none" ? ["-map", "1:a", "-c:a", "aac", "-b:a", master ? "320k" : "256k", "-ar", "44100"] : []),
  "-c:v", "libx264", ...vq, "-pix_fmt", "yuv420p", "-profile:v", "high", "-level", "4.2",
  "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709",
  "-r", String(fps), "-t", String(duration), "-movflags", "+faststart", out,
], { stdio: ["pipe", "inherit", "inherit"] });

const started = Date.now();
for (let f = 0; f < frames; f++) {
  const buf = await shoot(f / fps);
  if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once("drain", r));
  if (f % 60 === 0) process.stdout.write(`\rframe ${f}/${frames}  ${((Date.now() - started) / 1000).toFixed(0)}s`);
}
ff.stdin.end();
await new Promise((r) => ff.on("close", r));
await browser.close();
console.log(`\n${out}`);
