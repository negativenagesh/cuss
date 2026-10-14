import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import LottieView from 'lottie-react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, G, Line, Path, Polygon, Rect } from 'react-native-svg';
import { COLORS, FONTS, MOTION } from '../theme';

/**
 * Multi-layer Lottie JSON animation built following `LottieFiles/motion-design-skill`:
 * - Layer 1 (Primary): Rotating octagonal cyber-reticle (180 frames, 60fps = 3.0s)
 * - Layer 2 (Secondary): Pulsing Acid-Lime / Magenta inner core with overshoot
 * - Layer 3 (Ambient): Breathing outer halo ring (scale 96% <-> 104%)
 */
const CUSS_CORE_LOTTIE = {
  v: '5.7.4',
  fr: 60,
  ip: 0,
  op: 180,
  w: 160,
  h: 160,
  nm: 'CussCyberCore',
  ddd: 0,
  assets: [],
  layers: [
    {
      ddd: 0,
      ind: 1,
      ty: 4,
      nm: 'PrimaryReticle',
      sr: 1,
      ks: {
        o: { a: 0, k: 100 },
        r: {
          a: 1,
          k: [
            { t: 0, s: [0], e: [360], i: { x: [0.5], y: [0.5] }, o: { x: [0.5], y: [0.5] } },
            { t: 180, s: [360] },
          ],
        },
        p: { a: 0, k: [80, 80, 0] },
        a: { a: 0, k: [0, 0, 0] },
        s: { a: 0, k: [100, 100, 100] },
      },
      ao: 0,
      shapes: [
        {
          ty: 'gr',
          it: [
            {
              ty: 'sr',
              sy: 1,
              d: 1,
              pt: { a: 0, k: 8 },
              p: { a: 0, k: [0, 0] },
              r: { a: 0, k: 0 },
              ir: { a: 0, k: 34 },
              is: { a: 0, k: 0 },
              or: { a: 0, k: 56 },
              os: { a: 0, k: 0 },
              nm: 'StarReticle',
            },
            {
              ty: 'st',
              c: { a: 0, k: [0.831, 1, 0, 1] },
              o: { a: 0, k: 95 },
              w: { a: 0, k: 3 },
              lc: 2,
              lj: 2,
              nm: 'LimeStroke',
            },
            {
              ty: 'tr',
              p: { a: 0, k: [0, 0] },
              a: { a: 0, k: [0, 0] },
              s: { a: 0, k: [100, 100] },
              r: { a: 0, k: 0 },
              o: { a: 0, k: 100 },
            },
          ],
          nm: 'ReticleGroup',
        },
      ],
      ip: 0,
      op: 180,
      st: 0,
      bm: 0,
    },
    {
      ddd: 0,
      ind: 2,
      ty: 4,
      nm: 'SecondaryCorePulse',
      sr: 1,
      ks: {
        o: { a: 0, k: 100 },
        r: {
          a: 1,
          k: [
            { t: 0, s: [360], e: [0], i: { x: [0.4], y: [0.2] }, o: { x: [0.4], y: [0] } },
            { t: 180, s: [0] },
          ],
        },
        p: { a: 0, k: [80, 80, 0] },
        a: { a: 0, k: [0, 0, 0] },
        s: {
          a: 1,
          k: [
            { t: 0, s: [75, 75, 100], e: [115, 115, 100], i: { x: [0.2, 0.2, 0.2], y: [1, 1, 1] }, o: { x: [0.4, 0.4, 0.4], y: [0, 0, 0] } },
            { t: 90, s: [115, 115, 100], e: [75, 75, 100], i: { x: [0.2, 0.2, 0.2], y: [1, 1, 1] }, o: { x: [0.4, 0.4, 0.4], y: [0, 0, 0] } },
            { t: 180, s: [75, 75, 100] },
          ],
        },
      },
      ao: 0,
      shapes: [
        {
          ty: 'gr',
          it: [
            {
              ty: 'rc',
              d: 1,
              s: { a: 0, k: [36, 36] },
              p: { a: 0, k: [0, 0] },
              r: { a: 0, k: 8 },
              nm: 'InnerDiamond',
            },
            {
              ty: 'fl',
              c: { a: 0, k: [1, 0.165, 0.522, 1] },
              o: { a: 0, k: 85 },
              nm: 'MagentaFill',
            },
            {
              ty: 'tr',
              p: { a: 0, k: [0, 0] },
              a: { a: 0, k: [0, 0] },
              s: { a: 0, k: [100, 100] },
              r: { a: 0, k: 45 },
              o: { a: 0, k: 100 },
            },
          ],
          nm: 'CoreGroup',
        },
      ],
      ip: 0,
      op: 180,
      st: 0,
      bm: 0,
    },
    {
      ddd: 0,
      ind: 3,
      ty: 4,
      nm: 'AmbientOuterRing',
      sr: 1,
      ks: {
        o: {
          a: 1,
          k: [
            { t: 0, s: [35], e: [85], i: { x: [0.4], y: [1] }, o: { x: [0.4], y: [0] } },
            { t: 90, s: [85], e: [35], i: { x: [0.4], y: [1] }, o: { x: [0.4], y: [0] } },
            { t: 180, s: [35] },
          ],
        },
        r: { a: 0, k: 0 },
        p: { a: 0, k: [80, 80, 0] },
        a: { a: 0, k: [0, 0, 0] },
        s: {
          a: 1,
          k: [
            { t: 0, s: [94, 94, 100], e: [106, 106, 100], i: { x: [0.4, 0.4, 0.4], y: [1, 1, 1] }, o: { x: [0.4, 0.4, 0.4], y: [0, 0, 0] } },
            { t: 90, s: [106, 106, 100], e: [94, 94, 100], i: { x: [0.4, 0.4, 0.4], y: [1, 1, 1] }, o: { x: [0.4, 0.4, 0.4], y: [0, 0, 0] } },
            { t: 180, s: [94, 94, 100] },
          ],
        },
      },
      ao: 0,
      shapes: [
        {
          ty: 'gr',
          it: [
            {
              ty: 'el',
              d: 1,
              s: { a: 0, k: [138, 138] },
              p: { a: 0, k: [0, 0] },
              nm: 'HaloCircle',
            },
            {
              ty: 'st',
              c: { a: 0, k: [0, 0.941, 1, 1] },
              o: { a: 0, k: 75 },
              w: { a: 0, k: 2 },
              nm: 'CyanRing',
            },
            {
              ty: 'tr',
              p: { a: 0, k: [0, 0] },
              a: { a: 0, k: [0, 0] },
              s: { a: 0, k: [100, 100] },
              r: { a: 0, k: 0 },
              o: { a: 0, k: 100 },
            },
          ],
          nm: 'HaloGroup',
        },
      ],
      ip: 0,
      op: 180,
      st: 0,
      bm: 0,
    },
  ],
};

