# React Native Zoomable Image Viewer

A compact full-screen image viewer extracted from a production React Native chat experience. It supports pinch zoom, bounded panning, double-tap zoom, single-tap dismissal at the minimum scale, device rotation, and an accessible close control.

The repository is a standalone Expo demo. It contains no application branding, API endpoint, credentials, user data, or production media.

## Run it

```bash
npm install
npm run ios
```

Use `npm run android` for Android.

## Use the component

```tsx
import { ZoomableImageViewer } from "./src/ZoomableImageViewer";

<ZoomableImageViewer
  accessibilityLabel="Mountain landscape"
  source={{ uri: "https://example.com/image.jpg" }}
/>
```

The application root must use `GestureHandlerRootView`, as shown in `App.tsx`.

## Props

| Prop | Default | Purpose |
| --- | --- | --- |
| `source` | Required | Any React Native `ImageSourcePropType` |
| `accessibilityLabel` | `Open image` | Describes the image and open action |
| `minScale` | `1` | Resting scale |
| `maxScale` | `4` | Pinch zoom limit |
| `doubleTapScale` | `2.5` | Double-tap zoom target |
| `backgroundColor` | `#0B0B0C` | Full-screen backdrop |
| `thumbnailStyle` | None | Overrides the thumbnail image style |
| `thumbnailContainerStyle` | None | Overrides the thumbnail pressable style |

## Behavior

- Pinch between the configured minimum and maximum scales.
- Drag only while zoomed. Translation is clamped to the scaled image bounds.
- Double-tap the point of interest to zoom in. Double-tap again to reset.
- Single-tap to close only when the image is at its minimum scale.
- Use the visible Close control or Android back action at any scale.
- Recalculate contained image geometry after device rotation.

## Checks

```bash
npm test
npm run typecheck
```

The geometry tests cover scale clamping, contained sizing, and pan boundaries.

## Dependencies

- [React Native Gesture Handler](https://docs.swmansion.com/react-native-gesture-handler/docs/gestures/gesture/)
- [React Native Reanimated](https://docs.swmansion.com/react-native-reanimated/)
- Expo and React Native

No license file is included. Public visibility alone does not grant permission to copy, modify, or redistribute the code.
