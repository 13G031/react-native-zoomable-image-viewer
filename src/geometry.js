/**
 * @param {number} value
 * @param {number} minimum
 * @param {number} maximum
 */
export function clamp(value, minimum, maximum) {
  "worklet";
  return Math.max(minimum, Math.min(value, maximum));
}

/**
 * Fits an aspect ratio inside a container without cropping.
 *
 * @param {number} containerWidth
 * @param {number} containerHeight
 * @param {number} aspectRatio
 * @returns {{ width: number, height: number }}
 */
export function fitContainedSize(containerWidth, containerHeight, aspectRatio) {
  "worklet";
  if (containerWidth <= 0 || containerHeight <= 0 || aspectRatio <= 0) {
    return { width: 0, height: 0 };
  }

  const containerRatio = containerWidth / containerHeight;
  return aspectRatio > containerRatio
    ? { width: containerWidth, height: containerWidth / aspectRatio }
    : { width: containerHeight * aspectRatio, height: containerHeight };
}

/**
 * Returns the maximum translation that keeps a scaled image over its viewport.
 *
 * @param {number} contentWidth
 * @param {number} contentHeight
 * @param {number} scale
 * @param {number} viewportWidth
 * @param {number} viewportHeight
 * @returns {{ x: number, y: number }}
 */
export function getPanBounds(
  contentWidth,
  contentHeight,
  scale,
  viewportWidth,
  viewportHeight
) {
  "worklet";
  return {
    x: Math.max(0, (contentWidth * scale - viewportWidth) / 2),
    y: Math.max(0, (contentHeight * scale - viewportHeight) / 2),
  };
}
