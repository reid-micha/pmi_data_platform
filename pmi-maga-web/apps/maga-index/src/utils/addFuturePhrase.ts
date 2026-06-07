// const FUTURE_PHRASES = [
//   'in the future',
//   'within the next year',
//   'at a later point',
//   'later on',
//   'in the months ahead',
//   'at some later stage',
//   'in the year ahead',
//   'before long',
//   'over the coming months',
//   'over the months to come',
//   'in the foreseeable future',
// ] as const;

// /** djb2 string hash — returns a non-negative integer. */
// function hashString(str: string): number {
//   let hash = 5381;
//   for (let i = 0; i < str.length; i++) {
//     hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
//   }
//   return Math.abs(hash);
// }

// /**
//  * Adds a deterministic future-oriented phrase to a question title (display only).
//  *
//  * For "Will …?" titles the hash randomly picks begin or end placement:
//  *   Begin: "In the future, will Trump Acquire Greenland?"
//  *   End:   "Will Trump Acquire Greenland in the future?"
//  *
//  * Non-"Will" titles always use end placement before the trailing "?".
//  */
// export function addFuturePhrase(title: string): string {
//   if (!title || !title.trim()) return title;
//
//   const hash = hashString(title);
//   const phrase = FUTURE_PHRASES[hash % FUTURE_PHRASES.length];
//   const startsWithWill = /^Will\s/i.test(title);
//
//   // For "Will" titles, use hash to pick begin (odd) vs end (even).
//   // Non-"Will" titles always use end.
//   const useBegin = startsWithWill && hash % 2 === 1;
//
//   if (useBegin) {
//     const capitalizedPhrase = phrase.charAt(0).toUpperCase() + phrase.slice(1);
//     const rest = title.slice(4); // everything after "Will"
//     return `${capitalizedPhrase}, will${rest}`;
//   }
//
//   // End placement: insert phrase before trailing "?"
//   if (title.trimEnd().endsWith('?')) {
//     const trimmed = title.trimEnd();
//     const idx = trimmed.lastIndexOf('?');
//     return `${trimmed.slice(0, idx)} ${phrase}?`;
//   }
//
//   return `${title} ${phrase}`;
// }

/**
 * Appends a future-oriented phrase to a question title (display only).
 * Phrase is inserted before the trailing "?" if present, otherwise appended at the end.
 * Phrase text is supplied by the caller (read from pmi_configurations via /api/settings).
 */
export function addFuturePhrase(title: string, phrase: string): string {
  if (!title || !title.trim()) return title;

  if (title.trimEnd().endsWith('?')) {
    const trimmed = title.trimEnd();
    const idx = trimmed.lastIndexOf('?');
    return `${trimmed.slice(0, idx)} ${phrase}?`;
  }

  return `${title} ${phrase}`;
}
