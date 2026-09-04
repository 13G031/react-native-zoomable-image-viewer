import assert from "node:assert/strict";
import test from "node:test";

import {
  clamp,
  fitContainedSize,
  getPanBounds,
} from "../src/geometry.js";

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
