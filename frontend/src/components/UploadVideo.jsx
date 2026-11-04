import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { collection, doc } from "firebase/firestore";
import { ref as storageRef, uploadBytesResumable } from "firebase/storage";
import { db, storage } from "../firebase";
import { useAuth } from "../context/AuthContext";
import { requestProcessing } from "../api";

const MAX_BYTES = 2 * 1024 * 1024 * 1024; // 2 GB, matches storage.rules

export default function UploadVideo() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const inputRef = useRef(null);

  const [file, setFile] = useState(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState("idle"); // idle | uploading | processing
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);

  function pick(f) {
    setError("");
    if (!f) return;
    if (!f.type.startsWith("video/")) return setError("Please choose a video file.");
    if (f.size > MAX_BYTES) return setError("That file is larger than 2 GB.");
    setFile(f);
    if (!title) setTitle(f.name.replace(/\.[^.]+$/, ""));
  }

  async function submit(e) {
    e.preventDefault();
    if (!file || !title.trim()) return;
    setError("");
    setPhase("uploading");
    setProgress(0);

    try {
      // A Firestore-generated ID is unique and matches what the backend accepts.
      const videoId = doc(collection(db, "videos")).id;
      const task = uploadBytesResumable(
        storageRef(storage, `raw-uploads/${user.uid}/${videoId}.mp4`),
        file,
        { contentType: file.type || "video/mp4" }
      );

      await new Promise((resolve, reject) => {
        task.on(
          "state_changed",
          (s) => setProgress(Math.round((s.bytesTransferred / s.totalBytes) * 100)),
          reject,
          resolve
        );
      });

      setPhase("processing");
      await requestProcessing({
        videoId,
        title: title.trim(),
        description: description.trim(),
        tags: tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
      });

      navigate(`/watch/${videoId}`);
    } catch (err) {
      console.error(err);
      setError(err.message || "Upload failed. Please try again.");
      setPhase("idle");
    }
  }

  const busy = phase !== "idle";

  return (
    <form className="upload" onSubmit={submit}>
      <div
        className={`dropzone ${dragOver ? "over" : ""} ${file ? "has-file" : ""}`}
        onClick={() => !busy && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (!busy) pick(e.dataTransfer.files?.[0]);
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept="video/*"
          hidden
          onChange={(e) => pick(e.target.files?.[0])}
        />
        {file ? (
          <>
            <strong>{file.name}</strong>
            <span className="muted small">{(file.size / 1024 / 1024).toFixed(1)} MB</span>
          </>
        ) : (
          <>
            <span className="dz-icon">🎬</span>
            <strong>Drag a video here or click to browse</strong>
            <span className="muted small">MP4, MOV, WebM… up to 2 GB</span>
          </>
        )}
      </div>

      <label>
        Title
        <input
          value={title}
          maxLength={100}
          onChange={(e) => setTitle(e.target.value)}
          disabled={busy}
          required
        />
      </label>

      <label>
        Description
        <textarea
          rows={4}
          value={description}
          maxLength={5000}
          onChange={(e) => setDescription(e.target.value)}
          disabled={busy}
        />
      </label>

      <label>
        Tags <span className="muted small">(comma separated)</span>
        <input
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          disabled={busy}
          placeholder="cats, funny, music"
        />
      </label>

      {phase === "uploading" && (
        <div>
          <div className="bar">
            <div className="bar-fill" style={{ width: `${progress}%` }} />
          </div>
          <p className="muted small">Uploading… {progress}%</p>
        </div>
      )}
      {phase === "processing" && (
        <p className="muted small">
          Upload complete. Starting processing… (the server may take a minute to wake up)
        </p>
      )}

      {error && <p className="error">{error}</p>}

      <button className="btn btn-primary" disabled={!file || !title.trim() || busy}>
        {busy ? "Working…" : "Upload video"}
      </button>
    </form>
  );
}
