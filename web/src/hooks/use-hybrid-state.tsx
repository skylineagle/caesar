import { useCallback, useEffect, useMemo } from "react";
import {
  useUrlStateString,
  useUrlStateNumber,
  useUrlStateBoolean,
  useUrlStateArray,
} from "./use-url-state";
import { usePersistence } from "./use-persistence";

type HybridStateMode = "url" | "persistence" | "migration";

interface HybridStateOptions<T> {
  mode?: HybridStateMode;
  defaultValue?: T;
  replace?: boolean;
  migrateFromKey?: string;
}

export const useHybridStateString = (
  key: string,
  options: HybridStateOptions<string> = {},
): [
  string | undefined,
  (value: string | undefined, replace?: boolean) => void,
  () => void,
] => {
  const {
    mode = "url",
    defaultValue,
    replace = false,
    migrateFromKey,
  } = options;

  const [urlValue, setUrlValue] = useUrlStateString(key, defaultValue, replace);
  const [
    persistedValue,
    setPersistedValue,
    persistedLoaded,
    deletePersistedValue,
  ] = usePersistence<string>(migrateFromKey || key, undefined);

  const value = useMemo(() => {
    switch (mode) {
      case "url":
        return urlValue;
      case "persistence":
        return persistedValue ?? defaultValue;
      case "migration":
        return urlValue ?? persistedValue ?? defaultValue;
      default:
        return urlValue;
    }
  }, [mode, urlValue, persistedValue, defaultValue]);

  const setValue = useCallback(
    (newValue: string | undefined, replaceHistory = replace) => {
      switch (mode) {
        case "url":
          setUrlValue(newValue, replaceHistory);
          break;
        case "persistence":
          setPersistedValue(newValue);
          break;
        case "migration":
          setUrlValue(newValue, replaceHistory);
          if (newValue !== undefined && persistedValue !== undefined) {
            deletePersistedValue();
          }
          break;
      }
    },
    [
      mode,
      setUrlValue,
      setPersistedValue,
      deletePersistedValue,
      replace,
      persistedValue,
    ],
  );

  const clearValue = useCallback(() => {
    switch (mode) {
      case "url":
        setUrlValue(undefined);
        break;
      case "persistence":
        deletePersistedValue();
        break;
      case "migration":
        setUrlValue(undefined);
        deletePersistedValue();
        break;
    }
  }, [mode, setUrlValue, deletePersistedValue]);

  useEffect(() => {
    if (
      mode === "migration" &&
      persistedLoaded &&
      persistedValue &&
      !urlValue
    ) {
      setUrlValue(persistedValue, true);
    }
  }, [mode, persistedLoaded, persistedValue, urlValue, setUrlValue]);

  return [value, setValue, clearValue];
};

export const useHybridStateNumber = (
  key: string,
  options: HybridStateOptions<number> = {},
): [
  number | undefined,
  (value: number | undefined, replace?: boolean) => void,
  () => void,
] => {
  const {
    mode = "url",
    defaultValue,
    replace = false,
    migrateFromKey,
  } = options;

  const [urlValue, setUrlValue] = useUrlStateNumber(key, defaultValue, replace);
  const [
    persistedValue,
    setPersistedValue,
    persistedLoaded,
    deletePersistedValue,
  ] = usePersistence<number>(migrateFromKey || key, undefined);

  const value = useMemo(() => {
    switch (mode) {
      case "url":
        return urlValue;
      case "persistence":
        return persistedValue ?? defaultValue;
      case "migration":
        return urlValue ?? persistedValue ?? defaultValue;
      default:
        return urlValue;
    }
  }, [mode, urlValue, persistedValue, defaultValue]);

  const setValue = useCallback(
    (newValue: number | undefined, replaceHistory = replace) => {
      switch (mode) {
        case "url":
          setUrlValue(newValue, replaceHistory);
          break;
        case "persistence":
          setPersistedValue(newValue);
          break;
        case "migration":
          setUrlValue(newValue, replaceHistory);
          if (newValue !== undefined && persistedValue !== undefined) {
            deletePersistedValue();
          }
          break;
      }
    },
    [
      mode,
      setUrlValue,
      setPersistedValue,
      deletePersistedValue,
      replace,
      persistedValue,
    ],
  );

  const clearValue = useCallback(() => {
    switch (mode) {
      case "url":
        setUrlValue(undefined);
        break;
      case "persistence":
        deletePersistedValue();
        break;
      case "migration":
        setUrlValue(undefined);
        deletePersistedValue();
        break;
    }
  }, [mode, setUrlValue, deletePersistedValue]);

  useEffect(() => {
    if (
      mode === "migration" &&
      persistedLoaded &&
      persistedValue &&
      !urlValue
    ) {
      setUrlValue(persistedValue, true);
    }
  }, [mode, persistedLoaded, persistedValue, urlValue, setUrlValue]);

  return [value, setValue, clearValue];
};

