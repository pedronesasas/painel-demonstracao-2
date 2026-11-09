import { useState } from "react";

// Preferência de cada pessoa, guardada só no navegador dela.
export function useLocalPref<T extends string>(key: string, fallback: T, allowed: readonly T[]): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const v = localStorage.getItem(key) as T | null;
      return v && allowed.includes(v) ? v : fallback;
    } catch { return fallback; }
  });
  const set = (v: T) => {
    setValue(v);
    try { localStorage.setItem(key, v); } catch { /* sem armazenamento */ }
  };
  return [value, set];
}
