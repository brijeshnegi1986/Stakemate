import { fetchSeries, SeriesInfo } from "@/lib/tournaments";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Dimensions, FlatList, StyleSheet, TouchableOpacity, View } from "react-native";

const SLIDE_WIDTH = Dimensions.get("window").width - 32;
const SLIDE_HEIGHT = 110;
const INTERVAL_MS = 3500;

export function SeriesCarousel() {
  const [series, setSeries] = useState<SeriesInfo[]>([]);
  const listRef  = useRef<FlatList<SeriesInfo>>(null);
  const indexRef = useRef(0);

  useEffect(() => {
    fetchSeries()
      .then((data) => setSeries(data.filter((s) => !!s.banner_url)))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (series.length < 2) return;
    const timer = setInterval(() => {
      const next = (indexRef.current + 1) % series.length;
      indexRef.current = next;
      listRef.current?.scrollToIndex({ index: next, animated: true });
    }, INTERVAL_MS);
    return () => clearInterval(timer);
  }, [series.length]);

  if (series.length === 0) return null;

  return (
    <View style={styles.wrap}>
      <FlatList
        ref={listRef}
        data={series}
        keyExtractor={(s) => s.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        snapToInterval={SLIDE_WIDTH}
        decelerationRate="fast"
        getItemLayout={(_, index) => ({ length: SLIDE_WIDTH, offset: SLIDE_WIDTH * index, index })}
        onMomentumScrollEnd={(e) => {
          indexRef.current = Math.round(e.nativeEvent.contentOffset.x / SLIDE_WIDTH);
        }}
        renderItem={({ item }) => (
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={() =>
              router.navigate({ pathname: "/(tabs)/calendar", params: { openSeries: item.name } })
            }
          >
            <View style={styles.slide}>
              <Image
                source={{ uri: item.banner_url! }}
                style={styles.image}
                contentFit="cover"
                transition={300}
              />
            </View>
          </TouchableOpacity>
        )}
      />

      {series.length > 1 && (
        <View style={styles.dots}>
          {series.map((_, i) => (
            <View key={i} style={[styles.dot, i === indexRef.current && styles.dotActive]} />
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: 20,
    paddingHorizontal: 16,
    alignItems: "center",
  },
  slide: {
    width: SLIDE_WIDTH,
    height: SLIDE_HEIGHT,
    borderRadius: 14,
    overflow: "hidden",
  },
  image: {
    width: "100%",
    height: "100%",
  },
  dots: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 5,
    marginTop: 8,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: "rgba(0,0,0,0.2)",
  },
  dotActive: {
    width: 16,
    backgroundColor: "#155DFC",
  },
});
