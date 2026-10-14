import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, G, Line, LinearGradient, Path, Polygon, Rect, Stop } from 'react-native-svg';
import {
  ArrowUpRight,
  Cpu,
  CussStarGlyph,
  FolderGit2,
  GitBranch,
  Laptop,
  Sparkles,
  SpringButton,
  Unplug,
} from '../components/CussIcons';
import {
  listAgents,
  localIdeState,
  localList,
  localModels,
  localProjects,
} from '../api/client';
import { useStore } from '../store';
import { COLORS, FONTS, MOTION } from '../theme';

/**
 * Bespoke Artistic CUSS Brand Sculpture (SVG + Calm Layered Motion)
 * Grounded in `@motion-design` skill:
 *  - Archetype: Premium + Playful Studio Hybrid
 *  - Layer 1 (Primary): Crisp sculptural CUSS monogram prism
 *  - Layer 2 (Secondary): Gentle counter-tilting orbital arc (-8deg <-> +8deg, 3600ms sine)
 *  - Layer 3 (Ambient): Slow 22,000ms architectural registration ring (12% visual energy, zero noise)
 *  - Zero overlapping lines or clutter behind the CUSS wordmark
 */
function CussArtisticBrandCrest({
  dialStyle,
  pendulumStyle,
  breatheStyle,
}: {
  dialStyle: any;
  pendulumStyle: any;
  breatheStyle: any;
}) {
  return (
    <View style={styles.crestContainer}>
      {/* Layer 3 (Ambient): Ultra-calm architectural registration dial */}
      <Animated.View style={[StyleSheet.absoluteFill, styles.crestCenter, dialStyle]}>
        <Svg width={124} height={124} viewBox="0 0 124 124">
          <Circle
            cx="62"
            cy="62"
            r="56"
            stroke={COLORS.borderHi}
            strokeWidth="1"
            strokeDasharray="3 9"
            fill="none"
          />
          <Line x1="62" y1="2" x2="62" y2="10" stroke={COLORS.lime} strokeWidth="2" />
          <Line x1="62" y1="114" x2="62" y2="122" stroke={COLORS.cyan} strokeWidth="2" />
          <Line x1="2" y1="62" x2="10" y2="62" stroke={COLORS.magenta} strokeWidth="2" />
          <Line x1="114" y1="62" x2="122" y2="62" stroke={COLORS.lime} strokeWidth="2" />
          <Circle cx="62" cy="14" r="2.2" fill={COLORS.lime} />
          <Circle cx="62" cy="110" r="2.2" fill={COLORS.cyan} />
        </Svg>
      </Animated.View>

      {/* Layer 2 (Secondary): Smooth sculptural pendulum arc */}
      <Animated.View style={[StyleSheet.absoluteFill, styles.crestCenter, pendulumStyle]}>
        <Svg width={104} height={104} viewBox="0 0 104 104">
          <Path
            d="M 18 52 A 34 34 0 0 1 86 52"
            stroke={COLORS.cyan}
            strokeWidth="1.6"
            strokeLinecap="round"
            fill="none"
          />
          <Path
            d="M 86 52 A 34 34 0 0 1 18 52"
            stroke="rgba(212, 255, 0, 0.35)"
            strokeWidth="1.2"
            strokeDasharray="4 6"
            fill="none"
          />
          <Circle cx="18" cy="52" r="3" fill={COLORS.cyan} />
          <Circle cx="86" cy="52" r="3" fill={COLORS.lime} />
        </Svg>
      </Animated.View>

      {/* Layer 1 (Primary): Breathing geometric CUSS studio monolith emblem */}
      <Animated.View style={[styles.crestCenter, breatheStyle]}>
        <Svg width={76} height={76} viewBox="0 0 76 76">
          <Defs>
            <LinearGradient id="cussPrism" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0%" stopColor={COLORS.lime} stopOpacity="0.2" />
              <Stop offset="100%" stopColor={COLORS.cyan} stopOpacity="0.06" />
            </LinearGradient>
          </Defs>
          <Polygon
            points="24,5 52,5 71,24 71,52 52,71 24,71 5,52 5,24"
            fill="url(#cussPrism)"
            stroke={COLORS.lime}
            strokeWidth="1.8"
          />
          <Rect
            x="16"
            y="16"
            width="44"
            height="44"
            rx="10"
            stroke={COLORS.borderHi}
            strokeWidth="1"
            fill="#090A12"
          />
          {/* Iconic sculptural 'C' + Umbilical Spark Mark */}
          <Path
            d="M46 25 H30 L23 32 V44 L30 51 H46"
            stroke={COLORS.bone}
            strokeWidth="3.8"
            strokeLinecap="square"
            fill="none"
          />
          <Polygon points="40,31 51,38 40,45 43,38" fill={COLORS.lime} />
          <Circle cx="32" cy="38" r="3" fill={COLORS.magenta} />
        </Svg>
      </Animated.View>
    </View>
  );
}