export function CussCyberOrbLottie({ size = 48 }: { size?: number }) {
  return (
    <View style={{ width: size, height: size }}>
      <LottieView
        source={CUSS_CORE_LOTTIE as any}
        autoPlay
        loop
        style={{ width: size, height: size }}
      />
    </View>
  );
}

/**
 * Quirky Brutalist Cyber-Art Empty State Poster
 * Uses LC Mogi display typography, Lottie core animation, and geometric SVG sigils
 * so empty spaces look like an underground Neo-Y2K synth poster.
 */
export function CussEmptyArtPoster({
  title,
  subtitle,
  tag = 'SYS // IDLE // 00',
}: {
  title: string;
  subtitle: string;
  tag?: string;
}) {
  const floatY = useSharedValue(0);

  useEffect(() => {
    floatY.value = withRepeat(
      withSequence(
        withTiming(-7, { duration: MOTION.duration.ambient, easing: MOTION.easing.ambient }),
        withTiming(7, { duration: MOTION.duration.ambient, easing: MOTION.easing.ambient }),
      ),
      -1,
      true,
    );
  }, [floatY]);

  const floatStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: floatY.value }],
  }));

  return (
    <View style={styles.posterCard}>
      <View style={styles.posterTopStrip}>
        <Text style={styles.posterTag}>{tag}</Text>
        <View style={styles.hazardDots}>
          <View style={[styles.dot, { backgroundColor: COLORS.lime }]} />
          <View style={[styles.dot, { backgroundColor: COLORS.magenta }]} />
          <View style={[styles.dot, { backgroundColor: COLORS.cyan }]} />
        </View>
      </View>

      <Animated.View style={[styles.artStage, floatStyle]}>
        <Svg width={220} height={110} viewBox="0 0 220 110" style={StyleSheet.absoluteFill}>
          {/* Brutalist wireframe grid & orbital geometry */}
          <Line x1="10" y1="55" x2="210" y2="55" stroke={COLORS.border} strokeWidth="1" strokeDasharray="4 4" />
          <Line x1="110" y1="5" x2="110" y2="105" stroke={COLORS.border} strokeWidth="1" strokeDasharray="4 4" />
          <Polygon
            points="110,8 158,32 158,78 110,102 62,78 62,32"
            stroke={COLORS.borderHi}
            strokeWidth="1.5"
            fill="rgba(23,25,38,0.65)"
          />
          <Circle cx="34" cy="28" r="6" stroke={COLORS.lime} strokeWidth="1.5" fill="none" />
          <Circle cx="186" cy="82" r="8" stroke={COLORS.magenta} strokeWidth="1.5" fill="none" />
          <Path d="M18 88 L32 88 M25 81 L25 95" stroke={COLORS.cyan} strokeWidth="1.5" />
          <Path d="M185 24 L199 24 M192 17 L192 31" stroke={COLORS.lime} strokeWidth="1.5" />
        </Svg>
        <CussCyberOrbLottie size={84} />
      </Animated.View>

      <Text style={styles.posterTitle}>{title}</Text>
      <Text style={styles.posterSub}>{subtitle}</Text>

      <View style={styles.posterFooter}>
        <Text style={styles.posterFooterCode}>CUSS // NEURAL UMBILICAL READY</Text>
      </View>
    </View>
  );
}

