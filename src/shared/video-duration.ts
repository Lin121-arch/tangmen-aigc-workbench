/** Integer-second video durations shared by the canvas and generation services. */
export const VIDEO_DURATIONS = Array.from({ length: 15 }, (_, index) => index + 1);

export function normalizeVideoDuration(value: unknown, workflowId?: string, declaredMinimum?: number, allowed?: number[]): number {
  const duration = Number(value ?? 5);
  if (allowed?.length) return allowed.includes(duration) ? duration : allowed[0];
  const minimum = declaredMinimum ?? (workflowId?.startsWith('seedance-') ? 4 : 1);
  return Number.isFinite(duration) ? Math.max(minimum, Math.min(15, Math.round(duration))) : 5;
}
