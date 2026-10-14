import React, { useEffect, useState } from 'react';
import { Alert, Linking, StyleSheet, Text, View } from 'react-native';
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
import Svg, { Circle, Defs, Line, LinearGradient, Path, Polygon, Rect, Stop } from 'react-native-svg';
import { CussSmallArtLoader } from '../components/CussArt';
import {
  ArrowUpRight,
  Check,
  Cpu,
  CussStarGlyph,
  ExternalLink,
  FolderGit2,
  GitBranch,
  Globe,
  Laptop,
  Sparkles,
  SpringButton,
  Unplug,
  X,
} from '../components/CussIcons';
import {
  listAgents,
  localAuthLogin,
  localAuthLogout,
  localAuthStatus,
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
    cursorSignedIn,
    setCursorSignedIn,
    ideState,
    setIdeState,
    setModelCatalog,
    setProjects,
    clearPairing,
  } = useStore();

  const [detectedMacEmail, setDetectedMacEmail] = useState<string | undefined>(
    accountEmail ?? undefined,
  );
  const [signingIn, setSigningIn] = useState(false);
  const [awaitingBrowserAuth, setAwaitingBrowserAuth] = useState(false);
  const [pendingLoginUrl, setPendingLoginUrl] = useState<string | undefined>(undefined);

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
    monolithOpacity.value = withTiming(1, { duration: 420, easing: MOTION.easing.enter });
    monolithY.value = withTiming(0, { duration: 420, easing: MOTION.easing.enter });
    monolithScale.value = withSpring(1, MOTION.spring.snappy);

    telemetryOpacity.value = withDelay(
      110,
      withTiming(1, { duration: 340, easing: MOTION.easing.enter }),
    );
    telemetryY.value = withDelay(
      110,
      withTiming(0, { duration: 340, easing: MOTION.easing.enter }),
    );

    ctaOpacity.value = withDelay(
      210,
      withTiming(1, { duration: 360, easing: MOTION.easing.enter }),
    );
    ctaY.value = withDelay(210, withSpring(0, MOTION.spring.snappy));

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

    // Preload Mac sessions, models, projects, auth status, and IDE state in the background
    (async () => {
      try {
        const [cloud, local, models, projs, ide, auth] = await Promise.allSettled([
          listAgents(),
          localList(true),
          localModels(false),
          localProjects(),
          localIdeState(),
          localAuthStatus(),
        ]);
        if (cloud.status === 'fulfilled' && Array.isArray(cloud.value?.agents)) {
          setAgents(cloud.value.agents);
        }
        if (local.status === 'fulfilled' && Array.isArray(local.value?.agents)) {
          setLocalAgents(local.value.agents);
          if (local.value?.account?.email) {
            setDetectedMacEmail(local.value.account.email);
          }
        }
        if (models.status === 'fulfilled' && Array.isArray(models.value?.families)) {
          setModelCatalog(models.value.families, models.value.account?.email);
          if (models.value?.account?.email) {
            setDetectedMacEmail(models.value.account.email);
          }
        }
        if (projs.status === 'fulfilled' && Array.isArray(projs.value?.projects)) {
          setProjects(projs.value.projects);
        }
        if (ide.status === 'fulfilled' && ide.value) {
          setIdeState(ide.value);
        }
        if (auth.status === 'fulfilled' && auth.value?.email) {
          setDetectedMacEmail(auth.value.email);
        }
      } catch {
        /* offline: saved device chats remain ready */
      }
    })();
  }, []);

  // Poll `GET /api/local/auth/status` while waiting for the user to finish Cursor OAuth in Chrome/Brave on their phone
  useEffect(() => {
    if (!awaitingBrowserAuth) return;
    const iv = setInterval(async () => {
      try {
        const st = await localAuthStatus();
        if (st.loggedIn && st.email) {
          setAwaitingBrowserAuth(false);
          setPendingLoginUrl(undefined);
          setDetectedMacEmail(st.email);
          await setCursorSignedIn(true, st.email);
          const models = await localModels(true).catch(() => null);
          if (models?.families) setModelCatalog(models.families, st.email);
        }
      } catch {
        /* retry next tick */
      }
    }, 1500);
    return () => clearInterval(iv);
  }, [awaitingBrowserAuth]);

  /**
   * Launch Cursor OAuth Sign-In directly from the Android phone!
   * Uses `POST /api/local/auth/login` (`NO_OPEN_BROWSER=1 cursor agent login` reverse-engineered via REA)
   * which generates `https://cursor.com/loginDeepControl?...` and opens it in Android Chrome/Brave.
   */
  async function handleStartPhoneSignIn(forceBrowserOAuth: boolean) {
    setSigningIn(true);
    try {
      const res = await localAuthLogin(forceBrowserOAuth);
      if (res.loggedIn && res.email && !forceBrowserOAuth) {
        setDetectedMacEmail(res.email);
        await setCursorSignedIn(true, res.email);
        return;
      }
      if (res.loginUrl) {
        setPendingLoginUrl(res.loginUrl);
        setAwaitingBrowserAuth(true);
        await Linking.openURL(res.loginUrl);
        return;
      }
      if (res.loggedIn && res.email) {
        setDetectedMacEmail(res.email);
        await setCursorSignedIn(true, res.email);
      } else {
        Alert.alert(
          'Cursor Login',
          'Could not start Cursor OAuth URL. Ensure the Mac bridge is running.',
        );
      }
    } catch (e: any) {
      Alert.alert('Sign-In Error', e?.message ?? 'Could not reach Mac bridge');
    } finally {
      setSigningIn(false);
    }
  }

  function handleSignOut() {
    Alert.alert(
      'Sign Out of Cursor',
      'Sign out of your Cursor session on this phone (and optionally clear Mac CLI auth)?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Lock Phone Session',
          onPress: async () => {
            await setCursorSignedIn(false, null);
          },
        },
        {
          text: 'Sign Out Everywhere',
          style: 'destructive',
          onPress: async () => {
            await setCursorSignedIn(false, null);
            setDetectedMacEmail(undefined);
            try {
              await localAuthLogout();
            } catch {
              /* ignore */
            }
          },
        },
      ],
    );
  }

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
  const displayEmail = accountEmail || detectedMacEmail;

  return (
    <View style={styles.root}>
      {/* Top Studio Header Bar */}
      <View style={styles.topStrip}>
        <View style={styles.onlinePill}>
          <View
            style={[
              styles.onlineDot,
              { backgroundColor: cursorSignedIn ? COLORS.lime : COLORS.amber },
            ]}
          />
          <Text
            style={[
              styles.onlineText,
              { color: cursorSignedIn ? COLORS.lime : COLORS.amber },
            ]}
          >
            {cursorSignedIn ? 'CURSOR // SIGNED IN' : 'CURSOR // AUTH REQUIRED'}
          </Text>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {cursorSignedIn ? (
            <SpringButton style={styles.signOutChip} onPress={handleSignOut}>
              <X size={11} color={COLORS.amber} />
              <Text style={styles.signOutChipText}>SIGN OUT</Text>
            </SpringButton>
          ) : null}
          <SpringButton style={styles.unlinkChip} onPress={clearPairing}>
            <Unplug size={12} color={COLORS.magenta} />
            <Text style={styles.unlinkChipText}>PAIRING</Text>
          </SpringButton>
        </View>
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
            <Text style={styles.telemetryLabel}>ACCOUNT:</Text>
            <Text style={styles.telemetryValue} numberOfLines={1}>
              {displayEmail ? displayEmail : 'Sign in to Cursor to unlock'}
            </Text>
            <View style={[styles.miniTag, { borderColor: COLORS.lime }]}>
              <Text style={[styles.miniTagText, { color: COLORS.lime }]}>
                {safeLocal.length} CHATS
              </Text>
            </View>
          </View>
        </Animated.View>
      </View>

      {/* Bottom Choreographed Deck: First-Time Sign-In Gate OR Remembered Explore Studio CTA */}
      <Animated.View style={[styles.bottomCtaDeck, ctaAnimStyle]}>
        {!cursorSignedIn ? (
          awaitingBrowserAuth || signingIn ? (
            <View style={{ gap: 8 }}>
              <CussSmallArtLoader
                variant="card"
                title="SIGNING IN TO CURSOR"
                stages={[
                  'OPENING CURSOR OAUTH IN PHONE BROWSER…',
                  'APPROVE LOGIN IN CHROME / BRAVE…',
                  'LOCKING CURSOR ULTRA CREDENTIALS ON MAC…',
                ]}
                accentColor={COLORS.lime}
              />
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {pendingLoginUrl ? (
                  <SpringButton
                    style={[styles.quickSpawnBtn, { flex: 1 }]}
                    onPress={() => Linking.openURL(pendingLoginUrl)}
                  >
                    <Globe size={13} color={COLORS.cyan} />
                    <Text style={styles.quickSpawnText}>RE-OPEN BROWSER</Text>
                    <ExternalLink size={11} color={COLORS.cyan} />
                  </SpringButton>
                ) : null}
                <SpringButton
                  style={[styles.quickSpawnBtn, { paddingHorizontal: 14, borderColor: COLORS.magenta }]}
                  onPress={() => {
                    setAwaitingBrowserAuth(false);
                    setSigningIn(false);
                  }}
                >
                  <Text style={[styles.quickSpawnText, { color: COLORS.magenta }]}>CANCEL</Text>
                </SpringButton>
              </View>
            </View>
          ) : (
            <View style={{ gap: 8 }}>
              {/* Primary Phone Browser OAuth Sign-In Button */}
              <SpringButton
                style={styles.exploreBtn}
                onPress={() => handleStartPhoneSignIn(true)}
                tiltOnPress
              >
                <Globe size={18} color={COLORS.bg} strokeWidth={2.5} />
                <Text style={styles.signInBtnText}>SIGN IN TO CURSOR TO CONTINUE</Text>
                <View style={styles.exploreArrowBox}>
                  <ArrowUpRight size={17} color={COLORS.lime} strokeWidth={2.8} />
                </View>
              </SpringButton>

              {/* If Mac already has an authenticated Cursor CLI account, offer instant 1-tap verification */}
              {detectedMacEmail ? (
                <SpringButton
                  style={styles.quickSpawnBtn}
                  onPress={() => handleStartPhoneSignIn(false)}
                >
                  <Check size={14} color={COLORS.lime} strokeWidth={2.6} />
                  <Text style={[styles.quickSpawnText, { color: COLORS.lime }]} numberOfLines={1}>
                    CONTINUE AS {detectedMacEmail.toUpperCase()}
                  </Text>
                </SpringButton>
              ) : null}
            </View>
          )
        ) : (
          <>
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
          </>
        )}
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
    paddingBottom: 26,
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
  signOutChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.amber,
    borderRadius: 9,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  signOutChipText: {
    fontFamily: FONTS.monoBold,
    fontSize: 9,
    color: COLORS.amber,
    letterSpacing: 0.8,
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
    paddingVertical: 6,
  },
  brandMonolithCard: {
    width: '100%',
    backgroundColor: '#0B0C14',
    borderWidth: 1.5,
    borderColor: COLORS.borderHi,
    borderRadius: 24,
    paddingVertical: 18,
    paddingHorizontal: 18,
    alignItems: 'center',
    gap: 6,
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
    fontSize: 58,
    lineHeight: 66,
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
    fontSize: 12,
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
    paddingHorizontal: 18,
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
  signInBtnText: {
    flex: 1,
    fontFamily: FONTS.mogiAlt,
    fontSize: 16,
    color: COLORS.bg,
    letterSpacing: 0.9,
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
    paddingHorizontal: 12,
  },
  quickSpawnText: {
    fontFamily: FONTS.monoBold,
    fontSize: 10.5,
    color: COLORS.cyan,
    letterSpacing: 1,
  },
});
