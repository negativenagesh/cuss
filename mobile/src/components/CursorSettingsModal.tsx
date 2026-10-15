import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import {
  Activity,
  Check,
  Cpu,
  FileCode2,
  FolderGit2,
  Gauge,
  Layers,
  ModeVectorIcon,
  Network,
  RefreshCw,
  SlidersHorizontal,
  Sparkles,
  SpringButton,
  Unplug,
  X,
  Zap,
} from './CussIcons';
import DirectoryPickerModal from './DirectoryPickerModal';
import { FileViewerModal } from './MarkdownRenderer';
import {
  CursorSettingsResponse,
  localAuthLogout,
  localGetSettings,
  localUpdateSettings,
} from '../api/client';
import { useStore } from '../store';
import { COLORS, ExecutionMode, FONTS, MODE_META } from '../theme';

interface Props {
  visible: boolean;
  onClose: () => void;
  initialTab?: 'usage' | 'general' | 'models' | 'privacy' | 'mcp';
}

function formatUsd(cents: number): string {
  const dollars = (Number(cents) || 0) / 100;
  return `$${dollars.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatCycleDate(msStr?: string): string {
  if (!msStr) return '—';
  const n = Number(msStr);
  if (!Number.isFinite(n) || n <= 0) return '—';
  return new Date(n).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function daysRemaining(msStr?: string): number | null {
  if (!msStr) return null;
  const n = Number(msStr);
  if (!Number.isFinite(n) || n <= 0) return null;
  const diff = n - Date.now();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

export default function CursorSettingsModal({
  visible,
  onClose,
  initialTab = 'usage',
}: Props) {
  const {
    bridgeUrl,
    token,
    selectedCwd,
    ideState,
    modelFamilies,
    selectedMode,
    selectedModel,
    selectedEffort,
    selectedContext,
    selectedFast,
    selectedThinking,
    setComposerConfig,
    setCursorSignedIn,
    clearPairing,
  } = useStore();

  const [tab, setTab] = useState<'usage' | 'general' | 'models' | 'privacy' | 'mcp'>(initialTab);
  const [data, setData] = useState<CursorSettingsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirModalOpen, setDirModalOpen] = useState(false);
  const [viewFilePath, setViewFilePath] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      const res = await localGetSettings();
      setData(res);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!visible) return;
    void refresh();
  }, [visible]);

  async function patchCliConfig(patch: Record<string, any>) {
    setSaving(true);
    try {
      const res = await localUpdateSettings({ cliConfig: patch });
      if (res?.cliConfig && data) {
        setData({ ...data, cliConfig: res.cliConfig });
      }
    } catch (e: any) {
      Alert.alert('Settings Error', e?.message ?? 'Could not update ~/.cursor/cli-config.json');
    } finally {
      setSaving(false);
    }
  }

  async function patchDesktopSettings(patch: Record<string, any>) {
    setSaving(true);
    try {
      const res = await localUpdateSettings({ desktopSettings: patch });
      if (res?.desktopSettings && data) {
        setData({ ...data, desktopSettings: res.desktopSettings });
      }
    } catch (e: any) {
      Alert.alert('Settings Error', e?.message ?? 'Could not update Cursor settings.json');
    } finally {
      setSaving(false);
    }
  }

  const pu = data?.planUsage;
  const pi = data?.planInfo;
  const acct = data?.account;
  const cli = data?.cliConfig ?? {};
  const desk = data?.desktopSettings ?? {};
  const activeCwd = selectedCwd || ideState?.activeWorkspace?.path || '~';
  const daysLeft = daysRemaining(pi?.billingCycleEnd);

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onClose}
    >
      <View style={s.backdrop}>
        <View style={s.sheet}>
          {/* Top Header */}
          <View style={s.header}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
              <SlidersHorizontal size={16} color={COLORS.lime} />
              <View style={{ flex: 1 }}>
                <Text style={s.title}>CURSOR SETTINGS & PLAN USAGE</Text>
                <Text style={s.subtitle} numberOfLines={1}>
                  {acct?.email || 'Cursor Mac Account'} · {pi?.planName?.toUpperCase() || 'ULTRA'} ({pi?.price || '$200/mo'})
                </Text>
              </View>
            </View>
            <SpringButton style={s.iconBtn} onPress={() => void refresh()}>
              <RefreshCw size={14} color={COLORS.cyan} />
            </SpringButton>
            <SpringButton style={s.iconBtn} onPress={onClose}>
              <X size={15} color={COLORS.bone} />
            </SpringButton>
          </View>

          {/* 5-Tab Bar */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxHeight: 38 }}>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {(
                [
                  { id: 'usage', label: 'PLAN & USAGE', icon: Gauge },
                  { id: 'general', label: 'GENERAL & DIR', icon: SlidersHorizontal },
                  { id: 'models', label: 'MODELS & DEFAULTS', icon: Cpu },
                  { id: 'privacy', label: 'PRIVACY & PLANS', icon: Layers },
                  { id: 'mcp', label: 'MCP & BRIDGE', icon: Network },
                ] as const
              ).map((t) => {
                const active = tab === t.id;
                const Icon = t.icon;
                return (
                  <SpringButton
                    key={t.id}
                    style={[s.tabChip, active && s.tabChipActive]}
                    onPress={() => setTab(t.id)}
                  >
                    <Icon size={12} color={active ? COLORS.bg : COLORS.bone} />
                    <Text style={[s.tabChipText, active && { color: COLORS.bg }]}>{t.label}</Text>
                  </SpringButton>
                );
              })}
            </View>
          </ScrollView>

          {loading && !data ? (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 }}>
              <ActivityIndicator size="large" color={COLORS.lime} />
              <Text style={s.subtitle}>Querying Cursor DashboardService & local settings…</Text>
            </View>
          ) : (
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: 12, paddingBottom: 24 }}>
              {/* ================= TAB 1: PLAN & USAGE ================= */}
              {tab === 'usage' ? (
                <>
                  {/* Account & Plan Tier Hero Card */}
                  <View style={s.card}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <View style={{ flex: 1 }}>
                        <Text style={s.eyebrow}>ACCOUNT & SUBSCRIPTION</Text>
                        <Text style={s.bigTitle}>{acct?.displayName || 'Cursor User'}</Text>
                        <Text style={s.monoSub}>{acct?.email || 'Signed in via Mac Cursor'}</Text>
                      </View>
                      <View style={s.planBadge}>
                        <Sparkles size={12} color={COLORS.bg} />
                        <Text style={s.planBadgeText}>
                          {pi?.planName?.toUpperCase() || 'ULTRA'} · {pi?.price || '$200/MO'}
                        </Text>
                      </View>
                    </View>

                    <View style={s.divider} />

                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <View>
                        <Text style={s.metaLabel}>BILLING CYCLE</Text>
                        <Text style={s.metaValue}>
                          {formatCycleDate(pi?.billingCycleStart)} → {formatCycleDate(pi?.billingCycleEnd)}
                        </Text>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={s.metaLabel}>CYCLE RESET</Text>
                        <Text style={[s.metaValue, { color: COLORS.cyan }]}>
                          {daysLeft != null ? `IN ${daysLeft} DAYS` : 'MONTHLY'}
                        </Text>
                      </View>
                    </View>
                  </View>

                  {/* Live Usage Bars (Identical to Cursor Desktop Settings -> Usage) */}
                  <View style={s.card}>
                    <Text style={s.eyebrow}>CURRENT PERIOD USAGE METERS</Text>

                    {/* Bar 1: Total Included Usage */}
                    <View style={{ gap: 5, marginTop: 4 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                        <Text style={s.barLabel}>Total Included Usage</Text>
                        <Text style={[s.barPct, { color: COLORS.lime }]}>
                          {(pu?.totalPercentUsed ?? 0).toFixed(1)}%
                        </Text>
                      </View>
                      <View style={s.progressTrack}>
                        <View
                          style={[
                            s.progressFill,
                            {
                              width: `${Math.min(100, Math.max(0, pu?.totalPercentUsed ?? 0))}%`,
                              backgroundColor: COLORS.lime,
                            },
                          ]}
                        />
                      </View>
                      {pu?.autoModelSelectedDisplayMessage ? (
                        <Text style={s.barHint}>{pu.autoModelSelectedDisplayMessage}</Text>
                      ) : null}
                    </View>

                    {/* Bar 2: Auto + Composer 2.5 + Grok 4.7 Bucket */}
                    <View style={{ gap: 5, marginTop: 8 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                        <Text style={s.barLabel}>Auto / Composer 2.5 / Grok 4.7 Bucket</Text>
                        <Text style={[s.barPct, { color: COLORS.cyan }]}>
                          {(pu?.autoPercentUsed ?? 0).toFixed(1)}%
                        </Text>
                      </View>
                      <View style={s.progressTrack}>
                        <View
                          style={[
                            s.progressFill,
                            {
                              width: `${Math.min(100, Math.max(0, pu?.autoPercentUsed ?? 0))}%`,
                              backgroundColor: COLORS.cyan,
                            },
                          ]}
                        />
                      </View>
                      <Text style={s.barHint}>
                        Models in this bucket (Auto, Composer 2.5, Grok 4.7/4.6/4.5, Vega) continue running even when Named API quota is at 100%.
                      </Text>
                    </View>

                    {/* Bar 3: Named Frontier API Models */}
                    <View style={{ gap: 5, marginTop: 8 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                        <Text style={s.barLabel}>Named Frontier API Usage</Text>
                        <Text
                          style={[
                            s.barPct,
                            { color: (pu?.apiPercentUsed ?? 0) >= 100 ? COLORS.magenta : COLORS.amber },
                          ]}
                        >
                          {(pu?.apiPercentUsed ?? 0).toFixed(1)}%
                        </Text>
                      </View>
                      <View style={s.progressTrack}>
                        <View
                          style={[
                            s.progressFill,
                            {
                              width: `${Math.min(100, Math.max(0, pu?.apiPercentUsed ?? 0))}%`,
                              backgroundColor:
                                (pu?.apiPercentUsed ?? 0) >= 100 ? COLORS.magenta : COLORS.amber,
                            },
                          ]}
                        />
                      </View>
                      {pu?.namedModelSelectedDisplayMessage ? (
                        <Text style={[s.barHint, { color: COLORS.amber }]}>
                          {pu.namedModelSelectedDisplayMessage}
                        </Text>
                      ) : null}
                    </View>
                  </View>

                  {/* USD Compute Spend & Bonus Value Breakdown */}
                  <View style={s.card}>
                    <Text style={s.eyebrow}>COMPUTE SPEND & PROVIDER BONUS BREAKDOWN</Text>
                    <View style={s.statGrid}>
                      <View style={s.statCell}>
                        <Text style={s.metaLabel}>INCLUDED CREDIT</Text>
                        <Text style={[s.statBig, { color: COLORS.bone }]}>
                          {formatUsd(pu?.includedSpendCents ?? 0)} / {formatUsd(pu?.limitCents ?? 40000)}
                        </Text>
                      </View>
                      <View style={s.statCell}>
                        <Text style={s.metaLabel}>PROVIDER BONUS</Text>
                        <Text style={[s.statBig, { color: COLORS.cyan }]}>
                          +{formatUsd(pu?.bonusSpendCents ?? 0)}
                        </Text>
                      </View>
                      <View style={s.statCell}>
                        <Text style={s.metaLabel}>TOTAL VALUE USED</Text>
                        <Text style={[s.statBig, { color: COLORS.lime }]}>
                          {formatUsd(pu?.totalSpendCents ?? 0)}
                        </Text>
                      </View>
                      <View style={s.statCell}>
                        <Text style={s.metaLabel}>ON-DEMAND SPEND</Text>
                        <Text style={[s.statBig, { color: COLORS.emerald }]}>
                          {pu?.noUsageBasedAllowed ? 'OFF (HARD CAP)' : 'ENABLED'}
                        </Text>
                      </View>
                    </View>
                    {pu?.bonusTooltip ? <Text style={s.barHint}>{pu.bonusTooltip}</Text> : null}
                  </View>

                  {/* Included Auto-Bucket Models */}
                  <View style={s.card}>
                    <Text style={s.eyebrow}>
                      INCLUDED AUTO-BUCKET MODELS ({pu?.autoBucketModels?.length ?? 0})
                    </Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                      {(pu?.autoBucketModels ?? []).slice(0, 24).map((m) => (
                        <View key={m} style={s.modelTag}>
                          <Text style={s.modelTagText}>{m}</Text>
                        </View>
                      ))}
                    </View>
                  </View>

                  {/* Local CUSS Session Token Telemetry */}
                  <View style={s.card}>
                    <Text style={s.eyebrow}>LOCAL CUSS SESSION TELEMETRY</Text>
                    <View style={s.statGrid}>
                      <View style={s.statCell}>
                        <Text style={s.metaLabel}>SESSIONS</Text>
                        <Text style={s.statBig}>{data?.localTelemetry.sessionCount ?? 0}</Text>
                      </View>
                      <View style={s.statCell}>
                        <Text style={s.metaLabel}>INPUT TOKENS</Text>
                        <Text style={[s.statBig, { color: COLORS.cyan }]}>
                          {(data?.localTelemetry.inputTokens ?? 0).toLocaleString()}
                        </Text>
                      </View>
                      <View style={s.statCell}>
                        <Text style={s.metaLabel}>OUTPUT TOKENS</Text>
                        <Text style={[s.statBig, { color: COLORS.lime }]}>
                          {(data?.localTelemetry.outputTokens ?? 0).toLocaleString()}
                        </Text>
                      </View>
                      <View style={s.statCell}>
                        <Text style={s.metaLabel}>CACHE READ</Text>
                        <Text style={[s.statBig, { color: COLORS.violet }]}>
                          {(data?.localTelemetry.cacheReadTokens ?? 0).toLocaleString()}
                        </Text>
                      </View>
                    </View>
                  </View>
                </>
              ) : null}

              {/* ================= TAB 2: GENERAL & DIR ================= */}
              {tab === 'general' ? (
                <>
                  {/* Active Working Directory Selector */}
                  <View style={s.card}>
                    <Text style={s.eyebrow}>ACTIVE MAC WORKING DIRECTORY</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 }}>
                      <FolderGit2 size={18} color={COLORS.lime} />
                      <View style={{ flex: 1 }}>
                        <Text style={s.barLabel} numberOfLines={1}>
                          {activeCwd.split('/').filter(Boolean).pop() || activeCwd}
                        </Text>
                        <Text style={s.monoSub} numberOfLines={1}>
                          {activeCwd}
                        </Text>
                      </View>
                      <SpringButton
                        style={s.actionBtn}
                        onPress={() => setDirModalOpen(true)}
                      >
                        <Text style={s.actionBtnText}>CHANGE DIR</Text>
                      </SpringButton>
                    </View>
                  </View>

                  {/* Cursor CLI Settings (~/.cursor/cli-config.json) */}
                  <View style={s.card}>
                    <Text style={s.eyebrow}>CURSOR AGENT CLI SETTINGS (~/.cursor/cli-config.json)</Text>
                    {[
                      {
                        label: 'Max Mode (Extended Compute)',
                        sub: 'Enable maximum token & tool budget per turn',
                        val: Boolean(cli.maxMode),
                        onToggle: (v: boolean) => void patchCliConfig({ maxMode: v }),
                      },
                      {
                        label: 'Disable Sandbox (Full Mac Access)',
                        sub: 'Run shell, git, gcloud, and build commands without sandbox blocks',
                        val: cli?.sandbox?.mode === 'disabled',
                        onToggle: (v: boolean) =>
                          void patchCliConfig({
                            sandbox: { ...(cli.sandbox || {}), mode: v ? 'disabled' : 'enabled' },
                          }),
                      },
                      {
                        label: 'Auto-Accept Web Search',
                        sub: 'Allow agent to search web documentation without prompting',
                        val: Boolean(cli.autoAcceptWebSearch),
                        onToggle: (v: boolean) => void patchCliConfig({ autoAcceptWebSearch: v }),
                      },
                      {
                        label: 'Attribute Git Commits to Agent',
                        sub: 'Include Co-Authored-By trailer on agent commits',
                        val: Boolean(cli?.attribution?.attributeCommitsToAgent ?? true),
                        onToggle: (v: boolean) =>
                          void patchCliConfig({
                            attribution: {
                              ...(cli.attribution || {}),
                              attributeCommitsToAgent: v,
                            },
                          }),
                      },
                      {
                        label: 'Attribute Pull Requests to Agent',
                        sub: 'Include agent attribution on PR descriptions',
                        val: Boolean(cli?.attribution?.attributePRsToAgent ?? true),
                        onToggle: (v: boolean) =>
                          void patchCliConfig({
                            attribution: {
                              ...(cli.attribution || {}),
                              attributePRsToAgent: v,
                            },
                          }),
                      },
                      {
                        label: 'Agent Notifications',
                        sub: 'Notify when background agent turns finish',
                        val: Boolean(cli.notifications ?? true),
                        onToggle: (v: boolean) => void patchCliConfig({ notifications: v }),
                      },
                      {
                        label: 'Vim Keybindings in CLI',
                        sub: 'Enable modal Vim editing in terminal CLI',
                        val: Boolean(cli?.editor?.vimMode),
                        onToggle: (v: boolean) =>
                          void patchCliConfig({ editor: { ...(cli.editor || {}), vimMode: v } }),
                      },
                    ].map((row) => (
                      <View key={row.label} style={s.switchRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={s.barLabel}>{row.label}</Text>
                          <Text style={s.barHint}>{row.sub}</Text>
                        </View>
                        <Switch
                          value={row.val}
                          onValueChange={row.onToggle}
                          disabled={saving}
                          trackColor={{ false: COLORS.border, true: COLORS.lime }}
                          thumbColor={row.val ? COLORS.bg : COLORS.muted}
                        />
                      </View>
                    ))}
                  </View>

                  {/* Cursor Desktop Editor Settings (settings.json) */}
                  <View style={s.card}>
                    <Text style={s.eyebrow}>CURSOR DESKTOP EDITOR SETTINGS (settings.json)</Text>
                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                      <View style={s.statCell}>
                        <Text style={s.metaLabel}>COLOR THEME</Text>
                        <Text style={s.metaValue}>
                          {desk['workbench.preferredDarkColorTheme'] || 'Cursor Dark'}
                        </Text>
                      </View>
                      <View style={s.statCell}>
                        <Text style={s.metaLabel}>ICON THEME</Text>
                        <Text style={s.metaValue}>
                          {desk['workbench.iconTheme'] || 'material-icon-theme'}
                        </Text>
                      </View>
                    </View>
                    {[
                      {
                        key: 'git.autofetch',
                        label: 'Git Autofetch',
                        sub: 'Automatically fetch changes from remote repository',
                      },
                      {
                        key: 'terminal.integrated.enableImages',
                        label: 'Terminal Inline Images',
                        sub: 'Render inline images inside integrated terminal',
                      },
                      {
                        key: 'window.autoDetectColorScheme',
                        label: 'Auto-Detect OS Color Scheme',
                        sub: 'Switch theme with macOS appearance',
                      },
                      {
                        key: 'editor.formatOnSave',
                        label: 'Format On Save',
                        sub: 'Automatically format files when saved in Cursor',
                      },
                    ].map((item) => {
                      const val = Boolean(desk[item.key]);
                      return (
                        <View key={item.key} style={s.switchRow}>
                          <View style={{ flex: 1 }}>
                            <Text style={s.barLabel}>{item.label}</Text>
                            <Text style={s.barHint}>{item.sub}</Text>
                          </View>
                          <Switch
                            value={val}
                            onValueChange={(v) => void patchDesktopSettings({ [item.key]: v })}
                            disabled={saving}
                            trackColor={{ false: COLORS.border, true: COLORS.cyan }}
                            thumbColor={val ? COLORS.bg : COLORS.muted}
                          />
                        </View>
                      );
                    })}
                  </View>
                </>
              ) : null}

              {/* ================= TAB 3: MODELS & DEFAULTS ================= */}
              {tab === 'models' ? (
                <>
                  <View style={s.card}>
                    <Text style={s.eyebrow}>DEFAULT EXECUTION MODE</Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                      {(['agent', 'plan', 'ask', 'debug', 'multitask'] as ExecutionMode[]).map((m) => {
                        const active = selectedMode === m;
                        const meta = MODE_META[m];
                        return (
                          <SpringButton
                            key={m}
                            style={[
                              s.tabChip,
                              active && { backgroundColor: meta.color, borderColor: meta.color },
                            ]}
                            onPress={() => setComposerConfig({ mode: m })}
                          >
                            <ModeVectorIcon mode={m} size={12} color={active ? COLORS.bg : meta.color} />
                            <Text style={[s.tabChipText, active && { color: COLORS.bg }]}>
                              {meta.label}
                            </Text>
                          </SpringButton>
                        );
                      })}
                    </View>
                  </View>

                  <View style={s.card}>
                    <Text style={s.eyebrow}>DEFAULT MODEL FAMILY</Text>
                    <View style={{ gap: 6, marginTop: 4 }}>
                      {modelFamilies.map((fam) => {
                        const active = selectedModel === fam.id;
                        return (
                          <SpringButton
                            key={fam.id}
                            style={[s.modelCard, active && s.modelCardActive]}
                            onPress={() => setComposerConfig({ model: fam.id })}
                          >
                            <Cpu size={14} color={active ? COLORS.lime : COLORS.cyan} />
                            <View style={{ flex: 1 }}>
                              <Text style={[s.barLabel, active && { color: COLORS.lime }]}>
                                {fam.name}
                              </Text>
                              <Text style={s.barHint}>
                                {fam.provider.toUpperCase()} · {fam.tagline}
                              </Text>
                            </View>
                            {active ? <Check size={15} color={COLORS.lime} strokeWidth={2.8} /> : null}
                          </SpringButton>
                        );
                      })}
                    </View>
                  </View>

                  <View style={s.card}>
                    <Text style={s.eyebrow}>DEFAULT REASONING EFFORT & CONTEXT</Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                      {['auto', 'low', 'medium', 'high', 'xhigh'].map((ef) => {
                        const active = selectedEffort === ef;
                        return (
                          <SpringButton
                            key={ef}
                            style={[s.tabChip, active && s.tabChipActive]}
                            onPress={() => setComposerConfig({ effort: ef })}
                          >
                            <Text style={[s.tabChipText, active && { color: COLORS.bg }]}>
                              EFFORT: {ef.toUpperCase()}
                            </Text>
                          </SpringButton>
                        );
                      })}
                    </View>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                      {['auto', '256k', '1M'].map((ctx) => {
                        const active = selectedContext === ctx;
                        return (
                          <SpringButton
                            key={ctx}
                            style={[
                              s.tabChip,
                              active && { backgroundColor: COLORS.cyan, borderColor: COLORS.cyan },
                            ]}
                            onPress={() => setComposerConfig({ context: ctx })}
                          >
                            <Text style={[s.tabChipText, active && { color: COLORS.bg }]}>
                              CTX: {ctx.toUpperCase()}
                            </Text>
                          </SpringButton>
                        );
                      })}
                      <SpringButton
                        style={[
                          s.tabChip,
                          selectedFast && { backgroundColor: COLORS.amber, borderColor: COLORS.amber },
                        ]}
                        onPress={() => setComposerConfig({ fast: !selectedFast })}
                      >
                        <Zap size={11} color={selectedFast ? COLORS.bg : COLORS.amber} />
                        <Text style={[s.tabChipText, selectedFast && { color: COLORS.bg }]}>
                          FAST: {selectedFast ? 'ON' : 'OFF'}
                        </Text>
                      </SpringButton>
                      <SpringButton
                        style={[
                          s.tabChip,
                          selectedThinking && {
                            backgroundColor: COLORS.magenta,
                            borderColor: COLORS.magenta,
                          },
                        ]}
                        onPress={() => setComposerConfig({ thinking: !selectedThinking })}
                      >
                        <Text style={[s.tabChipText, selectedThinking && { color: COLORS.bg }]}>
                          THINKING: {selectedThinking ? 'ON' : 'OFF'}
                        </Text>
                      </SpringButton>
                    </View>
                  </View>
                </>
              ) : null}

              {/* ================= TAB 4: PRIVACY & SAVED PLANS ================= */}
              {tab === 'privacy' ? (
                <>
                  <View style={s.card}>
                    <Text style={s.eyebrow}>DATA PRIVACY & GHOST MODE</Text>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <View style={{ flex: 1 }}>
                        <Text style={s.barLabel}>
                          {data?.privacy.privacyMode || 'PRIVACY_MODE_NO_TRAINING'}
                        </Text>
                        <Text style={s.barHint}>
                          Zero code retention / no model training on your repositories.
                        </Text>
                      </View>
                      <View style={[s.planBadge, { backgroundColor: COLORS.emerald }]}>
                        <Text style={s.planBadgeText}>
                          {data?.privacy.ghostMode ? 'GHOST MODE ON' : 'PROTECTED'}
                        </Text>
                      </View>
                    </View>
                  </View>

                  <View style={s.card}>
                    <Text style={s.eyebrow}>
                      SAVED CURSOR ARCHITECTURE PLANS ({data?.savedPlans?.length ?? 0})
                    </Text>
                    {(data?.savedPlans ?? []).length === 0 ? (
                      <Text style={s.barHint}>No saved plans in ~/.cursor/plans yet.</Text>
                    ) : (
                      (data?.savedPlans ?? []).map((pl) => (
                        <SpringButton
                          key={pl.id}
                          style={s.modelCard}
                          onPress={() => pl.path && setViewFilePath(pl.path)}
                        >
                          <FileCode2 size={14} color={COLORS.cyan} />
                          <View style={{ flex: 1 }}>
                            <Text style={s.barLabel}>{pl.name}</Text>
                            <Text style={s.monoSub} numberOfLines={1}>
                              {pl.path}
                            </Text>
                          </View>
                        </SpringButton>
                      ))
                    )}
                  </View>
                </>
              ) : null}

              {/* ================= TAB 5: MCP & BRIDGE ================= */}
              {tab === 'mcp' ? (
                <>
                  <View style={s.card}>
                    <Text style={s.eyebrow}>
                      CONFIGURED MCP SERVERS ({data?.mcpServers?.length ?? 0})
                    </Text>
                    {(data?.mcpServers ?? []).length === 0 ? (
                      <Text style={s.barHint}>No MCP servers found in ~/.cursor/mcp.json.</Text>
                    ) : (
                      (data?.mcpServers ?? []).map((mcp) => (
                        <View key={mcp.name} style={s.modelCard}>
                          <Network size={14} color={COLORS.lime} />
                          <View style={{ flex: 1 }}>
                            <Text style={s.barLabel}>{mcp.name}</Text>
                            <Text style={s.monoSub} numberOfLines={1}>
                              {mcp.command || mcp.url || 'stdio'}
                            </Text>
                          </View>
                          <View style={s.modelTag}>
                            <Text style={s.modelTagText}>READY</Text>
                          </View>
                        </View>
                      ))
                    )}
                  </View>

                  <View style={s.card}>
                    <Text style={s.eyebrow}>MAC BRIDGE UMBILICAL & SESSION</Text>
                    <Text style={s.barLabel}>Bridge URL: {bridgeUrl || '—'}</Text>
                    <Text style={s.monoSub} numberOfLines={1}>
                      Token: {token ? `${token.slice(0, 16)}…` : '—'}
                    </Text>

                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                      <SpringButton
                        style={[s.actionBtn, { backgroundColor: COLORS.amber, flex: 1, justifyContent: 'center' }]}
                        onPress={() => {
                          Alert.alert('Sign Out of Cursor', 'Sign out of your Cursor session?', [
                            { text: 'Cancel', style: 'cancel' },
                            {
                              text: 'Sign Out',
                              style: 'destructive',
                              onPress: async () => {
                                await setCursorSignedIn(false, null);
                                void localAuthLogout().catch(() => {});
                                onClose();
                              },
                            },
                          ]);
                        }}
                      >
                        <Text style={s.actionBtnText}>SIGN OUT OF CURSOR</Text>
                      </SpringButton>
                      <SpringButton
                        style={[s.actionBtn, { backgroundColor: COLORS.magenta, flex: 1, justifyContent: 'center' }]}
                        onPress={() => {
                          void clearPairing();
                          onClose();
                        }}
                      >
                        <Unplug size={12} color={COLORS.bg} />
                        <Text style={s.actionBtnText}>UNLINK MAC</Text>
                      </SpringButton>
                    </View>
                  </View>
                </>
              ) : null}
            </ScrollView>
          )}
        </View>
      </View>

      {/* Nested Directory Picker */}
      <DirectoryPickerModal
        visible={dirModalOpen}
        onClose={() => setDirModalOpen(false)}
      />

      {/* Nested File Viewer for Saved Plans */}
      <FileViewerModal
        visible={Boolean(viewFilePath)}
        filePath={viewFilePath}
        cwd={activeCwd}
        onClose={() => setViewFilePath(null)}
      />
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(5, 5, 10, 0.88)',
    justifyContent: 'flex-end',
  },
  sheet: {
    height: '90%',
    backgroundColor: COLORS.bg,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderTopWidth: 1.5,
    borderColor: COLORS.lime,
    padding: 16,
    gap: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontFamily: FONTS.monoBold,
    fontSize: 13,
    color: COLORS.lime,
    letterSpacing: 0.9,
  },
  subtitle: {
    fontFamily: FONTS.mono,
    fontSize: 10,
    color: COLORS.muted,
    marginTop: 2,
  },
  iconBtn: {
    padding: 8,
    borderRadius: 9,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.borderHi,
  },
  tabChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: COLORS.borderHi,
    backgroundColor: COLORS.surface,
  },
  tabChipActive: {
    backgroundColor: COLORS.lime,
    borderColor: COLORS.lime,
  },
  tabChipText: {
    fontFamily: FONTS.monoBold,
    fontSize: 9.5,
    color: COLORS.bone,
    letterSpacing: 0.6,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderWidth: 1.2,
    borderColor: COLORS.borderHi,
    borderRadius: 14,
    padding: 13,
    gap: 8,
  },
  eyebrow: {
    fontFamily: FONTS.monoBold,
    fontSize: 9.5,
    color: COLORS.cyan,
    letterSpacing: 1,
  },
  bigTitle: {
    fontFamily: FONTS.display,
    fontSize: 16,
    color: COLORS.bone,
    marginTop: 2,
  },
  monoSub: {
    fontFamily: FONTS.mono,
    fontSize: 10.5,
    color: COLORS.muted,
    marginTop: 1,
  },
  planBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: COLORS.lime,
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  planBadgeText: {
    fontFamily: FONTS.monoBold,
    fontSize: 9.5,
    color: COLORS.bg,
    letterSpacing: 0.6,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: 2,
  },
  metaLabel: {
    fontFamily: FONTS.monoBold,
    fontSize: 8.5,
    color: COLORS.dim,
    letterSpacing: 0.8,
  },
  metaValue: {
    fontFamily: FONTS.monoBold,
    fontSize: 11,
    color: COLORS.bone,
    marginTop: 2,
  },
  barLabel: {
    fontFamily: FONTS.bodyBold,
    fontSize: 13,
    color: COLORS.bone,
  },
  barPct: {
    fontFamily: FONTS.monoBold,
    fontSize: 12,
  },
  progressTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.plate,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
  },
  barHint: {
    fontFamily: FONTS.mono,
    fontSize: 10,
    color: COLORS.muted,
    lineHeight: 14,
  },
  statGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  statCell: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: COLORS.plate,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    padding: 9,
  },
  statBig: {
    fontFamily: FONTS.monoBold,
    fontSize: 13.5,
    color: COLORS.bone,
    marginTop: 3,
  },
  modelTag: {
    backgroundColor: COLORS.plate,
    borderWidth: 1,
    borderColor: COLORS.borderHi,
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  modelTagText: {
    fontFamily: FONTS.mono,
    fontSize: 9.5,
    color: COLORS.cyan,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: COLORS.lime,
    borderRadius: 9,
    paddingHorizontal: 11,
    paddingVertical: 8,
  },
  actionBtnText: {
    fontFamily: FONTS.monoBold,
    fontSize: 10,
    color: COLORS.bg,
    letterSpacing: 0.6,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  modelCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: COLORS.plate,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    padding: 10,
  },
  modelCardActive: {
    borderColor: COLORS.lime,
    backgroundColor: COLORS.limeDim,
  },
});
