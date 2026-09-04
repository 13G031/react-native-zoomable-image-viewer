import React from "react";
import { SafeAreaView, StatusBar, StyleSheet, Text, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import { ZoomableImageViewer } from "./src/ZoomableImageViewer";

const SAMPLE_IMAGE = {
  uri: "https://picsum.photos/seed/react-native-zoom-demo/1200/900",
};

export default function App() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <StatusBar barStyle="dark-content" />
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <Text style={styles.title}>Zoomable image viewer</Text>
          <Text style={styles.description}>
            Tap the image. Pinch or double-tap to zoom, then drag to inspect it.
          </Text>
          <ZoomableImageViewer
            accessibilityLabel="Sample landscape"
            source={SAMPLE_IMAGE}
          />
        </View>
      </SafeAreaView>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 22,
  },
  description: {
    maxWidth: 420,
    marginBottom: 24,
    color: "#5B606A",
    fontSize: 16,
    lineHeight: 24,
  },
  root: {
    flex: 1,
    backgroundColor: "#F7F8FA",
  },
  safeArea: {
    flex: 1,
  },
  title: {
    marginBottom: 8,
    color: "#17191D",
    fontSize: 30,
    fontWeight: "700",
    letterSpacing: -0.7,
  },
});
