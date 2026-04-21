/**
 * A30 反诈助手 - 2D 智能形象交互组件
 *
 * 基于 react-native-reanimated 的动画状态机，实现助手形象的多状态切换。
 * 状态包括：idle（待机）、listening（倾听）、thinking（思考）、speaking（播报）、alert（高危警告）
 *
 * 设计参考：
 * - 使用盾牌 + 脉冲光环作为核心视觉元素
 * - 不同状态对应不同的动画节奏和颜色
 * - 支持点击交互触发状态切换
 */

import { useEffect, useMemo } from "react";
import { View, Text, StyleSheet } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withSequence,
  withDelay,
  Easing,
  interpolateColor,
  cancelAnimation,
} from "react-native-reanimated";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

export type AvatarAnimState = "idle" | "listening" | "thinking" | "speaking" | "alert";

export interface AvatarStateMachineProps {
  state: AvatarAnimState;
  size?: number;
  showLabel?: boolean;
  onPress?: () => void;
}

/* ------------------------------------------------------------------ */
/*  State config                                                      */
/* ------------------------------------------------------------------ */

interface StateConfig {
  label: string;
  iconScale: number;
  pulseSpeed: number; // ms per cycle
  pulseAmplitude: number; // scale range
  glowIntensity: number; // 0-1
  ringCount: number;
}

const STATE_CONFIGS: Record<AvatarAnimState, StateConfig> = {
  idle: {
    label: "待命中",
    iconScale: 1,
    pulseSpeed: 3000,
    pulseAmplitude: 0.03,
    glowIntensity: 0.15,
    ringCount: 1,
  },
  listening: {
    label: "倾听中",
    iconScale: 1.05,
    pulseSpeed: 1200,
    pulseAmplitude: 0.06,
    glowIntensity: 0.4,
    ringCount: 2,
  },
  thinking: {
    label: "分析中",
    iconScale: 0.95,
    pulseSpeed: 800,
    pulseAmplitude: 0.08,
    glowIntensity: 0.5,
    ringCount: 3,
  },
  speaking: {
    label: "播报中",
    iconScale: 1.02,
    pulseSpeed: 600,
    pulseAmplitude: 0.05,
    glowIntensity: 0.45,
    ringCount: 2,
  },
  alert: {
    label: "高危警告",
    iconScale: 1.1,
    pulseSpeed: 400,
    pulseAmplitude: 0.12,
    glowIntensity: 0.8,
    ringCount: 3,
  },
};

/* ------------------------------------------------------------------ */
/*  Animated ring component                                           */
/* ------------------------------------------------------------------ */

function AnimatedRing({
  size,
  color,
  delay,
  speed,
  amplitude,
}: {
  size: number;
  color: string;
  delay: number;
  speed: number;
  amplitude: number;
}) {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(0.3);

  useEffect(() => {
    scale.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(1 + amplitude, { duration: speed, easing: Easing.inOut(Easing.ease) }),
          withTiming(1 - amplitude * 0.5, { duration: speed, easing: Easing.inOut(Easing.ease) }),
        ),
        -1,
        true,
      ),
    );

    opacity.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(0.5, { duration: speed, easing: Easing.inOut(Easing.ease) }),
          withTiming(0.1, { duration: speed, easing: Easing.inOut(Easing.ease) }),
        ),
        -1,
        true,
      ),
    );

    return () => {
      cancelAnimation(scale);
      cancelAnimation(opacity);
    };
  }, [delay, speed, amplitude, scale, opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[
        styles.ring,
        animatedStyle,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          borderColor: color,
          borderWidth: 2,
        },
      ]}
    />
  );
}

/* ------------------------------------------------------------------ */
/*  Wave bars for listening/speaking states                           */
/* ------------------------------------------------------------------ */

function WaveBars({ count, color, speed }: { count: number; color: string; speed: number }) {
  const bars = useMemo(() => Array.from({ length: count }, (_, i) => i), [count]);

  return (
    <View style={styles.waveBarsContainer}>
      {bars.map((i) => (
        <WaveBar key={i} index={i} color={color} speed={speed} total={count} />
      ))}
    </View>
  );
}

function WaveBar({
  index,
  color,
  speed,
  total,
}: {
  index: number;
  color: string;
  speed: number;
  total: number;
}) {
  const height = useSharedValue(8);

  useEffect(() => {
    const delay = (index / total) * speed * 0.5;
    height.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(20 + Math.random() * 10, { duration: speed * 0.5, easing: Easing.inOut(Easing.ease) }),
          withTiming(6 + Math.random() * 4, { duration: speed * 0.5, easing: Easing.inOut(Easing.ease) }),
        ),
        -1,
        true,
      ),
    );

    return () => {
      cancelAnimation(height);
    };
  }, [index, total, speed, height]);

  const animatedStyle = useAnimatedStyle(() => ({
    height: height.value,
  }));

  return (
    <Animated.View
      style={[
        styles.waveBar,
        animatedStyle,
        { backgroundColor: color },
      ]}
    />
  );
}

