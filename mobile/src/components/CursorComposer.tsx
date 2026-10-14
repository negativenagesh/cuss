import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
} from 'expo-audio';
import { File as ExpoFile } from 'expo-file-system';
import { ContextUsageSheet } from './ContextUsageSheet';
import { CussKineticSynthBars, CussSmallArtLoader } from './CussArt';
import { FileViewerModal } from './MarkdownRenderer';
import {
  AtSign,
  Brain,
  Check,
  ChevronDown,
  Cpu,
  CussContextRing,
  Eye,
  FileCode2,
  Gauge,
  GitBranch,
  Layers,
  Mic,
  ModeVectorIcon,
  Network,
  RefreshCw,
  Search,
  Send,
  Sparkles,
  SpringButton,
  Square,
  X,
  Zap,
} from './CussIcons';
import { localFiles, localIdeState, localModels, localTranscribe } from '../api/client';
import { CursorPlanEntry, ModelFamily, PromptAttachments, useStore } from '../store';
import { COLORS, ExecutionMode, FONTS, MODE_META } from '../theme';

const ALL_MODES: ExecutionMode[] = ['agent', 'plan', 'ask', 'debug', 'multitask'];
const SLASH_COMMANDS = ['plan', 'review', 'test', 'fix', 'simplify'];
const SUBAGENTS = ['explore', 'debug', 'shell', 'computerUse'];

export interface ComposerSubmitPayload {
  text: string;
  mode: ExecutionMode;
  model: string;
  effort: string;
  context: string;
  fast: boolean;
  thinking: boolean;
  attachments: PromptAttachments;
}

