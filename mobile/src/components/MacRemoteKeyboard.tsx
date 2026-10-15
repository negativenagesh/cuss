import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { File as ExpoFile } from 'expo-file-system';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
} from 'expo-audio';
import {
  Clipboard as ClipboardIcon,
  ClipboardPaste,
  CornerDownLeft,
  Keyboard as KeyboardIcon,
  Lock,
  Mic,
  RotateCcw,
  Save,
  Send,
  Trash2,
} from 'lucide-react-native';
import { localMacClipboard, localTranscribe, MacFocusInfo, MacInputAction } from '../api/client';
import { MacEnterPolicy, useStore } from '../store';
import { COLORS, FONTS, MOTION } from '../theme';
import { SpringButton } from './CussIcons';

/**
 * Energetic motion archetype for the remote keyboard (per @motion-design):
 *   duration 100-250ms · ease-out-expo entrances · 15-30% overshoot on confirmations.
 * Signature easing: MOTION.easing.enter (MD3 Emphasized Decelerate).
 */
const EXPO_OUT = Easing.bezier(0.16, 1, 0.3, 1);

export interface MacInputAck {
  id?: number;
  ok: boolean;
  detail?: string;
  at: number;
}

interface Props {
  frontApp: string;
  focus: MacFocusInfo | null;
  lastAck: MacInputAck | null;
  /** Fire a Mac input action. Returns the request id used for ack correlation. */
  send: (action: MacInputAction) => number;
  requestFocus: () => void;
  onStatus?: (s: string) => void;
}

/** Per-app quick action rails (P2 #9). Keys map to bridge `send-key` targets or `type-text`. */
const APP_QUICK_ACTIONS: Record<string, { label: string; key?: string; text?: string }[]> = {
  cursor: [
    { label: 'FOCUS CHAT', key: 'cmd+l' },
    { label: 'NEW CHAT', key: 'cmd+n' },
    { label: 'ACCEPT ⌘⏎', key: 'cmd+enter' },
    { label: 'PALETTE', key: 'cmd+shift+p' },
    { label: 'INLINE EDIT', key: 'cmd+k' },
    { label: 'SAVE', key: 'cmd+s' },
    { label: 'TOGGLE SIDEBAR', key: 'cmd+b' },
    { label: 'TERMINAL', key: 'ctrl+`' },
  ],
  code: [
    { label: 'PALETTE', key: 'cmd+shift+p' },
    { label: 'QUICK OPEN', key: 'cmd+p' },
    { label: 'SAVE', key: 'cmd+s' },
    { label: 'SIDEBAR', key: 'cmd+b' },
  ],
  'google chrome': [
    { label: 'ADDRESS BAR', key: 'cmd+l' },
    { label: 'NEW TAB', key: 'cmd+t' },
    { label: 'RELOAD', key: 'reload' },
    { label: 'BACK', key: 'cmd+[' },
    { label: 'FORWARD', key: 'cmd+]' },
    { label: 'FIND', key: 'cmd+f' },
    { label: 'CLOSE TAB', key: 'cmd+w' },
    { label: 'REOPEN TAB', key: 'cmd+shift+t' },
    { label: 'DEVTOOLS', key: 'cmd+alt+i' },
  ],
  safari: [
    { label: 'ADDRESS BAR', key: 'cmd+l' },
    { label: 'NEW TAB', key: 'cmd+t' },
    { label: 'RELOAD', key: 'reload' },
    { label: 'BACK', key: 'cmd+[' },
    { label: 'FORWARD', key: 'cmd+]' },
  ],
  terminal: [
    { label: 'CTRL+C', key: 'ctrl+c' },
    { label: 'CLEAR', text: 'clear\n' },
    { label: 'CTRL+D', key: 'ctrl+d' },
    { label: 'CTRL+L', key: 'ctrl+l' },
    { label: 'NEW TAB', key: 'cmd+t' },
  ],
  slack: [
    { label: 'SEARCH ⌘K', key: 'cmd+k' },
    { label: 'NEWLINE ⇧⏎', key: 'shift+enter' },
    { label: 'UNREADS', key: 'cmd+shift+a' },
  ],
  finder: [
    { label: 'GO TO FOLDER', key: 'cmd+shift+g' },
    { label: 'NEW FOLDER', key: 'cmd+shift+n' },
    { label: 'GET INFO', key: 'cmd+i' },
  ],
  notes: [
    { label: 'NEW NOTE', key: 'cmd+n' },
    { label: 'BOLD', key: 'cmd+b' },
  ],
};
APP_QUICK_ACTIONS.brave = APP_QUICK_ACTIONS['google chrome'];
APP_QUICK_ACTIONS['brave browser'] = APP_QUICK_ACTIONS['google chrome'];
APP_QUICK_ACTIONS.arc = APP_QUICK_ACTIONS['google chrome'];
APP_QUICK_ACTIONS.iterm2 = APP_QUICK_ACTIONS.terminal;
APP_QUICK_ACTIONS.iterm = APP_QUICK_ACTIONS.terminal;
APP_QUICK_ACTIONS.warp = APP_QUICK_ACTIONS.terminal;
APP_QUICK_ACTIONS.ghostty = APP_QUICK_ACTIONS.terminal;
APP_QUICK_ACTIONS.discord = APP_QUICK_ACTIONS.slack;

