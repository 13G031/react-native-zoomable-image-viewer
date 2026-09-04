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
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import { clamp, fitContainedSize, getPanBounds } from "./geometry";

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

  const scale = useSharedValue(minScale);
  const savedScale = useSharedValue(minScale);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);

  const containedSize = useMemo(
    () => fitContainedSize(viewportWidth, viewportHeight, aspectRatio),
    [aspectRatio, viewportHeight, viewportWidth]
  );

  const reset = (animated: boolean) => {
    const next = animated ? withTiming(minScale) : minScale;
    scale.value = next;
    savedScale.value = minScale;
    translateX.value = animated ? withSpring(0) : 0;
    translateY.value = animated ? withSpring(0) : 0;
    savedTranslateX.value = 0;
    savedTranslateY.value = 0;
  };

  const close = () => {
    reset(false);
    setIsOpen(false);
  };

  const open = () => {
    reset(false);
    setIsOpen(true);
  };

  useEffect(() => {
    reset(false);
  }, [viewportHeight, viewportWidth]);

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .maxDuration(250)
    .onEnd((event, success) => {
      if (!success) return;

      if (scale.value > minScale + 0.01) {
        scale.value = withTiming(minScale);
        savedScale.value = minScale;
        translateX.value = withSpring(0);
        translateY.value = withSpring(0);
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
        return;
      }

      const targetScale = clamp(doubleTapScale, minScale, maxScale);
      const bounds = getPanBounds(
        containedSize.width,
        containedSize.height,
        targetScale,
        viewportWidth,
        viewportHeight
      );
      const targetX = clamp(
        (viewportWidth / 2 - event.x) * (targetScale - 1),
        -bounds.x,
        bounds.x
      );
      const targetY = clamp(
        (viewportHeight / 2 - event.y) * (targetScale - 1),
        -bounds.y,
        bounds.y
      );

      scale.value = withTiming(targetScale);
      savedScale.value = targetScale;
      translateX.value = withSpring(targetX);
      translateY.value = withSpring(targetY);
      savedTranslateX.value = targetX;
      savedTranslateY.value = targetY;
    });

  const singleTap = Gesture.Tap()
    .numberOfTaps(1)
    .maxDistance(10)
    .onEnd((_event, success) => {
      if (success && scale.value <= minScale + 0.01) {
        runOnJS(close)();
      }
    });

  const pinch = Gesture.Pinch()
    .onStart(() => {
      savedScale.value = scale.value;
    })
    .onUpdate((event) => {
      scale.value = clamp(savedScale.value * event.scale, minScale, maxScale);
    })
    .onEnd(() => {
      if (scale.value <= minScale + 0.01) {
        scale.value = withTiming(minScale);
        savedScale.value = minScale;
        translateX.value = withSpring(0);
        translateY.value = withSpring(0);
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
        return;
      }

      const bounds = getPanBounds(
        containedSize.width,
        containedSize.height,
        scale.value,
        viewportWidth,
        viewportHeight
      );
      const nextX = clamp(translateX.value, -bounds.x, bounds.x);
      const nextY = clamp(translateY.value, -bounds.y, bounds.y);
      translateX.value = withSpring(nextX);
      translateY.value = withSpring(nextY);
      savedTranslateX.value = nextX;
      savedTranslateY.value = nextY;
      savedScale.value = scale.value;
    });

  const pan = Gesture.Pan()
    .maxPointers(1)
    .onStart(() => {
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    })
    .onUpdate((event) => {
      if (scale.value <= minScale) return;

      const bounds = getPanBounds(
        containedSize.width,
        containedSize.height,
        scale.value,
        viewportWidth,
        viewportHeight
      );
      translateX.value = clamp(
        savedTranslateX.value + event.translationX,
        -bounds.x,
        bounds.x
      );
      translateY.value = clamp(
        savedTranslateY.value + event.translationY,
        -bounds.y,
        bounds.y
      );
    })
    .onEnd(() => {
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    });

  const gesture = Gesture.Simultaneous(
    pinch,
    pan,
    Gesture.Exclusive(doubleTap, singleTap)
  );

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

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
        <View style={[styles.backdrop, { backgroundColor }]}>
          <GestureDetector gesture={gesture}>
            <Animated.View style={[styles.gestureSurface, animatedStyle]}>
              <Animated.Image
                accessible
                accessibilityLabel={accessibilityLabel}
                resizeMode="contain"
                source={source}
                style={containedSize}
              />
            </Animated.View>
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
        </View>
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
