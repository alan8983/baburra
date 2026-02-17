/**
 * Convert any CSS color (including oklch, hsl, etc.) to rgb() format
 * that lightweight-charts can parse. Uses canvas to force browser conversion.
 */
export function convertToRgb(color: string): string {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1;
  const ctx = canvas.getContext('2d');
  if (!ctx) return 'rgb(0, 0, 0)'; // fallback
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
  return `rgb(${r}, ${g}, ${b})`;
}

/**
 * Resolve CSS variable colors and convert to rgb() strings for lightweight-charts.
 * Returns foreground color and grid color (border with 0.3 opacity).
 */
export function resolveThemeColors(container: HTMLElement): {
  foregroundColor: string;
  gridColor: string;
} {
  const temp = document.createElement('div');
  temp.style.color = 'var(--foreground)';
  temp.style.backgroundColor = 'var(--border)';
  container.appendChild(temp);
  const computedTemp = getComputedStyle(temp);
  const rawForeground = computedTemp.color;
  const rawBorder = computedTemp.backgroundColor;
  container.removeChild(temp);

  const foregroundColor = convertToRgb(rawForeground);
  const borderRgb = convertToRgb(rawBorder);
  const gridColor = borderRgb.replace('rgb(', 'rgba(').replace(')', ', 0.3)');

  return { foregroundColor, gridColor };
}
