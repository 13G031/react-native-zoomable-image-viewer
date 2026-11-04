import React, { useEffect, useMemo, useState } from "react";
import {
  Image,
  Modal,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type ImageSourcePropType,
  type ImageStyle,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { Gesture, GestureDetector, GestureHandlerRootView, PointerType } from "react-native-gesture-handler";
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDecay,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import type { SharedValue } from "react-native-reanimated";
import { scheduleOnRN, scheduleOnUI } from "react-native-worklets";

import { clamp, clampPhotoOffset, dragPhotoOffset, fitContainedSize, photoPanLimit, zoomPhotoAtPoint } from "./geometry";

const TAP_DISTANCE = 10;
const PAN_SPEED = 1;
const EDGE_SPRING = { stiffness: 100, damping: 20, mass: 1, overshootClamping: true };
const ZOOM_TIMING = { duration: 320 };

type ZoomableImageViewerProps = {
  source: ImageSourcePropType;
  accessibilityLabel?: string;
  backgroundColor?: string;
  doubleTapScale?: number;
  maxScale?: number;
  minScale?: number;
  thumbnailStyle?: StyleProp<ImageStyle>;
  thumbnailContainerStyle?: StyleProp<ViewStyle>;
};

export function ZoomableImageViewer({
  source,
  accessibilityLabel = "Open image",
  backgroundColor = "#0B0B0C",
  doubleTapScale = 2.5,
  maxScale = 4,
  minScale = 1,
  thumbnailStyle,
  thumbnailContainerStyle,
}: ZoomableImageViewerProps) {
  const { width: viewportWidth, height: viewportHeight } = useWindowDimensions();
  const [isOpen, setIsOpen] = useState(false);
  const [aspectRatio, setAspectRatio] = useState(1);

  const viewport = { width: viewportWidth, height: viewportHeight };
  const restingZoom = { scale: minScale, x: 0, y: 0 };
  const containedSize = useMemo(
    () => fitContainedSize(viewportWidth, viewportHeight, aspectRatio),
    [aspectRatio, viewportHeight, viewportWidth]
  );
  const ready = containedSize.width > 0 && containedSize.height > 0;
  const zoomScale = useSharedValue(minScale);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const pinchStart = useSharedValue({ zoom: restingZoom, focal: { x: 0, y: 0 }, gestureScale: 1, pointers: 2 });
  const panTracking = useSharedValue({ scale: minScale, translationX: 0, translationY: 0 });
  const hasPanMotion = useSharedValue(false);

  const stopMotion = () => {
    "worklet";
    hasPanMotion.set(false);
    cancelAnimation(zoomScale);
    cancelAnimation(translateX);
    cancelAnimation(translateY);
  };

  const reset = () => {
    stopMotion();
    zoomScale.set(minScale);
    translateX.set(0);
    translateY.set(0);
  };

  const close = () => {
    reset();
    setIsOpen(false);
  };

  const open = () => {
    reset();
    setIsOpen(true);
  };

  useEffect(() => {
    reset();
  }, [minScale, viewportHeight, viewportWidth]);

  const releaseAxis = (position: SharedValue<number>, velocity: number, imageLength: number, viewportLength: number) => {
    "worklet";
    const offset = position.get();
    const scale = zoomScale.get();
    const limit = photoPanLimit(imageLength, viewportLength, scale);
    if (scale <= minScale || limit === 0) {
      position.set(0);
      return;
    }
    const edge = clampPhotoOffset(offset, imageLength, viewportLength, scale);
    if (offset !== edge) {
      position.set(withSpring(edge, EDGE_SPRING));
      return;
    }
    if (velocity === 0) return;
    const overscroll = Math.min(viewportLength * 0.06, limit);
    position.set(withDecay({
      velocity: Math.max(-1800, Math.min(velocity * 0.65, 1800)),
      deceleration: 0.996,
      // Bound fast flicks before returning to the image edge.
      clamp: [-limit - overscroll, limit + overscroll],
    }, (finished) => {
      if (!finished) return;
      const current = position.get();
      const target = clampPhotoOffset(current, imageLength, viewportLength, scale);
      if (current !== target) position.set(withSpring(target, EDGE_SPRING));
    }));
  };

  const releasePan = (velocityX: number, velocityY: number) => {
    "worklet";
    hasPanMotion.set(true);
    releaseAxis(translateX, velocityX, containedSize.width, viewport.width);
    releaseAxis(translateY, velocityY, containedSize.height, viewport.height);
  };

  const toggleZoom = (x: number, y: number) => {
    "worklet";
    if (!ready) return;
    stopMotion();
    const target = zoomScale.get() > minScale ? restingZoom : zoomPhotoAtPoint(restingZoom, clamp(doubleTapScale, minScale, maxScale), { x, y }, viewport, containedSize);
    zoomScale.set(withTiming(target.scale, ZOOM_TIMING));
    translateX.set(withTiming(target.x, ZOOM_TIMING));
    translateY.set(withTiming(target.y, ZOOM_TIMING));
  };

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .maxDelay(300)
    .maxDistance(TAP_DISTANCE)
    .onEnd((event, success) => {
      if (success) toggleZoom(event.x, event.y);
    });

  const singleTap = Gesture.Tap()
    .maxDistance(TAP_DISTANCE)
    .onEnd((_event, success) => {
      if (success) scheduleOnRN(close);
    });

  const savePinchStart = (event: { scale: number; focalX: number; focalY: number; numberOfPointers: number }) => {
    "worklet";
    pinchStart.value = {
      zoom: { scale: zoomScale.get(), x: translateX.get(), y: translateY.get() },
      focal: { x: event.focalX, y: event.focalY },
      gestureScale: event.scale,
      pointers: event.numberOfPointers,
    };
  };

  const pinch = Gesture.Pinch()
    .enabled(ready)
    .onStart((event) => {
      stopMotion();
      savePinchStart(event);
    })
    .onUpdate((event) => {
      const start = pinchStart.value;
      // A changed finger count moves the reported focal point without moving the photo.
      if (event.numberOfPointers !== start.pointers) {
        savePinchStart(event);
        return;
      }
      if (event.numberOfPointers < 2 && event.pointerType !== PointerType.MOUSE) return;
      const scale = clamp(start.zoom.scale * event.scale / start.gestureScale, minScale, maxScale);
      const focal = {
        x: event.focalX,
        y: event.focalY,
      };
      const target = scale <= minScale ? restingZoom : zoomPhotoAtPoint(start.zoom, scale, start.focal, viewport, containedSize, focal, true);
      zoomScale.set(target.scale);
      translateX.set(target.x);
      translateY.set(target.y);
    })
    .onEnd(() => {
      releasePan(0, 0);
    });

  const pan = Gesture.Pan()
    .maxPointers(1)
    .minDistance(TAP_DISTANCE)
    .onBegin(() => {
      if (hasPanMotion.get()) stopMotion();
    })
    .onStart((event) => {
      stopMotion();
      panTracking.value = {
        scale: zoomScale.get(),
        translationX: event.translationX,
        translationY: event.translationY,
      };
    })
    .onUpdate((event) => {
      const { scale, translationX, translationY } = panTracking.value;
      if (scale <= minScale) return;
      translateX.set(dragPhotoOffset(translateX.get(), (event.translationX - translationX) * PAN_SPEED, containedSize.width, viewport.width, scale));
      translateY.set(dragPhotoOffset(translateY.get(), (event.translationY - translationY) * PAN_SPEED, containedSize.height, viewport.height, scale));
      panTracking.value = { scale, translationX: event.translationX, translationY: event.translationY };
    })
    .onEnd((event, success) => {
      const verticalDistance = Math.abs(event.translationY);
      if (success && panTracking.value.scale <= minScale && verticalDistance > 60 && verticalDistance > Math.abs(event.translationX)) {
        scheduleOnRN(close);
      }
      if (panTracking.value.scale > minScale) {
        releasePan(success ? event.velocityX : 0, success ? event.velocityY : 0);
      }
    });

  const animatedStyle = useAnimatedStyle(() => {
    return { transform: [{ translateX: translateX.get() }, { translateY: translateY.get() }, { scale: zoomScale.get() }] };
  });

  const updateAspectRatio = (width?: number, height?: number) => {
    if (width && height) setAspectRatio(width / height);
  };

  return (
    <>
      <Pressable
        accessibilityHint="Opens a full-screen viewer with pinch and double-tap zoom"
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="button"
        onPress={open}
        style={[styles.thumbnailContainer, thumbnailContainerStyle]}
      >
        <Image
          onLoad={(event) =>
            updateAspectRatio(
              event.nativeEvent.source?.width,
              event.nativeEvent.source?.height
            )
          }
          resizeMode="cover"
          source={source}
          style={[styles.thumbnail, { aspectRatio }, thumbnailStyle]}
        />
      </Pressable>

      <Modal
        animationType="fade"
        onRequestClose={close}
        statusBarTranslucent
        transparent
        visible={isOpen}
      >
        <StatusBar backgroundColor={backgroundColor} barStyle="light-content" />
        <GestureHandlerRootView style={[styles.backdrop, { backgroundColor }]} accessibilityViewIsModal>
          <GestureDetector gesture={Gesture.Race(pinch, pan, Gesture.Exclusive(doubleTap, singleTap))}>
            <View collapsable={false} style={styles.gestureSurface}>
              <Animated.View style={animatedStyle}>
                <Image
                  accessible
                  accessibilityLabel={accessibilityLabel}
                  accessibilityActions={[{ name: "activate", label: "Toggle zoom" }]}
                  onAccessibilityAction={({ nativeEvent }) => {
                    if (nativeEvent.actionName === "activate") {
                      scheduleOnUI(toggleZoom, viewportWidth / 2, viewportHeight / 2);
                    }
                  }}
                  resizeMode="contain"
                  source={source}
                  style={containedSize}
                />
              </Animated.View>
            </View>
          </GestureDetector>

          <Pressable
            accessibilityLabel="Close image"
            accessibilityRole="button"
            hitSlop={12}
            onPress={close}
            style={styles.closeButton}
          >
            <Text style={styles.closeText}>Close</Text>
          </Pressable>
        </GestureHandlerRootView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
  },
  closeButton: {
    position: "absolute",
    right: 18,
    top: 54,
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: "rgba(255, 255, 255, 0.14)",
  },
  closeText: {
    color: "#F8F8FA",
    fontSize: 15,
    fontWeight: "600",
  },
  gestureSurface: {
    flex: 1,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  thumbnail: {
    width: "100%",
    minHeight: 180,
    borderRadius: 16,
  },
  thumbnailContainer: {
    width: "100%",
  },
});
