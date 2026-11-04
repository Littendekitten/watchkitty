import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";

// HLS player: hls.js on most browsers, native HLS on Safari/iOS.
export default function VideoPlayer({ src, poster }) {
  const videoRef = useRef(null);
  const hlsRef = useRef(null);
  const [levels, setLevels] = useState([]);
  const [level, setLevel] = useState(-1); // -1 = auto
  const [error, setError] = useState("");

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;
    setError("");
    setLevels([]);
    setLevel(-1);

    if (Hls.isSupported()) {
      const hls = new Hls({ capLevelToPlayerSize: true });
      hlsRef.current = hls;
      hls.loadSource(src);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, (_e, data) => {
        setLevels(data.levels.map((l, i) => ({ index: i, height: l.height })));
      });

      hls.on(Hls.Events.ERROR, (_e, data) => {
        if (!data.fatal) return;
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
          hls.startLoad();
        } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
          hls.recoverMediaError();
        } else {
          setError("Sorry, this video could not be played.");
          hls.destroy();
        }
      });
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = src; // Safari
    } else {
      setError("Your browser does not support HLS video.");
    }

    return () => {
      hlsRef.current?.destroy();
      hlsRef.current = null;
    };
  }, [src]);

  function changeLevel(e) {
    const value = Number(e.target.value);
    setLevel(value);
    if (hlsRef.current) hlsRef.current.currentLevel = value;
  }

  return (
    <div className="player-wrap">
      <video ref={videoRef} className="player" poster={poster} controls playsInline />
      {error && <p className="error">{error}</p>}
      {levels.length > 1 && (
        <label className="quality small muted">
          Quality{" "}
          <select value={level} onChange={changeLevel}>
            <option value={-1}>Auto</option>
            {[...levels]
              .sort((a, b) => b.height - a.height)
              .map((l) => (
                <option key={l.index} value={l.index}>
                  {l.height}p
                </option>
              ))}
          </select>
        </label>
      )}
    </div>
  );
}
