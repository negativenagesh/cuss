import React, { useEffect, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, {
  Circle,
  Defs,
  Ellipse,
  G,
  Line,
  Polygon,
  RadialGradient,
  Stop,
} from 'react-native-svg';
import type { Agent } from '../store';
import { COLORS, MOTION } from '../theme';

const STATUS_COLOR: Record<string, string> = {
  ACTIVE: COLORS.lime,
  running: COLORS.lime,
  queued: COLORS.amber,
  IDLE: COLORS.cyan,
  idle: COLORS.cyan,
  done: COLORS.violet,
  error: COLORS.magenta,
  ARCHIVED: '#555c7a',
};

/**
 * Pure Native SVG + Reanimated 60fps 3D-Projected Cybernetic Orbital Reactor Field.
 * Replaces the legacy `expo-gl` / `@react-three/fiber` WebGL canvas so both Expo Go and
 * standalone Android release APKs render at 60fps with zero native GLThread / JSI crash risk.
 *
 * 3-Layer Motion Choreography (`@motion-design`):
 * - Primary: Rotating wireframe icosahedron reactor core + orbital rings
 * - Secondary: Orbiting per-agent satellite nodes colored by live run status
 * - Ambient: Perspective synth grid + breathing radial energy field
 */
export default function AgentField({ agents }: { agents: Agent[] }) {
  const orbs = useMemo(() => (Array.isArray(agents) ? agents.slice(0, 24) : []), [agents]);
  const activeCount = useMemo(
    () => orbs.filter((a) => a.status === 'ACTIVE' || a.status === 'running').length,
    [orbs],
  );

  const outerSpin = useSharedValue(0);
  const innerSpin = useSharedValue(0);
  const orbitSpin = useSharedValue(0);
  const corePulse = useSharedValue(1);

  useEffect(() => {
    const speedFactor = activeCount > 0 ? 0.65 : 1;
    outerSpin.value = 0;
    outerSpin.value = withRepeat(
      withTiming(360, { duration: Math.round(22000 * speedFactor), easing: Easing.linear }),
      -1,
      false,
    );

    innerSpin.value = 0;
    innerSpin.value = withRepeat(
      withTiming(-360, { duration: Math.round(14000 * speedFactor), easing: Easing.linear }),
      -1,
      false,
    );

    orbitSpin.value = 0;
    orbitSpin.value = withRepeat(
      withTiming(360, { duration: Math.round(18000 * speedFactor), easing: Easing.linear }),
      -1,
      false,
    );

    corePulse.value = withRepeat(
      withSequence(
        withTiming(activeCount > 0 ? 1.14 : 1.05, {
          duration: activeCount > 0 ? 900 : 1800,
          easing: MOTION.easing.ambient,
        }),
        withTiming(0.94, {
          duration: activeCount > 0 ? 900 : 1800,
          easing: MOTION.easing.ambient,
        }),
      ),
      -1,
      true,
    );
  }, [activeCount]);

  const outerAnimStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${outerSpin.value}deg` }],
  }));

  const innerAnimStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${innerSpin.value}deg` }, { scale: corePulse.value }],
  }));

  const orbitAnimStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${orbitSpin.value}deg` }],
  }));

  return (
    <View style={styles.container} pointerEvents="none">
      {/* Ambient Layer: Perspective Grid + Radial Glow */}
      <Svg width="100%" height="100%" viewBox="0 0 400 228" preserveAspectRatio="xMidYMid slice">
        <Defs>
          <RadialGradient id="reactorGlow" cx="50%" cy="50%" r="50%">
            <Stop
              offset="0%"
              stopColor={activeCount > 0 ? COLORS.lime : COLORS.cyan}
              stopOpacity={activeCount > 0 ? 0.22 : 0.14}
            />
            <Stop offset="55%" stopColor={COLORS.magenta} stopOpacity={0.06} />
            <Stop offset="100%" stopColor={COLORS.bg} stopOpacity={0} />
          </RadialGradient>
        </Defs>

        {/* Subtle Architectural Grid */}
        {[40, 80, 120, 160, 200].map((y) => (
          <Line
            key={`h-${y}`}
            x1="0"
            y1={y}
            x2="400"
            y2={y}
            stroke="#161929"
            strokeWidth="1"
          />
        ))}
        {[50, 100, 150, 200, 250, 300, 350].map((x) => (
          <Line
            key={`v-${x}`}
            x1={x}
            y1="0"
            x2={x}
            y2="228"
            stroke="#161929"
            strokeWidth="1"
          />
        ))}

        {/* Radial Reactor Aura */}
        <Circle cx="200" cy="114" r="108" fill="url(#reactorGlow)" />

        {/* Tilted 3D Perspective Orbital Tracks */}
        <Ellipse
          cx="200"
          cy="114"
          rx="128"
          ry="52"
          stroke={COLORS.cyan}
          strokeOpacity={0.22}
          strokeWidth="1.2"
          strokeDasharray="5 7"
          fill="none"
        />
        <Ellipse
          cx="200"
          cy="114"
          rx="96"
          ry="38"
          stroke={COLORS.lime}
          strokeOpacity={0.18}
          strokeWidth="1"
          fill="none"
        />
      </Svg>

      {/* Primary Layer 1: Rotating Wireframe Reactor Ring */}
      <Animated.View style={[styles.centeredLayer, outerAnimStyle]}>
        <Svg width={200} height={200} viewBox="0 0 200 200">
          <Circle
            cx="100"
            cy="100"
            r="86"
            stroke={COLORS.cyan}
            strokeOpacity={0.35}
            strokeWidth="1.4"
            strokeDasharray="4 8"
            fill="none"
          />
          <Circle
            cx="100"
            cy="100"
            r="68"
            stroke={COLORS.lime}
            strokeOpacity={0.55}
            strokeWidth="1.5"
            fill="none"
          />
          {/* Wireframe Icosahedron / Octagonal Cage */}
          <Polygon
            points="100,26 152,48 174,100 152,152 100,174 48,152 26,100 48,48"
            stroke={COLORS.lime}
            strokeOpacity={0.65}
            strokeWidth="1.4"
            fill="none"
          />
          <Line x1="100" y1="26" x2="100" y2="174" stroke={COLORS.lime} strokeOpacity={0.22} strokeWidth="1" />
          <Line x1="26" y1="100" x2="174" y2="100" stroke={COLORS.lime} strokeOpacity={0.22} strokeWidth="1" />
          <Line x1="48" y1="48" x2="152" y2="152" stroke={COLORS.cyan} strokeOpacity={0.22} strokeWidth="1" />
          <Line x1="152" y1="48" x2="48" y2="152" stroke={COLORS.cyan} strokeOpacity={0.22} strokeWidth="1" />
        </Svg>
      </Animated.View>

      {/* Secondary Layer: Orbiting Per-Agent Satellites */}
      <Animated.View style={[styles.centeredLayer, orbitAnimStyle]}>
        <Svg width={210} height={210} viewBox="0 0 210 210">
          {orbs.map((ag, i) => {
            const total = Math.max(orbs.length, 1);
            const angle = (i / total) * Math.PI * 2;
            const ringRadius = 46 + (i % 3) * 19;
            const cx = 105 + Math.cos(angle) * ringRadius;
            const cy = 105 + Math.sin(angle) * ringRadius;
            const color = STATUS_COLOR[ag.status] ?? COLORS.cyan;
            const isActive = ag.status === 'ACTIVE' || ag.status === 'running';
            return (
              <G key={ag.id || `orb-${i}`}>
                {isActive ? (
                  <Circle
                    cx={cx}
                    cy={cy}
                    r={9}
                    stroke={color}
                    strokeOpacity={0.55}
                    strokeWidth="1.5"
                    fill={color}
                    fillOpacity={0.16}
                  />
                ) : null}
                <Circle
                  cx={cx}
                  cy={cy}
                  r={isActive ? 4.8 : 3.6}
                  fill={color}
                  stroke={COLORS.bg}
                  strokeWidth="1"
                />
              </G>
            );
          })}
        </Svg>
      </Animated.View>

      {/* Primary Layer 2: Counter-Rotating Hyper-Magenta / Acid-Lime Inner Core */}
      <Animated.View style={[styles.centeredLayer, innerAnimStyle]}>
        <Svg width={110} height={110} viewBox="0 0 110 110">
          <Polygon
            points="55,14 96,55 55,96 14,55"
            stroke={COLORS.magenta}
            strokeWidth="2"
            fill={COLORS.magenta}
            fillOpacity={0.18}
          />
          <Polygon
            points="55,28 82,55 55,82 28,55"
            stroke={COLORS.lime}
            strokeWidth="1.8"
            fill={COLORS.lime}
            fillOpacity={0.28}
          />
          <Circle cx="55" cy="55" r="6" fill={COLORS.lime} />
        </Svg>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  centeredLayer: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
