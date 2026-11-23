// Takes still frames from a screen recording in the browser, so the AI model
// (which reads images, not video) can see what happened.

const SEEK_TIMEOUT_MS = 10_000;

function waitFor(target, event, timeoutMs = SEEK_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("timeout"));
    }, timeoutMs);
    const onEvent = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error("error"));
    };
    function cleanup() {
      clearTimeout(timer);
      target.removeEventListener(event, onEvent);
      target.removeEventListener("error", onError);
    }
    target.addEventListener(event, onEvent, { once: true });
    target.addEventListener("error", onError, { once: true });
  });
}

// Frames spread evenly through the video, skipping the very start and end.
export function frameTimes(duration, count) {
  if (!Number.isFinite(duration) || duration <= 0) return [0];
  const n = Math.max(1, count);
  return Array.from({ length: n }, (_, i) => Math.min(duration - 0.05, (duration * (i + 1)) / (n + 1)));
}

export function formatTimestamp(seconds) {
  const total = Math.max(0, Math.round(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

// Returns [{ blob (JPEG), time (seconds) }]. Throws a readable Error when the
// browser can't play the file.
export async function extractFrames(file, { count = 4, maxWidth = 1024 } = {}) {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = url;

  try {
    try {
      await waitFor(video, "loadeddata");
    } catch {
      throw new Error(`${file.name} can't be played in this browser (try MP4 or WebM).`);
    }

    const scale = Math.min(1, maxWidth / (video.videoWidth || maxWidth));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round((video.videoWidth || maxWidth) * scale));
    canvas.height = Math.max(1, Math.round((video.videoHeight || maxWidth * 0.5625) * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("This browser can't read video frames.");

    const frames = [];
    for (const time of frameTimes(video.duration, count)) {
      video.currentTime = time;
      try {
        await waitFor(video, "seeked");
      } catch {
        continue;
      }
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
      if (blob) frames.push({ blob, time });
    }

    if (frames.length === 0) throw new Error(`No frames could be read from ${file.name}.`);
    return frames;
  } finally {
    video.removeAttribute("src");
    video.load?.();
    URL.revokeObjectURL(url);
  }
}