const GENERAL_KEYS: { label: string; key: string }[] = [
  { label: 'ESC', key: 'escape' },
  { label: 'TAB', key: 'tab' },
  { label: 'CMD+A', key: 'cmd+a' },
  { label: 'CMD+C', key: 'cmd+c' },
  { label: 'CMD+V', key: 'cmd+v' },
  { label: 'CMD+Z', key: 'cmd+z' },
  { label: 'CMD+TAB', key: 'cmd+tab' },
  { label: 'CMD+SPACE', key: 'cmd+space' },
  { label: '↑', key: 'up' },
  { label: '↓', key: 'down' },
  { label: '←', key: 'left' },
  { label: '→', key: 'right' },
  { label: 'HOME', key: 'home' },
  { label: 'END', key: 'end' },
];

const ENTER_POLICY_LABEL: Record<MacEnterPolicy, string> = {
  auto: 'ENTER: AUTO',
  enter: 'ENTER: ⏎',
  'cmd+enter': 'ENTER: ⌘⏎',
  'shift+enter': 'ENTER: ⇧⏎',
};
const ENTER_POLICY_ORDER: MacEnterPolicy[] = ['auto', 'enter', 'cmd+enter', 'shift+enter'];

function roleLabel(focus: MacFocusInfo | null): string {
  if (!focus) return 'NO FOCUS DATA';
  if (!focus.trusted) return 'ACCESSIBILITY OFF';
  if (focus.secure) return 'SECURE FIELD';
  switch (focus.role) {
    case 'AXTextField':
      return 'TEXT FIELD';
    case 'AXTextArea':
      return 'TEXT AREA';
    case 'AXComboBox':
      return 'COMBO BOX';
    case 'AXSearchField':
      return 'SEARCH FIELD';
    case 'AXWebArea':
      return 'WEB CONTENT';
    case '':
      return 'NO FIELD FOCUSED';
    default:
      return focus.role.replace(/^AX/, '').toUpperCase();
  }
}

/** Blinking caret (ambient layer, sine loop 900ms) that sits after the echoed Mac text. */
function Caret({ color }: { color: string }) {
  const op = useSharedValue(1);
  useEffect(() => {
    op.value = withRepeat(withSequence(withTiming(0, { duration: 450, easing: MOTION.easing.ambient }), withTiming(1, { duration: 450, easing: MOTION.easing.ambient })), -1, false);
  }, []);
  const st = useAnimatedStyle(() => ({ opacity: op.value }));
  return <Animated.View style={[{ width: 2, height: 13, backgroundColor: color, marginLeft: 1, alignSelf: 'center' }, st]} />;
}

