import { useEffect, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
} from "firebase/firestore";
import { Link } from "react-router-dom";
import { db } from "../firebase";
import { useAuth } from "../context/AuthContext";
import { timeAgo } from "../utils";

export default function Comments({ videoId }) {
  const { user } = useAuth();
  const [comments, setComments] = useState([]);
  const [text, setText] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const q = query(collection(db, "videos", videoId, "comments"), orderBy("createdAt", "desc"));
    return onSnapshot(
      q,
      (snap) => setComments(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (e) => console.error(e)
    );
  }, [videoId]);

  async function post(e) {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    setError("");
    try {
      await addDoc(collection(db, "videos", videoId, "comments"), {
        authorId: user.uid,
        authorName: user.displayName || user.email?.split("@")[0] || "Kitty Fan",
        authorPhotoURL: user.photoURL || null,
        text: trimmed,
        parentId: null,
        likeCount: 0,
        createdAt: serverTimestamp(),
      });
      setText("");
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <section className="comments">
      <h3>{comments.length} Comment{comments.length === 1 ? "" : "s"}</h3>

      {user ? (
        <form onSubmit={post} className="comment-form">
          <input
            value={text}
            maxLength={2000}
            onChange={(e) => setText(e.target.value)}
            placeholder="Add a comment…"
          />
          <button className="btn btn-primary" disabled={!text.trim()}>
            Comment
          </button>
        </form>
      ) : (
        <p className="muted">
          <Link to="/login">Sign in</Link> to comment.
        </p>
      )}
      {error && <p className="error">{error}</p>}

      <ul className="comment-list">
        {comments.map((c) => (
          <li key={c.id}>
            {c.authorPhotoURL ? (
              <img className="avatar" src={c.authorPhotoURL} alt="" referrerPolicy="no-referrer" />
            ) : (
              <div className="avatar avatar-fallback">{c.authorName?.[0]?.toUpperCase()}</div>
            )}
            <div className="comment-body">
              <div className="small">
                <strong>{c.authorName}</strong>{" "}
                <span className="muted">{timeAgo(c.createdAt)}</span>
              </div>
              <p>{c.text}</p>
            </div>
            {user?.uid === c.authorId && (
              <button
                className="link-btn"
                onClick={() => deleteDoc(doc(db, "videos", videoId, "comments", c.id))}
              >
                Delete
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
