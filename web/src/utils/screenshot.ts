export const captureScreenshot = (
  videoElement: HTMLVideoElement | HTMLCanvasElement | null,
  filename?: string,
): Promise<void> => {
  return new Promise((resolve, reject) => {
    if (!videoElement) {
      reject(new Error("No video element provided"));
      return;
    }

    try {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");

      if (!ctx) {
        reject(new Error("Could not get canvas context"));
        return;
      }

      let width: number;
      let height: number;

      if (videoElement instanceof HTMLVideoElement) {
        width = videoElement.videoWidth;
        height = videoElement.videoHeight;
        canvas.width = width;
        canvas.height = height;
        ctx.drawImage(videoElement, 0, 0, width, height);
      } else if (videoElement instanceof HTMLCanvasElement) {
        width = videoElement.width;
        height = videoElement.height;
        canvas.width = width;
        canvas.height = height;
        ctx.drawImage(videoElement, 0, 0, width, height);
      } else {
        reject(new Error("Unsupported element type"));
        return;
      }

      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error("Failed to create blob"));
          return;
        }

        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = filename || `screenshot_${Date.now()}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        resolve();
      }, "image/png");
    } catch (error) {
      reject(error);
    }
  });
};

export const captureLiveScreenshot = async (
  cameraName: string,
  filename?: string,
): Promise<void> => {
  try {
    const response = await fetch(
      `/api/${cameraName}/latest.webp?cache=${Date.now()}`,
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch latest frame: ${response.statusText}`);
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename || getScreenshotFilename(cameraName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  } catch (error) {
    throw new Error(`Failed to capture live screenshot: ${error}`);
  }
};

export const getScreenshotFilename = (
  cameraName: string,
  timestamp?: number,
): string => {
  const date = timestamp ? new Date(timestamp * 1000) : new Date();
  const dateStr = date.toISOString().replace(/[:.]/g, "-").slice(0, 19);
  return `${cameraName}_${dateStr}.png`;
};
