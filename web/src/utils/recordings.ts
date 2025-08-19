import { Recording, RecordingSegment } from "../types/record";

/**
 * Check if a recording was backfilled (not processed by algorithms)
 */
export const isBackfilledRecording = (
  recording: Recording | RecordingSegment,
): boolean => {
  return recording.motion === -1 || recording.objects === -1;
};

/**
 * Get the processing status of a recording
 */
export const getRecordingProcessingStatus = (
  recording: Recording | RecordingSegment,
): "live" | "backfilled" => {
  return isBackfilledRecording(recording) ? "backfilled" : "live";
};

/**
 * Get a visual indicator for the recording type
 */
export const getRecordingIcon = (
  recording: Recording | RecordingSegment,
): string => {
  if (isBackfilledRecording(recording)) {
    return "📁"; // File icon for backfilled recordings
  }

  // Live recordings with motion
  if (recording.motion > 0) {
    return "🎥"; // Video icon with motion
  }

  return "📹"; // Regular video icon
};

/**
 * Get CSS class for recording styling
 */
export const getRecordingCssClass = (
  recording: Recording | RecordingSegment,
): string => {
  if (isBackfilledRecording(recording)) {
    return "recording-backfilled";
  }
  return "recording-live";
};

/**
 * Get tooltip text for recording
 */
export const getRecordingTooltip = (
  recording: Recording | RecordingSegment,
): string => {
  if (isBackfilledRecording(recording)) {
    return "Backfilled recording - no motion detection data available";
  }

  if (recording.motion > 0) {
    return `Live recording with ${recording.motion} motion events`;
  }

  return "Live recording - no motion detected";
};

/**
 * Format motion count for display
 */
export const formatMotionCount = (motion: number): string => {
  if (motion === -1) {
    return "N/A"; // Not available for backfilled recordings
  }
  return motion.toString();
};

/**
 * Format object count for display
 */
export const formatObjectCount = (objects: number): string => {
  if (objects === -1) {
    return "N/A"; // Not available for backfilled recordings
  }
  return objects.toString();
};

/**
 * Check if recording has valid motion data
 */
export const hasMotionData = (
  recording: Recording | RecordingSegment,
): boolean => {
  return recording.motion >= 0;
};

/**
 * Check if recording has valid object data
 */
export const hasObjectData = (
  recording: Recording | RecordingSegment,
): boolean => {
  return recording.objects >= 0;
};
