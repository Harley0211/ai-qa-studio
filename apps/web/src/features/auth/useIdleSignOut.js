import { useEffect, useRef } from "react";
import { useLogout } from "./auth.hooks.js";

export const IDLE_SIGN_OUT_MS = 30 * 60 * 1000;
const ACTIVITY_EVENTS = ["pointerdown", "pointermove", "keydown", "wheel", "touchstart", "scroll"];

// Signs out after `IDLE_SIGN_OUT_MS` without mouse, keyboard or touch
// activity in this tab, then shows "You are signed out" with a short notice.
export function useIdleSignOut(enabled) {
  const logout = useLogout();
  const logoutRef = useRef(logout);
  logoutRef.current = logout;

  useEffect(() => {
    if (!enabled) return undefined;
    let timer;
    const restart = () => {
      clearTimeout(timer);
      timer = setTimeout(() => logoutRef.current.mutate("idle"), IDLE_SIGN_OUT_MS);
    };
    restart();
    ACTIVITY_EVENTS.forEach((name) => window.addEventListener(name, restart, { passive: true }));
    return () => {
      clearTimeout(timer);
      ACTIVITY_EVENTS.forEach((name) => window.removeEventListener(name, restart));
    };
  }, [enabled]);
}
