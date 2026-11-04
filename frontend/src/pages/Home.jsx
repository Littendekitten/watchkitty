import { useEffect, useState } from "react";
import { collection, getDocs, limit, orderBy, query, where } from "firebase/firestore";
import { db } from "../firebase";
import VideoCard from "../components/VideoCard";

export default function Home() {
  const [videos, setVideos] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const q = query(
      collection(db, "videos"),
      where("status", "==", "ready"),
      where("visibility", "==", "public"),
      orderBy("createdAt", "desc"),
      limit(48)
    );
    getDocs(q)
      .then((snap) => setVideos(snap.docs.map((d) => ({ id: d.id, ...d.data() }))))
      .catch((e) => {
        console.error(e);
        setError(
          e.code === "failed-precondition"
            ? "Firestore needs an index for this query. Open the browser console (F12) and click the link in the error message to create it, then wait a minute and reload."
            : e.message
        );
        setVideos([]);
      });
  }, []);

  if (videos === null) return <p className="center muted">Loading videos…</p>;

  return (
    <>
      {error && <p className="error">{error}</p>}
      {videos.length === 0 && !error && (
        <p className="center muted">No videos yet. Be the first to upload one! 🐱</p>
      )}
      <div className="grid">
        {videos.map((v) => (
          <VideoCard key={v.id} video={v} />
        ))}
      </div>
    </>
  );
}
