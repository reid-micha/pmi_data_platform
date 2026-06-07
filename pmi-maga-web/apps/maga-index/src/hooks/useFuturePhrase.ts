import { fetchSettings } from '@micah/api';
import { useEffect, useState } from 'react';

const DEFAULT_PHRASE = 'within the next 12 months';

export function useFuturePhrase(): string {
  const [phrase, setPhrase] = useState(DEFAULT_PHRASE);
  useEffect(() => {
    fetchSettings()
      .then((s) => setPhrase(s.future_phrase))
      .catch(() => {});
  }, []);
  return phrase;
}
