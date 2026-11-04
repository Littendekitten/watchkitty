import { Link } from "react-router-dom";
import { formatDuration, timeAgo } from "../utils";

export default function VideoCard({ video }) {
  return (
    <Link to={`/watch/${video.id}`} className="card">
      <div className="thumb">
        {video.thumbnailUrl ? (
          <img src={video.thumbnailUrl} alt="" loading="lazy" />
        ) : (
          <div className="thumb-empty">🐱</div>
        )}
        {video.duration != null && <span className="badge">{formatDuration(video.duration)}</span>}
      </div>
      <h3 className="card-title">{video.title}</h3>
      <p className="muted small">
        {video.uploaderName} · {timeAgo(video.createdAt)}
      </p>
    </Link>
  );
}
