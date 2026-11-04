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
    x: photoPanLimit(contentWidth, viewportWidth, scale),
    y: photoPanLimit(contentHeight, viewportHeight, scale),
  };
}

/** @param {number} image @param {number} viewport @param {number} scale */
export function photoPanLimit(image, viewport, scale) {
  "worklet";
  return Math.max(0, (image * scale - viewport) / 2);
}

/** @param {number} offset @param {number} image @param {number} viewport @param {number} scale */
export function clampPhotoOffset(offset, image, viewport, scale) {
  "worklet";
  const limit = photoPanLimit(image, viewport, scale);
  if (limit === 0) return 0;
  return clamp(offset, -limit, limit);
}

/** @param {number} offset @param {number} delta @param {number} image @param {number} viewport @param {number} scale */
export function dragPhotoOffset(offset, delta, image, viewport, scale) {
  "worklet";
  if (photoPanLimit(image, viewport, scale) === 0) return 0;
  const resistance = 0.35;
  const edge = clampPhotoOffset(offset, image, viewport, scale);
  // Undo resistance before moving so catching an edge return stays continuous.
  const next = edge + (offset - edge) / resistance + delta;
  const nextEdge = clampPhotoOffset(next, image, viewport, scale);
  return nextEdge + (next - nextEdge) * resistance;
}

/**
 * @param {{ x: number, y: number, scale: number }} start
 * @param {number} scale
 * @param {{ x: number, y: number }} focal
 * @param {{ width: number, height: number }} viewport
 * @param {{ width: number, height: number }} image
 * @param {{ x: number, y: number }} nextFocal
 * @param {boolean} allowOverscroll
 */
export function zoomPhotoAtPoint(start, scale, focal, viewport, image, nextFocal = focal, allowOverscroll = false) {
  "worklet";
  const ratio = scale / start.scale;
  const imageX = focal.x - viewport.width / 2 - start.x;
  const imageY = focal.y - viewport.height / 2 - start.y;
  const x = nextFocal.x - viewport.width / 2 - imageX * ratio;
  const y = nextFocal.y - viewport.height / 2 - imageY * ratio;
  return {
    scale,
    x: allowOverscroll
      ? dragPhotoOffset(start.x, x - start.x, image.width, viewport.width, scale)
      : clampPhotoOffset(x, image.width, viewport.width, scale),
    y: allowOverscroll
      ? dragPhotoOffset(start.y, y - start.y, image.height, viewport.height, scale)
      : clampPhotoOffset(y, image.height, viewport.height, scale),
  };
}
