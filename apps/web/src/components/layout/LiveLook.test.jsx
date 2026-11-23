import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MOTION_STORAGE_KEY, SEASON_STORAGE_KEY, seasonForDate } from "../../lib/season.js";
import { mockApi, renderRoute } from "../../test/utils.jsx";
import { Clock } from "./Clock.jsx";

// localStorage is not available in this test environment, so use an in-memory one.
beforeEach(() => {
  const store = new Map();
  vi.stubGlobal("localStorage", {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
  });
});

afterEach(() => {
  delete document.documentElement.dataset.season;
  delete document.documentElement.dataset.motion;
  vi.useRealTimers();
});

describe("Seasons", () => {
  it.each([
    ["2026-03-01", "spring"],
    ["2026-05-31", "spring"],
    ["2026-06-15", "summer"],
    ["2026-08-31", "summer"],
    ["2026-09-01", "autumn"],
    ["2026-11-23", "autumn"],
    ["2026-12-01", "winter"],
    ["2027-01-15", "winter"],
    ["2027-02-28", "winter"],
  ])("%s is %s", (day, season) => {
    expect(seasonForDate(new Date(`${day}T12:00:00`))).toBe(season);
  });
});

describe("Live look in the app layout", () => {
  it("follows today's season, lets you pick another and remembers it", async () => {
    const user = userEvent.setup();
    mockApi({ "GET /api/projects": { items: [], total: 0 } });

    renderRoute("/projects");

    const picker = await screen.findByRole("combobox", { name: "Season theme" });
    expect(picker).toHaveValue("auto");
    expect(document.documentElement.dataset.season).toBe(seasonForDate());

    await user.selectOptions(picker, "winter");
    expect(document.documentElement.dataset.season).toBe("winter");
    expect(window.localStorage.getItem(SEASON_STORAGE_KEY)).toBe("winter");

    await user.selectOptions(picker, "auto");
    expect(document.documentElement.dataset.season).toBe(seasonForDate());
  });

  it("turns animations on and off and remembers the choice", async () => {
    const user = userEvent.setup();
    mockApi({ "GET /api/projects": { items: [], total: 0 } });

    renderRoute("/projects");

    // No matchMedia in the test browser: animations start off.
    const on = await screen.findByRole("button", { name: "Turn animations on" });
    expect(document.documentElement.dataset.motion).toBe("off");

    await user.click(on);
    expect(screen.getByRole("button", { name: "Turn animations off" })).toHaveAttribute("aria-pressed", "true");
    expect(document.documentElement.dataset.motion).toBe("on");
    expect(window.localStorage.getItem(MOTION_STORAGE_KEY)).toBe("on");
  });

  it("shows the clock in the sidebar", async () => {
    mockApi({ "GET /api/projects": { items: [], total: 0 } });

    renderRoute("/projects");

    expect(await screen.findByRole("timer")).toBeInTheDocument();
  });
});

describe("Clock", () => {
  it("shows the time and date and keeps ticking", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 23, 9, 5, 58));

    render(<Clock />);

    const clock = screen.getByRole("timer");
    expect(clock).toHaveTextContent("05");
    expect(clock).toHaveTextContent("58");
    expect(clock).toHaveTextContent("23");

    act(() => vi.advanceTimersByTime(3000));
    expect(clock).toHaveTextContent("06");
    expect(clock).toHaveTextContent("01");
  });

  it("has a compact one-line version", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 23, 14, 30, 0));

    render(<Clock compact />);

    expect(screen.getByText("30", { exact: false })).toBeInTheDocument();
    expect(screen.queryByRole("timer")).not.toBeInTheDocument();
  });
});