/** Quirky decorative brutalist divider strip with diagonal SVG ticks */
export function CussHazardStrip({ color = COLORS.lime, label }: { color?: string; label?: string }) {
  return (
    <View style={styles.stripRow}>
      <Svg width={56} height={10} viewBox="0 0 56 10">
        <G stroke={color} strokeWidth={2}>
          <Line x1="2" y1="9" x2="9" y2="1" />
          <Line x1="12" y1="9" x2="19" y2="1" />
          <Line x1="22" y1="9" x2="29" y2="1" />
          <Line x1="32" y1="9" x2="39" y2="1" />
          <Line x1="42" y1="9" x2="49" y2="1" />
        </G>
      </Svg>
      {label ? <Text style={[styles.stripLabel, { color }]}>{label}</Text> : null}
      <View style={[styles.stripLine, { backgroundColor: COLORS.border }]} />
    </View>
  );
}

const DEFAULT_SYNTH_STAGES = [
  'LOCKING MAC UMBILICAL…',
  'DISPATCHING TO CURSOR AGENT CLI…',
  'SCANNING WORKSPACE & @FILE CONTEXT…',
  'SYNTHESIZING FIRST MODEL TOKEN…',
];

function SynthWaveBar({
  delayMs,
  color,
  height = 20,
}: {
  delayMs: number;
  color: string;
  height?: number;
}) {
  const scaleY = useSharedValue(0.28);

  useEffect(() => {
    scaleY.value = withDelay(
      delayMs,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 380, easing: MOTION.easing.enter }),
          withTiming(0.26, { duration: 420, easing: MOTION.easing.ambient }),
        ),
        -1,
        true,
      ),
    );
  }, [delayMs, scaleY]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scaleY: scaleY.value }],
  }));

  return (
    <Animated.View
      style={[
        {
          width: 4,
          height,
          borderRadius: 2,
          backgroundColor: color,
        },
        animStyle,
      ]}
    />
  );
}

/**
 * 5-Bar Staggered Kinetic Synth Wave (`@motion-design` Wave Stagger Pattern: 60ms delay, <350ms total budget)
 */
export function CussKineticSynthBars({ height = 20 }: { height?: number }) {
  const barColors = [COLORS.lime, COLORS.cyan, COLORS.magenta, COLORS.cyan, COLORS.lime];
  return (
    <View style={[styles.synthBarsRow, { height }]}>
      {barColors.map((c, idx) => (
        <SynthWaveBar key={idx} delayMs={idx * 65} color={c} height={height} />
      ))}
    </View>
  );
}

