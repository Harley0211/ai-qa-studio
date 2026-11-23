import { useEffect, useState } from 'react';

function useNow() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    // Tick on the second boundary so the display never lags behind.
    let timer = setTimeout(function tick() {
      setNow(new Date());
      timer = setTimeout(tick, 1000 - (Date.now() % 1000));
    }, 1000 - (Date.now() % 1000));
    return () => clearTimeout(timer);
  }, []);

  return now;
}

const timeFormat = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
const dateFormat = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
});

// Hour, minute and (in 12-hour locales) AM/PM, from the person's locale.
function timeParts(date) {
  const parts = timeFormat.formatToParts(date);
  const value = (type) => parts.find((part) => part.type === type)?.value ?? '';
  return { hour: value('hour'), minute: value('minute'), period: value('dayPeriod') };
}

// A small live clock: time with a pulsing colon, seconds, the date, and a bar
// that fills over each minute. compact: one line, for the mobile header.
export function Clock({ compact = false }) {
  const now = useNow();
  const { hour, minute, period } = timeParts(now);
  const seconds = String(now.getSeconds()).padStart(2, '0');
  const label = `${timeFormat.format(now)}, ${dateFormat.format(now)}`;

  if (compact) {
    return (
      <time
        dateTime={now.toISOString()}
        aria-label={label}
        className="live-clock-compact text-sm font-semibold tabular-nums text-slate-700"
      >
        {hour}
        <span className="live-colon">:</span>
        {minute}
        {period && <span className="ml-1 text-xs text-slate-500">{period}</span>}
      </time>
    );
  }

  return (
    <div className="live-clock rounded-xl px-3 py-2" role="timer" aria-label={label}>
      <div className="flex items-baseline gap-1">
        <time dateTime={now.toISOString()} className="live-clock-time text-2xl font-bold tabular-nums">
          {hour}
          <span className="live-colon">:</span>
          {minute}
        </time>
        <span className="text-xs font-semibold tabular-nums text-slate-500">{seconds}</span>
        {period && <span className="text-xs font-semibold text-slate-500">{period}</span>}
        <span className="ml-auto text-xs font-medium text-slate-500">{dateFormat.format(now)}</span>
      </div>
      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-slate-200">
        <div className="live-clock-bar h-full rounded-full" style={{ width: `${(now.getSeconds() / 59) * 100}%` }} />
      </div>
    </div>
  );
}