/* ------------------------------------------------------------------ */
/*  Main component                                                    */
/* ------------------------------------------------------------------ */

export function AvatarStateMachine({
  state,
  size = 120,
  showLabel = true,
}: AvatarStateMachineProps) {
  const colors = useColors();
  const config = STATE_CONFIGS[state];

  // Core animations
  const coreScale = useSharedValue(1);
  const glowOpacity = useSharedValue(config.glowIntensity);
  const colorProgress = useSharedValue(0);

  // Determine colors based on state
  const stateColor = state === "alert" ? colors.error : colors.primary;
  const stateColorLight = state === "alert" ? `${colors.error}40` : `${colors.primary}30`;

  useEffect(() => {
    // Core pulse
    coreScale.value = withRepeat(
      withSequence(
        withTiming(config.iconScale + config.pulseAmplitude, {
          duration: config.pulseSpeed,
          easing: Easing.inOut(Easing.ease),
        }),
        withTiming(config.iconScale - config.pulseAmplitude * 0.5, {
          duration: config.pulseSpeed,
          easing: Easing.inOut(Easing.ease),
        }),
      ),
      -1,
      true,
    );

    // Glow
    glowOpacity.value = withRepeat(
      withSequence(
        withTiming(config.glowIntensity, {
          duration: config.pulseSpeed * 0.8,
          easing: Easing.inOut(Easing.ease),
        }),
        withTiming(config.glowIntensity * 0.3, {
          duration: config.pulseSpeed * 0.8,
          easing: Easing.inOut(Easing.ease),
        }),
      ),
      -1,
      true,
    );

    // Color transition for alert
    colorProgress.value = withTiming(state === "alert" ? 1 : 0, { duration: 400 });

    return () => {
      cancelAnimation(coreScale);
      cancelAnimation(glowOpacity);
    };
  }, [state, config, coreScale, glowOpacity, colorProgress]);

  const coreAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: coreScale.value }],
  }));

  const glowAnimatedStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
  }));

  const iconSize = size * 0.4;
  const glowSize = size * 1.3;

  // Generate rings
  const rings = useMemo(() => {
    return Array.from({ length: config.ringCount }, (_, i) => ({
      key: `${state}-ring-${i}`,
      size: size + (i + 1) * 20,
      delay: i * 200,
    }));
  }, [state, config.ringCount, size]);

  return (
    <View style={[styles.container, { width: size * 1.6, height: size * 1.6 + (showLabel ? 30 : 0) }]}>
      {/* Glow background */}
      <Animated.View
        style={[
          styles.glow,
          glowAnimatedStyle,
          {
            width: glowSize,
            height: glowSize,
            borderRadius: glowSize / 2,
            backgroundColor: stateColorLight,
          },
        ]}
      />

      {/* Animated rings */}
      {rings.map((ring) => (
        <AnimatedRing
          key={ring.key}
          size={ring.size}
          color={stateColor}
          delay={ring.delay}
          speed={config.pulseSpeed}
          amplitude={config.pulseAmplitude}
        />
      ))}

      {/* Core avatar */}
      <Animated.View
        style={[
          coreAnimatedStyle,
          styles.core,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: stateColor,
          },
        ]}
      >
        <IconSymbol name="shield.lefthalf.fill" size={iconSize} color="#ffffff" />

        {/* Wave bars for listening/speaking */}
        {(state === "listening" || state === "speaking") && (
          <View style={styles.waveBarsOverlay}>
            <WaveBars count={5} color="#ffffff" speed={config.pulseSpeed} />
          </View>
        )}
      </Animated.View>

      {/* State label */}
      {showLabel && (
        <View style={styles.labelContainer}>
          <View style={[styles.labelBadge, { backgroundColor: stateColorLight }]}>
            <View style={[styles.labelDot, { backgroundColor: stateColor }]} />
            <Text style={[styles.labelText, { color: stateColor }]}>{config.label}</Text>
          </View>
        </View>
      )}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/*  Styles                                                            */
/* ------------------------------------------------------------------ */

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
  },
  glow: {
    position: "absolute",
  },
  ring: {
    position: "absolute",
  },
  core: {
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  waveBarsOverlay: {
    position: "absolute",
    bottom: 12,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  waveBarsContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    height: 24,
  },
  waveBar: {
    width: 3,
    borderRadius: 1.5,
    minHeight: 4,
  },
  labelContainer: {
    position: "absolute",
    bottom: 0,
  },
  labelBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  labelDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  labelText: {
    fontSize: 12,
    fontWeight: "600",
  },
});
