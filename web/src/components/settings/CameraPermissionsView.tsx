import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { AuthContext } from "@/context/auth-context";
import { FrigateConfig } from "@/types/frigateConfig";
import { isDefaultAdmin } from "@/utils/isDefaultAdmin";
import axios from "axios";
import { useCallback, useContext, useMemo, useState } from "react";
import { toast } from "sonner";
import useSWR from "swr";

type User = {
  username: string;
  role: string;
};

type UserPermissions = {
  username: string;
  role: string;
  cameras: string[] | "all";
};

type CameraPermissionsViewProps = {
  config: FrigateConfig;
};

const CameraPermissionsView = ({ config }: CameraPermissionsViewProps) => {
  const [isLoading, setIsLoading] = useState(false);
  const { auth } = useContext(AuthContext);

  const { data: users } = useSWR<User[]>("users");
  const { data: permissionsSummary, mutate: mutatePermissions } = useSWR<{
    permissions: UserPermissions[];
  }>("camera_permissions/summary");

  const allCameras = useMemo(() => {
    return Object.keys(config?.cameras || {});
  }, [config]);

  const getUserCameras = useCallback(
    (username: string): string[] => {
      const userPermission = permissionsSummary?.permissions.find(
        (p) => p.username === username,
      );
      if (!userPermission || userPermission.cameras === "all") {
        return allCameras;
      }
      return Array.isArray(userPermission.cameras)
        ? userPermission.cameras
        : [];
    },
    [permissionsSummary, allCameras],
  );

  const handleUserPermissionChange = useCallback(
    async (username: string, cameraName: string, isChecked: boolean) => {
      // Prevent revoking the last camera permission
      if (!isChecked) {
        const userCameras = getUserCameras(username);
        if (userCameras.length === 1 && userCameras.includes(cameraName)) {
          toast.error(
            "A user must have permission to at least one camera. Use 'Grant All' to reset permissions.",
          );
          return;
        }
      }

      setIsLoading(true);
      try {
        const endpoint = isChecked
          ? "camera_permissions/grant"
          : "camera_permissions/revoke";

        await axios.post(`/${endpoint}`, {
          username,
          camera_name: cameraName,
        });

        await mutatePermissions();
        toast.success(
          `Camera permission ${isChecked ? "granted" : "revoked"} successfully`,
        );
      } catch (error) {
        toast.error("Failed to update camera permission");
      } finally {
        setIsLoading(false);
      }
    },
    [mutatePermissions, getUserCameras],
  );

  const handleSetUserPermissions = useCallback(
    async (username: string, selectedCameras: string[]) => {
      setIsLoading(true);
      try {
        await axios.post("/camera_permissions/set", {
          username,
          camera_names: selectedCameras,
        });

        await mutatePermissions();
        toast.success("Camera permissions updated successfully");
      } catch (error) {
        toast.error("Failed to update camera permissions");
      } finally {
        setIsLoading(false);
      }
    },
    [mutatePermissions],
  );

  const hasCameraPermission = useCallback(
    (username: string, cameraName: string): boolean => {
      const userCameras = getUserCameras(username);
      return userCameras.includes(cameraName);
    },
    [getUserCameras],
  );

  if (!users || !permissionsSummary) {
    return <div>Loading...</div>;
  }

  const viewerUsers = users.filter((user) => !isDefaultAdmin(user));

  // Show loading while auth is being determined
  if (!auth.user) {
    return <div>Loading...</div>;
  }

  const isDevAdmin =
    auth.user.username === "anonymous" && auth.user.role === "admin";

  if (!isDefaultAdmin(auth.user) && !isDevAdmin) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold">Camera Permissions</h2>
          <p className="text-muted-foreground">
            Access denied. Only the default admin user can manage camera
            permissions.
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            Current user: {auth.user.username} (role: {auth.user.role})
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Camera Permissions</h2>
        <p className="text-muted-foreground">
          Manage which cameras each user can access. Admin users have access to
          all cameras by default.
        </p>
      </div>

      {viewerUsers.length === 0 ? (
        <Card>
          <CardContent className="py-6">
            <p className="text-center text-muted-foreground">
              No viewer users found. Only viewer users can have restricted
              camera access.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {viewerUsers.map((user) => (
            <Card key={user.username}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <div>
                    <span>{user.username}</span>
                    <span className="ml-2 text-sm font-normal text-muted-foreground">
                      ({user.role})
                    </span>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {getUserCameras(user.username).length === allCameras.length
                      ? "All cameras"
                      : `${getUserCameras(user.username).length} / ${
                          allCameras.length
                        } cameras`}
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
                    {allCameras.map((cameraName) => (
                      <label
                        key={cameraName}
                        className="flex cursor-pointer items-center space-x-2"
                      >
                        <Checkbox
                          checked={hasCameraPermission(
                            user.username,
                            cameraName,
                          )}
                          onCheckedChange={(checked) =>
                            handleUserPermissionChange(
                              user.username,
                              cameraName,
                              checked as boolean,
                            )
                          }
                          disabled={isLoading}
                        />
                        <span className="text-sm">{cameraName}</span>
                      </label>
                    ))}
                  </div>
                  <div className="flex gap-2 border-t pt-3">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        handleSetUserPermissions(user.username, allCameras)
                      }
                      disabled={isLoading}
                    >
                      Grant All
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default CameraPermissionsView;
