import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

import * as geometry from "../src/geometry.js";

const { outputText } = ts.transpileModule(
  readFileSync(new URL("../src/ZoomableImageViewer.tsx", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true } }
);

function createViewer(props = {}) {
  const gestures = { tap: [], pan: [], pinch: [] };
  const animations = [];
  const state = [false, 0.5];
  let stateIndex = 0;
  let readStyle;
  const element = (type, props, ...children) => ({ type, props: { ...props, children } });
  const react = {
    __esModule: true,
    default: { createElement: element, Fragment: "Fragment" },
    useEffect: () => {},
    useMemo: (factory) => factory(),
    useState: () => {
      const index = stateIndex++;
      return [state[index], (value) => { state[index] = value; }];
    },
  };
  const gesture = (kind) => {
    const callbacks = {};
    const builder = {};
    for (const method of ["enabled", "numberOfTaps", "maxDelay", "maxDistance", "maxPointers", "minDistance"]) {
      builder[method] = () => builder;
    }
    for (const method of ["onBegin", "onStart", "onUpdate", "onEnd"]) {
      builder[method] = (callback) => { callbacks[method] = callback; return builder; };
    }
    gestures[kind].push(callbacks);
    return builder;
  };
  const mocks = {
    react,
    "react-native": {
      Image: "Image", Modal: "Modal", Pressable: "Pressable", StatusBar: "StatusBar", Text: "Text", View: "View",
      StyleSheet: { create: (styles) => styles },
      useWindowDimensions: () => ({ width: 400, height: 800 }),
    },
    "react-native-gesture-handler": {
      GestureDetector: "GestureDetector", GestureHandlerRootView: "GestureHandlerRootView",
      PointerType: { TOUCH: 0, MOUSE: 2 },
      Gesture: {
        Tap: () => gesture("tap"), Pan: () => gesture("pan"), Pinch: () => gesture("pinch"),
        Race: (...children) => children, Exclusive: (...children) => children,
      },
    },
    "react-native-reanimated": {
      __esModule: true,
      default: { View: "AnimatedView" },
      cancelAnimation: (value) => { value.animation = null; },
      useAnimatedStyle: (factory) => { readStyle = factory; return {}; },
      useSharedValue: (initial) => ({
        value: initial,
        animation: null,
        get() { return this.value; },
        set(value) {
          if (value && typeof value === "object" && "motion" in value) {
            this.animation = value;
            animations.push({ position: this, ...value });
          } else {
            this.value = value;
            this.animation = null;
          }
        },
      }),
      withTiming: (target) => target,
      withSpring: (target, config) => ({ motion: "spring", target, config }),
      withDecay: (config, callback) => ({ motion: "decay", config, callback }),
    },
    "react-native-worklets": {
      scheduleOnRN: (fn, ...args) => fn(...args),
      scheduleOnUI: (fn, ...args) => fn(...args),
    },
    "./geometry": geometry,
  };
  const exports = {};
  new Function("require", "exports", outputText)((name) => {
    assert.ok(name in mocks, `Unexpected viewer import: ${name}`);
    return mocks[name];
  }, exports);
  const tree = exports.ZoomableImageViewer({ source: 1, doubleTapScale: 2, ...props });
  tree.props.children[0].props.onPress();
  return {
    ...gestures,
    animations,
    isOpen: () => state[0],
    position: () => {
      const { transform } = readStyle();
      return { x: transform[0].translateX, y: transform[1].translateY, scale: transform[2].scale };
    },
    zoom: (x = 200, y = 400) => gestures.tap[0].onEnd({ x, y }, true),
  };
}

const pinchEvent = (scale, pointers = 2, focalX = 200, focalY = 400) => ({
  scale, numberOfPointers: pointers, focalX, focalY, pointerType: 0,
});

test("single taps close at fit and at higher zoom; failed taps do not", () => {
  for (const scale of [1, 1.75, 3]) {
    const viewer = createViewer();
    viewer.pinch[0].onStart(pinchEvent(1));
    viewer.pinch[0].onUpdate(pinchEvent(scale));
    viewer.tap[1].onEnd({}, false);
    assert.equal(viewer.isOpen(), true);
    viewer.tap[1].onEnd({}, true);
    assert.equal(viewer.isOpen(), false);
    assert.deepEqual(viewer.position(), { x: 0, y: 0, scale: 1 });
  }
});

