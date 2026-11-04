import { auth } from "./firebase";

const BASE = (import.meta.env.VITE_BACKEND_URL || "").replace(/\/$/, "");

// Tells the Render backend to start transcoding a raw upload.
// Note: a sleeping Render service can take up to ~1 minute to wake on the first request.
export async function requestProcessing(payload) {
  const token = await auth.currentUser.getIdToken();
  const res = await fetch(`${BASE}/api/videos/process`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Server error (${res.status})`);
  }
  return res.json();
}
