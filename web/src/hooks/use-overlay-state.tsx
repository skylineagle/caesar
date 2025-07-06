export function useSearchEffect(
  key: string,
  callback: (value: string) => boolean,
) {
  console.log("useSearchEffect", key);
  // const location = useLocation();
  // const [searchParams, setSearchParams] = useSearchParams();
  // const param = useMemo(() => {
  //   const param = searchParams.get(key);
  //   if (!param) {
  //     return undefined;
  //   }
  //   return [key, decodeURIComponent(param)];
  // }, [searchParams, key]);
  // useEffect(() => {
  //   if (!param) {
  //     return;
  //   }
  //   const remove = callback(param[1]);
  //   if (remove) {
  //     setSearchParams(undefined, { state: location.state, replace: true });
  //   }
  // }, [param, location.state, callback, setSearchParams]);
}
