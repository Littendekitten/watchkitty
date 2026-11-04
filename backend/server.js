// WatchKitty backend: download raw upload -> FFmpeg HLS -> upload -> Firestore
import express from "express";
import cors from "cors";
import admin from "firebase-admin";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

// ---------- Config ----------
const PORT = process.env.PORT || 10000;
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "http://localhost:5173")
  .split(",")
  .map((s) => s.trim());
const RAW_BUCKET = process.env.FIREBASE_STORAGE_BUCKET; // e.g. my-app.appspot.com
const PROCESSED_BUCKET = process.env.PROCESSED_BUCKET || RAW_BUCKET; // public-read bucket for HLS output
const MAX_CONCURRENT_JOBS = Number(process.env.MAX_CONCURRENT_JOBS || 1);

// FIREBASE_SERVICE_ACCOUNT = full service-account JSON as a single env var
admin.initializeApp({
  credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)),
  storageBucket: RAW_BUCKET,
});
const db = admin.firestore();
const rawBucket = admin.storage().bucket(RAW_BUCKET);
const processedBucket = admin.storage().bucket(PROCESSED_BUCKET);

// ---------- Helpers ----------
function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args);
    let out = "";
    let err = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err = (err + d).slice(-4000))); // keep tail only
    p.on("error", reject);
    p.on("close", (code) =>
      code === 0 ? resolve(out) : reject(new Error(`${cmd} exited ${code}: ${err}`))
    );
  });
}

async function probe(file) {
  const out = await run("ffprobe", [
    "-v", "error", "-print_format", "json", "-show_streams", "-show_format", file,
  ]);
  const info = JSON.parse(out);
  const video = info.streams.find((s) => s.codec_type === "video");
  if (!video) throw new Error("File contains no video stream");
  return {
    duration: Math.round(Number(info.format.duration) || 0),
    hasAudio: info.streams.some((s) => s.codec_type === "audio"),
    width: video.width,
    height: video.height,
  };
}

async function makeHls(input, outDir, hasAudio) {
  await fs.mkdir(path.join(outDir, "v0"), { recursive: true });
  await fs.mkdir(path.join(outDir, "v1"), { recursive: true });

  const args = [
    "-y", "-i", input,
    "-filter_complex",
    "[0:v]split=2[a][b];[a]scale=-2:720[v720];[b]scale=-2:480[v480]",
    "-map", "[v720]",
  ];
  if (hasAudio) args.push("-map", "a:0");
  args.push("-map", "[v480]");
  if (hasAudio) args.push("-map", "a:0");

  args.push(
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "23",
    "-profile:v", "main", "-sc_threshold", "0", "-g", "48", "-keyint_min", "48",
    "-b:v:0", "2800k", "-maxrate:v:0", "3000k", "-bufsize:v:0", "5600k",
    "-b:v:1", "1400k", "-maxrate:v:1", "1500k", "-bufsize:v:1", "2800k"
  );
  if (hasAudio) args.push("-c:a", "aac", "-b:a", "128k", "-ac", "2");

  args.push(
    "-f", "hls", "-hls_time", "6", "-hls_playlist_type", "vod",
    "-hls_segment_filename", path.join(outDir, "v%v", "seg_%03d.ts"),
    "-master_pl_name", "master.m3u8",
    "-var_stream_map", hasAudio ? "v:0,a:0 v:1,a:1" : "v:0 v:1",
    path.join(outDir, "v%v", "index.m3u8")
  );
  await run("ffmpeg", args);
}

async function makeThumbnail(input, outFile, duration) {
  const ts = Math.min(1, Math.max(0, duration / 2));
  await run("ffmpeg", [
    "-y", "-ss", String(ts), "-i", input, "-frames:v", "1",
    "-vf", "scale=640:-2", "-q:v", "3", outFile,
  ]);
}

const CONTENT_TYPES = {
  ".m3u8": "application/vnd.apple.mpegurl",
  ".ts": "video/mp2t",
  ".jpg": "image/jpeg",
};

async function* walk(dir) {
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else yield p;
  }
}

async function uploadDir(localDir, remotePrefix) {
  for await (const file of walk(localDir)) {
    const rel = path.relative(localDir, file).split(path.sep).join("/");
    const ext = path.extname(file);
    await processedBucket.upload(file, {
      destination: `${remotePrefix}/${rel}`,
      metadata: {
        contentType: CONTENT_TYPES[ext] || "application/octet-stream",
        // playlists are tiny and VOD-final; segments are immutable
        cacheControl: "public, max-age=31536000, immutable",
      },
    });
  }
}

