import { Sparkles } from 'lucide-react';
import { SEASONS } from '../../lib/season.js';
import { IconButton } from '../ui/Button.jsx';

// Season theme picker ("Auto" follows today's date) and an animations switch.
export function SeasonControls({ choice, autoSeason, setChoice, motion, toggleMotion }) {
  return (
    <div className="flex items-center gap-2">
      <label className="flex min-w-0 flex-1 items-center gap-2 text-xs text-slate-500">
        <span className="sr-only">Season theme</span>
        <select
          value={choice}
          onChange={(event) => setChoice(event.target.value)}
          aria-label="Season theme"
          className="w-full min-w-0 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium text-slate-700 focus:outline-2 focus:outline-indigo-600"
        >
          <option value="auto">
            {SEASONS[autoSeason].emoji} Auto ({SEASONS[autoSeason].label})
          </option>
          {Object.entries(SEASONS).map(([key, season]) => (
            <option key={key} value={key}>
              {season.emoji} {season.label}
            </option>
          ))}
        </select>
      </label>
      <IconButton
        icon={Sparkles}
        label={motion ? 'Turn animations off' : 'Turn animations on'}
        aria-pressed={motion}
        onClick={toggleMotion}
        className={motion ? 'text-indigo-600' : ''}
      />
    </div>
  );
}
