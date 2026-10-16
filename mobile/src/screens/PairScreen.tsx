import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  Vibration,
  View,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  Laptop,
  QrCode,
  RefreshCw,
  Sparkles,
  SpringButton,
  Wifi,
} from '../components/CussIcons';
import { CussCyberOrbLottie, CussHazardStrip, CussSmallArtLoader } from '../components/CussArt';
import {
  detectLiveMacBridgeUrl,
  parsePairingInput,
  resolveAndVerifyPairing,
  useStore,
} from '../store';
import { COLORS, FONTS } from '../theme';

export default function PairScreen({ navigation }: any) {
  const setPairing = useStore((s) => s.setPairing);
  const existingBridgeUrl = useStore((s) => s.bridgeUrl);
  const existingToken = useStore((s) => s.token);
  const [permission, requestPermission] = useCameraPermissions();
  const [manual, setManual] = useState(false);
  const [url, setUrl] = useState(
    () => detectLiveMacBridgeUrl() ?? existingBridgeUrl ?? 'http://10.10.0.132:4040',
  );
  const [token, setToken] = useState(() => existingToken ?? '');
  const [cameraKey, setCameraKey] = useState(0);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [checking, setChecking] = useState(false);

  // Use a ref lock instead of unbinding `onBarcodeScanned` so ExpoCamera's native
  // `barcodeScannerEnabled` prop stays `true` continuously without tearing down CameraX/AVFoundation.
  const scanLockRef = useRef(false);
  const lastInvalidScanRef = useRef<{ raw: string; at: number }>({ raw: '', at: 0 });

  const connectWithCredentials = useCallback(
    async (
      candidateUrl?: string | null,
      candidateToken?: string | null,
      extra?: { tunnelUrl?: string | null; lanUrl?: string | null; cursorAccessToken?: string | null },
    ) => {
      if (scanLockRef.current) return;
      scanLockRef.current = true;
      setChecking(true);
      setStatus({ ok: true, text: 'PROBING MAC UMBILICAL & VERIFYING HANDSHAKE…' });

      try {
        const res = await resolveAndVerifyPairing(candidateUrl, candidateToken, extra);
        setChecking(false);
        if (!res.ok || !res.bridgeUrl || !res.token) {
          setStatus({ ok: false, text: res.message });
          setTimeout(() => {
            scanLockRef.current = false;
          }, 1200);
          return;
        }

        try {
          Vibration.vibrate(60);
        } catch {
          /* ignore */
        }
        setUrl(res.bridgeUrl);
        setToken(res.token);
        setStatus({ ok: true, text: res.message });
        await setPairing(res.bridgeUrl, res.token);
        scanLockRef.current = false;
        if (navigation?.canGoBack?.()) {
          navigation.goBack();
        } else if (navigation?.navigate) {
          navigation.navigate('Landing');
        }
      } catch (e: any) {
        setChecking(false);
        setStatus({
          ok: false,
          text: e?.message ?? 'Failed to verify Mac bridge connection',
        });
        setTimeout(() => {
          scanLockRef.current = false;
        }, 1200);
      }
    },
    [navigation, setPairing],
  );

  const handleRawPayload = useCallback(
    async (raw: string, fromDeepLink = false) => {
      if (!raw || scanLockRef.current) return;
      // Ignore plain initial Expo Go boot URL (`exp://ip:8081` with no path/query) on app mount
      // so opening the Pair screen intentionally doesn't immediately exit before scanning.
      if (
        fromDeepLink &&
        /^exps?:\/\/[^/?#]+\/?$/i.test(raw.trim()) &&
        !raw.includes('pair') &&
        !raw.includes('token=')
      ) {
        return;
      }

      const parsed = parsePairingInput(raw);
      if (!parsed) {
        const now = Date.now();
        if (
          lastInvalidScanRef.current.raw !== raw ||
          now - lastInvalidScanRef.current.at > 2500
        ) {
          lastInvalidScanRef.current = { raw, at: now };
          setStatus({
            ok: false,
            text: 'Unrecognized QR code — point camera at the CUSS Mac Menu Bar QR code.',
          });
        }
        return;
      }

      await connectWithCredentials(parsed.bridgeUrl, parsed.token, {
        tunnelUrl: parsed.tunnelUrl,
        lanUrl: parsed.lanUrl,
        cursorAccessToken: parsed.cursorAccessToken,
      });
    },
    [connectWithCredentials],
  );

  useEffect(() => {
    const sub = Linking.addEventListener('url', ({ url: link }) => {
      void handleRawPayload(link, true);
    });
    Linking.getInitialURL().then((link) => {
      if (link) void handleRawPayload(link, true);
    });

    let modernSub: { remove: () => void } | null = null;
    try {
      if ((CameraView as any).onModernBarcodeScanned) {
        modernSub = CameraView.onModernBarcodeScanned((event) => {
          if (event?.data) {
            if ((CameraView as any).dismissScanner) {
              void CameraView.dismissScanner().catch(() => {});
            }
            void handleRawPayload(event.data, false);
          }
        });
      }
    } catch {
      /* optional native scanner listener */
    }

    return () => {
      sub.remove();
      modernSub?.remove();
    };
  }, [handleRawPayload]);

  async function handleLaunchNativeScanner() {
    try {
      if ((CameraView as any).isModernBarcodeScannerAvailable && CameraView.launchScanner) {
        await CameraView.launchScanner({
          barcodeTypes: ['qr'],
          isHighlightingEnabled: true,
          isGuidanceEnabled: true,
          isPinchToZoomEnabled: true,
        });
      } else {
        setCameraKey((k) => k + 1);
        scanLockRef.current = false;
      }
    } catch {
      setCameraKey((k) => k + 1);
      scanLockRef.current = false;
    }
  }

  if (!permission) return <View style={styles.root} />;

  const canGoBack = Boolean(navigation?.canGoBack?.() && existingBridgeUrl && existingToken);
  const liveDetectedUrl = detectLiveMacBridgeUrl();

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {canGoBack ? (
          <View style={styles.topBackRow}>
            <SpringButton style={styles.backChip} onPress={() => navigation.goBack()}>
              <ArrowLeft size={13} color={COLORS.lime} />
              <Text style={styles.backChipText}>BACK TO STUDIO</Text>
            </SpringButton>
          </View>
        ) : null}

        <View style={styles.brandHeader}>
          <CussCyberOrbLottie size={64} />
          <Text style={styles.brandWordmark}>CUSS</Text>
          <Text style={styles.brandTag}>CYBERNETIC UMBILICAL STUDIO // MAC CURSOR DECK</Text>
        </View>

        <CussHazardStrip color={COLORS.lime} label="PAIRING LINK" />

        {!permission.granted && !manual ? (
          <View style={styles.card}>
            <QrCode size={32} color={COLORS.lime} />
            <Text style={styles.cardTitle}>CAMERA OPTICS REQUIRED</Text>
            <Text style={styles.cardSub}>
              Grant camera access to scan the QR reticle from ⚡ CUSS → Pair Phone in your Mac menu bar, or auto-pair over Wi-Fi in one tap.
            </Text>
            <SpringButton style={styles.primaryBtn} onPress={requestPermission} tiltOnPress>
              <Sparkles size={16} color={COLORS.bg} />
              <Text style={styles.primaryBtnText}>ENABLE CAMERA OPTICS</Text>
            </SpringButton>
            <SpringButton
              style={styles.wifiPairBtn}
              disabled={checking}
              onPress={() => void connectWithCredentials(liveDetectedUrl ?? url, undefined)}
              tiltOnPress
            >
              <Wifi size={15} color={COLORS.lime} />
              <Text style={styles.wifiPairBtnText}>
                1-TAP AUTO-PAIR ON WI-FI ({(liveDetectedUrl ?? url).replace(/^https?:\/\//, '')})
              </Text>
            </SpringButton>
            <SpringButton style={styles.secondaryBtn} onPress={() => setManual(true)}>
              <Laptop size={15} color={COLORS.cyan} />
              <Text style={styles.secondaryBtnText}>ENTER IP &amp; TOKEN MANUALLY</Text>
            </SpringButton>
          </View>
        ) : manual ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>MANUAL UMBILICAL</Text>
            <Text style={styles.fieldLabel}>MAC BRIDGE URL (LAN OR TAILSCALE)</Text>
            <TextInput
              style={styles.input}
              placeholder="http://192.168.1.10:4040"
              placeholderTextColor={COLORS.dim}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              value={url}
              onChangeText={setUrl}
            />
            <Text style={styles.fieldLabel}>PAIRING TOKEN (OPTIONAL ON SAME WI-FI)</Text>
            <TextInput
              style={styles.input}
              placeholder="Auto-fetched on LAN, or paste 48-char hex token"
              placeholderTextColor={COLORS.dim}
              autoCapitalize="none"
              autoCorrect={false}
              value={token}
              onChangeText={setToken}
            />
            <SpringButton
              style={[styles.primaryBtn, checking && { opacity: 0.6 }]}
              disabled={checking}
              onPress={() => void connectWithCredentials(url, token || undefined)}
              tiltOnPress
            >
              {checking ? (
                <ActivityIndicator color={COLORS.bg} />
              ) : (
                <>
                  <Check size={16} color={COLORS.bg} strokeWidth={2.6} />
                  <Text style={styles.primaryBtnText}>VERIFY &amp; LOCK LINK</Text>
                </>
              )}
            </SpringButton>
            <SpringButton style={styles.secondaryBtn} onPress={() => setManual(false)}>
              <QrCode size={15} color={COLORS.cyan} />
              <Text style={styles.secondaryBtnText}>SWITCH TO QR RETICLE</Text>
            </SpringButton>
          </View>
        ) : (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>SCAN MAC MENU BAR QR</Text>
            <Text style={styles.cardSub}>
              Click ⚡ CUSS → Pair Phone in your Mac menu bar and point at any QR tab.
            </Text>
            <View style={styles.cameraFrame}>
              <CameraView
                key={`cam-${cameraKey}`}
                style={StyleSheet.absoluteFill}
                facing="back"
                autofocus="off"
                barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                onBarcodeScanned={({ data }) => {
                  if (data) void handleRawPayload(data, false);
                }}
              />
              <View style={styles.cornerTL} />
              <View style={styles.cornerTR} />
              <View style={styles.cornerBL} />
              <View style={styles.cornerBR} />
            </View>

            <View style={styles.scannerActionsRow}>
              <SpringButton
                style={styles.smallActionChip}
                onPress={() => {
                  scanLockRef.current = false;
                  setStatus(null);
                  setCameraKey((k) => k + 1);
                }}
              >
                <RefreshCw size={12} color={COLORS.cyan} />
                <Text style={styles.smallActionChipText}>RESET OPTICS</Text>
              </SpringButton>

              {(CameraView as any).isModernBarcodeScannerAvailable ? (
                <SpringButton
                  style={[styles.smallActionChip, { borderColor: COLORS.lime }]}
                  onPress={() => void handleLaunchNativeScanner()}
                >
                  <QrCode size={12} color={COLORS.lime} />
                  <Text style={[styles.smallActionChipText, { color: COLORS.lime }]}>
                    FULLSCREEN SCANNER
                  </Text>
                </SpringButton>
              ) : null}
            </View>

            <SpringButton
              style={styles.wifiPairBtn}
              disabled={checking}
              onPress={() => void connectWithCredentials(liveDetectedUrl ?? url, undefined)}
              tiltOnPress
            >
              <Wifi size={15} color={COLORS.lime} />
              <Text style={styles.wifiPairBtnText} numberOfLines={1}>
                1-TAP AUTO-PAIR ON WI-FI ({(liveDetectedUrl ?? url).replace(/^https?:\/\//, '')})
              </Text>
            </SpringButton>

            <SpringButton style={styles.secondaryBtn} onPress={() => setManual(true)}>
              <Laptop size={15} color={COLORS.cyan} />
              <Text style={styles.secondaryBtnText}>ENTER IP &amp; TOKEN MANUALLY</Text>
            </SpringButton>
          </View>
        )}

        {checking ? (
          <CussSmallArtLoader
            variant="inline"
            title="PROBING MAC UMBILICAL"
            subtitle="Verifying bridge handshake & pairing token…"
            accentColor={COLORS.lime}
          />
        ) : null}

        {status ? (
          <View
            style={[
              styles.statusBanner,
              { borderColor: status.ok ? COLORS.lime : COLORS.magenta },
            ]}
          >
            {status.ok ? (
              <Check size={15} color={COLORS.lime} strokeWidth={2.5} />
            ) : (
              <AlertTriangle size={15} color={COLORS.magenta} strokeWidth={2.3} />
            )}
            <Text
              style={[
                styles.statusText,
                { color: status.ok ? COLORS.lime : COLORS.magenta },
              ]}
            >
              {status.text}
            </Text>
          </View>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 20,
    paddingTop: 44,
  },
  topBackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  backChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.lime,
    borderRadius: 9,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  backChipText: {
    fontFamily: FONTS.monoBold,
    fontSize: 10,
    color: COLORS.lime,
    letterSpacing: 0.9,
  },
  brandHeader: {
    alignItems: 'center',
    marginBottom: 12,
  },
  brandWordmark: {
    fontFamily: FONTS.mogi,
    fontSize: 48,
    color: COLORS.lime,
    letterSpacing: 3,
    marginTop: 2,
  },
  brandTag: {
    fontFamily: FONTS.monoBold,
    fontSize: 10,
    color: COLORS.cyan,
    letterSpacing: 1.5,
    marginTop: 2,
    textAlign: 'center',
  },
  card: {
    backgroundColor: COLORS.surface,
    borderWidth: 1.5,
    borderColor: COLORS.borderHi,
    borderRadius: 18,
    padding: 18,
    alignItems: 'center',
    gap: 10,
    marginTop: 8,
  },
  cardTitle: {
    fontFamily: FONTS.mogiAlt,
    fontSize: 22,
    color: COLORS.bone,
    letterSpacing: 1,
  },
  cardSub: {
    fontFamily: FONTS.body,
    fontSize: 13,
    color: COLORS.muted,
    textAlign: 'center',
    lineHeight: 19,
  },
  fieldLabel: {
    alignSelf: 'flex-start',
    fontFamily: FONTS.monoBold,
    fontSize: 10,
    color: COLORS.cyan,
    letterSpacing: 1.1,
    marginTop: 4,
  },
  input: {
    width: '100%',
    fontFamily: FONTS.mono,
    fontSize: 13,
    backgroundColor: COLORS.plate,
    color: COLORS.bone,
    borderWidth: 1.2,
    borderColor: COLORS.borderHi,
    borderRadius: 11,
    paddingHorizontal: 13,
    paddingVertical: 12,
  },
  cameraFrame: {
    width: 256,
    height: 256,
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: COLORS.borderHi,
    marginVertical: 4,
  },
  cornerTL: {
    position: 'absolute',
    top: 12,
    left: 12,
    width: 24,
    height: 24,
    borderTopWidth: 3,
    borderLeftWidth: 3,
    borderColor: COLORS.lime,
  },
  cornerTR: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 24,
    height: 24,
    borderTopWidth: 3,
    borderRightWidth: 3,
    borderColor: COLORS.lime,
  },
  cornerBL: {
    position: 'absolute',
    bottom: 12,
    left: 12,
    width: 24,
    height: 24,
    borderBottomWidth: 3,
    borderLeftWidth: 3,
    borderColor: COLORS.lime,
  },
  cornerBR: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    width: 24,
    height: 24,
    borderBottomWidth: 3,
    borderRightWidth: 3,
    borderColor: COLORS.lime,
  },
  scannerActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    width: '100%',
  },
  smallActionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.plate,
    borderWidth: 1,
    borderColor: COLORS.cyan,
    borderRadius: 9,
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  smallActionChipText: {
    fontFamily: FONTS.monoBold,
    fontSize: 10,
    color: COLORS.cyan,
    letterSpacing: 0.8,
  },
  wifiPairBtn: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COLORS.plate,
    borderWidth: 1.4,
    borderColor: COLORS.lime,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginTop: 2,
  },
  wifiPairBtnText: {
    fontFamily: FONTS.monoBold,
    fontSize: 11,
    color: COLORS.lime,
    letterSpacing: 0.8,
  },
  primaryBtn: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COLORS.lime,
    borderRadius: 12,
    paddingVertical: 14,
    marginTop: 6,
  },
  primaryBtnText: {
    fontFamily: FONTS.monoBold,
    fontSize: 13,
    color: COLORS.bg,
    letterSpacing: 1.1,
  },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingVertical: 8,
  },
  secondaryBtnText: {
    fontFamily: FONTS.monoBold,
    fontSize: 11,
    color: COLORS.cyan,
    letterSpacing: 0.9,
  },
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.surface,
    borderWidth: 1.5,
    borderRadius: 12,
    padding: 12,
    marginTop: 14,
  },
  statusText: {
    flex: 1,
    fontFamily: FONTS.mono,
    fontSize: 11.5,
  },
});
