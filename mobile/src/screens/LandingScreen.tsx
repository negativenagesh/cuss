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
import CursorSettingsModal from '../components/CursorSettingsModal';
import DirectoryPickerModal from '../components/DirectoryPickerModal';
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
  SlidersHorizontal,
  Sparkles,
  SpringButton,
  Unplug,
  X,
} from '../components/CussIcons';
import {
  listAgents,
  localAuthComplete,
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

function toBase64Url(bytes: number[]): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : 0;
    out += chars[b0 >> 2];
    out += chars[((b0 & 3) << 4) | (b1 >> 4)];
    if (i + 1 < bytes.length) out += chars[((b1 & 15) << 2) | (b2 >> 6)];
    if (i + 2 < bytes.length) out += chars[b2 & 63];
  }
  return out.replace(/\+/g, '-').replace(/\//g, '_');
}

function sha256AsciiBytes(ascii: string): number[] {
  const K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];
  const H = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ];
  const bytes: number[] = [];
  for (let i = 0; i < ascii.length; i++) bytes.push(ascii.charCodeAt(i) & 0xff);
  const bitLen = bytes.length * 8;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  for (let i = 7; i >= 0; i--) bytes.push(Math.floor(bitLen / Math.pow(2, i * 8)) & 0xff);
  const W = new Array<number>(64);
  const rotr = (n: number, x: number) => (x >>> n) | (x << (32 - n));
  for (let i = 0; i < bytes.length; i += 64) {
    for (let t = 0; t < 16; t++) {
      W[t] =
        ((bytes[i + t * 4] << 24) |
          (bytes[i + t * 4 + 1] << 16) |
          (bytes[i + t * 4 + 2] << 8) |
          bytes[i + t * 4 + 3]) >>>
        0;
    }
    for (let t = 16; t < 64; t++) {
      const s0 = (rotr(7, W[t - 15]) ^ rotr(18, W[t - 15]) ^ (W[t - 15] >>> 3)) >>> 0;
      const s1 = (rotr(17, W[t - 2]) ^ rotr(19, W[t - 2]) ^ (W[t - 2] >>> 10)) >>> 0;
      W[t] = (W[t - 16] + s0 + W[t - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = H;
    for (let t = 0; t < 64; t++) {
      const S1 = (rotr(6, e) ^ rotr(11, e) ^ rotr(25, e)) >>> 0;
      const ch = ((e & f) ^ (~e & g)) >>> 0;
      const temp1 = (h + S1 + ch + K[t] + W[t]) >>> 0;
      const S0 = (rotr(2, a) ^ rotr(13, a) ^ rotr(22, a)) >>> 0;
      const maj = ((a & b) ^ (a & c) ^ (b & c)) >>> 0;
      const temp2 = (S0 + maj) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }
    H[0] = (H[0] + a) >>> 0;
    H[1] = (H[1] + b) >>> 0;
    H[2] = (H[2] + c) >>> 0;
    H[3] = (H[3] + d) >>> 0;
    H[4] = (H[4] + e) >>> 0;
    H[5] = (H[5] + f) >>> 0;
    H[6] = (H[6] + g) >>> 0;
    H[7] = (H[7] + h) >>> 0;
  }
  const out: number[] = [];
  for (const w of H) {
    out.push((w >>> 24) & 0xff, (w >>> 16) & 0xff, (w >>> 8) & 0xff, w & 0xff);
  }
  return out;
}

/**
 * Pure-JS implementation of Cursor CLI's `startLogin()` (reverse-engineered via REA from `1584.index.js`).
 * Generates `uuid`, `verifier`, `challenge` (SHA-256 base64url), and `https://cursor.com/loginDeepControl`
 * synchronously in 0.1ms on the phone so the mobile default browser opens at t=0ms with ZERO network wait!
 */
function createCursorPkceSession(): {
  uuid: string;
  verifier: string;
  challenge: string;
  loginUrl: string;
} {
  const randBytes: number[] = [];
  for (let i = 0; i < 32; i++) {
    randBytes.push(Math.floor(Math.random() * 256));
  }
  const verifier = toBase64Url(randBytes);
  const challenge = toBase64Url(sha256AsciiBytes(verifier));
  const hex = '0123456789abcdef';
  let uuid = '';
  for (let i = 0; i < 36; i++) {
    if (i === 8 || i === 13 || i === 18 || i === 23) uuid += '-';
    else if (i === 14) uuid += '4';
    else if (i === 19) uuid += hex[(Math.floor(Math.random() * 16) & 0x3) | 0x8];
    else uuid += hex[Math.floor(Math.random() * 16)];
  }
  const loginUrl =
    `https://cursor.com/loginDeepControl` +
    `?challenge=${encodeURIComponent(challenge)}` +
    `&uuid=${encodeURIComponent(uuid)}` +
    `&mode=login&redirectTarget=cli&supportsSelectedTeamLogin=true`;
  return { uuid, verifier, challenge, loginUrl };
}

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
    saveCursorTokens,
    connectionMode,
    ideState,
    setIdeState,
    setModelCatalog,
    projects,
    setProjects,
    selectedCwd,
    setSelectedCwd,
    clearPairing,
  } = useStore();

  const [detectedMacEmail, setDetectedMacEmail] = useState<string | undefined>(
    accountEmail ?? undefined,
  );
  const [signingIn, setSigningIn] = useState(false);
  const [awaitingBrowserAuth, setAwaitingBrowserAuth] = useState(false);
  const [pendingLoginUrl, setPendingLoginUrl] = useState<string | undefined>(undefined);
  const [pkceSession, setPkceSession] = useState<{ uuid: string; verifier: string } | null>(null);
  const [manualSignedOut, setManualSignedOut] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [dirPickerOpen, setDirPickerOpen] = useState(false);

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

    // Fast 2ms auth + IDE state check first, then preload sessions & models in background
    (async () => {
      try {
        const [auth, ide] = await Promise.allSettled([localAuthStatus(), localIdeState()]);
        if (auth.status === 'fulfilled' && auth.value?.email) {
          setDetectedMacEmail(auth.value.email);
          if (!manualSignedOut) {
            await setCursorSignedIn(true, auth.value.email);
          }
        }
        if (ide.status === 'fulfilled' && ide.value) {
          setIdeState(ide.value);
        }

        const [local, projs, models, cloud] = await Promise.allSettled([
          localList(false),
          localProjects(),
          localModels(false),
          listAgents(),
        ]);
        if (local.status === 'fulfilled' && Array.isArray(local.value?.agents)) {
          setLocalAgents(local.value.agents);
          if (local.value?.account?.email) {
            setDetectedMacEmail(local.value.account.email);
            if (!manualSignedOut) {
              await setCursorSignedIn(true, local.value.account.email);
            }
          }
        }
        if (projs.status === 'fulfilled' && Array.isArray(projs.value?.projects)) {
          setProjects(projs.value.projects);
        }
        if (models.status === 'fulfilled' && Array.isArray(models.value?.families)) {
          setModelCatalog(models.value.families, models.value.account?.email);
          if (models.value?.account?.email) {
            setDetectedMacEmail(models.value.account.email);
            if (!manualSignedOut) {
              await setCursorSignedIn(true, models.value.account.email);
            }
          }
        }
        if (cloud.status === 'fulfilled' && Array.isArray(cloud.value?.agents)) {
          setAgents(cloud.value.agents);
        }
      } catch {
        /* offline: saved device chats remain ready */
      }
    })();
  }, []);

  // Poll `https://api2.cursor.sh/auth/poll` directly from the phone (AND `localAuthStatus()` on Mac)
  // while waiting for the user to finish Cursor OAuth in Chrome/Brave on their phone!
  useEffect(() => {
    if (!awaitingBrowserAuth) return;
    const iv = setInterval(async () => {
      // 1. Direct poll to Cursor's OAuth backend (`https://api2.cursor.sh/auth/poll`) from the phone!
      if (pkceSession) {
        try {
          const pollUrl = `https://api2.cursor.sh/auth/poll?uuid=${encodeURIComponent(pkceSession.uuid)}&verifier=${encodeURIComponent(pkceSession.verifier)}`;
          const res = await fetch(pollUrl, { headers: { 'Content-Type': 'application/json' } });
          if (res.ok) {
            const data = await res.json();
            if (data?.accessToken) {
              // Save the mobile-acquired OAuth tokens directly on the phone AND push to Mac bridge (`~/.cursor/auth.json`)
              await saveCursorTokens(
                String(data.accessToken),
                data.refreshToken ? String(data.refreshToken) : undefined,
                detectedMacEmail || accountEmail,
              );
              const bridgeComplete = await localAuthComplete({
                accessToken: String(data.accessToken),
                refreshToken: data.refreshToken ? String(data.refreshToken) : undefined,
              }).catch(() => null);
              const email =
                bridgeComplete?.email || detectedMacEmail || accountEmail || 'Cursor Account';
              setAwaitingBrowserAuth(false);
              setPendingLoginUrl(undefined);
              setPkceSession(null);
              setDetectedMacEmail(email);
              await setCursorSignedIn(true, email);
              return;
            }
          }
        } catch {
          /* retry next tick */
        }
      }

      // 2. Also check Mac bridge auth status if reachable
      try {
        const st = await localAuthStatus();
        if (st.loggedIn && st.email) {
          setAwaitingBrowserAuth(false);
          setPendingLoginUrl(undefined);
          setPkceSession(null);
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
  }, [awaitingBrowserAuth, pkceSession]);

  /**
   * Launch Cursor OAuth Sign-In directly in the Android phone's default browser (Chrome / Brave) at t=0ms!
   * Uses `createCursorPkceSession()` synchronously so `Linking.openURL` opens the browser IMMEDIATELY
   * with zero network wait, then polls `https://api2.cursor.sh/auth/poll` until approved!
   */
  async function handleStartPhoneSignIn(openMobileBrowser = true) {
    if (!openMobileBrowser && detectedMacEmail) {
      await setCursorSignedIn(true, detectedMacEmail);
      return;
    }

    // Generate official Cursor PKCE loginDeepControl URL synchronously in 0.1ms and open mobile browser at t=0ms!
    const pkce = createCursorPkceSession();
    setPkceSession({ uuid: pkce.uuid, verifier: pkce.verifier });
    setPendingLoginUrl(pkce.loginUrl);
    setAwaitingBrowserAuth(true);

    try {
      await Linking.openURL(pkce.loginUrl);
    } catch (e: any) {
      Alert.alert('Browser Error', e?.message ?? 'Could not open default browser on phone');
    }

    // Best-effort notify Mac bridge in background (never blocks mobile browser!)
    localAuthLogin(false)
      .then((res) => {
        if (res?.email) setDetectedMacEmail(res.email);
      })
      .catch(() => {});
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
            setManualSignedOut(true);
            await setCursorSignedIn(false, null);
          },
        },
        {
          text: 'Sign Out Everywhere',
          style: 'destructive',
          onPress: async () => {
            setManualSignedOut(true);
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
  const activeDirPath =
    selectedCwd || activeWs?.path || (Array.isArray(projects) && projects[0]?.path) || '';
  const activeDirName = activeDirPath
    ? activeDirPath.split('/').filter(Boolean).pop() || activeDirPath
    : activeWs?.name || 'Select Mac Folder';

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
              {
                color: !cursorSignedIn
                  ? COLORS.amber
                  : connectionMode === 'autonomous-cloud'
                    ? COLORS.cyan
                    : COLORS.lime,
              },
            ]}
          >
            {!cursorSignedIn
              ? 'CURSOR // AUTH REQUIRED'
              : connectionMode === 'autonomous-cloud'
                ? 'CLOUD DIRECT // MAC OFFLINE'
                : connectionMode === 'tunnel'
                  ? 'WORLDWIDE TUNNEL // LIVE'
                  : 'CURSOR // SIGNED IN'}
          </Text>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <SpringButton
            style={[styles.signOutChip, { borderColor: COLORS.cyan }]}
            onPress={() => setSettingsOpen(true)}
          >
            <SlidersHorizontal size={11} color={COLORS.cyan} />
            <Text style={[styles.signOutChipText, { color: COLORS.cyan }]}>SETTINGS</Text>
          </SpringButton>
          {cursorSignedIn ? (
            <SpringButton style={styles.signOutChip} onPress={handleSignOut}>
              <X size={11} color={COLORS.amber} />
              <Text style={styles.signOutChipText}>SIGN OUT</Text>
            </SpringButton>
          ) : null}
          <SpringButton
            style={styles.unlinkChip}
            onPress={() => navigation.navigate('Pair')}
          >
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

        {/* Clean Architectural Telemetry Strip + Working Directory Selector */}
        <Animated.View style={[styles.telemetryCard, telemetryAnimStyle]}>
          <SpringButton
            style={styles.telemetryRow}
            onPress={() => setDirPickerOpen(true)}
          >
            <FolderGit2 size={13} color={COLORS.lime} />
            <Text style={styles.telemetryLabel}>WORK DIR:</Text>
            <Text style={styles.telemetryValue} numberOfLines={1}>
              {activeDirName}
            </Text>
            {activeWs?.branch ? (
              <View style={styles.miniTag}>
                <GitBranch size={9} color={COLORS.cyan} />
                <Text style={styles.miniTagText}>{activeWs.branch}</Text>
              </View>
            ) : null}
            <View style={[styles.miniTag, { borderColor: COLORS.lime, backgroundColor: COLORS.limeDim }]}>
              <Text style={[styles.miniTagText, { color: COLORS.lime }]}>SELECT DIR</Text>
            </View>
          </SpringButton>

          <View style={styles.telemetryDivider} />

          <SpringButton
            style={styles.telemetryRow}
            onPress={() => setSettingsOpen(true)}
          >
            <Cpu size={13} color={COLORS.cyan} />
            <Text style={styles.telemetryLabel}>ACCOUNT:</Text>
            <Text style={styles.telemetryValue} numberOfLines={1}>
              {displayEmail ? displayEmail : 'Sign in to Cursor to unlock'}
            </Text>
            <View style={[styles.miniTag, { borderColor: COLORS.cyan }]}>
              <Text style={[styles.miniTagText, { color: COLORS.cyan }]}>
                PLAN &amp; USAGE
              </Text>
            </View>
          </SpringButton>
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
                  'OPENED CURSOR LOGIN IN MOBILE BROWSER…',
                  'APPROVE LOGIN IN CHROME / BRAVE…',
                  'POLLING CURSOR OAUTH COMPLETION…',
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
                  style={[styles.quickSpawnBtn, { flex: 1, borderColor: COLORS.lime }]}
                  onPress={() => setCursorSignedIn(true, detectedMacEmail || 'Cursor Account')}
                >
                  <Check size={13} color={COLORS.lime} strokeWidth={2.6} />
                  <Text style={[styles.quickSpawnText, { color: COLORS.lime }]}>
                    DONE // CONTINUE
                  </Text>
                </SpringButton>
                <SpringButton
                  style={[styles.quickSpawnBtn, { paddingHorizontal: 12, borderColor: COLORS.magenta }]}
                  onPress={() => {
                    setAwaitingBrowserAuth(false);
                    setSigningIn(false);
                  }}
                >
                  <X size={13} color={COLORS.magenta} />
                </SpringButton>
              </View>
            </View>
          ) : (
            <View style={{ gap: 8 }}>
              {/* Primary Sign-In Button: Immediately opens phone's default browser (Chrome/Brave) at t=0ms! */}
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

              {/* Optional 1-tap shortcut if Mac CLI is already logged in */}
              {detectedMacEmail ? (
                <SpringButton
                  style={styles.quickSpawnBtn}
                  onPress={() => handleStartPhoneSignIn(false)}
                >
                  <Check size={14} color={COLORS.lime} strokeWidth={2.6} />
                  <Text style={[styles.quickSpawnText, { color: COLORS.lime }]} numberOfLines={1}>
                    INSTANT CONTINUE AS {detectedMacEmail.toUpperCase()}
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
              onPress={() =>
                navigation.navigate('CreateAgent', {
                  kind: 'mac',
                  cwd: activeDirPath || undefined,
                })
              }
            >
              <FolderGit2 size={14} color={COLORS.cyan} />
              <Text style={styles.quickSpawnText} numberOfLines={1}>
                SPAWN AGENT IN {activeDirName.toUpperCase()}
              </Text>
            </SpringButton>
          </>
        )}
      </Animated.View>

      {/* Cursor Settings & Plan Usage Modal */}
      <CursorSettingsModal
        visible={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />

      {/* Mac Working Directory Picker Modal */}
      <DirectoryPickerModal
        visible={dirPickerOpen}
        onClose={() => setDirPickerOpen(false)}
        onSelectDirectory={(dir) => setSelectedCwd(dir)}
      />
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