/**
 * Bespoke CUSS Small Art Kinetic Loader
 * Built with `@motion-design` Three Pillars:
 *  - Shows immediately when the user sends a message until the first token starts
 *  - Also used in any async wait (File Viewer, Git Studio, Mac Shell, Mac Peek, Spawning Agent, @File search)
 *  - Features a live 0.1s elapsed timer + cycling status phases so the user always knows CUSS is actively working and never stuck.
 */
export function CussSmallArtLoader({
  title = 'NEURAL SYNTHESIS ACTIVE',
  subtitle,
  stages = DEFAULT_SYNTH_STAGES,
  variant = 'card',
  accentColor = COLORS.lime,
}: {
  title?: string;
  subtitle?: string;
  stages?: string[];
  variant?: 'card' | 'inline';
  accentColor?: string;
}) {
  const [tenths, setTenths] = useState(1);
  const enterOpacity = useSharedValue(0);
  const enterY = useSharedValue(10);
  const enterScale = useSharedValue(0.96);
  const scanX = useSharedValue(-40);

  useEffect(() => {
    enterOpacity.value = withTiming(1, { duration: 220, easing: MOTION.easing.enter });
    enterY.value = withTiming(0, { duration: 220, easing: MOTION.easing.enter });
    enterScale.value = withSpring(1, MOTION.spring.snappy);

    scanX.value = withRepeat(
      withSequence(
        withTiming(160, { duration: 1350, easing: MOTION.easing.standard }),
        withTiming(-40, { duration: 1350, easing: MOTION.easing.standard }),
      ),
      -1,
      true,
    );

    const iv = setInterval(() => {
      setTenths((t) => t + 1);
    }, 100);
    return () => clearInterval(iv);
  }, []);

  const cardAnimStyle = useAnimatedStyle(() => ({
    opacity: enterOpacity.value,
    transform: [{ translateY: enterY.value }, { scale: enterScale.value }],
  }));

  const scanBarStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: scanX.value }],
  }));

  const stageIdx = Math.floor(tenths / 18) % Math.max(stages.length, 1);
  const activeStageText = subtitle ?? stages[stageIdx] ?? DEFAULT_SYNTH_STAGES[0];
  const elapsedLabel = `${(tenths / 10).toFixed(1)}s`;

  if (variant === 'inline') {
    return (
      <Animated.View style={[styles.inlineLoaderWrap, { borderColor: accentColor }, cardAnimStyle]}>
        <CussCyberOrbLottie size={26} />
        <CussKineticSynthBars height={15} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.inlineLoaderTitle, { color: accentColor }]} numberOfLines={1}>
            {title}
          </Text>
          <Text style={styles.inlineLoaderSub} numberOfLines={1}>
            {activeStageText}
          </Text>
        </View>
        <View style={[styles.timerPill, { borderColor: accentColor }]}>
          <Text style={[styles.timerPillText, { color: accentColor }]}>{elapsedLabel}</Text>
        </View>
      </Animated.View>
    );
  }

  return (
    <Animated.View style={[styles.smallArtCard, { borderColor: accentColor }, cardAnimStyle]}>
      {/* Decorative SVG Corner Crosshairs + Mini Prism Frame */}
      <View style={styles.smallArtTopRow}>
        <View style={styles.smallArtLeftCluster}>
          <View style={styles.orbFrame}>
            <Svg width={54} height={54} viewBox="0 0 54 54" style={StyleSheet.absoluteFill}>
              <Polygon
                points="16,3 38,3 51,16 51,38 38,51 16,51 3,38 3,16"
                stroke={ COLORS.borderHi }
                strokeWidth="1.2"
                fill="rgba(16, 17, 26, 0.9)"
              />
              <Circle cx="9" cy="9" r="2" fill={COLORS.lime} />
              <Circle cx="45" cy="45" r="2" fill={COLORS.cyan} />
            </Svg>
            <CussCyberOrbLottie size={44} />
          </View>

          <View style={{ flex: 1, gap: 3 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
              <View style={[styles.liveDot, { backgroundColor: accentColor }]} />
              <Text style={[styles.smallArtTitle, { color: accentColor }]} numberOfLines={1}>
                {title}
              </Text>
            </View>
            <Text style={styles.smallArtStageText} numberOfLines={1}>
              {activeStageText}
            </Text>
          </View>
        </View>

        <View style={{ alignItems: 'flex-end', gap: 5 }}>
          <CussKineticSynthBars height={18} />
          <View style={[styles.timerPill, { borderColor: accentColor }]}>
            <Text style={[styles.timerPillText, { color: accentColor }]}>{elapsedLabel}</Text>
          </View>
        </View>
      </View>

      {/* Animated Cyber Scan Track so user visually sees continuous progress */}
      <View style={styles.scanTrack}>
        <Animated.View
          style={[styles.scanShuttle, { backgroundColor: accentColor }, scanBarStyle]}
        />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  posterCard: {
    backgroundColor: COLORS.surface,
    borderWidth: 1.5,
    borderColor: COLORS.borderHi,
    borderRadius: 18,
    padding: 18,
    marginVertical: 14,
    alignItems: 'center',
  },
  posterTopStrip: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    paddingBottom: 8,
    marginBottom: 12,
  },
  posterTag: {
    fontFamily: FONTS.monoBold,
    fontSize: 10,
    color: COLORS.cyan,
    letterSpacing: 1.4,
  },
  hazardDots: {
    flexDirection: 'row',
    gap: 6,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 2,
  },
  artStage: {
    width: 220,
    height: 110,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 6,
  },
  posterTitle: {
    fontFamily: FONTS.mogi,
    fontSize: 24,
    color: COLORS.bone,
    textAlign: 'center',
    marginTop: 8,
    letterSpacing: 0.8,
  },
  posterSub: {
    fontFamily: FONTS.body,
    fontSize: 13,
    color: COLORS.muted,
    textAlign: 'center',
    lineHeight: 19,
    marginTop: 6,
    paddingHorizontal: 8,
  },
  posterFooter: {
    marginTop: 14,
    paddingVertical: 4,
    paddingHorizontal: 10,
    backgroundColor: COLORS.plate,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  posterFooterCode: {
    fontFamily: FONTS.mono,
    fontSize: 9.5,
    color: COLORS.lime,
    letterSpacing: 1.2,
  },
  stripRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginVertical: 6,
  },
  stripLabel: {
    fontFamily: FONTS.monoBold,
    fontSize: 10,
    letterSpacing: 1.3,
  },
  stripLine: {
    flex: 1,
    height: 1,
  },
  synthBarsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3.5,
  },
  smallArtCard: {
    backgroundColor: '#0D0E18',
    borderWidth: 1.5,
    borderColor: COLORS.lime,
    borderRadius: 15,
    padding: 12,
    marginVertical: 5,
    gap: 9,
  },
  smallArtTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  smallArtLeftCluster: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  orbFrame: {
    width: 54,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  smallArtTitle: {
    fontFamily: FONTS.monoBold,
    fontSize: 10.5,
    letterSpacing: 1.1,
  },
  smallArtStageText: {
    fontFamily: FONTS.body,
    fontSize: 12.5,
    color: COLORS.bone,
  },
  timerPill: {
    backgroundColor: COLORS.plate,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  timerPillText: {
    fontFamily: FONTS.monoBold,
    fontSize: 9.5,
    letterSpacing: 0.6,
  },
  scanTrack: {
    height: 3.5,
    borderRadius: 2,
    backgroundColor: COLORS.plate,
    overflow: 'hidden',
  },
  scanShuttle: {
    width: 96,
    height: '100%',
    borderRadius: 2,
  },
  inlineLoaderWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    backgroundColor: '#0D0E18',
    borderWidth: 1.2,
    borderRadius: 11,
    paddingHorizontal: 10,
    paddingVertical: 7,
    marginVertical: 4,
  },
  inlineLoaderTitle: {
    fontFamily: FONTS.monoBold,
    fontSize: 9.5,
    letterSpacing: 0.9,
  },
  inlineLoaderSub: {
    fontFamily: FONTS.mono,
    fontSize: 10.5,
    color: COLORS.muted,
    marginTop: 1,
  },
});
