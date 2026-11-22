// Apply the saved theme before first paint (see src/lib/theme.js).
// Kept as a file, not an inline <script>, so the server's Content Security
// Policy can forbid inline scripts.
try {
  var t = localStorage.getItem('aqs-theme');
  if (t === 'dark' || (!t && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    document.documentElement.classList.add('dark');
  }
} catch (e) {}
