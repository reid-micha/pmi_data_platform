// Figma orange color scale for PMI scores
// Uses exact color stops from the design system
const PMI_COLORS: Record<number, string> = {
  100: '#FDEAD7', // Orange/100 - lightest
  200: '#F9DBAF', // Orange/200
  400: '#F38744', // Orange/400
  500: '#EF6820', // Orange/500 - most vibrant
};

/**
 * Get PMI badge color based on score
 */
export function getPmiColor(score: number): string {
  if (score >= 75) return PMI_COLORS[500]; // 75-100: most vibrant
  if (score >= 50) return PMI_COLORS[400]; // 50-74: vibrant
  if (score >= 25) return PMI_COLORS[200]; // 25-49: medium
  return PMI_COLORS[100];                   // 0-24: lightest
}
