import Providers from "@/context/providers";
import { BrowserRouter, Routes, Route, useNavigate } from "react-router-dom";
import Wrapper from "@/components/Wrapper";
import Sidebar from "@/components/navigation/Sidebar";

import { isDesktop, isMobile } from "react-device-detect";
import Statusbar from "./components/Statusbar";
import Bottombar from "./components/navigation/Bottombar";
import { Suspense, lazy, useEffect } from "react";
import { Redirect } from "./components/navigation/Redirect";
import { cn } from "./lib/utils";
import { isPWA } from "./utils/isPWA";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { baseUrl } from "@/api/baseUrl";
import { setNavigateFunction } from "@/api";

const Live = lazy(() => import("@/pages/Live"));
const Events = lazy(() => import("@/pages/Events"));
const Explore = lazy(() => import("@/pages/Explore"));
const Exports = lazy(() => import("@/pages/Exports"));
const ConfigEditor = lazy(() => import("@/pages/ConfigEditor"));
const System = lazy(() => import("@/pages/System"));
const Settings = lazy(() => import("@/pages/Settings"));
const UIPlayground = lazy(() => import("@/pages/UIPlayground"));
const FaceLibrary = lazy(() => import("@/pages/FaceLibrary"));
const Logs = lazy(() => import("@/pages/Logs"));
const AccessDenied = lazy(() => import("@/pages/AccessDenied"));
const LoginPage = lazy(() => import("@/pages/LoginPage"));

function AppRoutes() {
  const navigate = useNavigate();

  useEffect(() => {
    setNavigateFunction(navigate);
  }, [navigate]);

  return (
    <Wrapper>
      <div className="size-full overflow-hidden">
        {isDesktop && <Sidebar />}
        {isDesktop && <Statusbar />}
        {isMobile && <Bottombar />}
        <div
          id="pageRoot"
          className={cn(
            "absolute right-0 top-0 overflow-hidden",
            isMobile
              ? `bottom-${isPWA ? 16 : 12} left-0 md:bottom-16 landscape:bottom-14 landscape:md:bottom-16`
              : "bottom-8 left-[52px]",
          )}
        >
          <Suspense>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route
                element={<ProtectedRoute requiredRoles={["viewer", "admin"]} />}
              >
                <Route index element={<Live />} />
                <Route path="/review" element={<Events />} />
                <Route path="/explore" element={<Explore />} />
                <Route path="/export" element={<Exports />} />
                <Route path="/settings" element={<Settings />} />
              </Route>
              <Route element={<ProtectedRoute requiredRoles={["admin"]} />}>
                <Route path="/system" element={<System />} />
                <Route path="/config" element={<ConfigEditor />} />
                <Route path="/logs" element={<Logs />} />
                <Route path="/faces" element={<FaceLibrary />} />
                <Route path="/playground" element={<UIPlayground />} />
              </Route>
              <Route path="/unauthorized" element={<AccessDenied />} />
              <Route path="*" element={<Redirect to="/" />} />
            </Routes>
          </Suspense>
        </div>
      </div>
    </Wrapper>
  );
}

function App() {
  const basePath = new URL(baseUrl).pathname;

  return (
    <Providers>
      <BrowserRouter basename={basePath}>
        <AppRoutes />
      </BrowserRouter>
    </Providers>
  );
}

export default App;