export default function CursorComposer({
  cwd,
  busy = false,
  isRunning = false,
  usedTokens = 0,
  inputTokens = 0,
  outputTokens = 0,
  cacheReadTokens = 0,
  sessionFiles = [],
  sessionTools = [],
  turnCount = 0,
  onSubmit,
  onStop,
  onPressFile,
  submitLabel,
  minInputHeight = 46,
}: {
  cwd?: string;
  busy?: boolean;
  isRunning?: boolean;
  usedTokens?: number;
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  sessionFiles?: string[];
  sessionTools?: string[];
  turnCount?: number;
  onSubmit: (payload: ComposerSubmitPayload) => void | Promise<void>;
  onStop?: () => void;
  onPressFile?: (filePath: string) => void;
  submitLabel?: string;
  minInputHeight?: number;
}) {
  const {
    modelFamilies,
    accountEmail,
    selectedMode,
    selectedModel,
    selectedEffort,
    selectedContext,
    selectedFast,
    selectedThinking,
    ideState,
    setIdeState,
    setModelCatalog,
    setComposerConfig,
  } = useStore();

  const [text, setText] = useState('');
  const [attachedFiles, setAttachedFiles] = useState<string[]>([]);
  const [includeGit, setIncludeGit] = useState(false);
  const [slashCmd, setSlashCmd] = useState<string | undefined>(undefined);
  const [subagents, setSubagents] = useState<string[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<CursorPlanEntry | undefined>(undefined);
  const [sandboxMode, setSandboxMode] = useState(false);
  const [worktreeMode, setWorktreeMode] = useState(false);

  const [modelModalOpen, setModelModalOpen] = useState(false);
  const [contextModalOpen, setContextModalOpen] = useState(false);
  const [usageModalOpen, setUsageModalOpen] = useState(false);
  const [loadingModels, setLoadingModels] = useState(false);
  const [localPreviewFile, setLocalPreviewFile] = useState<string | null>(null);

  function openFilePreview(filePath: string) {
    if (onPressFile) {
      setContextModalOpen(false);
      onPressFile(filePath);
    } else {
      setLocalPreviewFile(filePath);
    }
  }

  // Voice recording state (Cursor realtime-voice-start / ui-voice-waveform parity)
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [recordingVoice, setRecordingVoice] = useState(false);
  const [transcribingVoice, setTranscribingVoice] = useState(false);
  const [voiceSec, setVoiceSec] = useState(0);

  useEffect(() => {
    if (!recordingVoice) {
      setVoiceSec(0);
      return;
    }
    const iv = setInterval(() => setVoiceSec((s) => s + 1), 1000);
    return () => clearInterval(iv);
  }, [recordingVoice]);

  async function handleToggleVoice() {
    if (transcribingVoice) return;
    if (!recordingVoice) {
      try {
        const perm = await requestRecordingPermissionsAsync();
        if (!perm.granted) {
          Alert.alert('Microphone Needed', 'Grant microphone permission to use CUSS voice input.');
          return;
        }
        await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
        await recorder.prepareToRecordAsync();
        recorder.record();
        setRecordingVoice(true);
      } catch (e: any) {
        Alert.alert('Voice Start Failed', e?.message ?? 'Could not start microphone recording');
      }
      return;
    }

    // Stop recording & transcribe on Mac bridge
    setRecordingVoice(false);
    setTranscribingVoice(true);
    try {
      await recorder.stop();
      const uri = recorder.uri;
      if (uri) {
        const file = new ExpoFile(uri);
        const b64 = await file.base64();
        const res = await localTranscribe(b64, 'm4a');
        if (res?.text?.trim()) {
          setText((prev) => (prev ? `${prev} ${res.text.trim()}` : res.text.trim()));
        } else {
          Alert.alert(
            'Voice Recorded',
            'Audio captured, but macOS Speech Recognition returned no text (enable Speech Recognition for Terminal/node on Mac, or use your keyboard mic icon).',
          );
        }
      }
    } catch (e: any) {
      Alert.alert('Voice Transcription Error', e?.message ?? 'Failed to transcribe audio');
    } finally {
      setTranscribingVoice(false);
    }
  }

  const [fileQuery, setFileQuery] = useState('');
  const [workspaceFiles, setWorkspaceFiles] = useState<{ path: string; relativePath: string; size: number }[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);

  const activeFamily: ModelFamily =
    modelFamilies.find((f) => f.id === selectedModel) ?? modelFamilies[0];
  const modeMeta = MODE_META[selectedMode];

  // Fetch live models from Mac CLI on mount
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await localModels(false);
        if (alive && res?.families?.length) {
          setModelCatalog(res.families, res.account?.email);
        }
      } catch {
        /* fallback catalog stays active */
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Load workspace files & IDE state when the @File drawer opens or search query changes
  useEffect(() => {
    if (!contextModalOpen) return;
    localIdeState()
      .then((s) => s && setIdeState(s))
      .catch(() => {});
    if (!cwd?.trim()) return;
    let alive = true;
    setLoadingFiles(true);
    const t = setTimeout(async () => {
      try {
        const res = await localFiles(cwd.trim(), fileQuery);
        if (alive) setWorkspaceFiles(res.files ?? []);
      } catch {
        if (alive) setWorkspaceFiles([]);
      } finally {
        if (alive) setLoadingFiles(false);
      }
    }, 150);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [contextModalOpen, cwd, fileQuery]);

  async function refreshModelsFromMac() {
    setLoadingModels(true);
    try {
      const res = await localModels(true);
      if (res?.families?.length) {
        setModelCatalog(res.families, res.account?.email);
      }
    } catch {
      /* ignore */
    } finally {
      setLoadingModels(false);
    }
  }

  function handleSend() {
    if (!text.trim() || busy) return;
    const payload: ComposerSubmitPayload = {
      text: text.trim(),
      mode: selectedMode,
      model: selectedModel,
      effort: selectedEffort,
      context: selectedContext,
      fast: selectedFast,
      thinking: selectedThinking,
      attachments: {
        files: attachedFiles.length > 0 ? attachedFiles : undefined,
        includeGit: includeGit || undefined,
        slashCommand: slashCmd,
        subagents: subagents.length > 0 ? subagents : undefined,
        planContent: selectedPlan?.content,
        planName: selectedPlan?.name,
        sandbox: sandboxMode || undefined,
        worktree: worktreeMode || undefined,
      },
    };
    setText('');
    setSlashCmd(undefined);
    setSelectedPlan(undefined);
    void onSubmit(payload);
  }

  function toggleFile(relPath: string) {
    setAttachedFiles((prev) =>
      prev.includes(relPath) ? prev.filter((p) => p !== relPath) : [...prev, relPath],
    );
  }

  function toggleSubagent(name: string) {
    setSubagents((prev) =>
      prev.includes(name) ? prev.filter((s) => s !== name) : [...prev, name],
    );
  }

  const hasAttachments =
    attachedFiles.length > 0 ||
    includeGit ||
    Boolean(slashCmd) ||
    subagents.length > 0 ||
    Boolean(selectedPlan) ||
    worktreeMode;

  return (
    <View style={[styles.dockWrap, { borderColor: modeMeta.color }]}>
      {/* Top Mode Selector Strip (Agent / Plan / Ask / Debug / Multitask) */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.modeStrip}
      >
        {ALL_MODES.map((m) => {
          const meta = MODE_META[m];
          const active = selectedMode === m;
          return (
            <SpringButton
              key={m}
              onPress={() => setComposerConfig({ mode: m })}
              style={[
                styles.modeChip,
                active && { backgroundColor: meta.bg, borderColor: meta.color },
              ]}
            >
              <ModeVectorIcon mode={m} size={13} color={active ? meta.color : COLORS.muted} />
              <Text style={[styles.modeChipText, active && { color: meta.color }]}>
                {meta.short}
              </Text>
            </SpringButton>
          );
        })}
      </ScrollView>

      {/* Active Context Pills Row (@files, @git, /command, @subagents) */}
      {hasAttachments ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.contextPillsRow}
        >
          {slashCmd ? (
            <SpringButton style={styles.cmdPill} onPress={() => setSlashCmd(undefined)}>
              <Sparkles size={11} color={COLORS.lime} />
              <Text style={styles.cmdPillText}>/{slashCmd}</Text>
              <X size={11} color={COLORS.lime} />
            </SpringButton>
          ) : null}
          {selectedPlan ? (
            <SpringButton style={styles.cmdPill} onPress={() => setSelectedPlan(undefined)}>
              <Layers size={11} color={COLORS.lime} />
              <Text style={styles.cmdPillText} numberOfLines={1}>
                PLAN: {selectedPlan.name}
              </Text>
              <X size={11} color={COLORS.lime} />
            </SpringButton>
          ) : null}
          {worktreeMode ? (
            <SpringButton style={styles.gitPill} onPress={() => setWorktreeMode(false)}>
              <GitBranch size={11} color={COLORS.amber} />
              <Text style={styles.gitPillText}>--worktree</Text>
              <X size={11} color={COLORS.amber} />
            </SpringButton>
          ) : null}
          {includeGit ? (
            <SpringButton style={styles.gitPill} onPress={() => setIncludeGit(false)}>
              <GitBranch size={11} color={COLORS.amber} />
              <Text style={styles.gitPillText}>@git-status</Text>
              <X size={11} color={COLORS.amber} />
            </SpringButton>
          ) : null}
          {subagents.map((sa) => (
            <SpringButton key={sa} style={styles.subagentPill} onPress={() => toggleSubagent(sa)}>
              <Network size={11} color={COLORS.violet} />
              <Text style={styles.subagentPillText}>@{sa}</Text>
              <X size={11} color={COLORS.violet} />
            </SpringButton>
          ))}
          {attachedFiles.map((f) => (
            <View key={f} style={styles.filePill}>
              <SpringButton
                style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
                onPress={() => openFilePreview(f)}
              >
                <FileCode2 size={11} color={COLORS.cyan} />
                <Text style={styles.filePillText} numberOfLines={1}>
                  @{f}
                </Text>
              </SpringButton>
              <SpringButton hitSlop={6} onPress={() => toggleFile(f)}>
                <X size={11} color={COLORS.cyan} />
              </SpringButton>
            </View>
          ))}
        </ScrollView>
      ) : null}

      {/* Main Prompt Input Box */}
      <TextInput
        style={[styles.input, { minHeight: minInputHeight }]}
        multiline
        placeholder={modeMeta.placeholder}
        placeholderTextColor={COLORS.dim}
        value={text}
        onChangeText={setText}
        editable={!busy}
        blurOnSubmit={false}
      />

      {/* Active Voice Recording Waveform Strip (Cursor ui-voice-waveform parity) */}
      {recordingVoice || transcribingVoice ? (
        <View style={styles.voiceStrip}>
          <CussKineticSynthBars height={16} />
          <Text style={styles.voiceStripText}>
            {transcribingVoice
              ? 'TRANSCRIBING AUDIO ON MAC…'
              : `VOICE WAVEFORM ACTIVE // 00:${String(voiceSec).padStart(2, '0')}`}
          </Text>
          {recordingVoice ? (
            <SpringButton style={styles.voiceStopChip} onPress={handleToggleVoice}>
              <Text style={styles.voiceStopChipText}>FINISH &amp; INSERT</Text>
            </SpringButton>
          ) : (
            <ActivityIndicator size="small" color={COLORS.magenta} />
          )}
        </View>
      ) : null}

      {/* Bottom Cursor Control Deck: @Context + Model/Options Pill + Context Ring + Voice + Send/Stop */}
      <View style={styles.bottomBar}>
        {/* @Context Button */}
        <SpringButton
          style={[styles.iconPillBtn, hasAttachments && styles.iconPillBtnActive]}
          onPress={() => setContextModalOpen(true)}
          tiltOnPress
        >
          <AtSign size={14} color={hasAttachments ? COLORS.cyan : COLORS.bone} strokeWidth={2.3} />
          <Text style={[styles.iconPillLabel, hasAttachments && { color: COLORS.cyan }]}>
            {attachedFiles.length > 0 ? `${attachedFiles.length}` : 'CTX'}
          </Text>
        </SpringButton>

        {/* Model + Effort + Context + Fast + Thinking Picker Pill */}
        <SpringButton
          style={styles.modelTriggerPill}
          onPress={() => setModelModalOpen(true)}
        >
          <Cpu size={13} color={COLORS.lime} strokeWidth={2.2} />
          <Text style={styles.modelTriggerName} numberOfLines={1}>
            {activeFamily?.name ?? selectedModel}
          </Text>
          {selectedEffort && selectedEffort !== 'auto' ? (
            <View style={styles.miniParamBadge}>
              <Text style={styles.miniParamText}>{selectedEffort.toUpperCase()}</Text>
            </View>
          ) : null}
          {selectedContext && selectedContext !== 'auto' ? (
            <View style={[styles.miniParamBadge, { borderColor: COLORS.cyan }]}>
              <Text style={[styles.miniParamText, { color: COLORS.cyan }]}>
                {selectedContext.toUpperCase()}
              </Text>
            </View>
          ) : null}
          {activeFamily?.supportsFast && selectedFast ? (
            <Zap size={12} color={COLORS.amber} fill={COLORS.amber} />
          ) : null}
          {activeFamily?.supportsThinking && selectedThinking ? (
            <Brain size={12} color={COLORS.magenta} />
          ) : null}
          <ChevronDown size={13} color={COLORS.muted} />
        </SpringButton>

        {/* Tappable Circular Context Usage Gauge -> Opens Cursor Context Explorer */}
        <SpringButton
          onPress={() => setUsageModalOpen(true)}
          hitSlop={8}
          tiltOnPress
        >
          <CussContextRing
            usedTokens={usedTokens}
            limitLabel={selectedContext === 'auto' ? '1M' : selectedContext}
            size={26}
          />
        </SpringButton>

        {/* Voice Input Button (Cursor realtime-voice-start parity) */}
        <SpringButton
          style={[
            styles.voiceBtn,
            recordingVoice && { borderColor: COLORS.magenta, backgroundColor: COLORS.magentaDim },
          ]}
          onPress={handleToggleVoice}
          tiltOnPress
        >
          <Mic size={14} color={recordingVoice ? COLORS.magenta : COLORS.cyan} strokeWidth={2.3} />
        </SpringButton>

        {/* Stop button when running */}
        {isRunning && onStop ? (
          <SpringButton style={styles.stopBtn} onPress={onStop} tiltOnPress>
            <Square size={13} color={COLORS.magenta} fill={COLORS.magenta} />
          </SpringButton>
        ) : null}

        {/* Launch / Send Button */}
        <SpringButton
          style={[
            styles.sendBtn,
            { backgroundColor: modeMeta.color },
            (!text.trim() || busy) && { opacity: 0.45 },
          ]}
          disabled={!text.trim() || busy}
          onPress={handleSend}
          tiltOnPress
        >
          {busy ? (
            <ActivityIndicator size="small" color={COLORS.bg} />
          ) : (
            <>
              <Send size={14} color={COLORS.bg} strokeWidth={2.5} />
              {submitLabel ? <Text style={styles.sendBtnLabel}>{submitLabel}</Text> : null}
            </>
          )}
        </SpringButton>
      </View>

      {/* MODAL 1: Cursor Model & 4D Parameter Matrix Sheet */}
      <Modal
        visible={modelModalOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setModelModalOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>MODEL MATRIX</Text>
                <Text style={styles.modalSubtitle}>
                  {accountEmail ? `LOGGED IN // ${accountEmail}` : 'MAC CURSOR ACCOUNT MODELS'}
                </Text>
              </View>
              <View style={styles.modalHeaderActions}>
                <SpringButton style={styles.refreshBtn} onPress={refreshModelsFromMac}>
                  {loadingModels ? (
                    <ActivityIndicator size="small" color={COLORS.lime} />
                  ) : (
                    <RefreshCw size={15} color={COLORS.lime} />
                  )}
                </SpringButton>
                <SpringButton style={styles.closeBtn} onPress={() => setModelModalOpen(false)}>
                  <X size={17} color={COLORS.bone} />
                </SpringButton>
              </View>
            </View>

            {loadingModels ? (
              <CussSmallArtLoader
                variant="inline"
                title="PROBING MAC CURSOR CLI MODELS"
                subtitle="Querying cursor agent --list-models…"
                accentColor={COLORS.lime}
              />
            ) : null}

            {/* 4D Parameter Controls for Selected Model Family */}
            {activeFamily && activeFamily.id !== 'auto' ? (
              <View style={styles.paramMatrixCard}>
                <Text style={styles.paramCardHeading}>
                  PARAMETERS // {activeFamily.name.toUpperCase()}
                </Text>

                {/* Effort Row */}
                {activeFamily.efforts.length > 0 && activeFamily.efforts[0] !== 'auto' ? (
                  <View style={styles.paramBlock}>
                    <View style={styles.paramLabelRow}>
                      <Gauge size={13} color={COLORS.lime} />
                      <Text style={styles.paramLabel}>REASONING EFFORT</Text>
                    </View>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                      <View style={styles.optionChipsRow}>
                        {activeFamily.efforts.map((ef) => {
                          const on = selectedEffort === ef;
                          return (
                            <SpringButton
                              key={ef}
                              style={[styles.paramOptionChip, on && styles.paramOptionChipLime]}
                              onPress={() => setComposerConfig({ effort: ef })}
                            >
                              <Text
                                style={[
                                  styles.paramOptionText,
                                  on && { color: COLORS.bg, fontFamily: FONTS.monoBold },
                                ]}
                              >
                                {ef.toUpperCase()}
                              </Text>
                            </SpringButton>
                          );
                        })}
                      </View>
                    </ScrollView>
                  </View>
                ) : null}

                {/* Context Window Row */}
                {activeFamily.contexts.length > 0 && activeFamily.contexts[0] !== 'auto' ? (
                  <View style={styles.paramBlock}>
                    <View style={styles.paramLabelRow}>
                      <Layers size={13} color={COLORS.cyan} />
                      <Text style={styles.paramLabel}>CONTEXT WINDOW (MAX MODE)</Text>
                    </View>
                    <View style={styles.optionChipsRow}>
                      {activeFamily.contexts.map((ctx) => {
                        const on = selectedContext === ctx;
                        return (
                          <SpringButton
                            key={ctx}
                            style={[styles.paramOptionChip, on && styles.paramOptionChipCyan]}
                            onPress={() => setComposerConfig({ context: ctx })}
                          >
                            <Text
                              style={[
                                styles.paramOptionText,
                                on && { color: COLORS.bg, fontFamily: FONTS.monoBold },
                              ]}
                            >
                              {ctx.toUpperCase()}
                            </Text>
                          </SpringButton>
                        );
                      })}
                    </View>
                  </View>
                ) : null}

                {/* Fast & Thinking Toggles Row */}
                <View style={styles.togglesRow}>
                  {activeFamily.supportsFast ? (
                    <SpringButton
                      style={[
                        styles.toggleSwitchCard,
                        selectedFast && { borderColor: COLORS.amber, backgroundColor: COLORS.amberDim },
                      ]}
                      onPress={() => setComposerConfig({ fast: !selectedFast })}
                    >
                      <Zap
                        size={15}
                        color={selectedFast ? COLORS.amber : COLORS.muted}
                        fill={selectedFast ? COLORS.amber : 'none'}
                      />
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.toggleTitle, selectedFast && { color: COLORS.amber }]}>
                          FAST TURBO
                        </Text>
                        <Text style={styles.toggleSub}>Max token velocity</Text>
                      </View>
                      <Text style={[styles.toggleState, selectedFast && { color: COLORS.amber }]}>
                        {selectedFast ? 'ON' : 'OFF'}
                      </Text>
                    </SpringButton>
                  ) : null}

                  {activeFamily.supportsThinking ? (
                    <SpringButton
                      style={[
                        styles.toggleSwitchCard,
                        selectedThinking && {
                          borderColor: COLORS.magenta,
                          backgroundColor: COLORS.magentaDim,
                        },
                      ]}
                      onPress={() => setComposerConfig({ thinking: !selectedThinking })}
                    >
                      <Brain size={15} color={selectedThinking ? COLORS.magenta : COLORS.muted} />
                      <View style={{ flex: 1 }}>
                        <Text
                          style={[styles.toggleTitle, selectedThinking && { color: COLORS.magenta }]}
                        >
                          THINKING
                        </Text>
                        <Text style={styles.toggleSub}>Chain of thought</Text>
                      </View>
                      <Text
                        style={[styles.toggleState, selectedThinking && { color: COLORS.magenta }]}
                      >
                        {selectedThinking ? 'ON' : 'OFF'}
                      </Text>
                    </SpringButton>
                  ) : null}
                </View>
              </View>
            ) : null}

            {/* Model Families List */}
            <ScrollView style={{ maxHeight: 340 }} contentContainerStyle={{ gap: 8, paddingBottom: 16 }}>
              {modelFamilies.map((fam) => {
                const isSelected = fam.id === selectedModel;
                return (
                  <SpringButton
                    key={fam.id}
                    style={[
                      styles.familyCard,
                      isSelected && { borderColor: COLORS.lime, backgroundColor: COLORS.plateHi },
                    ]}
                    onPress={() => setComposerConfig({ model: fam.id })}
                  >
                    <View style={{ flex: 1 }}>
                      <View style={styles.familyTopRow}>
                        <Text style={[styles.familyName, isSelected && { color: COLORS.lime }]}>
                          {fam.name}
                        </Text>
                        <View style={styles.providerBadge}>
                          <Text style={styles.providerBadgeText}>
                            {fam.provider.toUpperCase()}
                          </Text>
                        </View>
                        {fam.contexts.includes('1m') ? (
                          <View style={[styles.providerBadge, { borderColor: COLORS.cyan }]}>
                            <Text style={[styles.providerBadgeText, { color: COLORS.cyan }]}>
                              1M MAX
                            </Text>
                          </View>
                        ) : null}
                        {fam.supportsFast ? (
                          <Zap size={12} color={COLORS.amber} />
                        ) : null}
                      </View>
                      <Text style={styles.familyTagline}>{fam.tagline}</Text>
                    </View>
                    {isSelected ? <Check size={18} color={COLORS.lime} strokeWidth={2.6} /> : null}
                  </SpringButton>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* MODAL 2: @File, @Git, /Commands & @Subagents Context Drawer */}
      <Modal
        visible={contextModalOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setContextModalOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>CONTEXT &amp; @FILES</Text>
                <Text style={styles.modalSubtitle} numberOfLines={1}>
                  {cwd ? `WORKSPACE // ${cwd}` : 'ATTACH CONTEXT TO PROMPT'}
                </Text>
              </View>
              <SpringButton style={styles.closeBtn} onPress={() => setContextModalOpen(false)}>
                <X size={17} color={COLORS.bone} />
              </SpringButton>
            </View>

            {/* Quick Context Toggles: @Git + Worktree + Sandbox + /Slash Commands */}
            <Text style={styles.sectionMiniHeader}>EXECUTION FLAGS &amp; WORKFLOW DIRECTIVES</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
              <View style={styles.optionChipsRow}>
                <SpringButton
                  style={[
                    styles.paramOptionChip,
                    !sandboxMode && styles.paramOptionChipLime,
                  ]}
                  onPress={() => setSandboxMode((v) => !v)}
                >
                  <Zap size={12} color={!sandboxMode ? COLORS.bg : COLORS.lime} />
                  <Text
                    style={[
                      styles.paramOptionText,
                      !sandboxMode && { color: COLORS.bg, fontFamily: FONTS.monoBold },
                    ]}
                  >
                    {sandboxMode ? 'SANDBOXED' : 'FULL SHELL+MCP (--force)'}
                  </Text>
                </SpringButton>

                <SpringButton
                  style={[
                    styles.paramOptionChip,
                    worktreeMode && styles.paramOptionChipCyan,
                  ]}
                  onPress={() => setWorktreeMode((v) => !v)}
                >
                  <GitBranch size={12} color={worktreeMode ? COLORS.bg : COLORS.cyan} />
                  <Text
                    style={[
                      styles.paramOptionText,
                      worktreeMode && { color: COLORS.bg, fontFamily: FONTS.monoBold },
                    ]}
                  >
                    ISOLATED WORKTREE (-w)
                  </Text>
                </SpringButton>

                <SpringButton
                  style={[
                    styles.paramOptionChip,
                    includeGit && { backgroundColor: COLORS.amber, borderColor: COLORS.amber },
                  ]}
                  onPress={() => setIncludeGit((v) => !v)}
                >
                  <GitBranch size={12} color={includeGit ? COLORS.bg : COLORS.amber} />
                  <Text
                    style={[
                      styles.paramOptionText,
                      includeGit && { color: COLORS.bg, fontFamily: FONTS.monoBold },
                    ]}
                  >
                    @GIT STATUS
                  </Text>
                </SpringButton>

                {SLASH_COMMANDS.map((cmd) => {
                  const on = slashCmd === cmd;
                  return (
                    <SpringButton
                      key={cmd}
                      style={[styles.paramOptionChip, on && styles.paramOptionChipLime]}
                      onPress={() => setSlashCmd(on ? undefined : cmd)}
                    >
                      <Text
                        style={[
                          styles.paramOptionText,
                          on && { color: COLORS.bg, fontFamily: FONTS.monoBold },
                        ]}
                      >
                        /{cmd}
                      </Text>
                    </SpringButton>
                  );
                })}
              </View>
            </ScrollView>

            {/* Saved Cursor Plans (~/.cursor/plans/*.plan.md) */}
            {ideState?.plans && ideState.plans.length > 0 ? (
              <>
                <Text style={styles.sectionMiniHeader}>
                  SAVED CURSOR PLANS (~/.cursor/plans)
                </Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={{ marginBottom: 8 }}
                >
                  <View style={styles.optionChipsRow}>
                    {ideState.plans.slice(0, 8).map((pl) => {
                      const on = selectedPlan?.id === pl.id;
                      return (
                        <SpringButton
                          key={pl.id}
                          style={[styles.paramOptionChip, on && styles.paramOptionChipLime]}
                          onPress={() => setSelectedPlan(on ? undefined : pl)}
                        >
                          <Layers size={11} color={on ? COLORS.bg : COLORS.lime} />
                          <Text
                            style={[
                              styles.paramOptionText,
                              on && { color: COLORS.bg, fontFamily: FONTS.monoBold },
                            ]}
                          >
                            {pl.name}
                          </Text>
                        </SpringButton>
                      );
                    })}
                  </View>
                </ScrollView>
              </>
            ) : null}

            {/* Recently Viewed in Mac IDE (~/.cursor/ide_state.json) */}
            {ideState?.recentFiles && ideState.recentFiles.length > 0 ? (
              <>
                <Text style={styles.sectionMiniHeader}>
                  RECENTLY VIEWED IN MAC CURSOR IDE
                </Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={{ marginBottom: 8 }}
                >
                  <View style={styles.optionChipsRow}>
                    {ideState.recentFiles.slice(0, 8).map((rf) => {
                      const on = attachedFiles.includes(rf.relativePath);
                      return (
                        <SpringButton
                          key={rf.absolutePath}
                          style={[styles.paramOptionChip, on && styles.paramOptionChipCyan]}
                          onPress={() => toggleFile(rf.relativePath)}
                        >
                          <FileCode2 size={11} color={on ? COLORS.bg : COLORS.cyan} />
                          <Text
                            style={[
                              styles.paramOptionText,
                              on && { color: COLORS.bg, fontFamily: FONTS.monoBold },
                            ]}
                          >
                            @{rf.relativePath}
                          </Text>
                        </SpringButton>
                      );
                    })}
                  </View>
                </ScrollView>
              </>
            ) : null}

            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
              <View style={styles.optionChipsRow}>
                {SUBAGENTS.map((sa) => {
                  const on = subagents.includes(sa);
                  return (
                    <SpringButton
                      key={sa}
                      style={[
                        styles.paramOptionChip,
                        on && { backgroundColor: COLORS.violet, borderColor: COLORS.violet },
                      ]}
                      onPress={() => toggleSubagent(sa)}
                    >
                      <Network size={11} color={on ? COLORS.bg : COLORS.violet} />
                      <Text
                        style={[
                          styles.paramOptionText,
                          on && { color: COLORS.bg, fontFamily: FONTS.monoBold },
                        ]}
                      >
                        @{sa}
                      </Text>
                    </SpringButton>
                  );
                })}
              </View>
            </ScrollView>

            {/* @File Search Box */}
            <View style={styles.fileSearchBox}>
              <Search size={15} color={COLORS.cyan} />
              <TextInput
                style={styles.fileSearchInput}
                placeholder="Search Mac workspace files to attach (@file)…"
                placeholderTextColor={COLORS.dim}
                value={fileQuery}
                onChangeText={setFileQuery}
                autoCapitalize="none"
              />
              {loadingFiles ? <ActivityIndicator size="small" color={COLORS.cyan} /> : null}
            </View>

            {loadingFiles ? (
              <CussSmallArtLoader
                variant="inline"
                title="INDEXING MAC WORKSPACE"
                subtitle="Scanning workspace files on Mac…"
                accentColor={COLORS.cyan}
              />
            ) : null}

            <ScrollView style={{ maxHeight: 260 }} contentContainerStyle={{ gap: 6, paddingBottom: 16 }}>
              {workspaceFiles.length === 0 && !loadingFiles ? (
                <Text style={styles.emptyFilesHint}>
                  {cwd
                    ? 'No matching files found in this folder.'
                    : 'Select a Mac project folder first to browse its files.'}
                </Text>
              ) : (
                workspaceFiles.map((f) => {
                  const attached = attachedFiles.includes(f.relativePath);
                  return (
                    <View
                      key={f.path}
                      style={[
                        styles.fileRowCard,
                        attached && { borderColor: COLORS.cyan, backgroundColor: COLORS.cyanDim },
                      ]}
                    >
                      <SpringButton
                        style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}
                        onPress={() => toggleFile(f.relativePath)}
                      >
                        <FileCode2 size={14} color={attached ? COLORS.cyan : COLORS.muted} />
                        <Text
                          style={[styles.fileRowPath, attached && { color: COLORS.cyan }]}
                          numberOfLines={1}
                        >
                          {f.relativePath}
                        </Text>
                        <Text style={styles.fileRowSize}>
                          {f.size > 1024 ? `${(f.size / 1024).toFixed(1)}KB` : `${f.size}B`}
                        </Text>
                        {attached ? <Check size={14} color={COLORS.cyan} /> : null}
                      </SpringButton>

                      <SpringButton
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 4,
                          backgroundColor: COLORS.surface,
                          borderWidth: 1,
                          borderColor: COLORS.lime,
                          borderRadius: 6,
                          paddingHorizontal: 7,
                          paddingVertical: 4,
                        }}
                        onPress={() => openFilePreview(f.relativePath)}
                      >
                        <Eye size={11} color={COLORS.lime} />
                        <Text
                          style={{
                            fontFamily: FONTS.monoBold,
                            fontSize: 8.5,
                            color: COLORS.lime,
                          }}
                        >
                          VIEW
                        </Text>
                      </SpringButton>
                    </View>
                  );
                })
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* MODAL 3: Cursor Context Usage Report & 9-Category Context Explorer */}
      <ContextUsageSheet
        visible={usageModalOpen}
        onClose={() => setUsageModalOpen(false)}
        modelName={activeFamily?.name ?? selectedModel}
        limitLabel={selectedContext === 'auto' ? activeFamily?.defaultContext ?? '1m' : selectedContext}
        inputTokens={inputTokens || usedTokens}
        outputTokens={outputTokens}
        cacheReadTokens={cacheReadTokens}
        attachedFiles={attachedFiles}
        sessionFiles={sessionFiles}
        sessionTools={sessionTools}
        turnCount={turnCount}
        mcpServerNames={
          ideState?.mcpServers?.length
            ? ideState.mcpServers.map((m) => m.name)
            : ['21st', 'headroom', 'rea']
        }
        subagents={subagents}
        onPressFile={openFilePreview}
      />

      {/* Fallback File Viewer Modal when composer is used outside AgentDetailScreen */}
      <FileViewerModal
        visible={Boolean(localPreviewFile)}
        cwd={cwd}
        filePath={localPreviewFile}
        onClose={() => setLocalPreviewFile(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  dockWrap: {
    backgroundColor: COLORS.surface,
    borderWidth: 1.5,
    borderColor: COLORS.lime,
    borderRadius: 16,
    padding: 10,
    gap: 8,
  },
  modeStrip: {
    flexDirection: 'row',
    gap: 6,
    paddingBottom: 2,
  },
  modeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: COLORS.plate,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  modeChipText: {
    fontFamily: FONTS.monoBold,
    fontSize: 10.5,
    color: COLORS.muted,
    letterSpacing: 0.9,
  },
  contextPillsRow: {
    flexDirection: 'row',
    gap: 6,
    paddingVertical: 2,
  },
  filePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.cyanDim,
    borderWidth: 1,
    borderColor: COLORS.cyan,
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
    maxWidth: 180,
  },
  filePillText: {
    fontFamily: FONTS.monoBold,
    fontSize: 10.5,
    color: COLORS.cyan,
  },
  gitPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.amberDim,
    borderWidth: 1,
    borderColor: COLORS.amber,
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  gitPillText: {
    fontFamily: FONTS.monoBold,
    fontSize: 10.5,
    color: COLORS.amber,
  },
  cmdPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.limeDim,
    borderWidth: 1,
    borderColor: COLORS.lime,
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  cmdPillText: {
    fontFamily: FONTS.monoBold,
    fontSize: 10.5,
    color: COLORS.lime,
  },
  subagentPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.violetDim,
    borderWidth: 1,
    borderColor: COLORS.violet,
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  subagentPillText: {
    fontFamily: FONTS.monoBold,
    fontSize: 10.5,
    color: COLORS.violet,
  },
  input: {
    fontFamily: FONTS.body,
    fontSize: 15,
    color: COLORS.bone,
    backgroundColor: COLORS.plate,
    borderRadius: 11,
    paddingHorizontal: 12,
    paddingVertical: 10,
    maxHeight: 130,
    textAlignVertical: 'top',
  },
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  iconPillBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.plate,
    borderWidth: 1,
    borderColor: COLORS.borderHi,
    borderRadius: 9,
    paddingHorizontal: 8,
    paddingVertical: 7,
  },
  iconPillBtnActive: {
    borderColor: COLORS.cyan,
    backgroundColor: COLORS.cyanDim,
  },
  iconPillLabel: {
    fontFamily: FONTS.monoBold,
    fontSize: 10,
    color: COLORS.muted,
  },
  modelTriggerPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: COLORS.plate,
    borderWidth: 1,
    borderColor: COLORS.borderHi,
    borderRadius: 9,
    paddingHorizontal: 9,
    paddingVertical: 7,
  },
  modelTriggerName: {
    flex: 1,
    fontFamily: FONTS.bodyBold,
    fontSize: 12,
    color: COLORS.bone,
  },
  miniParamBadge: {
    borderWidth: 1,
    borderColor: COLORS.lime,
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  miniParamText: {
    fontFamily: FONTS.monoBold,
    fontSize: 8.5,
    color: COLORS.lime,
  },
  stopBtn: {
    backgroundColor: COLORS.magentaDim,
    borderWidth: 1.5,
    borderColor: COLORS.magenta,
    borderRadius: 10,
    padding: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  voiceBtn: {
    backgroundColor: COLORS.plate,
    borderWidth: 1.2,
    borderColor: COLORS.borderHi,
    borderRadius: 10,
    padding: 8.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  voiceStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.magentaDim,
    borderWidth: 1,
    borderColor: COLORS.magenta,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  voiceDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.magenta,
  },
  voiceStripText: {
    flex: 1,
    fontFamily: FONTS.monoBold,
    fontSize: 10,
    color: COLORS.magenta,
    letterSpacing: 0.9,
  },
  voiceStopChip: {
    backgroundColor: COLORS.magenta,
    borderRadius: 6,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  voiceStopChipText: {
    fontFamily: FONTS.monoBold,
    fontSize: 9.5,
    color: COLORS.bone,
  },
  sendBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 10,
    paddingVertical: 9,
    paddingHorizontal: 13,
  },
  sendBtnLabel: {
    fontFamily: FONTS.monoBold,
    fontSize: 11.5,
    color: COLORS.bg,
    letterSpacing: 0.8,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(5, 5, 11, 0.84)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 2,
    borderColor: COLORS.lime,
    padding: 18,
    maxHeight: '88%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  modalTitle: {
    fontFamily: FONTS.mogi,
    fontSize: 22,
    color: COLORS.lime,
    letterSpacing: 0.8,
  },
  modalSubtitle: {
    fontFamily: FONTS.mono,
    fontSize: 10,
    color: COLORS.muted,
    marginTop: 2,
  },
  modalHeaderActions: {
    flexDirection: 'row',
    gap: 8,
  },
  refreshBtn: {
    backgroundColor: COLORS.plate,
    borderWidth: 1,
    borderColor: COLORS.borderHi,
    borderRadius: 10,
    padding: 8,
  },
  closeBtn: {
    backgroundColor: COLORS.plate,
    borderWidth: 1,
    borderColor: COLORS.borderHi,
    borderRadius: 10,
    padding: 8,
  },
  paramMatrixCard: {
    backgroundColor: COLORS.plate,
    borderWidth: 1.5,
    borderColor: COLORS.borderHi,
    borderRadius: 14,
    padding: 12,
    marginBottom: 14,
    gap: 10,
  },
  paramCardHeading: {
    fontFamily: FONTS.monoBold,
    fontSize: 10.5,
    color: COLORS.cyan,
    letterSpacing: 1.2,
  },
  paramBlock: {
    gap: 6,
  },
  paramLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  paramLabel: {
    fontFamily: FONTS.monoBold,
    fontSize: 10,
    color: COLORS.muted,
    letterSpacing: 0.9,
  },
  optionChipsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  paramOptionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.borderHi,
    borderRadius: 8,
    paddingHorizontal: 11,
    paddingVertical: 6,
  },
  paramOptionChipLime: {
    backgroundColor: COLORS.lime,
    borderColor: COLORS.lime,
  },
  paramOptionChipCyan: {
    backgroundColor: COLORS.cyan,
    borderColor: COLORS.cyan,
  },
  paramOptionText: {
    fontFamily: FONTS.mono,
    fontSize: 11,
    color: COLORS.bone,
  },
  togglesRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 2,
  },
  toggleSwitchCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.surface,
    borderWidth: 1.2,
    borderColor: COLORS.borderHi,
    borderRadius: 10,
    padding: 9,
  },
  toggleTitle: {
    fontFamily: FONTS.monoBold,
    fontSize: 10.5,
    color: COLORS.bone,
  },
  toggleSub: {
    fontFamily: FONTS.body,
    fontSize: 10,
    color: COLORS.muted,
  },
  toggleState: {
    fontFamily: FONTS.monoBold,
    fontSize: 10.5,
    color: COLORS.muted,
  },
  familyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.plate,
    borderWidth: 1.2,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: 12,
    gap: 10,
  },
  familyTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    flexWrap: 'wrap',
  },
  familyName: {
    fontFamily: FONTS.bodyBold,
    fontSize: 14.5,
    color: COLORS.bone,
  },
  providerBadge: {
    borderWidth: 1,
    borderColor: COLORS.borderHi,
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  providerBadgeText: {
    fontFamily: FONTS.monoBold,
    fontSize: 8.5,
    color: COLORS.muted,
  },
  familyTagline: {
    fontFamily: FONTS.body,
    fontSize: 12,
    color: COLORS.muted,
    marginTop: 3,
  },
  sectionMiniHeader: {
    fontFamily: FONTS.monoBold,
    fontSize: 10,
    color: COLORS.lime,
    letterSpacing: 1.1,
    marginBottom: 6,
  },
  fileSearchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.plate,
    borderWidth: 1.2,
    borderColor: COLORS.cyan,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 10,
  },
  fileSearchInput: {
    flex: 1,
    fontFamily: FONTS.mono,
    fontSize: 12.5,
    color: COLORS.bone,
  },
  emptyFilesHint: {
    fontFamily: FONTS.body,
    fontSize: 13,
    color: COLORS.muted,
    textAlign: 'center',
    paddingVertical: 20,
  },
  fileRowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.plate,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 9,
    paddingVertical: 9,
    paddingHorizontal: 10,
  },
  fileRowPath: {
    flex: 1,
    fontFamily: FONTS.mono,
    fontSize: 12,
    color: COLORS.bone,
  },
  fileRowSize: {
    fontFamily: FONTS.mono,
    fontSize: 10,
    color: COLORS.muted,
  },
});
