import ActivityIndicator from "@/components/indicators/activity-indicator";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import Heading from "@/components/ui/heading";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { FrigateConfig } from "@/types/frigateConfig";
import { User } from "@/types/user";
import axios, { AxiosError } from "axios";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import useSWR from "swr";

type PermissionsSummaryUser = {
  username: string;
  role: "admin" | "viewer" | string;
  cameras: "all" | string[];
};

type PermissionsSummary = {
  permissions: PermissionsSummaryUser[];
};

const CameraPermissionsView = () => {
  const { t } = useTranslation("views/settings");
  const { data: config } = useSWR<FrigateConfig>("config");
  const { data: users } = useSWR<User[]>("users");
  const { data: summary, mutate: mutateSummary } = useSWR<PermissionsSummary>(
    "camera_permissions/summary",
  );

  const cameraNames = useMemo(() => {
    if (!config) return [] as string[];
    return Object.keys(config.cameras);
  }, [config]);

  const allUsers = useMemo(() => {
    if (!users) return [] as User[];
    return users;
  }, [users]);

  const initialUser = useMemo(() => {
    if (!allUsers.length) return "";
    const nonAdmin = allUsers.find((u) => u.username !== "admin");
    return nonAdmin?.username || allUsers[0]?.username || "";
  }, [allUsers]);

  const [selectedUser, setSelectedUser] = useState<string>("");
  const [selectedCameras, setSelectedCameras] = useState<string[]>([]);
  const skipNextSaveRef = useRef(false);

  useEffect(() => {
    if (!selectedUser && initialUser) setSelectedUser(initialUser);
  }, [selectedUser, initialUser]);

  useEffect(() => {
    document.title = t("documentTitle.cameraPermissions");
  }, [t]);

  useEffect(() => {
    if (!summary || !selectedUser) return;
    const found = summary.permissions.find((p) => p.username === selectedUser);
    if (!found) return;
    skipNextSaveRef.current = true;
    if (found.cameras === "all") {
      setSelectedCameras(cameraNames);
      return;
    }
    setSelectedCameras(found.cameras || []);
  }, [summary, selectedUser, cameraNames]);

  const allSelected = useMemo(() => {
    if (!cameraNames.length) return false;
    return selectedCameras.length === cameraNames.length;
  }, [selectedCameras, cameraNames]);

  const handleSelectUser = useCallback((username: string) => {
    setSelectedUser(username);
  }, []);

  const handleToggleAll = useCallback(
    (checked: boolean) => {
      if (checked) {
        setSelectedCameras(cameraNames);
        return;
      }
      toast.error(t("cameraPermissions.toast.error.mustSelectAtLeastOne"), {
        position: "top-center",
        id: "camera-permissions-min-one",
      });
    },
    [cameraNames, t],
  );

  const handleToggleCamera = useCallback(
    (camera: string, checked: boolean) => {
      setSelectedCameras((prev) => {
        if (checked) return Array.from(new Set([...prev, camera]));
        if (prev.length === 1 && prev[0] === camera) {
          toast.error(t("cameraPermissions.toast.error.mustSelectAtLeastOne"), {
            position: "top-center",
            id: "camera-permissions-min-one",
          });
          return prev;
        }
        return prev.filter((c) => c !== camera);
      });
    },
    [t],
  );

  useEffect(() => {
    if (!selectedUser) return;
    if (skipNextSaveRef.current) {
      skipNextSaveRef.current = false;
      return;
    }
    const timeoutId = setTimeout(async () => {
      const payloadCameras =
        selectedCameras.length === cameraNames.length ? [] : selectedCameras;
      try {
        const res = await axios.post("camera_permissions/set", {
          username: selectedUser,
          camera_names: payloadCameras,
        });
        if (res.status === 200) {
          mutateSummary();
        }
      } catch (error: unknown) {
        if (error instanceof AxiosError) {
          const errorMessage = error.response?.data?.message || "Unknown error";
          toast.error(
            t("cameraPermissions.toast.error.saveFailed", { errorMessage }),
            { position: "top-center", id: "camera-permissions-save-failed" },
          );
        }
      }
    }, 400);
    return () => clearTimeout(timeoutId);
  }, [selectedUser, selectedCameras, cameraNames.length, mutateSummary, t]);

  if (!config || !users || !summary) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <ActivityIndicator />
      </div>
    );
  }

  return (
    <div className="flex size-full flex-col md:flex-row">
      <div className="order-last mb-10 mt-2 w-full rounded-lg border border-secondary-foreground bg-background_alt p-2 md:order-none md:mb-0 md:mr-2 md:mt-0 md:w-1/3">
        <div className="mb-4 flex items-center justify-between">
          <Heading as="h3" className="my-2">
            {t("cameraPermissions.users.title")}
          </Heading>
        </div>
        <div className="scrollbar-container h-[60dvh] overflow-y-auto rounded-lg border border-border">
          <Table>
            <TableHeader className="sticky top-0 bg-muted/50">
              <TableRow>
                <TableHead className="w-[250px]">
                  {t("cameraPermissions.table.username")}
                </TableHead>
                <TableHead>{t("cameraPermissions.table.role")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {allUsers.map((u) => (
                <TableRow
                  key={u.username}
                  className={
                    u.username === selectedUser
                      ? "bg-muted/50"
                      : "cursor-pointer"
                  }
                  onClick={() => handleSelectUser(u.username)}
                  tabIndex={0}
                  aria-label={t("cameraPermissions.users.select", {
                    user: u.username,
                  })}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ")
                      handleSelectUser(u.username);
                  }}
                >
                  <TableCell className="font-medium">{u.username}</TableCell>
                  <TableCell className="capitalize">
                    {t(`role.${u.role || "viewer"}`, { ns: "common" })}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      <div className="scrollbar-container flex h-full w-full flex-1 flex-col overflow-y-auto rounded-lg border border-secondary-foreground bg-background_alt p-2">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex flex-col items-start">
            <Heading as="h3" className="my-2">
              {t("cameraPermissions.title")}
            </Heading>
            <p className="text-sm text-muted-foreground">
              {t("cameraPermissions.desc")}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              aria-label={t("cameraPermissions.actions.selectAll")}
              variant="outline"
              onClick={() => handleToggleAll(true)}
            >
              {t("cameraPermissions.actions.selectAll")}
            </Button>
            <Button
              size="sm"
              aria-label={t("cameraPermissions.actions.clearAll")}
              variant="outline"
              onClick={() => handleToggleAll(false)}
            >
              {t("cameraPermissions.actions.clearAll")}
            </Button>
          </div>
        </div>

        <div className="mb-2 flex items-center gap-2">
          <Checkbox
            id="select-all"
            checked={allSelected}
            onCheckedChange={(val) => handleToggleAll(Boolean(val))}
          />
          <label
            htmlFor="select-all"
            className="cursor-pointer select-none text-sm"
          >
            {t("cameraPermissions.selectAllCameras")}
          </label>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {cameraNames.map((cam) => {
            const checked = selectedCameras.includes(cam);
            const inputId = `cam-${cam}`;
            return (
              <div
                key={cam}
                className="flex items-center gap-2 rounded-md border border-border p-2"
              >
                <Checkbox
                  id={inputId}
                  checked={checked}
                  onCheckedChange={(val) =>
                    handleToggleCamera(cam, Boolean(val))
                  }
                />
                <label
                  htmlFor={inputId}
                  className="cursor-pointer select-none smart-capitalize"
                >
                  {cam.replaceAll("_", " ")}
                </label>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default CameraPermissionsView;
