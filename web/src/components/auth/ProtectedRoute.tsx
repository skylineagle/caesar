import { useContext } from "react";
import { Navigate, Outlet, useLocation, useNavigate } from "react-router-dom";
import { AuthContext } from "@/context/auth-context";
import ActivityIndicator from "../indicators/activity-indicator";

export default function ProtectedRoute({
  requiredRoles,
}: {
  requiredRoles: ("admin" | "viewer")[];
}) {
  const { auth } = useContext(AuthContext);
  const location = useLocation();
  const navigate = useNavigate();

  if (auth.isLoading) {
    return (
      <ActivityIndicator className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" />
    );
  }

  // Unauthenticated mode
  if (!auth.isAuthenticated) {
    return <Outlet />;
  }

  // Authenticated mode (8971): require login
  if (!auth.user) {
    // Preserve the current URL as a return parameter
    const currentUrl = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?return=${currentUrl}`} />;
  }

  // If role is null (shouldn't happen if isAuthenticated, but type safety), fallback
  // though isAuthenticated should catch this
  if (auth.user.role === null) {
    return <Outlet />;
  }

  if (!requiredRoles.includes(auth.user.role)) {
    return <Navigate to="/unauthorized" />;
  }

  return <Outlet />;
}
