import axios from "axios";
import { ReactNode } from "react";
import { SWRConfig } from "swr";
import { baseUrl } from "./baseUrl";
import { WsProvider } from "./ws";

axios.defaults.baseURL = `${baseUrl}api/`;

// Global reference to store the navigate function
let navigateFunction:
  | ((to: string, options?: { replace?: boolean }) => void)
  | null = null;

export const setNavigateFunction = (
  navigate: (to: string, options?: { replace?: boolean }) => void,
) => {
  navigateFunction = navigate;
};

type ApiProviderType = {
  children?: ReactNode;
  options?: Record<string, unknown>;
};

export function ApiProvider({ children, options }: ApiProviderType) {
  axios.defaults.headers.common = {
    "X-CSRF-TOKEN": 1,
    "X-CACHE-BYPASS": 1,
  };

  return (
    <SWRConfig
      value={{
        fetcher: (key) => {
          const [path, params] = Array.isArray(key) ? key : [key, undefined];
          return axios.get(path, { params }).then((res) => res.data);
        },
        onError: (error, key) => {
          if (
            error.response &&
            [401, 302, 307].includes(error.response.status)
          ) {
            const path = Array.isArray(key) ? key[0] : key;

            if (path === "/profile") {
              return;
            }

            const loginPage = "/login";
            if (window.location.pathname !== loginPage) {
              const currentUrl = encodeURIComponent(
                window.location.pathname + window.location.search,
              );
              const redirectUrl = `${loginPage}?return=${currentUrl}`;

              if (navigateFunction) {
                navigateFunction(redirectUrl);
              } else {
                window.location.href = redirectUrl;
              }
            }
          }
        },
        ...options,
      }}
    >
      <WsWithConfig>{children}</WsWithConfig>
    </SWRConfig>
  );
}

type WsWithConfigType = {
  children: ReactNode;
};

function WsWithConfig({ children }: WsWithConfigType) {
  return <WsProvider>{children}</WsProvider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useApiHost() {
  return baseUrl;
}
