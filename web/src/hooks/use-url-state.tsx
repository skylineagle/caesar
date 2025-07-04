import {
  parseAsArrayOf,
  parseAsBoolean,
  parseAsInteger,
  parseAsJson,
  parseAsString,
  useQueryState,
  useQueryStates,
  UseQueryStatesKeysMap,
  Values,
  type Options,
} from "nuqs";
import { useCallback } from "react";

export const useUrlStateString = (
  key: string,
  defaultValue?: string,
  replace = false,
) => {
  const [value, setValue] = useQueryState(
    key,
    parseAsString
      .withDefault(defaultValue ?? "")
      .withOptions({ history: replace ? "replace" : "push" }),
  );

  const wrappedSetValue = useCallback(
    (newValue: string | undefined, replaceHistory = replace) => {
      setValue(newValue ?? null, {
        history: replaceHistory ? "replace" : "push",
      });
    },
    [setValue, replace],
  );

  return [value || defaultValue, wrappedSetValue] as const;
};

export const useUrlStateNumber = (
  key: string,
  defaultValue?: number,
  replace = false,
) => {
  const [value, setValue] = useQueryState(
    key,
    parseAsInteger
      .withDefault(defaultValue ?? 0)
      .withOptions({ history: replace ? "replace" : "push" }),
  );

  const wrappedSetValue = useCallback(
    (newValue: number | undefined, replaceHistory = replace) => {
      setValue(newValue ?? null, {
        history: replaceHistory ? "replace" : "push",
      });
    },
    [setValue, replace],
  );

  return [value ?? defaultValue, wrappedSetValue] as const;
};

export const useUrlStateBoolean = (
  key: string,
  defaultValue?: boolean,
  replace = false,
) => {
  const [value, setValue] = useQueryState(
    key,
    parseAsBoolean
      .withDefault(defaultValue ?? false)
      .withOptions({ history: replace ? "replace" : "push" }),
  );

  const wrappedSetValue = useCallback(
    (newValue: boolean | undefined, replaceHistory = replace) => {
      setValue(newValue ?? null, {
        history: replaceHistory ? "replace" : "push",
      });
    },
    [setValue, replace],
  );

  return [value ?? defaultValue, wrappedSetValue] as const;
};

export const useUrlStateArray = (
  key: string,
  defaultValue?: string[],
  replace = false,
) => {
  const [value, setValue] = useQueryState(
    key,
    parseAsArrayOf(parseAsString)
      .withDefault(defaultValue ?? [])
      .withOptions({ history: replace ? "replace" : "push" }),
  );

  const wrappedSetValue = useCallback(
    (newValue: string[] | undefined, replaceHistory = replace) => {
      setValue(newValue ?? null, {
        history: replaceHistory ? "replace" : "push",
      });
    },
    [setValue, replace],
  );

  return [value ?? defaultValue ?? [], wrappedSetValue] as const;
};

export const useUrlStateObject = <T extends UseQueryStatesKeysMap>(
  key: string,
  defaultValue?: T,
  replace = false,
) => {
  const [value, setValue] = useQueryState(
    key,
    parseAsJson<T>((value) => value as T)
      .withDefault(defaultValue as T)
      .withOptions({ history: replace ? "replace" : "push" }),
  );

  const wrappedSetValue = useCallback(
    (newValue: T | undefined, replaceHistory = replace) => {
      setValue(newValue ?? null, {
        history: replaceHistory ? "replace" : "push",
      });
    },
    [setValue, replace],
  );

  return [value ?? defaultValue, wrappedSetValue] as const;
};

export const useMultipleUrlState = <T extends UseQueryStatesKeysMap>(
  parsers: T,
  options: Options = {},
) => {
  const [values, setValues] = useQueryStates<T>(parsers, options);

  const setMultipleValues = useCallback(
    (updates: Partial<Values<T>>, replace = false) => {
      setValues(updates, { history: replace ? "replace" : "push" });
    },
    [setValues],
  );

  const setValue = useCallback(
    (key: keyof T, value: T[keyof T] | undefined, replace = false) => {
      setValues({ [key]: value } as Partial<Values<T>>, {
        history: replace ? "replace" : "push",
      });
    },
    [setValues],
  );

  return [values, setMultipleValues, setValue] as const;
};
