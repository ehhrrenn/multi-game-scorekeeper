// src/hooks/useGameState.ts
import { useState, useEffect } from 'react';

export function useGameState<T>(key: string, initialValue: T) {
  // 1. Always start with the initial value to guarantee Server/Client match
  const [storedValue, setStoredValue] = useState<T>(initialValue);

  // 2. Only check LocalStorage AFTER the component has safely mounted on the browser
  useEffect(() => {
    try {
      const item = window.localStorage.getItem(key);
      if (item) {
        setStoredValue(JSON.parse(item));
      }
    } catch (error) {
      console.log(error);
    }
  }, [key]);

  // 3. Update state and save to LocalStorage simultaneously
  const setValue = (value: T | ((val: T) => T)) => {
    try {
      const valueToStore = value instanceof Function ? value(storedValue) : value;
      setStoredValue(valueToStore);
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(key, JSON.stringify(valueToStore));
      }
    } catch (error) {
      console.log(error);
    }
  };

  return [storedValue, setValue] as const;
}