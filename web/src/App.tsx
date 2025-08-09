import { setNavigateFunction } from "@/api";
import { baseUrl } from "@/api/baseUrl";
import Wrapper from "@/components/Wrapper";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import Sidebar from "@/components/navigation/Sidebar";
import Providers from "@/context/providers";
import { Suspense, lazy, useEffect } from "react";
import { isDesktop, isMobile } from "react-device-detect";
import {
  BrowserRouter,
  Route,
  Routes,
  useNavigate,
  Outlet,
} from "react-router-dom";
import Statusbar from "./components/Statusbar";
import Bottombar from "./components/navigation/Bottombar";
import { Redirect } from "./components/navigation/Redirect";
import { cn } from "./lib/utils";
import { isPWA } from "./utils/isPWA";
import { Toaster } from "sonner";

const Live = lazy(() => import("@/pages/Live"));
const GroupView = lazy(() => import("@/pages/GroupView"));
const LiveCameraPage = lazy(() => import("@/pages/LiveCameraPage"));
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

function MainLayout() {
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
            <Outlet />
          </Suspense>
        </div>
      </div>
    </Wrapper>
  );
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/unauthorized" element={<AccessDenied />} />
      <Route element={<MainLayout />}>
        <Route element={<ProtectedRoute requiredRoles={["viewer", "admin"]} />}>
          <Route index element={<Live />} />
          <Route path="/group/:group" element={<GroupView />} />
          <Route path="/camera/:camera" element={<LiveCameraPage />} />
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
      </Route>
      <Route path="*" element={<Redirect to="/" />} />
    </Routes>
  );
}

function NavigationSetup() {
  const navigate = useNavigate();

  useEffect(() => {
    setNavigateFunction(navigate);
  }, [navigate]);

  return null;
}

function App() {
  const basePath = new URL(baseUrl).pathname;

  return (
    <Providers>
      <BrowserRouter basename={basePath}>
        <NavigationSetup />
        <AppRoutes />
        <Toaster position="top-center" closeButton />
      </BrowserRouter>
    </Providers>
  );
}

export default App;