// Public URL that keeps relative paths working for HLS (do NOT use firebasestorage ?alt=media URLs)
const publicUrl = (objectPath) =>
  `https://storage.googleapis.com/${PROCESSED_BUCKET}/${objectPath}`;

// ---------- Pipeline ----------
async function processVideo({ videoId, rawPath }) {
  const videoRef = db.collection("videos").doc(videoId);
  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), `wk-${videoId}-`));
  try {
    const inputFile = path.join(workDir, "input" + (path.extname(rawPath) || ".mp4"));
    await rawBucket.file(rawPath).download({ destination: inputFile });

    const meta = await probe(inputFile);
    const outDir = path.join(workDir, "out");
    await fs.mkdir(outDir, { recursive: true });

    await makeHls(inputFile, outDir, meta.hasAudio);
    await makeThumbnail(inputFile, path.join(outDir, "thumbnail.jpg"), meta.duration);

    const prefix = `processed-videos/${videoId}`;
    await uploadDir(outDir, prefix);

    await videoRef.update({
      status: "ready",
      hlsUrl: publicUrl(`${prefix}/master.m3u8`),
      thumbnailUrl: publicUrl(`${prefix}/thumbnail.jpg`),
      duration: meta.duration,
      width: meta.width,
      height: meta.height,
      error: null,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    await rawBucket.file(rawPath).delete({ ignoreNotFound: true });
    console.log(`[${videoId}] ready`);
  } catch (err) {
    console.error(`[${videoId}] failed:`, err.message);
    await videoRef.update({
      status: "failed",
      error: String(err.message).slice(0, 500),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  } finally {
    await fs.rm(workDir, { recursive: true, force: true });
  }
}

// Minimal in-memory queue (swap for Cloud Tasks / BullMQ if you scale out)
const queue = [];
let active = 0;
function enqueue(job) {
  queue.push(job);
  pump();
}
function pump() {
  while (active < MAX_CONCURRENT_JOBS && queue.length) {
    const job = queue.shift();
    active++;
    processVideo(job).finally(() => {
      active--;
      pump();
    });
  }
}

// ---------- HTTP ----------
const app = express();
app.use(cors({ origin: ALLOWED_ORIGINS }));
app.use(express.json({ limit: "100kb" }));

async function requireAuth(req, res, next) {
  const token = (req.headers.authorization || "").replace(/^Bearer /, "");
  if (!token) return res.status(401).json({ error: "Missing token" });
  try {
    req.user = await admin.auth().verifyIdToken(token);
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
}

app.get("/health", (_req, res) => res.json({ ok: true, queued: queue.length, active }));

app.post("/api/videos/process", requireAuth, async (req, res) => {
  const { videoId, title, description = "", tags = [] } = req.body || {};
  if (!videoId || !/^[A-Za-z0-9_-]{6,64}$/.test(videoId))
    return res.status(400).json({ error: "Invalid videoId" });
  if (!title || typeof title !== "string" || title.length > 100)
    return res.status(400).json({ error: "Title required (max 100 chars)" });

  // Never trust a client-supplied path: derive it from videoId
  const rawPath = `raw-uploads/${req.user.uid}/${videoId}.mp4`;
  const [exists] = await rawBucket.file(rawPath).exists();
  if (!exists) return res.status(404).json({ error: "Raw upload not found" });

  const videoRef = db.collection("videos").doc(videoId);
  const existing = await videoRef.get();
  if (existing.exists && existing.data().uploaderId !== req.user.uid)
    return res.status(403).json({ error: "Not your video" });

  const userSnap = await db.collection("users").doc(req.user.uid).get();
  const u = userSnap.data() || {};

  await videoRef.set(
    {
      title: title.trim(),
      description: String(description).slice(0, 5000),
      tags: Array.isArray(tags) ? tags.slice(0, 10).map(String) : [],
      uploaderId: req.user.uid,
      uploaderName: u.displayName || req.user.name || "Anonymous",
      uploaderPhotoURL: u.photoURL || req.user.picture || null,
      status: "processing",
      visibility: "public",
      hlsUrl: null,
      thumbnailUrl: null,
      duration: null,
      viewCount: 0,
      likeCount: 0,
      commentCount: 0,
      createdAt: existing.exists
        ? existing.data().createdAt
        : admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  enqueue({ videoId, rawPath });
  res.status(202).json({ videoId, status: "processing" });
});

app.listen(PORT, () => console.log(`WatchKitty backend on :${PORT}`));
