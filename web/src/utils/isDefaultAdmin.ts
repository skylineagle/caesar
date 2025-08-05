import type { AuthState } from "@/context/auth-context";
import { User } from "@/types/user";

export function isDefaultAdmin(user: AuthState["user"] | User) {
  return user?.username === "admin" && user?.role === "admin";
}
