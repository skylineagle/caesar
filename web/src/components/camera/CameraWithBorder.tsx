import { cn } from "@/lib/utils";
import { CameraConfig } from "@/types/frigateConfig";
import { useCameraActivity } from "@/hooks/use-camera-activity";
import { ReactNode, forwardRef } from "react";

type CameraWithBorderProps = {
  camera: CameraConfig;
  className?: string;
  children: ReactNode;
} & React.HTMLAttributes<HTMLDivElement>;

export const CameraWithBorder = forwardRef<
  HTMLDivElement,
  CameraWithBorderProps
>(({ camera, className, children, ...props }, ref) => {
  const { activeTracking, activeMotion } = useCameraActivity(camera);

  return (
    <div
      ref={ref}
      className={cn(
        "group relative flex w-full cursor-pointer justify-center overflow-hidden outline",
        activeTracking
          ? "outline-3 rounded-lg shadow-severity_alert outline-severity_alert md:rounded-2xl"
          : activeMotion
            ? "outline-3 rounded-lg shadow-severity_significant_motion outline-severity_significant_motion md:rounded-2xl"
            : "rounded-lg outline-0 outline-background md:rounded-2xl",
        "transition-all duration-500",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
});
