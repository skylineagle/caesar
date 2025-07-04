import {
  useQueryStates,
  parseAsArrayOf,
  parseAsString,
  parseAsFloat,
  parseAsBoolean,
} from "nuqs";
import { ReviewFilter, ReviewSeverity } from "@/types/review";
import { useCallback, useMemo } from "react";

const reviewFilterParsers = {
  cameras: parseAsArrayOf(parseAsString, ","),
  labels: parseAsArrayOf(parseAsString, ","),
  zones: parseAsArrayOf(parseAsString, ","),
  before: parseAsFloat,
  after: parseAsFloat,
  showAll: parseAsBoolean,
};

const severityParser = parseAsString.withDefault("alert" as ReviewSeverity);
const showReviewedParser = parseAsBoolean.withDefault(false);

export const useReviewFilter = () => {
  const [filterState, setFilterState] = useQueryStates(reviewFilterParsers, {
    shallow: false,
  });

  const [severity, setSeverity] = useQueryStates(
    {
      severity: severityParser,
    },
    {
      shallow: false,
    },
  );

  const [showReviewedState, setShowReviewedState] = useQueryStates(
    {
      showReviewed: showReviewedParser,
    },
    {
      shallow: false,
    },
  );

  const filter = useMemo<ReviewFilter>(() => {
    const result: ReviewFilter = {};

    if (filterState.cameras && filterState.cameras.length > 0) {
      result.cameras = filterState.cameras;
    }

    if (filterState.labels && filterState.labels.length > 0) {
      result.labels = filterState.labels;
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

    if (filterState.showAll !== null) {
      result.showAll = filterState.showAll;
    }

    return result;
  }, [filterState]);

  const setFilter = useCallback(
    (newFilter: ReviewFilter) => {
      setFilterState({
        cameras: newFilter.cameras || null,
        labels: newFilter.labels || null,
        zones: newFilter.zones || null,
        before: newFilter.before ?? null,
        after: newFilter.after ?? null,
        showAll: newFilter.showAll ?? null,
      });
    },
    [setFilterState],
  );

  const currentSeverity = severity.severity as ReviewSeverity;
  const showReviewed = showReviewedState.showReviewed;

  const setCurrentSeverity = useCallback(
    (newSeverity: ReviewSeverity) => {
      setSeverity({ severity: newSeverity });
    },
    [setSeverity],
  );

  const setShowReviewed = useCallback(
    (show: boolean) => {
      setShowReviewedState({ showReviewed: show });
    },
    [setShowReviewedState],
  );

  const searchParams = useMemo(() => {
    const params: Record<string, string | number | boolean | string[]> = {};

    if (filter.cameras) {
      params.cameras = filter.cameras;
    }

    if (filter.labels) {
      params.labels = filter.labels;
    }

    if (filter.zones) {
      params.zones = filter.zones;
    }

    if (filter.before !== undefined) {
      params.before = filter.before;
    }

    if (filter.after !== undefined) {
      params.after = filter.after;
    }

    if (filter.showAll !== undefined) {
      params.showAll = filter.showAll;
    }

    return params;
  }, [filter]);

  return {
    filter,
    setFilter,
    severity: currentSeverity,
    setSeverity: setCurrentSeverity,
    showReviewed,
    setShowReviewed,
    searchParams,
  };
};
