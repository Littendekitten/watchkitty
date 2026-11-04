import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";
import VideoPlayer from "../components/VideoPlayer";
import Comments from "../components/Comments";
import { timeAgo } from "../utils";

export default function Watch() {
  const { id } = useParams();
  const [video, setVideo] = useState(undefined); // undefined = loading, null = not found

  // Live listener, so the page flips from "processing" to the player automatically.
  useEffect(() => {
    setVideo(undefined);
    return onSnapshot(
      doc(db, "videos", id),
      (snap) => setVideo(snap.exists() ? { id: snap.id, ...snap.data() } : null),
      () => setVideo(null) // permission denied also lands here (private/unfinished videos)
    );
  }, [id]);

  if (video === undefined) return <p className="center muted">Loading…</p>;
  if (video === null) return <p className="center muted">Video not found.</p>;

  return (
    <div className="watch">
      {video.status === "ready" && video.hlsUrl ? (
        <VideoPlayer src={video.hlsUrl} poster={video.thumbnailUrl} />
      ) : video.status === "failed" ? (
        <div className="status-box error">
          Processing failed{video.error ? `: ${video.error}` : "."}
        </div>
      ) : (
        <div className="status-box">
          <div className="spinner" />
          <p>Your video is being processed. This page will update when it's ready.</p>
        </div>
      )}

      <h1 className="watch-title">{video.title}</h1>
      <div className="uploader">
        {video.uploaderPhotoURL && (
          <img className="avatar" src={video.uploaderPhotoURL} alt="" referrerPolicy="no-referrer" />
        )}
        <div>
          <strong>{video.uploaderName}</strong>
          <div className="muted small">{timeAgo(video.createdAt)}</div>
        </div>
      </div>

      {video.description && <p className="description">{video.description}</p>}
      {video.tags?.length > 0 && (
        <p className="tags">
          {video.tags.map((t) => (
            <span key={t} className="tag">
              #{t}
            </span>
          ))}
        </p>
      )}

      <Comments videoId={video.id} />
    </div>
  );
}
