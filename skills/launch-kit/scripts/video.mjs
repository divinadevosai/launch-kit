#!/usr/bin/env node
// A short promo video from launch.json: title cards, screenshots with a slow push in, screen recordings,
// captions and an end card, at 1920×1080 and 30 fps. Needs ffmpeg.
// node video.mjs <launch.json>  → <out>/video/<name>-promo.mp4      (run shoot.mjs first)
//
// "video": { "sound": true, "scenes": [
//   { "title": "Your history is a *list*.", "seconds": 2.5 },
//   { "shot": "palace", "caption": "Loci turns it into a *building*.", "seconds": 4, "zoom": [1, 1.08], "focus": [0.5, 0.4] },
//   { "clip": "recording.mp4", "from": 3, "to": 9, "speed": 1.5, "caption": "…" },
//   { "end": { "text": "Your week, as a *place*.", "meta": "Free for Edge · nothing leaves your computer" }, "seconds": 4 } ] }
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { openFrames } from './stills.mjs';

const FPS = 30;
const W = 1920;
const H = 1080;

export async function video(configPath) {
  const config = JSON.parse(readFileSync(configPath, 'utf8'));
  const base = dirname(resolve(configPath));
  const outDir = resolve(base, config.out ?? '.');
  const work = join(outDir, 'video', 'parts');
  rmSync(work, { recursive: true, force: true });
  mkdirSync(work, { recursive: true });
  const scenes = config.video?.scenes ?? [];
  if (!scenes.length) throw new Error('launch.json has no video.scenes');

  const ff = (args) => {
    const r = spawnSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...args], { cwd: work, stdio: 'inherit' });
    if (r.status !== 0) throw new Error(`ffmpeg failed: ${args.join(' ')}`);
  };
  const enc = ['-an', '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', String(FPS)];
  const fit = `scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1`;

  const f = await openFrames(config, base);
  const parts = [];
  for (const [i, s] of scenes.entries()) {
    const part = `p${String(i).padStart(2, '0')}.mp4`;
    const seconds = s.seconds ?? (s.title ? 2.5 : s.end ? 4 : 3.5);
    const frames = Math.round(seconds * FPS);
    let caption = null;
    if (s.caption) caption = await f.frame('caption', { text: s.caption, width: W, height: H }, join(work, `c${i}.png`), true);
    const withCaption = caption ? `[v][1:v]overlay=0:0:format=auto[w];[w]` : '[v]';
    if (s.title || s.end) {
      const card = await f.frame(s.title ? 'title' : 'end', { ...(s.end ?? {}), text: s.title ?? s.end?.text, light: s.light, width: W, height: H }, join(work, `t${i}.png`));
      ff(['-loop', '1', '-t', String(seconds), '-i', card, '-vf', `fps=${FPS},fade=t=in:st=0:d=0.4`, ...enc, part]);
    } else if (s.shot) {
      // the 2× screenshot, cropped to 16:9 around the focus point, with a slow zoom
      const src = join(outDir, 'shots', `${s.shot}@2x.png`);
      const [z0, z1] = s.zoom ?? [1, 1.06];
      const [fx, fy] = s.focus ?? [0.5, 0.5];
      const z = `${z0}+${z1 - z0}*on/${frames}`;
      const vf = `crop=iw:iw*9/16:0:(ih-iw*9/16)*${fy},scale=${W * 2}:${H * 2},` +
        `zoompan=z='${z}':x='max(0,min(iw-iw/zoom,iw*${fx}-iw/zoom/2))':y='max(0,min(ih-ih/zoom,ih*${fy}-ih/zoom/2))':d=${frames}:s=${W}x${H}:fps=${FPS}`;
      ff(['-i', src, ...(caption ? ['-i', caption] : []), '-filter_complex', `[0:v]${vf}[v];${withCaption}fade=t=in:st=0:d=0.3[o]`, '-map', '[o]', '-frames:v', String(frames), ...enc, part]);
    } else if (s.clip) {
      const speed = s.speed ?? 1;
      ff([...(s.from != null ? ['-ss', String(s.from)] : []), ...(s.to != null ? ['-to', String(s.to)] : []), '-i', resolve(base, s.clip), ...(caption ? ['-i', caption] : []),
        '-filter_complex', `[0:v]setpts=PTS/${speed},${fit},fps=${FPS}[v];${withCaption}fade=t=in:st=0:d=0.25[o]`, '-map', '[o]', ...enc, part]);
    } else throw new Error(`scene ${i + 1} needs title, shot, clip or end`);
    parts.push(part);
  }
  await f.close();

  writeFileSync(join(work, 'parts.txt'), parts.map((p) => `file '${p}'`).join('\n') + '\n');
  ff(['-f', 'concat', '-safe', '0', '-i', 'parts.txt', '-c', 'copy', 'silent.mp4']);
  const total = parseFloat(spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', join(work, 'silent.mp4')]).stdout.toString());
  const name = (config.name ?? config.brand?.name ?? 'promo').toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const final = join(outDir, 'video', `${name}-promo.mp4`);
  if (config.video?.sound === false) ff(['-i', 'silent.mp4', '-c', 'copy', '-movflags', '+faststart', final]);
  else {
    // a quiet low drone, faded in and out: enough to stop the video feeling broken when sound is on
    ff(['-f', 'lavfi', '-i', `aevalsrc='0.10*sin(2*PI*55*t)+0.06*sin(2*PI*82.5*t)+0.035*sin(2*PI*110.4*t)*(0.6+0.4*sin(2*PI*0.25*t))':s=48000:d=${total.toFixed(2)}`,
      '-af', `afade=t=in:d=1.5,afade=t=out:st=${Math.max(0, total - 2.5).toFixed(2)}:d=2.5,lowpass=f=900`, '-c:a', 'pcm_s16le', 'score.wav']);
    ff(['-i', 'silent.mp4', '-i', 'score.wav', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-shortest', '-movflags', '+faststart', final]);
  }
  return { file: final, seconds: total };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (!process.argv[2]) {
    console.error('usage: node video.mjs <launch.json>');
    process.exit(2);
  }
  const { file, seconds } = await video(process.argv[2]);
  console.log(`video ${file} (${seconds.toFixed(1)} s)`);
}