test("double taps zoom and reset without closing, including a custom minimum", () => {
  const viewer = createViewer({ minScale: 2, maxScale: 4, doubleTapScale: 3 });
  viewer.zoom(300, 250);
  assert.deepEqual(viewer.position(), { x: -50, y: 75, scale: 3 });
  assert.equal(viewer.isOpen(), true);
  viewer.zoom();
  assert.deepEqual(viewer.position(), { x: 0, y: 0, scale: 2 });
});

test("lifting and replacing pinch fingers preserves the image position", () => {
  const viewer = createViewer();
  viewer.zoom();
  viewer.pinch[0].onStart(pinchEvent(1));
  viewer.pinch[0].onUpdate(pinchEvent(1.5));
  const saved = viewer.position();
  viewer.pinch[0].onUpdate(pinchEvent(1.5, 1, 330, 600));
  viewer.pinch[0].onUpdate(pinchEvent(1.5, 0, 0, 0));
  viewer.pinch[0].onEnd();
  assert.deepEqual(viewer.position(), saved);
  viewer.pinch[0].onUpdate(pinchEvent(1.8, 2, 350, 600));
  assert.deepEqual(viewer.position(), saved);
});

test("repeated drags track one-to-one and keep the released position", () => {
  const viewer = createViewer();
  viewer.zoom();
  const pan = viewer.pan[0];
  pan.onStart({ translationX: 0, translationY: 0 });
  pan.onUpdate({ translationX: 50, translationY: 30 });
  pan.onEnd({ translationX: 50, translationY: 30, velocityX: 0, velocityY: 0 }, true);
  assert.deepEqual(viewer.position(), { x: 50, y: 30, scale: 2 });
  pan.onStart({ translationX: 12, translationY: -8 });
  pan.onUpdate({ translationX: 22, translationY: -18 });
  assert.deepEqual(viewer.position(), { x: 60, y: 20, scale: 2 });
  assert.equal(viewer.animations.length, 0);
});

test("fast flicks are bounded and cancelled glides cannot start a rebound", () => {
  const viewer = createViewer();
  viewer.zoom();
  const pan = viewer.pan[0];
  pan.onStart({ translationX: 0, translationY: 0 });
  pan.onUpdate({ translationX: 50, translationY: 0 });
  pan.onEnd({ translationX: 50, translationY: 0, velocityX: 8000, velocityY: 0 }, true);
  const decay = viewer.animations[0];
  assert.equal(decay.config.velocity, 1800);
  assert.deepEqual(decay.config.clamp, [-224, 224]);
  decay.position.value = 224;
  pan.onBegin();
  assert.equal(decay.position.animation, null);
  decay.callback(false);
  assert.equal(viewer.animations.length, 1);
  pan.onStart({ translationX: 0, translationY: 0 });
  pan.onUpdate({ translationX: -10, translationY: 0 });
  assert.equal(viewer.position().x, 220.5);
});

test("edge release uses a gentle return that can be caught without a jump", () => {
  const viewer = createViewer();
  viewer.zoom();
  const pan = viewer.pan[0];
  pan.onStart({ translationX: 0, translationY: 0 });
  pan.onUpdate({ translationX: 250, translationY: 0 });
  const saved = viewer.position();
  pan.onEnd({ translationX: 250, translationY: 0, velocityX: 500, velocityY: 0 }, true);
  const spring = viewer.animations[0];
  assert.equal(spring.target, 200);
  assert.deepEqual(spring.config, { stiffness: 100, damping: 20, mass: 1, overshootClamping: true });
  pan.onBegin();
  pan.onStart({ translationX: 0, translationY: 0 });
  pan.onUpdate({ translationX: 0, translationY: 0 });
  assert.deepEqual(viewer.position(), saved);
});

test("cancelled drags do not fling or dismiss the viewer", () => {
  const viewer = createViewer();
  viewer.zoom();
  const pan = viewer.pan[0];
  pan.onStart({ translationX: 0, translationY: 0 });
  pan.onUpdate({ translationX: 50, translationY: 30 });
  const saved = viewer.position();
  pan.onEnd({ translationX: 50, translationY: 30, velocityX: 800, velocityY: 400 }, false);
  assert.equal(viewer.isOpen(), true);
  assert.deepEqual(viewer.position(), saved);
  assert.equal(viewer.animations.length, 0);
});
