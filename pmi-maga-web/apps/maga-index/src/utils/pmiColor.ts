/**
 * Returns the background hex color for a given PMI score:
 * 0–10:   #00317A
 * 11–20:  #1756B5
 * 21–30:  #3B7EE2
 * 31–40:  #7DA8E8
 * 41–50:  #C2C8E8
 * 51–60:  #D8C6D9
 * 61–70:  #E96777
 * 71–80:  #E01E35
 * 81–90:  #C40018
 * 91–100: #AD2D42
 */
export function getPmiColor(score: number | null | undefined): string {
    if (score == null || score <= 10) return '#00317A';
    if (score <= 20) return '#1756B5';
    if (score <= 30) return '#3B7EE2';
    if (score <= 40) return '#7DA8E8';
    if (score <= 50) return '#C2C8E8';
    if (score <= 60) return '#D8C6D9';
    if (score <= 70) return '#E96777';
    if (score <= 80) return '#E01E35';
    if (score <= 90) return '#C40018';
    return '#AD2D42';
}
