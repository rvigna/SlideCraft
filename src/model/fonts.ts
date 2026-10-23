/* Font fallbacks: decks keep the font names they were written with (so PowerPoint
   round-trips them), but render with metric-compatible open fonts when the
   original isn't installed. */

const METRIC_COMPATIBLE: Record<string, string> = {
  calibri: 'Carlito',
  'calibri light': 'Carlito',
  cambria: 'Caladea',
  arial: 'Arimo',
  helvetica: 'Arimo',
  'helvetica neue': 'Arimo',
  'times new roman': 'Tinos',
  times: 'Tinos',
  'courier new': 'Cousine',
  courier: 'Cousine',
  georgia: 'Gelasio',
  aptos: 'Inter',
  'aptos display': 'Inter',
  'segoe ui': 'Open Sans',
  'segoe ui light': 'Open Sans',
};

function generic(name: string): string {
  const n = name.toLowerCase();
  if (/mono|courier|code|consol/.test(n)) return 'monospace';
  if (/times|georgia|cambria|serif|garamond|playfair|book|palatino/.test(n) && !/sans/.test(n)) return 'serif';
  return 'sans-serif';
}

/** CSS font-family list for a deck font name */
export function fontStack(name: string): string {
  const clean = name.replace(/["']/g, '').trim() || 'IBM Plex Sans';
  const parts = [`'${clean}'`];
  const alt = METRIC_COMPATIBLE[clean.toLowerCase()];
  if (alt) parts.push(`'${alt}'`);
  parts.push(generic(clean));
  return parts.join(', ');
}

/** Google Fonts stylesheet used by the app and by HTML exports */
export const GOOGLE_FONTS_URL = 'https://fonts.googleapis.com/css2?family=Arimo:ital,wght@0,400;0,700;1,400&family=Caladea:ital,wght@0,400;0,700;1,400&family=Carlito:ital,wght@0,400;0,700;1,400&family=Cousine:wght@400;700&family=Gelasio:ital,wght@0,400;0,700;1,400&family=IBM+Plex+Mono:wght@400;600&family=IBM+Plex+Sans:ital,wght@0,300;0,400;0,600;0,700;1,400&family=IBM+Plex+Serif:ital,wght@0,400;0,600;0,700;1,400&family=Inter:wght@300;400;500;600;700;800;900&family=Lato:wght@300;400;700;900&family=Montserrat:wght@300;400;500;600;700;800;900&family=Open+Sans:wght@300;400;600;700&family=Playfair+Display:ital,wght@0,400;0,600;0,700;0,900;1,400&family=Poppins:wght@300;400;500;600;700&family=Roboto:wght@300;400;500;700&family=Source+Code+Pro:wght@400;500&family=Tinos:ital,wght@0,400;0,700;1,400&display=swap';
