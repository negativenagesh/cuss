import React, { useEffect, useState } from 'react';
import {
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import CursorComposer, { ComposerSubmitPayload } from '../components/CursorComposer';
import WorkspaceVaultDropdown from '../components/WorkspaceVaultDropdown';
import {
  Check,
  Cloud,
  GitBranch,
  Laptop,
  SpringButton,
  Terminal,
} from '../components/CussIcons';
import { CussHazardStrip, CussSmallArtLoader } from '../components/CussArt';
import {
  createAgent,
  localCreate,
  localIdeState,
  localProjects,
  localShowOnMac,
} from '../api/client';
import { useStore } from '../store';
import { COLORS, FONTS, MODE_META } from '../theme';

export default function CreateAgentScreen({ navigation, route }: any) {
  const kind: 'mac' | 'cloud' = route.params?.kind ?? 'mac';
  const isMac = kind === 'mac';
  const { projects, setProjects, ideState, setIdeState, selectedMode } = useStore();

  const [cwd, setCwd] = useState(
    ideState?.activeWorkspace?.path ??
      projects[0]?.path ??
      '/Users/subramanyadattatrayag/Downloads/opptra-scrapers',
  );
  const [repoUrl, setRepoUrl] = useState('');
  const [autoCreatePR, setAutoCreatePR] = useState(true);
  const [watchOnMac, setWatchOnMac] = useState(true);
  const [busy, setBusy] = useState(false);
  const [kbHeight, setKbHeight] = useState(0);

  useEffect(() => {
    (async () => {
      try {
        const [projs, ide] = await Promise.allSettled([localProjects(), localIdeState()]);
        if (projs.status === 'fulfilled' && projs.value?.projects?.length) {
          setProjects(projs.value.projects);
        }
        if (ide.status === 'fulfilled' && ide.value) {
          setIdeState(ide.value);
          if (ide.value.activeWorkspace?.path) {
            setCwd(ide.value.activeWorkspace.path);
          }
        }
      } catch {
        /* ignore */
      }
    })();
  }, []);

  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const s1 = Keyboard.addListener(showEvt, (e) => setKbHeight(e.endCoordinates.height));
    const s2 = Keyboard.addListener(hideEvt, () => setKbHeight(0));
    return () => {
      s1.remove();
      s2.remove();
    };
  }, []);

  async function handleLaunch(payload: ComposerSubmitPayload) {
    if (isMac && !cwd.trim()) {
      Alert.alert('Workspace folder required', 'Unfurl the Workspace Vault and pick a folder on your Mac.');
      return;
    }
    setBusy(true);
    try {
      if (isMac) {
        const res = await localCreate({
          prompt: payload.text,
          cwd: cwd.trim(),
          mode: payload.mode,
          model: payload.model,
          effort: payload.effort,
          context: payload.context,
          fast: payload.fast,
          thinking: payload.thinking,
          attachments: payload.attachments,
        });
        const agent = res?.agent;
        if (watchOnMac && agent?.id) {
          localShowOnMac(agent.id).catch(() => {
            /* best effort */
          });
        }
        if (agent) {
          navigation.replace('AgentDetail', {
            agent: { ...agent, status: agent.lastStatus },
            kind: 'mac',
          });
          return;
        }
      } else {
        await createAgent({
          prompt: payload.text,
          repoUrl: repoUrl.trim() || undefined,
          model: payload.model === 'auto' ? undefined : payload.model,
          mode: payload.mode === 'plan' ? 'plan' : 'agent',
          autoCreatePR,
        });
        navigation.goBack();
        return;
      }
    } catch (e: any) {
      if (e?.code === 'cli_login_required') {
        Alert.alert('Cursor CLI Login Required', 'Run `cursor agent login` once on your Mac.');
      } else {
        Alert.alert('Spawn Failed', e?.message ?? 'Unknown error');
      }
    } finally {
      setBusy(false);
    }
  }

  const modeMeta = MODE_META[selectedMode];

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
    >
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[
          styles.scrollContent,
          Platform.OS === 'android' && kbHeight > 0 ? { paddingBottom: kbHeight + 24 } : null,
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.bannerCard}>
          {isMac ? (
            <Laptop size={16} color={COLORS.lime} />
          ) : (
            <Cloud size={16} color={COLORS.cyan} />
          )}
          <View style={{ flex: 1 }}>
            <Text style={styles.bannerTitle}>
              {isMac ? 'MAC LOCAL AGENT // FULL SHELL & MCP UNLOCKED' : 'CURSOR CLOUD AGENT'}
            </Text>
            <Text style={styles.bannerDesc}>{modeMeta.desc}</Text>
          </View>
        </View>

        {isMac ? (
          <>
            <CussHazardStrip color={COLORS.cyan} label="1. TARGET MAC WORKSPACE" />

            {/* Quirky Brutalist Accordion Vault Dropdown (No horizontal swiping!) */}
            <WorkspaceVaultDropdown
              cwd={cwd}
              onSelectCwd={setCwd}
              projects={projects}
              activeIdePath={ideState?.activeWorkspace?.path}
            />

            <SpringButton
              style={[
                styles.watchToggleCard,
                watchOnMac && { borderColor: COLORS.lime, backgroundColor: COLORS.limeDim },
              ]}
              onPress={() => setWatchOnMac((v) => !v)}
            >
              <Terminal size={16} color={watchOnMac ? COLORS.lime : COLORS.muted} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.watchTitle, watchOnMac && { color: COLORS.lime }]}>
                  MIRROR IN MAC TERMINAL
                </Text>
                <Text style={styles.watchSub}>
                  Auto-opens Terminal.app attached to this Cursor session
                </Text>
              </View>
              {watchOnMac ? <Check size={16} color={COLORS.lime} strokeWidth={2.6} /> : null}
            </SpringButton>
          </>
        ) : (
          <>
            <CussHazardStrip color={COLORS.cyan} label="1. TARGET REPOSITORY" />
            <TextInput
              style={styles.pathInput}
              placeholder="https://github.com/org/repo"
              placeholderTextColor={COLORS.dim}
              autoCapitalize="none"
              autoCorrect={false}
              value={repoUrl}
              onChangeText={setRepoUrl}
            />
            <SpringButton
              style={[
                styles.watchToggleCard,
                autoCreatePR && { borderColor: COLORS.cyan, backgroundColor: COLORS.cyanDim },
              ]}
              onPress={() => setAutoCreatePR((v) => !v)}
            >
              <GitBranch size={16} color={autoCreatePR ? COLORS.cyan : COLORS.muted} />
              <Text style={[styles.watchTitle, { flex: 1 }, autoCreatePR && { color: COLORS.cyan }]}>
                AUTO-OPEN PULL REQUEST ON COMPLETION
              </Text>
              {autoCreatePR ? <Check size={16} color={COLORS.cyan} /> : null}
            </SpringButton>
          </>
        )}

        <CussHazardStrip color={modeMeta.color} label="2. COMPOSER // MODE, MODEL & CONTEXT" />

        {busy ? (
          <CussSmallArtLoader
            variant="card"
            title="SPAWNING MAC CURSOR AGENT"
            stages={[
              'CREATING PERSISTENT CURSOR CHAT…',
              'LOCKING TARGET MAC WORKSPACE…',
              'DISPATCHING FIRST TURN TO AGENT…',
            ]}
            accentColor={COLORS.lime}
          />
        ) : null}

        <CursorComposer
          cwd={isMac ? cwd : undefined}
          busy={busy}
          onSubmit={handleLaunch}
          submitLabel="LAUNCH"
          minInputHeight={92}
        />
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
    padding: 16,
    gap: 10,
    paddingBottom: 36,
  },
  bannerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: COLORS.surface,
    borderWidth: 1.5,
    borderColor: COLORS.borderHi,
    borderRadius: 14,
    padding: 12,
  },
  bannerTitle: {
    fontFamily: FONTS.monoBold,
    fontSize: 11,
    color: COLORS.lime,
    letterSpacing: 1.1,
  },
  bannerDesc: {
    fontFamily: FONTS.body,
    fontSize: 12,
    color: COLORS.muted,
    marginTop: 2,
  },
  pathInput: {
    fontFamily: FONTS.mono,
    fontSize: 12.5,
    backgroundColor: COLORS.surface,
    color: COLORS.bone,
    borderWidth: 1.2,
    borderColor: COLORS.borderHi,
    borderRadius: 11,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  watchToggleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: COLORS.surface,
    borderWidth: 1.2,
    borderColor: COLORS.borderHi,
    borderRadius: 12,
    padding: 11,
  },
  watchTitle: {
    fontFamily: FONTS.monoBold,
    fontSize: 11,
    color: COLORS.bone,
    letterSpacing: 0.9,
  },
  watchSub: {
    fontFamily: FONTS.body,
    fontSize: 11.5,
    color: COLORS.muted,
    marginTop: 1,
  },
});