export default function MacRemoteKeyboard({ frontApp, focus, lastAck, send, requestFocus, onStatus }: Props) {
  const { macSnippets, addMacSnippet, removeMacSnippet, macEnterPolicies, setMacEnterPolicy } = useStore();
  const [text, setText] = useState('');
  const [live, setLive] = useState(true);
  const [keyCount, setKeyCount] = useState(0);
  const prevRef = useRef('');
  const burstRef = useRef<{ added: number; removed: string }>({ added: 0, removed: '' });
  const [lastBurst, setLastBurst] = useState<{ added: number; removed: string } | null>(null);
  const focusDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // --- P3 #12 latency HUD -------------------------------------------------------------
  const pendingRef = useRef<Map<number, number>>(new Map());
  const [rtts, setRtts] = useState<number[]>([]);
  useEffect(() => {
    if (!lastAck?.id) return;
    const started = pendingRef.current.get(lastAck.id);
    if (started) {
      pendingRef.current.delete(lastAck.id);
      setRtts((r) => [...r.slice(-19), lastAck.at - started]);
    }
  }, [lastAck]);
  const p50 = useMemo(() => {
    if (rtts.length === 0) return null;
    const s = [...rtts].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
  }, [rtts]);
  const latencyColor = p50 == null ? COLORS.dim : p50 < 80 ? COLORS.emerald : p50 < 200 ? COLORS.amber : COLORS.danger;

  const fire = useCallback(
    (action: MacInputAction) => {
      const id = send(action);
      pendingRef.current.set(id, Date.now());
      if (pendingRef.current.size > 60) {
        const first = pendingRef.current.keys().next().value;
        if (first !== undefined) pendingRef.current.delete(first);
      }
      return id;
    },
    [send],
  );

  const scheduleFocus = useCallback(() => {
    if (focusDebounce.current) clearTimeout(focusDebounce.current);
    focusDebounce.current = setTimeout(() => requestFocus(), 140);
  }, [requestFocus]);

  // Poll focus when app changes and periodically while live
  useEffect(() => {
    requestFocus();
  }, [frontApp]);
  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => requestFocus(), 2200);
    return () => clearInterval(t);
  }, [live, requestFocus]);

  // --- Key pulse (secondary motion layer): the LIVE badge pops on every keystroke -------
  const pulse = useSharedValue(1);
  const pulseStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));
  const kick = () => {
    pulse.value = withSequence(withTiming(1.18, { duration: 70, easing: EXPO_OUT }), withSpring(1, MOTION.spring.snappy));
  };

  // --- P0 #1 live diff streaming + P3 #13 undo burst ------------------------------------
  const onChange = (next: string) => {
    setText(next);
    if (!live) return;
    const prev = prevRef.current;
    prevRef.current = next;
    if (next === prev) return;
    let p = 0;
    const max = Math.min(prev.length, next.length);
    while (p < max && prev.charCodeAt(p) === next.charCodeAt(p)) p++;
    const removed = prev.slice(p);
    const added = next.slice(p);
    if (removed.length > 0) fire({ type: 'backspace', count: removed.length });
    if (added.length > 0) fire({ type: 'type-text', text: added });
    burstRef.current = { added: burstRef.current.added + added.length - Math.min(removed.length, burstRef.current.added), removed: removed || burstRef.current.removed };
    setLastBurst({ ...burstRef.current });
    setKeyCount((c) => c + removed.length + added.length);
    kick();
    scheduleFocus();
  };

  const enterPolicy: MacEnterPolicy = macEnterPolicies[frontApp.toLowerCase()] ?? 'auto';
  const resolvedEnterKey = enterPolicy === 'auto' ? 'enter' : enterPolicy;

  const submit = () => {
    if (live) {
      fire({ type: 'send-key', target: resolvedEnterKey });
      prevRef.current = '';
      burstRef.current = { added: 0, removed: '' };
      setLastBurst(null);
      setText('');
      setKeyCount((c) => c + 1);
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      kick();
      scheduleFocus();
      return;
    }
    if (!text) return;
    fire({ type: 'type-text', text });
    fire({ type: 'send-key', target: resolvedEnterKey });
    setText('');
    scheduleFocus();
  };

  const undoBurst = () => {
    if (!lastBurst) return;
    if (lastBurst.added > 0) fire({ type: 'backspace', count: lastBurst.added });
    if (lastBurst.removed) fire({ type: 'type-text', text: lastBurst.removed });
    prevRef.current = prevRef.current.slice(0, Math.max(0, prevRef.current.length - lastBurst.added)) + lastBurst.removed;
    setText(prevRef.current);
    burstRef.current = { added: 0, removed: '' };
    setLastBurst(null);
    onStatus?.(`UNDID ${lastBurst.added} KEYS`);
    scheduleFocus();
  };

  const cycleEnterPolicy = () => {
    const i = ENTER_POLICY_ORDER.indexOf(enterPolicy);
    setMacEnterPolicy(frontApp, ENTER_POLICY_ORDER[(i + 1) % ENTER_POLICY_ORDER.length]);
  };

  // --- P1 #4 clipboard bridge ------------------------------------------------------------
  const pastePhoneToMac = async () => {
    try {
      const t = await Clipboard.getStringAsync();
      if (!t) return onStatus?.('PHONE CLIPBOARD EMPTY');
      fire({ type: 'paste-text', text: t });
      onStatus?.(`PASTED ${t.length} CHARS → ${frontApp}`);
      scheduleFocus();
    } catch (e: any) {
      Alert.alert('Clipboard', e?.message ?? 'Could not read phone clipboard');
    }
  };
  const copyMacToPhone = async () => {
    try {
      const r = await localMacClipboard();
      if (!r?.text) return onStatus?.('MAC CLIPBOARD EMPTY');
      await Clipboard.setStringAsync(r.text);
      onStatus?.(`COPIED ${r.text.length} CHARS ← MAC`);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (e: any) {
      Alert.alert('Clipboard', e?.message ?? 'Could not read Mac clipboard');
    }
  };

  // --- P1 #5 voice-to-Mac dictation -----------------------------------------------------
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const toggleVoice = async () => {
    if (transcribing) return;
    if (!recording) {
      try {
        const perm = await requestRecordingPermissionsAsync();
        if (!perm.granted) return Alert.alert('Microphone Needed', 'Grant microphone permission to dictate to your Mac.');
        await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
        await recorder.prepareToRecordAsync();
        recorder.record();
        setRecording(true);
        onStatus?.('LISTENING…');
      } catch (e: any) {
        Alert.alert('Voice', e?.message ?? 'Could not start recording');
      }
      return;
    }
    setRecording(false);
    setTranscribing(true);
    try {
      await recorder.stop();
      if (recorder.uri) {
        const b64 = await new ExpoFile(recorder.uri).base64();
        const res = await localTranscribe(b64, 'm4a');
        const spoken = res?.text?.trim();
        if (spoken) {
          fire({ type: 'type-text', text: spoken });
          onStatus?.(`DICTATED ${spoken.length} CHARS → ${frontApp}`);
          scheduleFocus();
        } else {
          onStatus?.('NO SPEECH RECOGNIZED');
        }
      }
    } catch (e: any) {
      Alert.alert('Voice', e?.message ?? 'Transcription failed');
    } finally {
      setTranscribing(false);
    }
  };

  const quick = APP_QUICK_ACTIONS[frontApp.toLowerCase()] ?? [];
  const secure = Boolean(focus?.secure);
  const echoColor = secure ? COLORS.magenta : focus?.editable ? COLORS.lime : COLORS.dim;
  const echoValue = focus?.value ?? '';

  return (
    <View style={{ gap: 6 }}>
      {/* Header: target app · latency HUD · LIVE toggle */}
      <View style={s.headerRow}>
        <Animated.View style={[s.liveBadge, pulseStyle, { borderColor: live ? COLORS.lime : COLORS.border }]}>
          <KeyboardIcon size={11} color={live ? COLORS.lime : COLORS.dim} />
          <Text style={[s.mono, { color: live ? COLORS.lime : COLORS.dim }]}>{live ? 'LIVE' : 'BATCH'}</Text>
        </Animated.View>
        <Text numberOfLines={1} style={[s.mono, { color: COLORS.muted, flex: 1 }]}>
          → {frontApp || 'MAC'}
          {keyCount > 0 ? ` · ${keyCount} KEYS` : ''}
        </Text>
        <View style={[s.latencyPill, { borderColor: latencyColor }]}>
          <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: latencyColor }} />
          <Text style={[s.mono, { color: latencyColor }]}>{p50 == null ? '— ms' : `${p50} ms`}</Text>
        </View>
        <SpringButton style={[s.chip, live && s.chipLime]} onPress={() => { prevRef.current = text; setLive((v) => !v); }}>
          <Text style={[s.mono, { color: live ? COLORS.lime : COLORS.bone }]}>{live ? 'LIVE: ON' : 'LIVE: OFF'}</Text>
        </SpringButton>
      </View>

      {/* P0 #1 focused-field echo + P3 #11 secure lock */}
      <View style={[s.echoCard, { borderColor: echoColor }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {secure ? <Lock size={11} color={COLORS.magenta} /> : <CornerDownLeft size={11} color={echoColor} />}
          <Text style={[s.mono, { color: echoColor }]}>{roleLabel(focus)}</Text>
          {focus?.title || focus?.placeholder || focus?.description ? (
            <Text numberOfLines={1} style={[s.mono, { color: COLORS.dim, flex: 1 }]}>
              · {focus.title || focus.placeholder || focus.description}
            </Text>
          ) : null}
          {focus?.multiline && focus.editable ? <Text style={[s.mono, { color: COLORS.cyan }]}>MULTILINE</Text> : null}
        </View>
        {secure ? (
          <Text style={[s.echoText, { color: COLORS.magenta }]}>Password field detected — echo disabled, keystrokes are not logged.</Text>
        ) : focus && !focus.trusted ? (
          <Text style={[s.echoText, { color: COLORS.amber }]}>
            Grant Accessibility to the CUSS bridge (System Settings → Privacy & Security → Accessibility → node) to see the live field value.
          </Text>
        ) : focus?.editable ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' }}>
            <Text style={[s.echoText, { color: COLORS.bone }]} numberOfLines={4}>
              {focus.valueTruncated ? '…' : ''}
              {echoValue.length > 0 ? echoValue : focus.role === 'AXWebArea' ? 'Web content focused (Electron app echo unavailable) — keystrokes still land live.' : ''}
            </Text>
            {echoValue.length > 0 || focus.role !== 'AXWebArea' ? <Caret color={COLORS.lime} /> : null}
          </View>
        ) : (
          <Text style={[s.echoText, { color: COLORS.dim }]}>No text field focused — tap a field on the mirror above, then type here.</Text>
        )}
      </View>

      {/* Input row */}
      <View style={s.inputRow}>
        <TextInput
          style={[s.input, live && { borderColor: COLORS.lime }, secure && { borderColor: COLORS.magenta }]}
          placeholder={live ? `Type → ${frontApp || 'Mac'} live · Enter = ${resolvedEnterKey.toUpperCase()}` : 'Type text, then press SEND…'}
          placeholderTextColor={COLORS.dim}
          value={text}
          onChangeText={onChange}
          onSubmitEditing={submit}
          onKeyPress={(e) => {
            if (live && e.nativeEvent.key === 'Backspace' && text.length === 0) {
              fire({ type: 'backspace', count: 1 });
              setKeyCount((c) => c + 1);
              kick();
              scheduleFocus();
            }
          }}
          blurOnSubmit={false}
          returnKeyType="send"
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          secureTextEntry={secure}
        />
        <SpringButton style={[s.sendBtn, live && { backgroundColor: COLORS.lime }]} disabled={!live && !text} onPress={submit}>
          <Send size={12} color={COLORS.bg} />
          <Text style={[s.mono, { color: COLORS.bg }]}>{live ? 'ENTER' : 'SEND'}</Text>
        </SpringButton>
      </View>

      {/* Enter policy · undo · clipboard · voice · save snippet */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          <SpringButton style={[s.chip, enterPolicy !== 'auto' && s.chipCyan]} onPress={cycleEnterPolicy}>
            <Text style={[s.mono, { color: enterPolicy !== 'auto' ? COLORS.cyan : COLORS.bone }]}>{ENTER_POLICY_LABEL[enterPolicy]}</Text>
          </SpringButton>
          <SpringButton style={[s.chip, !lastBurst && { opacity: 0.45 }]} disabled={!lastBurst} onPress={undoBurst}>
            <RotateCcw size={10} color={COLORS.amber} />
            <Text style={[s.mono, { color: COLORS.amber }]}>UNDO{lastBurst?.added ? ` ${lastBurst.added}` : ''}</Text>
          </SpringButton>
          <SpringButton style={s.chip} onPress={() => void pastePhoneToMac()}>
            <ClipboardPaste size={10} color={COLORS.cyan} />
            <Text style={[s.mono, { color: COLORS.cyan }]}>PASTE PHONE → MAC</Text>
          </SpringButton>
          <SpringButton style={s.chip} onPress={() => void copyMacToPhone()}>
            <ClipboardIcon size={10} color={COLORS.cyan} />
            <Text style={[s.mono, { color: COLORS.cyan }]}>COPY MAC → PHONE</Text>
          </SpringButton>
          <SpringButton style={[s.chip, recording && { borderColor: COLORS.magenta, backgroundColor: COLORS.magentaDim }]} onPress={() => void toggleVoice()}>
            <Mic size={10} color={recording ? COLORS.magenta : COLORS.lime} />
            <Text style={[s.mono, { color: recording ? COLORS.magenta : COLORS.lime }]}>
              {transcribing ? 'TRANSCRIBING…' : recording ? 'STOP & TYPE' : 'DICTATE → MAC'}
            </Text>
          </SpringButton>
          {text.trim().length > 0 ? (
            <SpringButton style={s.chip} onPress={() => { addMacSnippet(text); onStatus?.('SNIPPET SAVED'); }}>
              <Save size={10} color={COLORS.violet} />
              <Text style={[s.mono, { color: COLORS.violet }]}>SAVE SNIPPET</Text>
            </SpringButton>
          ) : null}
        </View>
      </ScrollView>

      {/* P2 #9 per-app quick actions + general keys */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {quick.map((q) => (
            <SpringButton
              key={q.label}
              style={[s.chip, s.chipLime]}
              onPress={() => {
                if (q.text) fire({ type: 'type-text', text: q.text });
                else if (q.key) fire({ type: 'send-key', target: q.key });
                scheduleFocus();
              }}
            >
              <Text style={[s.mono, { color: COLORS.lime }]}>{q.label}</Text>
            </SpringButton>
          ))}
          {GENERAL_KEYS.map((k) => (
            <SpringButton key={k.key} style={s.chip} onPress={() => { fire({ type: 'send-key', target: k.key }); scheduleFocus(); }}>
              <Text style={[s.mono, { color: COLORS.bone }]}>{k.label}</Text>
            </SpringButton>
          ))}
        </View>
      </ScrollView>

      {/* P2 #10 snippets */}
      {macSnippets.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {macSnippets.map((sn) => (
              <Pressable
                key={sn}
                style={[s.chip, { borderColor: COLORS.violet }]}
                onPress={() => { fire({ type: 'type-text', text: sn }); onStatus?.('SNIPPET TYPED'); scheduleFocus(); }}
                onLongPress={() => Alert.alert('Delete snippet?', sn, [{ text: 'Cancel' }, { text: 'Delete', style: 'destructive', onPress: () => removeMacSnippet(sn) }])}
              >
                <Trash2 size={9} color={COLORS.dim} />
                <Text numberOfLines={1} style={[s.mono, { color: COLORS.violet, maxWidth: 160 }]}>{sn}</Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  mono: { fontFamily: FONTS.monoBold, fontSize: 9.5, letterSpacing: 0.4 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  liveBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 7, paddingVertical: 4, borderRadius: 7, borderWidth: 1, backgroundColor: COLORS.plate },
  latencyPill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 7, paddingVertical: 4, borderRadius: 7, borderWidth: 1, backgroundColor: COLORS.plate },
  echoCard: { borderWidth: 1, borderRadius: 10, padding: 9, gap: 5, backgroundColor: '#0B0C14' },
  echoText: { fontFamily: FONTS.mono, fontSize: 11.5, lineHeight: 16 },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: { flex: 1, borderWidth: 1, borderColor: COLORS.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, color: COLORS.bone, fontFamily: FONTS.mono, fontSize: 12.5, backgroundColor: COLORS.plate },
  sendBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, backgroundColor: COLORS.cyan },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.plate },
  chipLime: { borderColor: COLORS.lime, backgroundColor: COLORS.limeDim },
  chipCyan: { borderColor: COLORS.cyan, backgroundColor: COLORS.cyanDim },
});
