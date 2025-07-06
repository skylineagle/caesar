import { usePersistence } from "@/hooks/use-persistence";
import { parseAsString, useQueryState } from "nuqs";

export function useGroup() {
  const [group, setGroup] = useQueryState(
    "group",
    parseAsString.withDefault("default"),
  );

  const [persistedValue, setPersistedValue, , deletePersistedValue] =
    usePersistence<string>("group", group);

  const handleSetGroup = (value: string) => {
    setGroup(value);
    setPersistedValue(value);
  };

  const handleDeleteGroup = () => {
    deletePersistedValue();
    setGroup("default");
  };

  return {
    group: group ?? persistedValue,
    setGroup: handleSetGroup,
    deleteGroup: handleDeleteGroup,
  };
}
