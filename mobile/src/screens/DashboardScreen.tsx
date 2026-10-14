import React, { useEffect, useState } from 'react';
import {
  Alert,
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import FadeIn from '../components/FadeIn';
import ErrorBoundary from '../components/ErrorBoundary';
import AgentField from '../components/AgentField';
import {
  ArrowUpRight,
  Check,
  Cloud,
  Cpu,
  Edit3,
  FolderGit2,
  GitBranch,
  Laptop,
  ModeVectorIcon,
  Plus,
  RefreshCw,
  SpringButton,
  Trash2,
  Unplug,
  X,
  Zap,
} from '../components/CussIcons';
import {
  CussCyberOrbLottie,
  CussEmptyArtPoster,
  CussHazardStrip,
  CussSmallArtLoader,
} from '../components/CussArt';
import {
  listAgents,
  localAuthLogout,
  localDelete,
  localIdeState,
  localList,
  localModels,
  localProjects,
  localRename,
  localSyncIde,
} from '../api/client';
import { LiveSocket } from '../api/live';
import { Agent, LocalAgent, useStore } from '../store';
import { COLORS, FONTS, MOTION } from '../theme';

const STATUS_META: Record<string, { color: string; label: string }> = {
  ACTIVE: { color: COLORS.lime, label: 'ACTIVE' },
  running: { color: COLORS.lime, label: 'RUNNING' },
  queued: { color: COLORS.amber, label: 'QUEUED' },
  IDLE: { color: COLORS.cyan, label: 'IDLE' },
  idle: { color: COLORS.cyan, label: 'IDLE' },
  done: { color: COLORS.violet, label: 'DONE' },
  error: { color: COLORS.magenta, label: 'ERROR' },
  ARCHIVED: { color: COLORS.dim, label: 'ARCHIVED' },
};

function toFieldAgent(a: LocalAgent): Agent {
  return {
    id: String(a?.id ?? ''),
    name: String(a?.name ?? a?.id ?? 'Agent'),
    status: String(a?.lastStatus ?? 'idle'),
    updatedAt: a?.lastActivityAt,
    cwd: a?.cwd,
    mode: a?.mode ?? 'agent',
    model: a?.model,
    modelSpec: a?.modelSpec,
    effort: a?.effort,
    contextWindow: a?.contextWindow,
    fast: a?.fast,
    thinking: a?.thinking,
    usage: a?.usage,
  };
}

type SurfaceMode = 'mac' | 'cloud';

export default function DashboardScreen({ navigation }: any) {
  const {
    agents,
    setAgents,
    localAgents,
    setLocalAgents,
    renameLocalAgentOnDevice,
    deleteLocalAgentOnDevice,
    accountEmail,
    ideState,
    setIdeState,
    setModelCatalog,
    setProjects,
    setCursorSignedIn,
    clearPairing,
  } = useStore();
  const [mode, setMode] = useState<SurfaceMode>('mac');
  const [syncingIde, setSyncingIde] = useState(false);
  const [renamingAgent, setRenamingAgent] = useState<Agent | null>(null);
  const [renameText, setRenameText] = useState('');

  async function handleConfirmRename() {
    if (!renamingAgent || !renameText.trim()) return;
    const nextTitle = renameText.trim();
    renameLocalAgentOnDevice(renamingAgent.id, nextTitle);
    setRenamingAgent(null);
    try {
      await localRename(renamingAgent.id, nextTitle);
      const updated = await localList(false);
      if (Array.isArray(updated?.agents)) setLocalAgents(updated.agents);
    } catch {
      /* kept locally on Android device even if bridge is unreachable */
    }
  }

  function handleConfirmDelete(ag: Agent) {
    Alert.alert(
      'Delete Chat Session',
      `Remove "${ag.name || ag.id}" from CUSS and device storage?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            deleteLocalAgentOnDevice(ag.id);
            try {
              await localDelete(ag.id);
              const updated = await localList(false);
              if (Array.isArray(updated?.agents)) setLocalAgents(updated.agents);
            } catch {
              /* deleted locally on Android device even if bridge is unreachable */
            }
          },
        },
      ],
    );
  }

  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <SpringButton
            onPress={() => {
              Alert.alert(
                'Sign Out of Cursor',
                'Sign out of your Cursor account?',
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Sign Out',
                    style: 'destructive',
                    onPress: async () => {
                      await setCursorSignedIn(false, null);
                      localAuthLogout().catch(() => {});
                      navigation.navigate('Landing');
                    },
                  },
                ],
              );
            }}
            hitSlop={10}
            style={[styles.unlinkBtn, { borderColor: COLORS.amber }]}
          >
            <X size={12} color={COLORS.amber} />
            <Text style={[styles.unlinkText, { color: COLORS.amber }]}>SIGN OUT</Text>
          </SpringButton>
          <SpringButton onPress={clearPairing} hitSlop={12} style={styles.unlinkBtn}>
            <Unplug size={13} color={COLORS.magenta} />
            <Text style={styles.unlinkText}>UNLINK</Text>
          </SpringButton>
        </View>
      ),
    });
  }, [navigation]);

  useEffect(() => {
    let live: LiveSocket | null = null;
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
        if (
          (cloud.status === 'rejected' && cloud.reason?.status === 401) ||
          (local.status === 'rejected' && local.reason?.status === 401)
        ) {
          await clearPairing();
          return;
        }
      } catch {
        /* offline: WS below still tries */
      }
      live = new LiveSocket(
        (msg) => {
          if (msg.type === 'agents:update' && Array.isArray(msg.agents)) {
            setAgents(msg.agents);
          }
          if (msg.type === 'local:update' && Array.isArray(msg.agents)) {
            setLocalAgents(msg.agents);
          }
        },
        () => {
          live?.send({ type: 'agents:watch' });
          live?.send({ type: 'local:watch' });
        },
      );
      live.connect();
    })();
    return () => live?.close();
  }, []);

  const isMac = mode === 'mac';
  const safeLocal = Array.isArray(localAgents) ? localAgents : [];
  const safeCloud = Array.isArray(agents) ? agents : [];
  const shown: Agent[] = isMac ? safeLocal.map(toFieldAgent) : safeCloud;
  const active = shown.filter((a) => a.status === 'ACTIVE' || a.status === 'running').length;
  const mcpList = Array.isArray(ideState?.mcpServers) ? ideState!.mcpServers : [];

  async function handleSyncIdeSessions() {
    setSyncingIde(true);
    try {
      const [res, ide] = await Promise.all([localSyncIde(), localIdeState()]);
      if (Array.isArray(res?.agents)) setLocalAgents(res.agents);
      if (ide) setIdeState(ide);
    } catch {
      /* ignore */
    } finally {
      setSyncingIde(false);
    }
  }

  return (
    <View style={styles.root}>
      <FlatList
        data={shown}
        keyExtractor={(a: Agent, i: number) => a.id || `ag-${i}`}
        contentContainerStyle={{ paddingBottom: 36 }}
        ListHeaderComponent={
          <View>
            {/* Hero 3D Cyber-Reactor Deck with Prominent CUSS Logo */}
            <View style={styles.hero}>
              <ErrorBoundary fallback={<View style={{ flex: 1 }} />}>
                <AgentField agents={shown} />
              </ErrorBoundary>

              {/* Top-Left Prominent CUSS Logo + Lottie Core Badge (tappable to view Brand Landing) */}
              <SpringButton
                style={styles.heroTopLeft}
                onPress={() => navigation.navigate('Landing')}
              >
                <CussCyberOrbLottie size={42} />
                <View>
                  <Text style={styles.heroLogoWordmark}>CUSS</Text>
                  <Text style={styles.heroAccountText} numberOfLines={1}>
                    {accountEmail ? accountEmail : 'MAC CLI UMBILICAL'}
                  </Text>
                </View>
              </SpringButton>

              {/* Top-Right Vector Surface Toggle (MAC vs CLOUD — zero emojis!) */}
              <View style={styles.surfaceToggle}>
                <SpringButton
                  style={[styles.surfaceBtn, mode === 'mac' && styles.surfaceBtnActive]}
                  onPress={() => setMode('mac')}
                >
                  <Laptop size={13} color={mode === 'mac' ? COLORS.bg : COLORS.muted} />
                  <Text style={[styles.surfaceBtnText, mode === 'mac' && { color: COLORS.bg }]}>
                    MAC
                  </Text>
                </SpringButton>
                <SpringButton
                  style={[styles.surfaceBtn, mode === 'cloud' && styles.surfaceBtnActive]}
                  onPress={() => setMode('cloud')}
                >
                  <Cloud size={13} color={mode === 'cloud' ? COLORS.bg : COLORS.muted} />
                  <Text style={[styles.surfaceBtnText, mode === 'cloud' && { color: COLORS.bg }]}>
                    CLOUD
                  </Text>
                </SpringButton>
              </View>

              {/* Bottom-Left LC Mogi Counter Readout */}
              <View style={styles.heroBottomLeft} pointerEvents="none">
                <Text style={styles.bigCount}>{String(active).padStart(2, '0')}</Text>
                <View>
                  <Text style={styles.countTitle}>LIVE AGENTS</Text>
                  <Text style={styles.countSub}>
                    {shown.length} SESSIONS ON {isMac ? 'THIS MAC' : 'CURSOR CLOUD'}
                  </Text>
                </View>
              </View>

              {/* Bottom-Right Spawn CTA */}
              <SpringButton
                style={styles.spawnFab}
                onPress={() => navigation.navigate('CreateAgent', { kind: mode })}
                tiltOnPress
              >
                <Plus size={16} color={COLORS.bg} strokeWidth={2.8} />
                <Text style={styles.spawnFabText}>SPAWN</Text>
              </SpringButton>
            </View>

            {/* Live Mac IDE Telemetry Strip (from globalStorage/storage.json + mcp.json) */}
            {isMac && ideState?.activeWorkspace ? (
              <View style={styles.ideTelemetryBar}>
                <View style={styles.ideLiveBadge}>
                  <View style={styles.ideLiveDot} />
                  <Text style={styles.ideLiveBadgeText}>MAC IDE</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={styles.ideWorkspaceName} numberOfLines={1}>
                      {ideState.activeWorkspace.name}
                    </Text>
                    {ideState.activeWorkspace.branch ? (
                      <View style={styles.ideBranchTag}>
                        <GitBranch size={9} color={COLORS.cyan} />
                        <Text style={styles.ideBranchText}>
                          {ideState.activeWorkspace.branch}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  {mcpList.length > 0 ? (
                    <Text style={styles.ideMcpText} numberOfLines={1}>
                      MCP // {mcpList.map((m) => m.name).join(' · ')}
                    </Text>
                  ) : null}
                </View>
                <SpringButton
                  style={styles.syncIdeBtn}
                  onPress={handleSyncIdeSessions}
                  disabled={syncingIde}
                  tiltOnPress
                >
                  <RefreshCw size={12} color={COLORS.lime} />
                  <Text style={styles.syncIdeBtnText}>{syncingIde ? 'SYNC…' : 'SYNC IDE'}</Text>
                </SpringButton>
              </View>
            ) : null}

            {/* Section Strip: LOCAL MAC SESSIONS */}
            <View style={{ paddingHorizontal: 16, marginTop: 4 }}>
              {syncingIde ? (
                <CussSmallArtLoader
                  variant="inline"
                  title="SYNCING MAC IDE TRANSCRIPTS"
                  subtitle="Importing ~/.cursor/projects/*/agent-transcripts…"
                  accentColor={COLORS.lime}
                />
              ) : null}
              <CussHazardStrip
                color={isMac ? COLORS.lime : COLORS.cyan}
                label={isMac ? 'LOCAL MAC SESSIONS' : 'CLOUD SESSIONS'}
              />
            </View>
          </View>
        }
        renderItem={({ item, index }) => {
          const st = STATUS_META[item.status] ?? { color: COLORS.cyan, label: item.status };
          const folderShort = item.cwd ? item.cwd.split('/').filter(Boolean).pop() : undefined;
          return (
            <View style={{ paddingHorizontal: 16 }}>
              <FadeIn delay={Math.min(index * MOTION.stagger.micro, MOTION.stagger.maxBudget)}>
                <SpringButton
                  style={[
                    styles.agentCard,
                    (item.status === 'running' || item.status === 'ACTIVE') && {
                      borderColor: COLORS.lime,
                    },
                  ]}
                  onPress={() => navigation.navigate('AgentDetail', { agent: item, kind: mode })}
                >
                  <View style={styles.cardTopRow}>
                    <View style={[styles.statusPill, { borderColor: st.color }]}>
                      <View style={[styles.statusDot, { backgroundColor: st.color }]} />
                      <Text style={[styles.statusPillText, { color: st.color }]}>{st.label}</Text>
                    </View>

                    {item.mode ? (
                      <View style={styles.metaBadge}>
                        <ModeVectorIcon mode={item.mode} size={11} />
                        <Text style={styles.metaBadgeText}>{item.mode.toUpperCase()}</Text>
                      </View>
                    ) : null}

                    {item.model ? (
                      <View style={styles.metaBadge}>
                        <Cpu size={11} color={COLORS.cyan} />
                        <Text style={[styles.metaBadgeText, { color: COLORS.cyan }]} numberOfLines={1}>
                          {item.model}
                        </Text>
                      </View>
                    ) : null}

                    {item.fast ? <Zap size={12} color={COLORS.amber} fill={COLORS.amber} /> : null}
                    <View style={{ flex: 1 }} />
                    {isMac ? (
                      <>
                        <SpringButton
                          style={styles.cardIconAction}
                          hitSlop={8}
                          onPress={() => {
                            setRenamingAgent(item);
                            setRenameText(item.name || '');
                          }}
                        >
                          <Edit3 size={13} color={COLORS.cyan} />
                        </SpringButton>
                        <SpringButton
                          style={styles.cardIconAction}
                          hitSlop={8}
                          onPress={() => handleConfirmDelete(item)}
                        >
                          <Trash2 size={13} color={COLORS.magenta} />
                        </SpringButton>
                      </>
                    ) : null}
                    <ArrowUpRight size={16} color={COLORS.lime} />
                  </View>

                  <Text style={styles.cardTitle} numberOfLines={2}>
                    {item.name || item.id}
                  </Text>

                  <View style={styles.cardFooterRow}>
                    {folderShort ? (
                      <View style={styles.folderChip}>
                        <FolderGit2 size={12} color={COLORS.muted} />
                        <Text style={styles.folderChipText}>{folderShort}</Text>
                      </View>
                    ) : null}
                    <Text style={styles.timeText}>
                      {item.updatedAt ? new Date(item.updatedAt).toLocaleTimeString() : ''}
                    </Text>
                  </View>
                </SpringButton>
              </FadeIn>
            </View>
          );
        }}
        ListEmptyComponent={
          <View style={{ paddingHorizontal: 16 }}>
            <CussEmptyArtPoster
              title={isMac ? 'NO MAC AGENTS ACTIVE' : 'NO CLOUD AGENTS'}
              subtitle={
                isMac
                  ? 'Tap SPAWN to fire a Cursor agent directly on your Mac with your logged-in account, full model options, and @file context.'
                  : 'Switch to MAC to drive your local Cursor IDE/CLI without any API key.'
              }
            />
          </View>
        }
      />

      {/* Rename Chat Modal */}
      <Modal
        visible={Boolean(renamingAgent)}
        animationType="fade"
        transparent
        onRequestClose={() => setRenamingAgent(null)}
      >
        <View style={styles.renameBackdrop}>
          <View style={styles.renameCard}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={styles.renameTitle}>RENAME CHAT</Text>
              <SpringButton onPress={() => setRenamingAgent(null)}>
                <X size={16} color={COLORS.bone} />
              </SpringButton>
            </View>
            <TextInput
              style={styles.renameInput}
              value={renameText}
              onChangeText={setRenameText}
              placeholder="New chat title…"
              placeholderTextColor={COLORS.dim}
              autoFocus
            />
            <SpringButton style={styles.renameSaveBtn} onPress={handleConfirmRename}>
              <Check size={15} color={COLORS.bg} strokeWidth={2.8} />
              <Text style={styles.renameSaveText}>SAVE TITLE</Text>
            </SpringButton>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  unlinkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: COLORS.plate,
    borderWidth: 1,
    borderColor: COLORS.magenta,
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  unlinkText: {
    fontFamily: FONTS.monoBold,
    fontSize: 10,
    color: COLORS.magenta,
    letterSpacing: 0.8,
  },
  hero: {
    height: 235,
    borderBottomWidth: 1.5,
    borderBottomColor: COLORS.borderHi,
  },
  heroTopLeft: {
    position: 'absolute',
    top: 10,
    left: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  heroLogoWordmark: {
    fontFamily: FONTS.mogi,
    fontSize: 28,
    color: COLORS.lime,
    letterSpacing: 2,
    lineHeight: 30,
  },
  heroAccountText: {
    fontFamily: FONTS.mono,
    fontSize: 9.5,
    color: COLORS.muted,
    maxWidth: 180,
  },
  surfaceToggle: {
    position: 'absolute',
    top: 12,
    right: 14,
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    borderWidth: 1.2,
    borderColor: COLORS.borderHi,
    borderRadius: 11,
    padding: 3,
    gap: 4,
  },
  surfaceBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  surfaceBtnActive: {
    backgroundColor: COLORS.lime,
  },
  surfaceBtnText: {
    fontFamily: FONTS.monoBold,
    fontSize: 10.5,
    color: COLORS.muted,
    letterSpacing: 0.9,
  },
  heroBottomLeft: {
    position: 'absolute',
    bottom: 12,
    left: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  bigCount: {
    fontFamily: FONTS.mogi,
    fontSize: 44,
    color: COLORS.lime,
    letterSpacing: 1,
  },
  countTitle: {
    fontFamily: FONTS.display,
    fontSize: 12,
    color: COLORS.bone,
    letterSpacing: 1,
  },
  countSub: {
    fontFamily: FONTS.mono,
    fontSize: 9.5,
    color: COLORS.muted,
    marginTop: 2,
  },
  spawnFab: {
    position: 'absolute',
    right: 16,
    bottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.lime,
    borderRadius: 12,
    paddingVertical: 11,
    paddingHorizontal: 16,
  },
  spawnFabText: {
    fontFamily: FONTS.monoBold,
    fontSize: 12.5,
    color: COLORS.bg,
    letterSpacing: 1.1,
  },
  agentCard: {
    backgroundColor: COLORS.surface,
    borderWidth: 1.5,
    borderColor: COLORS.borderHi,
    borderRadius: 15,
    padding: 14,
    marginBottom: 10,
    gap: 8,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    backgroundColor: COLORS.plate,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusPillText: {
    fontFamily: FONTS.monoBold,
    fontSize: 9.5,
    letterSpacing: 0.9,
  },
  metaBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.plate,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2.5,
    maxWidth: 130,
  },
  metaBadgeText: {
    fontFamily: FONTS.monoBold,
    fontSize: 9.5,
    color: COLORS.bone,
  },
  cardTitle: {
    fontFamily: FONTS.bodyBold,
    fontSize: 15.5,
    color: COLORS.bone,
    lineHeight: 21,
  },
  cardFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  folderChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  folderChipText: {
    fontFamily: FONTS.mono,
    fontSize: 11,
    color: COLORS.muted,
  },
  timeText: {
    fontFamily: FONTS.mono,
    fontSize: 10.5,
    color: COLORS.dim,
  },
  ideTelemetryBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    marginHorizontal: 16,
    marginTop: 10,
    backgroundColor: COLORS.surface,
    borderWidth: 1.2,
    borderColor: COLORS.cyan,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  ideLiveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.limeDim,
    borderWidth: 1,
    borderColor: COLORS.lime,
    borderRadius: 5,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  ideLiveDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: COLORS.lime,
  },
  ideLiveBadgeText: {
    fontFamily: FONTS.monoBold,
    fontSize: 8.5,
    color: COLORS.lime,
    letterSpacing: 0.8,
  },
  ideWorkspaceName: {
    fontFamily: FONTS.bodyBold,
    fontSize: 13,
    color: COLORS.bone,
  },
  ideBranchTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: COLORS.plate,
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  ideBranchText: {
    fontFamily: FONTS.mono,
    fontSize: 9,
    color: COLORS.cyan,
  },
  ideMcpText: {
    fontFamily: FONTS.mono,
    fontSize: 9.5,
    color: COLORS.muted,
    marginTop: 1,
  },
  syncIdeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.plate,
    borderWidth: 1,
    borderColor: COLORS.lime,
    borderRadius: 7,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  syncIdeBtnText: {
    fontFamily: FONTS.monoBold,
    fontSize: 9.5,
    color: COLORS.lime,
  },
  cardIconAction: {
    backgroundColor: COLORS.plate,
    borderWidth: 1,
    borderColor: COLORS.borderHi,
    borderRadius: 6,
    padding: 5,
  },
  renameBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(5,5,11,0.84)',
    justifyContent: 'center',
    padding: 24,
  },
  renameCard: {
    backgroundColor: COLORS.surface,
    borderWidth: 1.5,
    borderColor: COLORS.lime,
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  renameTitle: {
    fontFamily: FONTS.mogi,
    fontSize: 20,
    color: COLORS.lime,
  },
  renameInput: {
    fontFamily: FONTS.bodyBold,
    fontSize: 15,
    color: COLORS.bone,
    backgroundColor: COLORS.plate,
    borderWidth: 1.2,
    borderColor: COLORS.borderHi,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  renameSaveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: COLORS.lime,
    borderRadius: 10,
    paddingVertical: 11,
  },
  renameSaveText: {
    fontFamily: FONTS.monoBold,
    fontSize: 12,
    color: COLORS.bg,
  },
});