export default function LandingScreen({ navigation }: any) {
  const {
    localAgents,
    setAgents,
    setLocalAgents,
    accountEmail,
    ideState,
    setIdeState,
    setModelCatalog,
    setProjects,
    clearPairing,
  } = useStore();

  // Choreographed Entrance (@motion-design 8-Step Checklist: MD3 Emphasized Decelerate + <400ms total stagger)
  const monolithOpacity = useSharedValue(0);
  const monolithY = useSharedValue(20);
  const monolithScale = useSharedValue(0.95);

  const telemetryOpacity = useSharedValue(0);
  const telemetryY = useSharedValue(14);

  const ctaOpacity = useSharedValue(0);
  const ctaY = useSharedValue(18);

  // Artistic & Calm Continuous Motion Layers (never obscure or compete with CUSS typography)
  const dialRotation = useSharedValue(0);
  const pendulumAngle = useSharedValue(-9);
  const emblemBreathe = useSharedValue(1);

  useEffect(() => {
    // 1. Hero Monolith Entrance (0ms delay, 420ms decelerate)
    monolithOpacity.value = withTiming(1, { duration: 420, easing: MOTION.easing.enter });
    monolithY.value = withTiming(0, { duration: 420, easing: MOTION.easing.enter });
    monolithScale.value = withSpring(1, MOTION.spring.snappy);

    // 2. Telemetry Strip Entrance (110ms stagger)
    telemetryOpacity.value = withDelay(
      110,
      withTiming(1, { duration: 340, easing: MOTION.easing.enter }),
    );
    telemetryY.value = withDelay(
      110,
      withTiming(0, { duration: 340, easing: MOTION.easing.enter }),
    );

    // 3. CTA Deck Entrance (210ms stagger — well within <500ms budget)
    ctaOpacity.value = withDelay(
      210,
      withTiming(1, { duration: 360, easing: MOTION.easing.enter }),
    );
    ctaY.value = withDelay(210, withSpring(0, MOTION.spring.snappy));

    // 4. Calm Artistic Continuous Loops
    dialRotation.value = withRepeat(
      withTiming(360, { duration: 22000, easing: Easing.linear }),
      -1,
      false,
    );
    pendulumAngle.value = withRepeat(
      withSequence(
        withTiming(9, { duration: 3400, easing: MOTION.easing.ambient }),
        withTiming(-9, { duration: 3400, easing: MOTION.easing.ambient }),
      ),
      -1,
      true,
    );
    emblemBreathe.value = withRepeat(
      withSequence(
        withTiming(1.025, { duration: 3000, easing: MOTION.easing.ambient }),
        withTiming(0.985, { duration: 3000, easing: MOTION.easing.ambient }),
      ),
      -1,
      true,
    );

    // Preload Mac sessions, models, projects, and IDE state in the background
    (async () => {
      try {
        const [cloud, local, models, projs, ide] = await Promise.allSettled([
          listAgents(),
          localList(true),
          localModels(false),
          localProjects(),
          localIdeState(),
        ]);
        if (cloud.status === 'fulfilled' && Array.isArray(cloud.value?.agents)) {
          setAgents(cloud.value.agents);
        }
        if (local.status === 'fulfilled' && Array.isArray(local.value?.agents)) {
          setLocalAgents(local.value.agents);
        }
        if (models.status === 'fulfilled' && Array.isArray(models.value?.families)) {
          setModelCatalog(models.value.families, models.value.account?.email);
        }
        if (projs.status === 'fulfilled' && Array.isArray(projs.value?.projects)) {
          setProjects(projs.value.projects);
        }
        if (ide.status === 'fulfilled' && ide.value) {
          setIdeState(ide.value);
        }
      } catch {
        /* offline: saved device chats remain ready */
      }
    })();
  }, []);

  const monolithAnimStyle = useAnimatedStyle(() => ({
    opacity: monolithOpacity.value,
    transform: [{ translateY: monolithY.value }, { scale: monolithScale.value }],
  }));

  const telemetryAnimStyle = useAnimatedStyle(() => ({
    opacity: telemetryOpacity.value,
    transform: [{ translateY: telemetryY.value }],
  }));

  const ctaAnimStyle = useAnimatedStyle(() => ({
    opacity: ctaOpacity.value,
    transform: [{ translateY: ctaY.value }],
  }));

  const dialAnimStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${dialRotation.value}deg` }],
  }));

  const pendulumAnimStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${pendulumAngle.value}deg` }],
  }));

  const breatheAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: emblemBreathe.value }],
  }));

  const safeLocal = Array.isArray(localAgents) ? localAgents : [];
  const activeWs = ideState?.activeWorkspace;

  return (
    <View style={styles.root}>
      {/* Top Studio Header Bar */}
      <View style={styles.topStrip}>
        <View style={styles.onlinePill}>
          <View style={styles.onlineDot} />
          <Text style={styles.onlineText}>UMBILICAL // LOCKED</Text>
        </View>
        <SpringButton style={styles.unlinkChip} onPress={clearPairing}>
          <Unplug size={12} color={COLORS.magenta} />
          <Text style={styles.unlinkChipText}>PAIRING</Text>
        </SpringButton>
      </View>

      {/* Dead-Center Artistic Brand Monolith (CUSS Logo & Name 100% Unobstructed in the Middle) */}
      <View style={styles.centerStage}>
        <Animated.View style={[styles.brandMonolithCard, monolithAnimStyle]}>
          <View style={styles.cornerTL} />
          <View style={styles.cornerBR} />

          <View style={styles.monolithEyebrowRow}>
            <CussStarGlyph size={12} color={COLORS.lime} />
            <Text style={styles.monolithEyebrowText}>01 // MOBILE STUDIO DECK</Text>
          </View>

          {/* Bespoke Artistic CUSS Logo Crest */}
          <CussArtisticBrandCrest
            dialStyle={dialAnimStyle}
            pendulumStyle={pendulumAnimStyle}
            breatheStyle={breatheAnimStyle}
          />

          {/* Dead-Center High-Contrast CUSS Wordmark + Full Name */}
          <View style={styles.wordmarkContainer}>
            <Text
              style={styles.cussHeroWordmark}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              CUSS
            </Text>
            <View style={styles.cussUnderlineBar}>
              <View style={[styles.cussBarSegment, { flex: 3, backgroundColor: COLORS.lime }]} />
              <View style={[styles.cussBarSegment, { flex: 1, backgroundColor: COLORS.cyan }]} />
              <View style={[styles.cussBarSegment, { flex: 1, backgroundColor: COLORS.magenta }]} />
            </View>
          </View>

          <Text style={styles.cussFullName}>CYBERNETIC UMBILICAL STUDIO &amp; SYNTH</Text>
          <Text style={styles.cussTagline}>
            Direct Mac Cursor CLI &amp; IDE mirror · Saved on Android · Live Git, Terminal, Voice &amp; File Renderer
          </Text>
        </Animated.View>

        {/* Clean Architectural Telemetry Strip */}
        <Animated.View style={[styles.telemetryCard, telemetryAnimStyle]}>
          <View style={styles.telemetryRow}>
            <Laptop size={13} color={COLORS.lime} />
            <Text style={styles.telemetryLabel}>MAC IDE:</Text>
            <Text style={styles.telemetryValue} numberOfLines={1}>
              {activeWs ? activeWs.name : 'Cursor Ready'}
            </Text>
            {activeWs?.branch ? (
              <View style={styles.miniTag}>
                <GitBranch size={9} color={COLORS.cyan} />
                <Text style={styles.miniTagText}>{activeWs.branch}</Text>
              </View>
            ) : null}
          </View>

          <View style={styles.telemetryDivider} />

          <View style={styles.telemetryRow}>
            <Cpu size={13} color={COLORS.cyan} />
            <Text style={styles.telemetryLabel}>DEFAULT:</Text>
            <Text style={styles.telemetryValue} numberOfLines={1}>
              {accountEmail ? `AUTO · ${accountEmail}` : 'AUTO · GROK 4.7 · OPUS 5.5'}
            </Text>
            <View style={[styles.miniTag, { borderColor: COLORS.lime }]}>
              <Text style={[styles.miniTagText, { color: COLORS.lime }]}>
                {safeLocal.length} SAVED CHATS
              </Text>
            </View>
          </View>
        </Animated.View>
      </View>

      {/* Bottom Choreographed Explore CTA Deck -> Takes User to Main Chats Page */}
      <Animated.View style={[styles.bottomCtaDeck, ctaAnimStyle]}>
        <SpringButton
          style={styles.exploreBtn}
          onPress={() => navigation.navigate('Dashboard')}
          tiltOnPress
        >
          <Sparkles size={18} color={COLORS.bg} strokeWidth={2.5} />
          <Text style={styles.exploreBtnText}>EXPLORE CUSS</Text>
          <View style={styles.exploreArrowBox}>
            <ArrowUpRight size={18} color={COLORS.lime} strokeWidth={2.8} />
          </View>
        </SpringButton>

        <SpringButton
          style={styles.quickSpawnBtn}
          onPress={() => navigation.navigate('CreateAgent', { kind: 'mac' })}
        >
          <FolderGit2 size={14} color={COLORS.cyan} />
          <Text style={styles.quickSpawnText}>SPAWN NEW MAC AGENT DIRECTLY</Text>
        </SpringButton>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.bg,
    justifyContent: 'space-between',
    paddingTop: 50,
    paddingBottom: 28,
    paddingHorizontal: 20,
  },
  topStrip: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  onlinePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.surface,
    borderWidth: 1.2,
    borderColor: COLORS.lime,
    borderRadius: 9,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  onlineDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: COLORS.lime,
  },
  onlineText: {
    fontFamily: FONTS.monoBold,
    fontSize: 9.5,
    color: COLORS.lime,
    letterSpacing: 1.1,
  },
  unlinkChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.borderHi,
    borderRadius: 9,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  unlinkChipText: {
    fontFamily: FONTS.monoBold,
    fontSize: 9.5,
    color: COLORS.magenta,
    letterSpacing: 0.9,
  },
  centerStage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingVertical: 8,
  },
  brandMonolithCard: {
    width: '100%',
    backgroundColor: '#0B0C14',
    borderWidth: 1.5,
    borderColor: COLORS.borderHi,
    borderRadius: 24,
    paddingVertical: 20,
    paddingHorizontal: 18,
    alignItems: 'center',
    gap: 7,
  },
  cornerTL: {
    position: 'absolute',
    top: 10,
    left: 10,
    width: 16,
    height: 16,
    borderTopWidth: 2,
    borderLeftWidth: 2,
    borderColor: COLORS.lime,
  },
  cornerBR: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    width: 16,
    height: 16,
    borderBottomWidth: 2,
    borderRightWidth: 2,
    borderColor: COLORS.cyan,
  },
  monolithEyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.plate,
    borderWidth: 1,
    borderColor: COLORS.borderHi,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  monolithEyebrowText: {
    fontFamily: FONTS.monoBold,
    fontSize: 9.5,
    color: COLORS.cyan,
    letterSpacing: 1.4,
  },
  crestContainer: {
    width: 124,
    height: 124,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 2,
  },
  crestCenter: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  wordmarkContainer: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    marginTop: 2,
  },
  cussHeroWordmark: {
    fontFamily: FONTS.mogi,
    fontSize: 60,
    lineHeight: 68,
    color: COLORS.lime,
    letterSpacing: 5,
    textAlign: 'center',
    includeFontPadding: false,
  },
  cussUnderlineBar: {
    width: 152,
    height: 4,
    flexDirection: 'row',
    gap: 4,
    marginTop: 3,
  },
  cussBarSegment: {
    height: '100%',
    borderRadius: 2,
  },
  cussFullName: {
    fontFamily: FONTS.display,
    fontSize: 12.5,
    color: COLORS.bone,
    letterSpacing: 1.8,
    textAlign: 'center',
    marginTop: 4,
  },
  cussTagline: {
    fontFamily: FONTS.body,
    fontSize: 12,
    color: COLORS.muted,
    textAlign: 'center',
    maxWidth: 300,
    lineHeight: 17.5,
  },
  telemetryCard: {
    width: '100%',
    backgroundColor: COLORS.surface,
    borderWidth: 1.2,
    borderColor: COLORS.borderHi,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 7,
  },
  telemetryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  telemetryDivider: {
    height: 1,
    backgroundColor: COLORS.border,
  },
  telemetryLabel: {
    fontFamily: FONTS.monoBold,
    fontSize: 9.5,
    color: COLORS.muted,
    letterSpacing: 0.8,
  },
  telemetryValue: {
    flex: 1,
    fontFamily: FONTS.monoBold,
    fontSize: 10.5,
    color: COLORS.bone,
  },
  miniTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.plate,
    borderWidth: 1,
    borderColor: COLORS.cyan,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  miniTagText: {
    fontFamily: FONTS.monoBold,
    fontSize: 9,
    color: COLORS.cyan,
  },
  bottomCtaDeck: {
    gap: 9,
  },
  exploreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: COLORS.lime,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 20,
  },
  exploreBtnText: {
    flex: 1,
    fontFamily: FONTS.mogiAlt,
    fontSize: 22,
    color: COLORS.bg,
    letterSpacing: 1.6,
    textAlign: 'center',
    includeFontPadding: false,
  },
  exploreArrowBox: {
    width: 32,
    height: 32,
    borderRadius: 9,
    backgroundColor: COLORS.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickSpawnBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    backgroundColor: COLORS.surface,
    borderWidth: 1.2,
    borderColor: COLORS.cyan,
    borderRadius: 12,
    paddingVertical: 11,
  },
  quickSpawnText: {
    fontFamily: FONTS.monoBold,
    fontSize: 11,
    color: COLORS.cyan,
    letterSpacing: 1.1,
  },
});
