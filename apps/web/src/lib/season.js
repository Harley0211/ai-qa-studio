import { useCallback, useEffect, useState } from 'react';

// Seasonal look: each season has its own colors (see index.css, keyed by
// <html data-season="...">) and its own moving particles (LiveBackground).
export const SEASONS = {
  spring: { label: 'Spring', emoji: '🌸', particle: 'petal' },
  summer: { label: 'Summer', emoji: '☀️', particle: 'glow' },
  autumn: { label: 'Autumn', emoji: '🍂', particle: 'leaf' },
  winter: { label: 'Winter', emoji: '❄️', particle: 'snow' },
};

export const SEASON_STORAGE_KEY = 'aqs-season';
export const MOTION_STORAGE_KEY = 'aqs-motion';

// Meteorological seasons (northern hemisphere): Mar-May spring, Jun-Aug
// summer, Sep-Nov autumn, Dec-Feb winter.
export function seasonForDate(date = new Date()) {
  const month = date.getMonth(); // 0 = January
  if (month >= 2 && month <= 4) return 'spring';
  if (month >= 5 && month <= 7) return 'summer';
  if (month >= 8 && month <= 10) return 'autumn';
  return 'winter';
}

function read(key) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* Storage unavailable (private mode); the choice lasts for this session. */
  }
}

function prefersReducedMotion() {
  return Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
}

// Animations run only where the browser can show them (not in tests) and the
// person hasn't asked their system for less motion, unless they turn it on.
function initialMotion() {
  const stored = read(MOTION_STORAGE_KEY);
  if (stored === 'on' || stored === 'off') return stored === 'on';
  return typeof window.matchMedia === 'function' && !prefersReducedMotion();
}

function initialChoice() {
  const stored = read(SEASON_STORAGE_KEY);
  return stored === 'auto' || SEASONS[stored] ? stored : 'auto';
}

export function useSeason() {
  const [choice, setChoiceState] = useState(initialChoice);
  const [motion, setMotionState] = useState(initialMotion);
  const [today, setToday] = useState(() => seasonForDate());

  // A tab left open across a season change follows it.
  useEffect(() => {
    const timer = setInterval(() => setToday(seasonForDate()), 60 * 60 * 1000);
    return () => clearInterval(timer);
  }, []);

  const season = choice === 'auto' ? today : choice;

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.season = season;
    root.dataset.motion = motion ? 'on' : 'off';
  }, [season, motion]);

  const setChoice = useCallback((value) => {
    write(SEASON_STORAGE_KEY, value);
    setChoiceState(value);
  }, []);

  const toggleMotion = useCallback(() => {
    setMotionState((current) => {
      write(MOTION_STORAGE_KEY, current ? 'off' : 'on');
      return !current;
    });
  }, []);

  return { season, choice, autoSeason: today, setChoice, motion, toggleMotion };
}
