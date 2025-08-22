import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { StreamingPriority } from "@/types/live";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";

type StreamingModeDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentPriority: StreamingPriority;
  onSave: (priority: StreamingPriority) => void;
};

export const StreamingModeDialog = ({
  open,
  onOpenChange,
  currentPriority,
  onSave,
}: StreamingModeDialogProps) => {
  const { t } = useTranslation(["views/settings", "common"]);

  const handleSave = useCallback(
    (priority: StreamingPriority) => {
      onSave(priority);
      onOpenChange(false);
    },
    [onSave, onOpenChange],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {t("streamingMode.title", { ns: "views/settings" })}
          </DialogTitle>
          <DialogDescription>
            {t("streamingMode.description", { ns: "views/settings" })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <RadioGroup
            value={currentPriority}
            onValueChange={(value) => handleSave(value as StreamingPriority)}
          >
            <div className="space-y-4">
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="standard" id="standard" />
                <div className="space-y-1">
                  <Label htmlFor="standard" className="text-sm font-medium">
                    {t("streamingMode.standard.title", {
                      ns: "views/settings",
                    })}
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {t("streamingMode.standard.description", {
                      ns: "views/settings",
                    })}
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <RadioGroupItem
                  value="ultra-low-latency"
                  id="ultra-low-latency"
                />
                <div className="space-y-1">
                  <Label
                    htmlFor="ultra-low-latency"
                    className="text-sm font-medium"
                  >
                    {t("streamingMode.ultraLowLatency.title", {
                      ns: "views/settings",
                    })}
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {t("streamingMode.ultraLowLatency.description", {
                      ns: "views/settings",
                    })}
                  </p>
                </div>
              </div>
            </div>
          </RadioGroup>

          <div className="rounded-md bg-yellow-50 p-3 dark:bg-yellow-950">
            <div className="flex">
              <div className="ml-3">
                <h3 className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                  {t("streamingMode.warning.title", { ns: "views/settings" })}
                </h3>
                <div className="mt-2 text-sm text-yellow-700 dark:text-yellow-300">
                  <p>
                    {t("streamingMode.warning.description", {
                      ns: "views/settings",
                    })}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("cancel", { ns: "common" })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
