import axios from "axios";
import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import useSWR from "swr";

interface AuthState {
  user: { username: string; role: "admin" | "viewer" | null } | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

interface AuthContextType {
  auth: AuthState;
  login: (user: AuthState["user"]) => void;
  logout: () => void;
}

export const AuthContext = createContext<AuthContextType>({
  auth: { user: null, isLoading: true, isAuthenticated: false },
  login: () => {},
  logout: () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [auth, setAuth] = useState<AuthState>({
    user: null,
    isLoading: true,
    isAuthenticated: false,
  });

  const { data: profile, error } = useSWR("/profile", {
    revalidateOnFocus: false,
    revalidateOnReconnect: true,
    errorRetryCount: 3,
    errorRetryInterval: 1000,
    shouldRetryOnError: (error) => {
      if (axios.isAxiosError(error)) {
        return error.response?.status !== 401;
      }
      return true;
    },
    fetcher: async (url) => {
      try {
        const response = await axios.get(url, { withCredentials: true });
        return response.data;
      } catch (error) {
        if (axios.isAxiosError(error) && error.response?.status === 401) {
          throw error;
        }
        throw error;
      }
    },
  });

  useEffect(() => {
    if (error) {
      if (axios.isAxiosError(error) && error.response?.status === 401) {
        setAuth((prevAuth) => {
          if (prevAuth.user === null && !prevAuth.isLoading) {
            return prevAuth;
          }
          return { user: null, isLoading: false, isAuthenticated: true };
        });
      } else {
        setAuth((prevAuth) => {
          if (prevAuth.user === null && !prevAuth.isLoading) {
            return prevAuth;
          }
          return { user: null, isLoading: false, isAuthenticated: false };
        });
      }
      return;
    }

    if (profile) {
      if (profile.username && profile.username !== "anonymous") {
        const newUser = {
          username: profile.username,
          role: profile.role || "viewer",
        };
        setAuth((prevAuth) => {
          if (
            prevAuth.user?.username === newUser.username &&
            prevAuth.user?.role === newUser.role &&
            !prevAuth.isLoading
          ) {
            return prevAuth;
          }
          return { user: newUser, isLoading: false, isAuthenticated: true };
        });
      } else {
        setAuth((prevAuth) => {
          if (prevAuth.user === null && !prevAuth.isLoading) {
            return prevAuth;
          }
          return { user: null, isLoading: false, isAuthenticated: false };
        });
      }
    }
  }, [profile, error]);

  const login = useCallback((user: AuthState["user"]) => {
    setAuth({ user, isLoading: false, isAuthenticated: true });
  }, []);

  const logout = () => {
    setAuth({ user: null, isLoading: false, isAuthenticated: true });
    axios.get("/logout", { withCredentials: true });
  };

  const contextValue = useMemo(
    () => ({
      auth,
      login,
      logout,
    }),
    [auth, login],
  );

  return (
    <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>
  );
}