export const useHybridStateBoolean = (
  key: string,
  options: HybridStateOptions<boolean> = {},
): [
  boolean | undefined,
  (value: boolean | undefined, replace?: boolean) => void,
  () => void,
] => {
  const {
    mode = "url",
    defaultValue,
    replace = false,
    migrateFromKey,
  } = options;

  const [urlValue, setUrlValue] = useUrlStateBoolean(
    key,
    defaultValue,
    replace,
  );
  const [
    persistedValue,
    setPersistedValue,
    persistedLoaded,
    deletePersistedValue,
  ] = usePersistence<boolean>(migrateFromKey || key, undefined);

  const value = useMemo(() => {
    switch (mode) {
      case "url":
        return urlValue;
      case "persistence":
        return persistedValue ?? defaultValue;
      case "migration":
        return urlValue ?? persistedValue ?? defaultValue;
      default:
        return urlValue;
    }
  }, [mode, urlValue, persistedValue, defaultValue]);

  const setValue = useCallback(
    (newValue: boolean | undefined, replaceHistory = replace) => {
      switch (mode) {
        case "url":
          setUrlValue(newValue, replaceHistory);
          break;
        case "persistence":
          setPersistedValue(newValue);
          break;
        case "migration":
          setUrlValue(newValue, replaceHistory);
          if (newValue !== undefined && persistedValue !== undefined) {
            deletePersistedValue();
          }
          break;
      }
    },
    [
      mode,
      setUrlValue,
      setPersistedValue,
      deletePersistedValue,
      replace,
      persistedValue,
    ],
  );

  const clearValue = useCallback(() => {
    switch (mode) {
      case "url":
        setUrlValue(undefined);
        break;
      case "persistence":
        deletePersistedValue();
        break;
      case "migration":
        setUrlValue(undefined);
        deletePersistedValue();
        break;
    }
  }, [mode, setUrlValue, deletePersistedValue]);

  useEffect(() => {
    if (
      mode === "migration" &&
      persistedLoaded &&
      persistedValue &&
      !urlValue
    ) {
      setUrlValue(persistedValue, true);
    }
  }, [mode, persistedLoaded, persistedValue, urlValue, setUrlValue]);

  return [value, setValue, clearValue];
};

export const useHybridStateArray = (
  key: string,
  options: HybridStateOptions<string[]> = {},
): [
  string[] | undefined,
  (value: string[] | undefined, replace?: boolean) => void,
  () => void,
] => {
  const {
    mode = "url",
    defaultValue,
    replace = false,
    migrateFromKey,
  } = options;

  const [urlValue, setUrlValue] = useUrlStateArray(key, defaultValue, replace);
  const [
    persistedValue,
    setPersistedValue,
    persistedLoaded,
    deletePersistedValue,
  ] = usePersistence<string[]>(migrateFromKey || key, undefined);

  const value = useMemo(() => {
    switch (mode) {
      case "url":
        return urlValue;
      case "persistence":
        return persistedValue ?? defaultValue;
      case "migration":
        return urlValue ?? persistedValue ?? defaultValue;
      default:
        return urlValue;
    }
  }, [mode, urlValue, persistedValue, defaultValue]);

  const setValue = useCallback(
    (newValue: string[] | undefined, replaceHistory = replace) => {
      switch (mode) {
        case "url":
          setUrlValue(newValue, replaceHistory);
          break;
        case "persistence":
          setPersistedValue(newValue);
          break;
        case "migration":
          setUrlValue(newValue, replaceHistory);
          if (newValue !== undefined && persistedValue !== undefined) {
            deletePersistedValue();
          }
          break;
      }
    },
    [
      mode,
      setUrlValue,
      setPersistedValue,
      deletePersistedValue,
      replace,
      persistedValue,
    ],
  );

  const clearValue = useCallback(() => {
    switch (mode) {
      case "url":
        setUrlValue(undefined);
        break;
      case "persistence":
        deletePersistedValue();
        break;
      case "migration":
        setUrlValue(undefined);
        deletePersistedValue();
        break;
    }
  }, [mode, setUrlValue, deletePersistedValue]);

  useEffect(() => {
    if (
      mode === "migration" &&
      persistedLoaded &&
      persistedValue &&
      !urlValue
    ) {
      setUrlValue(persistedValue, true);
    }
  }, [mode, persistedLoaded, persistedValue, urlValue, setUrlValue]);

  return [value, setValue, clearValue];
};
