export type LastUpdatedFormatted = { date: string; time: string };

function toValidDate(input: string | Date): Date | null {
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

/** Format an ISO string or Date for "Last updated" / "UPDATED" UI (war-index & maga-index). */
export function formatLastUpdated(
  input: string | Date | undefined | null,
): LastUpdatedFormatted | null {
  if (input == null) return null;
  const d = toValidDate(input);
  if (d == null) return null;
  return {
    date: d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }),
    time: d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
  };
}
