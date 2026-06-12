/**
 * Pieces - Stores SVG definition paths and handles color rendering for the piece themes.
 */
function getPieceSVG(type, color) {
  const isWhite = color === 'w';
  
  // Read active piece theme
  const theme = document.getElementById('piece-theme-select')?.value || 'classic';
  let fill = '#fcfbf9';
  let stroke = '#1e293b';
  let glowStyle = '';

  if (theme === 'classic') {
    fill = isWhite ? '#fcfbf9' : '#3c404c';
    stroke = isWhite ? '#1e293b' : '#f8fafc';
  } else if (theme === 'neon') {
    // Glowing neon cyan for White, neon pink for Black
    fill = isWhite ? 'rgba(14, 165, 233, 0.15)' : 'rgba(236, 72, 153, 0.15)';
    stroke = isWhite ? '#0ea5e9' : '#ec4899';
    glowStyle = `filter: drop-shadow(0 0 3px ${stroke});`;
  } else if (theme === 'minimalist') {
    // Elegant line art (no fill)
    fill = 'none';
    stroke = isWhite ? '#6366f1' : '#f43f5e';
    glowStyle = 'stroke-width: 2.2;';
  } else if (theme === 'rustic') {
    // Oak fill with dark wood border
    fill = isWhite ? '#e9c496' : '#7d512d';
    stroke = isWhite ? '#54351a' : '#fcfcfa';
  } else if (theme === 'staunton') {
    // Premium Staunton: ivory/ebony with gold accents
    fill = isWhite ? '#f5f0e8' : '#2c2c2c';
    stroke = isWhite ? '#b8860b' : '#daa520';
    glowStyle = `filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3)); stroke-width: 1.8;`;
  }
  
  let paths = '';
  switch (type) {
    case 'p':
      paths = `<path d="M 22.5 9 C 20.29 9 18.5 10.79 18.5 13 C 18.5 13.89 18.79 14.71 19.28 15.38 C 17.33 16.5 16 18.59 16 21 C 16 23.03 16.94 24.84 18.41 26.03 C 17.58 27.09 17 28.49 17 31 C 17 33.51 17.58 34.91 18.41 35.97 C 16.94 37.16 16 38.97 16 41 L 29 41 C 29 38.97 28.06 37.16 26.59 35.97 C 27.42 34.91 28 33.51 28 31 C 28 28.49 27.42 27.09 26.59 26.03 C 28.06 24.84 29 23.03 29 21 C 29 18.59 27.67 16.5 25.72 15.38 C 26.21 14.71 26.5 13.89 26.5 13 C 26.5 10.79 24.71 9 22.5 9 z M 12 36 L 33 36 L 33 39 L 12 39 L 12 36 z" />`;
      break;
    case 'r':
      paths = `<path d="M 9,39 L 36,39 L 36,36 L 9,36 L 9,39 z M 12,36 L 12,24 L 33,24 L 33,36 L 12,36 z M 12,24 L 10,14 L 35,14 L 33,24 L 12,24 z M 9,14 L 9,9 L 14,9 L 14,14 L 18,14 L 18,9 L 22,9 L 22,14 L 23,14 L 23,9 L 27,9 L 27,14 L 31,14 L 31,9 L 36,9 L 36,14 L 9,14 z" />`;
      break;
    case 'n':
      paths = `<path d="M 22,10 C 22,10 19,11 16,15 C 13,19 13,23 13,23 C 13,23 14.5,21.5 15,20.5 C 15.5,19.5 16,18 16,18 C 16,18 17,19 18,22 C 19,25 21,29 21,29 C 21,29 19,29 17,28 C 15,27 13,24 13,24 C 13,24 12,26 12,28 C 12,30 13,31 14,31 C 15,31 16,30 17,31 C 18,32 18,33 16,34 C 14,35 12,34 12,34 C 12,34 13,36 15,36 C 17,36 20,35 22,33 C 24,31 25,28 26,27 C 27,26 28,26 29,26 C 30,26 31,27 32,27 C 33,27 34,26 34,25 C 34,24 33,23 31,23 C 29,23 28,21 28,20 C 28,19 29,18 29,16 C 29,14 27,11 25,10 C 23,9 22,10 22,10 z" />
               <path d="M 9,36 L 36,36 L 36,39 A 2 2 0 0 1 34,41 L 11,41 A 2 2 0 0 1 9,39 L 9,36 z" />
               <circle cx="16" cy="16" r="1.5" fill="${stroke}"/>`;
      break;
    case 'b':
      paths = `<path d="M 9,36 L 36,36 L 36,39 L 9,39 L 9,36 z M 15,36 L 15,33 L 30,33 L 30,36 L 15,36 z M 18,33 C 18,33 16,27 16,23 C 16,19 19.5,14.5 22.5,10 C 25.5,14.5 29,19 29,23 C 29,27 27,33 27,33 L 18,33 z" />
               <circle cx="22.5" cy="8" r="2" />
               <path d="M 18,18 L 27,21 M 22.5,13 L 22.5,22 M 20,16 L 25,16" />`;
      break;
    case 'q':
      paths = `<path d="M 9 37 L 36 37 L 36 40 L 9 40 L 9 37 z M 12 37 L 13.5 24 L 31.5 24 L 33 37 L 12 37 z M 12 24 L 9 12 L 17 20 L 22.5 8 L 28 20 L 36 12 L 33 24 L 12 24 z" />
               <circle cx="9" cy="12" r="1.5" fill="${stroke}" />
               <circle cx="17" cy="20" r="1.5" fill="${stroke}" />
               <circle cx="22.5" cy="8" r="1.5" fill="${stroke}" />
               <circle cx="28" cy="20" r="1.5" fill="${stroke}" />
               <circle cx="36" cy="12" r="1.5" fill="${stroke}" />`;
      break;
    case 'k':
      paths = `<path d="M 11.5 37 L 33.5 37 L 33.5 40 L 11.5 40 L 11.5 37 z M 14.5 37 L 15.5 30 L 29.5 30 L 30.5 37 L 14.5 37 z M 17 30 C 17,26 19.5,22 22.5,16 C 25.5,22 28,26 28,30 L 17 30 z M 22.5 16 L 22.5 8 M 19 11 L 26 11 M 22.5 13 L 22.5 30 M 17 21 L 28 21" />`;
      break;
  }

  return `<svg viewBox="0 0 45 45" class="piece-svg ${color}" fill="${fill}" stroke="${stroke}" stroke-width="1.5" stroke-linejoin="round" style="${glowStyle}" draggable="true">${paths}</svg>`;
}
