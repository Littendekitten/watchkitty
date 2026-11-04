import { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "../firebase";

const AuthContext = createContext(null);

// Creates users/{uid} on first login so the backend can read the display name.
async function ensureUserDoc(user) {
  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);
  if (snap.exists()) return;
  await setDoc(ref, {
    displayName: user.displayName || user.email?.split("@")[0] || "Kitty Fan",
    photoURL: user.photoURL || null,
    email: user.email || null,
    channelName: user.displayName || user.email?.split("@")[0] || "Kitty Fan",
    bio: "",
    subscriberCount: 0,
    createdAt: serverTimestamp(),
  });
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    return onAuthStateChanged(auth, async (u) => {
      setUser(u);
      setLoading(false);
      if (u) {
        try {
          await ensureUserDoc(u);
        } catch (e) {
          console.error("Could not create user profile", e);
        }
      }
    });
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, logout: () => signOut(auth) }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
