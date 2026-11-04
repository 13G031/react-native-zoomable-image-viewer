import assert from "node:assert/strict";
import test from "node:test";

import {
  clamp,
  clampPhotoOffset,
  dragPhotoOffset,
  fitContainedSize,
  getPanBounds,
  photoPanLimit,
  zoomPhotoAtPoint,
} from "../src/geometry.js";

const viewport = { width: 400, height: 800 };
const fit = { scale: 1, x: 0, y: 0 };

function assertClose(actual, expected) {
  assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} should equal ${expected}`);
}

test("clamp keeps values inside the scale range", () => {
  assert.equal(clamp(0.5, 1, 4), 1);
  assert.equal(clamp(2.5, 1, 4), 2.5);
  assert.equal(clamp(8, 1, 4), 4);
});

test("fitContainedSize preserves wide and tall aspect ratios", () => {
  assert.deepEqual(fitContainedSize(300, 300, 2), {
    width: 300,
    height: 150,
  });
  assert.deepEqual(fitContainedSize(300, 300, 0.5), {
    width: 150,
    height: 300,
  });
});

test("getPanBounds prevents blank space around the scaled image", () => {
  assert.deepEqual(getPanBounds(300, 150, 2, 300, 300), { x: 150, y: 0 });
  assert.deepEqual(getPanBounds(300, 300, 3, 300, 300), { x: 300, y: 300 });
});

test("zoom keeps the same photo detail under an off-center focal point", () => {
  const focal = { x: 300, y: 250 };
  for (const scale of [1.25, 1.75, 2.6, 3]) {
    const zoom = zoomPhotoAtPoint(fit, scale, focal, viewport, viewport);
    assert.equal(zoom.scale, scale);
    assertClose((focal.x - viewport.width / 2 - zoom.x) / scale, 100);
    assertClose((focal.y - viewport.height / 2 - zoom.y) / scale, -150);
  }
});

test("zoom follows a moving focal point from an already panned photo", () => {
  const zoom = zoomPhotoAtPoint(
    { scale: 2, x: -100, y: 150 },
    3,
    { x: 300, y: 250 },
    viewport,
    viewport,
    { x: 350, y: 200 }
  );
  assert.deepEqual(zoom, { scale: 3, x: -150, y: 250 });
});

test("focal zoom respects a custom minimum scale", () => {
  const zoom = zoomPhotoAtPoint(
    { scale: 2, x: 0, y: 0 },
    3,
    { x: 300, y: 250 },
    viewport,
    viewport
  );
  assert.deepEqual(zoom, { scale: 3, x: -50, y: 75 });
});

test("letterboxed axes stay centered during zoom and drag", () => {
  const zoom = zoomPhotoAtPoint(
    fit, 2, { x: 350, y: 450 }, viewport, { width: 400, height: 180 }
  );
  assert.equal(zoom.scale, 2);
  assert.equal(zoom.x, -150);
  assertClose(zoom.y, 0);
  assert.equal(photoPanLimit(180, 800, 2), 0);
  assertClose(clampPhotoOffset(100, 180, 800, 2), 0);
  assert.equal(dragPhotoOffset(0, 100, 180, 800, 2), 0);
});

test("focal zoom stops at the edge when a letterboxed photo grows past the viewport", () => {
  const zoom = zoomPhotoAtPoint(
    fit, 2, { x: 300, y: 40 }, viewport, { width: 400, height: 500 }
  );
  assert.deepEqual(zoom, { scale: 2, x: -100, y: 100 });
});

test("offset clamping preserves interior positions and limits both edges", () => {
  assert.equal(clampPhotoOffset(150, 400, 400, 2), 150);
  assert.equal(clampPhotoOffset(300, 400, 400, 2), 200);
  assert.equal(clampPhotoOffset(-300, 400, 400, 2), -200);
  assert.equal(dragPhotoOffset(50, -20, 400, 400, 2), 30);
});

test("edge resistance catches a returning photo without jumping and reverses immediately", () => {
  for (const direction of [1, -1]) {
    const pulled = dragPhotoOffset(0, direction * 300, 400, 400, 2);
    assert.ok(Math.abs(pulled) > 200);
    assert.ok(Math.abs(pulled) < 300);
    assertClose(dragPhotoOffset(pulled, 0, 400, 400, 2), pulled);

    const reversed = dragPhotoOffset(pulled, -direction * 10, 400, 400, 2);
    assert.ok(direction * reversed < direction * pulled);
    assert.ok(direction * reversed > 200);
    assertClose(dragPhotoOffset(pulled, -direction * 200, 400, 400, 2), direction * 100);
  }
});

test("a pinch can catch an overscrolled photo continuously", () => {
  const start = { scale: 2, x: 220, y: 0 };
  const focal = { x: 200, y: 400 };
  const captured = zoomPhotoAtPoint(start, 2, focal, viewport, viewport, focal, true);
  assert.deepEqual(captured, start);

  const moved = zoomPhotoAtPoint(start, 2, focal, viewport, viewport, { x: 190, y: 400 }, true);
  assert.ok(moved.x < captured.x);
  assert.ok(moved.x > 200);
  assert.equal(moved.y, 0);
});
