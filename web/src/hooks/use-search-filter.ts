import {
  useQueryStates,
  parseAsArrayOf,
  parseAsString,
  parseAsFloat,
  parseAsInteger,
} from "nuqs";
import { SearchFilter, SearchSource, SearchSortType } from "@/types/search";
import { useCallback, useMemo } from "react";

const searchFilterParsers = {
  query: parseAsString,
  cameras: parseAsArrayOf(parseAsString, ","),
  labels: parseAsArrayOf(parseAsString, ","),
  sub_labels: parseAsArrayOf(parseAsString, ","),
  zones: parseAsArrayOf(parseAsString, ","),
  before: parseAsFloat,
  after: parseAsFloat,
  min_score: parseAsFloat,
  max_score: parseAsFloat,
  has_snapshot: parseAsInteger,
  has_clip: parseAsInteger,
  is_submitted: parseAsInteger,
  time_range: parseAsString,
  search_type: parseAsArrayOf(parseAsString, ","),
  event_id: parseAsString,
  sort: parseAsString,
};

export const useSearchFilter = () => {
  const [filterState, setFilterState] = useQueryStates(searchFilterParsers, {
    shallow: false,
  });

  const filter = useMemo<SearchFilter>(() => {
    const result: SearchFilter = {};

    if (filterState.query) {
      result.query = filterState.query;
    }

    if (filterState.cameras && filterState.cameras.length > 0) {
      result.cameras = filterState.cameras;
    }

    if (filterState.labels && filterState.labels.length > 0) {
      result.labels = filterState.labels;
    }

    if (filterState.sub_labels && filterState.sub_labels.length > 0) {
      result.sub_labels = filterState.sub_labels;
    }

    if (filterState.zones && filterState.zones.length > 0) {
      result.zones = filterState.zones;
    }

    if (filterState.before !== null) {
      result.before = filterState.before;
    }

    if (filterState.after !== null) {
      result.after = filterState.after;
    }

    if (filterState.min_score !== null) {
      result.min_score = filterState.min_score;
    }

    if (filterState.max_score !== null) {
      result.max_score = filterState.max_score;
    }

    if (filterState.has_snapshot !== null) {
      result.has_snapshot = filterState.has_snapshot;
    }

    if (filterState.has_clip !== null) {
      result.has_clip = filterState.has_clip;
    }

    if (filterState.is_submitted !== null) {
      result.is_submitted = filterState.is_submitted;
    }

    if (filterState.time_range) {
      result.time_range = filterState.time_range;
    }

    if (filterState.search_type && filterState.search_type.length > 0) {
      result.search_type = filterState.search_type as SearchSource[];
    }

    if (filterState.event_id) {
      result.event_id = filterState.event_id;
    }

    if (filterState.sort) {
      result.sort = filterState.sort as SearchSortType;
    }

    return result;
  }, [filterState]);

  const setFilter = useCallback(
    (newFilter: SearchFilter) => {
      setFilterState({
        query: newFilter.query || null,
        cameras: newFilter.cameras || null,
        labels: newFilter.labels || null,
        sub_labels: newFilter.sub_labels || null,
        zones: newFilter.zones || null,
        before: newFilter.before ?? null,
        after: newFilter.after ?? null,
        min_score: newFilter.min_score ?? null,
        max_score: newFilter.max_score ?? null,
        has_snapshot: newFilter.has_snapshot ?? null,
        has_clip: newFilter.has_clip ?? null,
        is_submitted: newFilter.is_submitted ?? null,
        time_range: newFilter.time_range || null,
        search_type: newFilter.search_type || null,
        event_id: newFilter.event_id || null,
        sort: newFilter.sort || null,
      });
    },
    [setFilterState],
  );

  const searchParams = useMemo(() => {
    const params: Record<string, string | number | boolean | string[]> = {};

    Object.entries(filter).forEach(([key, value]) => {
      if (Array.isArray(value)) {
        if (value.length > 0) {
          params[key] = value;
        }
      } else if (value !== undefined && value !== null) {
        params[key] = value;
      }
    });

    return params;
  }, [filter]);

  return {
    filter,
    setFilter,
    searchParams,
  };
};
