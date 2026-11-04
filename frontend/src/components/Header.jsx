import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Header() {
  const { user, logout } = useAuth();
  return (
    <header className="header">
      <Link to="/" className="logo">
        🐱 Watch<span>Kitty</span>
      </Link>
      <nav className="nav">
        {user ? (
          <>
            <Link to="/upload" className="btn btn-primary">
              + Upload
            </Link>
            {user.photoURL && (
              <img className="avatar" src={user.photoURL} alt="" referrerPolicy="no-referrer" />
            )}
            <button className="btn" onClick={logout}>
              Sign out
            </button>
          </>
        ) : (
          <Link to="/login" className="btn btn-primary">
            Sign in
          </Link>
        )}
      </nav>
    </header>
  );
}
