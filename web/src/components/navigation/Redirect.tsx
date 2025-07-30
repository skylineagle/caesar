import { Navigate } from "react-router-dom";

type RedirectProps = {
  to: string;
};

export function Redirect({ to }: RedirectProps) {
  return <Navigate to={to} replace />;
}
