import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import {
  AlertTriangle,
  Check,
  Laptop,
  QrCode,
  Sparkles,
  SpringButton,
} from '../components/CussIcons';
import { CussCyberOrbLottie, CussHazardStrip, CussSmallArtLoader } from '../components/CussArt';
import { detectLiveMacBridgeUrl, useStore } from '../store';
import { COLORS, FONTS } from '../theme';

/** Verify the bridge answers before saving anything (prevents silent bad URLs). */
async function verifyBridge(url: string): Promise<{ ok: boolean; message: string }> {
  try {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 8000);
    const res = await fetch(`${url.replace(/\/$/, '')}/api/health`, { signal: ac.signal });
    clearTimeout(t);
    if (!res.ok) return { ok: false, message: `Bridge answered with HTTP ${res.status}` };
    const j = await res.json();
    return j?.ok
      ? { ok: true, message: `LINK ESTABLISHED // BRIDGE v${j.version ?? '0.2'}` }
      : { ok: false, message: 'Endpoint is not a CUSS Mac bridge' };
  } catch {
    return {
      ok: false,
      message: 'Cannot reach bridge at that address (check Wi-Fi / Tailscale IP / port 4040)',
    };
  }
}

export default function PairScreen() {
  const setPairing = useStore((s) => s.setPairing);
  const [permission, requestPermission] = useCameraPermissions();
  const [manual, setManual] = useState(false);
  const [url, setUrl] = useState(() => detectLiveMacBridgeUrl() ?? 'http://10.10.0.160:4040');
  const [token, setToken] = useState('');
  const [scanned, setScanned] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    const sub = Linking.addEventListener('url', ({ url: link }) => void handleLink(link));
    Linking.getInitialURL().then((link) => {
      if (link) void handleLink(link);
    });
    return () => sub.remove();
  }, []);

  async function save(urlIn: string, tokenIn: string) {
    const cleanUrl = urlIn.trim().replace(/\/$/, '');
    const cleanToken = tokenIn.trim();
    if (!/^https?:\/\//.test(cleanUrl)) {
      setStatus({ ok: false, text: 'Address must start with http:// (e.g. http://192.168.1.10:4040)' });
      return;
    }
    setChecking(true);
    setStatus({ ok: true, text: 'PROBING MAC UMBILICAL…' });
    const res = await verifyBridge(cleanUrl);
    setChecking(false);
    if (!res.ok) {
      setStatus({ ok: false, text: res.message });
      setScanned(false);
      return;
    }
    setStatus({ ok: true, text: res.message });
    await setPairing(cleanUrl, cleanToken);
  }

  async function handleLink(link: string) {
    if (!link.startsWith('missioncontrol://pair')) return;
    const u = new URL(link);
    const bridgeUrl = u.searchParams.get('url');
    const t = u.searchParams.get('token');
    if (bridgeUrl && t) await save(bridgeUrl, t);
  }

  if (!permission) return <View style={styles.root} />;

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.brandHeader}>
          <CussCyberOrbLottie size={68} />
          <Text style={styles.brandWordmark}>CUSS</Text>
          <Text style={styles.brandTag}>CYBERNETIC UMBILICAL STUDIO // MAC CURSOR DECK</Text>
        </View>

        <CussHazardStrip color={COLORS.lime} label="PAIRING LINK" />

        {!permission.granted && !manual ? (
          <View style={styles.card}>
            <QrCode size={32} color={COLORS.lime} />
            <Text style={styles.cardTitle}>CAMERA OPTICS REQUIRED</Text>
            <Text style={styles.cardSub}>
              Grant camera access to scan the QR reticle printed by your Mac bridge, or link manually with your IP and token.
            </Text>
            <SpringButton style={styles.primaryBtn} onPress={requestPermission} tiltOnPress>
              <Sparkles size={16} color={COLORS.bg} />
              <Text style={styles.primaryBtnText}>ENABLE OPTICS</Text>
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
            <Text style={styles.fieldLabel}>PAIRING TOKEN</Text>
            <TextInput
              style={styles.input}
              placeholder="48-character hex token"
              placeholderTextColor={COLORS.dim}
              autoCapitalize="none"
              autoCorrect={false}
              value={token}
              onChangeText={setToken}
            />
            <SpringButton
              style={[styles.primaryBtn, checking && { opacity: 0.6 }]}
              disabled={checking}
              onPress={() => url && token && save(url, token)}
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
            <Text style={styles.cardTitle}>SCAN MAC TERMINAL QR</Text>
            <View style={styles.cameraFrame}>
              <CameraView
                style={StyleSheet.absoluteFill}
                barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                onBarcodeScanned={
                  scanned
                    ? undefined
                    : ({ data }) => {
                        setScanned(true);
                        void handleLink(data);
                      }
                }
              />
              <View style={styles.cornerTL} />
              <View style={styles.cornerTR} />
              <View style={styles.cornerBL} />
              <View style={styles.cornerBR} />
            </View>
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
    padding: 22,
  },
  brandHeader: {
    alignItems: 'center',
    marginBottom: 14,
  },
  brandWordmark: {
    fontFamily: FONTS.mogi,
    fontSize: 52,
    color: COLORS.lime,
    letterSpacing: 3,
    marginTop: 4,
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
    fontSize: 13.5,
    color: COLORS.muted,
    textAlign: 'center',
    lineHeight: 20,
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
    width: 248,
    height: 248,
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: COLORS.borderHi,
    marginVertical: 8,
  },
  cornerTL: {
    position: 'absolute',
    top: 12,
    left: 12,
    width: 22,
    height: 22,
    borderTopWidth: 3,
    borderLeftWidth: 3,
    borderColor: COLORS.lime,
  },
  cornerTR: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 22,
    height: 22,
    borderTopWidth: 3,
    borderRightWidth: 3,
    borderColor: COLORS.lime,
  },
  cornerBL: {
    position: 'absolute',
    bottom: 12,
    left: 12,
    width: 22,
    height: 22,
    borderBottomWidth: 3,
    borderLeftWidth: 3,
    borderColor: COLORS.lime,
  },
  cornerBR: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    width: 22,
    height: 22,
    borderBottomWidth: 3,
    borderRightWidth: 3,
    borderColor: COLORS.lime,
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
