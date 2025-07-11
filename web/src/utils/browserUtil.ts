import copy from "copy-to-clipboard";
import { t } from "i18next";
import { toast } from "sonner";

export function shareOrCopy(url: string, title?: string) {
  if (window.isSecureContext && "share" in navigator) {
    navigator.share({
      url: url,
      title: title,
    });
  } else {
    copy(url);
    toast.success(t("toast.copyUrlToClipboard", { ns: "common" }), {
      position: "top-center",
    });
  }
}

export function copyToClipboard(url: string) {
  copy(url);
  toast.success(t("toast.copyUrlToClipboard", { ns: "common" }), {
    position: "top-center",
  });
}
