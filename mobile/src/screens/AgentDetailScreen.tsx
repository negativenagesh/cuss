import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import CursorComposer, { ComposerSubmitPayload } from '../components/CursorComposer';
import {
  FileViewerModal,
  looksLikeFilePath,
  MarkdownRenderer,
  ThinkingAccordion,
  ToolCallBlock,
} from '../components/MarkdownRenderer';
import {
  Check,
  ChevronDown,
  Cpu,
  Edit3,
  ExternalLink,
  Eye,
  FileCode2,
  FolderGit2,
  GitBranch,
  Globe,
  Laptop,
  ModeVectorIcon,
  Plus,
  RefreshCw,
  Send,
  Sparkles,
  SpringButton,
  Square,
  Terminal,
  Trash2,
  X,
  Zap,
} from '../components/CussIcons';
import {
  CussCyberOrbLottie,
  CussEmptyArtPoster,
  CussSmallArtLoader,
} from '../components/CussArt';
import {
  agentDetail,
  cancelRun,
  localDelete,
  localDetail,
  localExecShell,
  localGitAction,
  localGitDiff,
  localList,
  localMacScreen,
  localOpenUrlOnMac,
  localPrompt,
  localRename,
  localShowOnMac,
  localStop,
  sendPrompt,
} from '../api/client';
import { LiveSocket } from '../api/live';
import {
  Agent,
  loadDeviceChatItems,
  PromptAttachments,
  saveDeviceChatItems,
  useStore,
} from '../store';
import { COLORS, ExecutionMode, FONTS } from '../theme';

export type StreamItem =
  | {
      id: string;
      kind: 'user';
      text: string;
      mode?: ExecutionMode;
      model?: string;
      effort?: string;
      contextWindow?: string;
      fast?: boolean;
      attachments?: PromptAttachments;
    }
  | { id: string; kind: 'thinking'; text: string }
  | {
      id: string;
      kind: 'assistant';
      text: string;
      durationMs?: number;
      tokensOut?: number;
      isComplete?: boolean;
    }
  | {
      id: string;
      kind: 'tool';
      callId: string;
      toolName: string;
      status: string;
      summary: string;
      details?: string;
    }
  | { id: string; kind: 'result'; text: string; isError?: boolean; tokensOut?: number; durationMs?: number }
  | { id: string; kind: 'status'; text: string };

/**
 * Find the index of the last user prompt in `items`, so all streaming events
 * in the current turn are scoped after `lastUserIdx`.
 */
function findCurrentTurnStart(items: StreamItem[]): number {
  for (let i = items.length - 1; i >= 0; i--) {
    if (items[i].kind === 'user') return i;
  }
  return -1;
}

/**
 * Insert or update the single `assistant` response box for the current turn,
 * keeping it at the end of the turn (after any thinking/tool blocks) so streaming
 * words update in-place inside ONE box and the final answer stays in that SAME box.
 */
function upsertSingleTurnAssistant(
  prev: StreamItem[],
  nextText: string,
  makeId: () => string,
  meta?: { durationMs?: number; tokensOut?: number; isComplete?: boolean },
): StreamItem[] {
  const turnStart = findCurrentTurnStart(prev);
  let existingIdx = -1;
  for (let i = prev.length - 1; i > turnStart; i--) {
    if (prev[i].kind === 'assistant') {
      existingIdx = i;
      break;
    }
  }

  if (existingIdx >= 0) {
    const existing = prev[existingIdx] as Extract<StreamItem, { kind: 'assistant' }>;
    const updatedItem: Extract<StreamItem, { kind: 'assistant' }> = {
      ...existing,
      text: nextText || existing.text,
      durationMs: meta?.durationMs ?? existing.durationMs,
      tokensOut: meta?.tokensOut ?? existing.tokensOut,
      isComplete: meta?.isComplete ?? existing.isComplete,
    };
    // Keep the assistant answer box positioned after any tool/thinking blocks in this turn
    if (existingIdx === prev.length - 1) {
      const copy = [...prev];
      copy[existingIdx] = updatedItem;
      return copy;
    }
    const without = prev.filter((_, idx) => idx !== existingIdx);
    return [...without, updatedItem];
  }

  return [
    ...prev,
    {
      id: makeId(),
      kind: 'assistant',
      text: nextText,
      durationMs: meta?.durationMs,
      tokensOut: meta?.tokensOut,
      isComplete: meta?.isComplete,
    },
  ];
}

/**
 * Insert or update the single collapsible `thinking` block for the current turn,
 * keeping it positioned above any `assistant` response box in the turn.
 */
function upsertSingleTurnThinking(
  prev: StreamItem[],
  deltaText: string,
  makeId: () => string,
): StreamItem[] {
  const turnStart = findCurrentTurnStart(prev);
  let existingIdx = -1;
  for (let i = prev.length - 1; i > turnStart; i--) {
    if (prev[i].kind === 'thinking') {
      existingIdx = i;
      break;
    }
  }

  if (existingIdx >= 0) {
    const existing = prev[existingIdx] as Extract<StreamItem, { kind: 'thinking' }>;
    const copy = [...prev];
    copy[existingIdx] = { ...existing, text: existing.text + deltaText };
    return copy;
  }

  const newThinking: StreamItem = { id: makeId(), kind: 'thinking', text: deltaText };
  // Insert before the turn's assistant item if one already exists
  let assistantIdx = -1;
  for (let i = prev.length - 1; i > turnStart; i--) {
    if (prev[i].kind === 'assistant') {
      assistantIdx = i;
      break;
    }
  }
  if (assistantIdx >= 0) {
    const copy = [...prev];
    copy.splice(assistantIdx, 0, newThinking);
    return copy;
  }
  return [...prev, newThinking];
}

export default function AgentDetailScreen({ route, navigation }: any) {
  const { agent, kind, initialPrompt } = route.params as {
    agent: Agent;
    kind: 'mac' | 'cloud';
    initialPrompt?: string;
  };
  const isMac = kind === 'mac';
  const { setLocalAgents, renameLocalAgentOnDevice, deleteLocalAgentOnDevice } = useStore();

  // Initialize chat items immediately from Android device storage (or seed from initialPrompt if newly spawned)
  const [items, setItems] = useState<StreamItem[]>(() => {
    const saved = loadDeviceChatItems<StreamItem>(agent.id);
    if (saved.length > 0) return saved;
    if (initialPrompt?.trim()) {
      return [
        {
          id: `usr-init-${Date.now()}`,
          kind: 'user',
          text: initialPrompt.trim(),
          mode: agent.mode,
          model: agent.model,
          effort: agent.effort,
          contextWindow: agent.contextWindow,
          fast: agent.fast,
        },
      ];
    }
    return [];
  });
  const [busy, setBusy] = useState(false);
  const [runStatus, setRunStatus] = useState<string>(agent.status ?? 'idle');
  const [inputTokens, setInputTokens] = useState<number>(agent.usage?.inputTokens ?? 0);
  const [outputTokens, setOutputTokens] = useState<number>(agent.usage?.outputTokens ?? 0);
  const [cacheReadTokens, setCacheReadTokens] = useState<number>(agent.usage?.cacheReadTokens ?? 0);
  const [sessionFiles, setSessionFiles] = useState<string[]>([]);
  const [sessionTools, setSessionTools] = useState<string[]>([]);
  const [kbHeight, setKbHeight] = useState(0);

  // Scroll tracking so user can freely scroll up after or during answers
  const isNearBottomRef = useRef(true);
  const [showJumpBottom, setShowJumpBottom] = useState(false);

  // In-app Universal File Viewer modal state
  const [viewingFilePath, setViewingFilePath] = useState<string | null>(null);

  // Git Studio modal state
  const [diffModalOpen, setDiffModalOpen] = useState(false);
  const [loadingDiff, setLoadingDiff] = useState(false);
  const [gitBusy, setGitBusy] = useState(false);
  const [newBranchName, setNewBranchName] = useState('');
  const [commitMessage, setCommitMessage] = useState('');
  const [gitActionOutput, setGitActionOutput] = useState('');
  const [gitDiffData, setGitDiffData] = useState<{
    branch?: string;
    branches?: string[];
    changedFiles: { status: string; path: string }[];
    statSummary: string;
    diff: string;
  } | null>(null);

  // Interactive Mac Shell & GCP OAuth modal state
  const [shellModalOpen, setShellModalOpen] = useState(false);
  const [shellCmd, setShellCmd] = useState('');
  const [shellRunning, setShellRunning] = useState(false);
  const [shellOutput, setShellOutput] = useState('');
  const [shellUrls, setShellUrls] = useState<string[]>([]);

  // Live Mac Screen / Browser Peek modal state
  const [peekModalOpen, setPeekModalOpen] = useState(false);
  const [peekLoading, setPeekLoading] = useState(false);
  const [peekData, setPeekData] = useState<{
    ok: boolean;
    frontApp: string;
    imageBase64?: string;
    capturedAt: string;
    hint?: string;
  } | null>(null);

  // Rename Chat modal state
  const [renameModalOpen, setRenameModalOpen] = useState(false);
  const [renameText, setRenameText] = useState(agent.name || '');

  const listRef = useRef<FlatList<StreamItem>>(null);
  const liveRef = useRef<LiveSocket | null>(null);
  const seqRef = useRef(Date.now());
  const receivedAnyRef = useRef(false);
  const firstServerEventRef = useRef(true);
  const assistantDeltaRef = useRef('');

  const nextId = (prefix = 'it') => `${prefix}-${seqRef.current++}`;

  // Header Rename & Delete buttons (Cursor chat header parity)
  useEffect(() => {
    if (!isMac) return;
    navigation.setOptions({
      headerRight: () => (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <SpringButton
            style={styles.headerActionBtn}
            onPress={() => {
              setRenameText(agent.name || '');
              setRenameModalOpen(true);
            }}
          >
            <Edit3 size={13} color={COLORS.cyan} />
          </SpringButton>
          <SpringButton style={styles.headerActionBtn} onPress={handleDeleteChat}>
            <Trash2 size={13} color={COLORS.magenta} />
          </SpringButton>
        </View>
      ),
    });
  }, [navigation, isMac, agent.id, agent.name]);

  // Persist chat items onto the Android device whenever `items` updates
  useEffect(() => {
    if (items.length > 0) {
      saveDeviceChatItems(agent.id, items);
    }
  }, [agent.id, items]);

  // Keyboard listener so the composer lifts smoothly above the keyboard
  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const s1 = Keyboard.addListener(showEvt, (e) => {
      setKbHeight(e.endCoordinates.height);
      if (isNearBottomRef.current) {
        setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 120);
      }
    });
    const s2 = Keyboard.addListener(hideEvt, () => setKbHeight(0));
    return () => {
      s1.remove();
      s2.remove();
    };
  }, []);

  function ingestLocalEvent(r: any) {
    if (!r || typeof r !== 'object') return;
    firstServerEventRef.current = false;

    if (r.type === 'cuss_user_turn' || r.type === 'user') {
      setRunStatus('running');
      assistantDeltaRef.current = '';
      if (r.attachments?.files?.length) {
        setSessionFiles((prev) => Array.from(new Set([...prev, ...r.attachments.files])));
      }
      const rawUserText =
        r.type === 'cuss_user_turn'
          ? String(r.text ?? '')
          : (r.message?.content ?? [])
              .filter((c: any) => c?.type === 'text')
              .map((c: any) => String(c.text ?? ''))
              .join('\n');
      // Strip synthetic [MODE: ...] / [ATTACHED FILES ...] prefix if present on raw CLI user event
      const turnText = rawUserText.replace(/^(?:\[[\s\S]*?\]\s*)+/, '').trim() || rawUserText.trim();
      if (!turnText) return;

      setItems((prev) => {
        // Deduplicate if this user message is already present in the current or recent turn
        const existingIdx = prev.findIndex(
          (it) => it.kind === 'user' && it.text.trim() === turnText.trim(),
        );
        if (existingIdx >= 0) {
          const existing = prev[existingIdx] as Extract<StreamItem, { kind: 'user' }>;
          const copy = [...prev];
          copy[existingIdx] = {
            ...existing,
            mode: r.mode ?? existing.mode,
            model: r.model ?? existing.model,
            effort: r.effort ?? existing.effort,
            contextWindow: r.contextWindow ?? existing.contextWindow,
            fast: r.fast ?? existing.fast,
            attachments: r.attachments ?? existing.attachments,
          };
          return copy;
        }
        return [
          ...prev,
          {
            id: nextId('usr'),
            kind: 'user',
            text: turnText,
            mode: r.mode,
            model: r.model,
            effort: r.effort,
            contextWindow: r.contextWindow,
            fast: r.fast,
            attachments: r.attachments,
          },
        ];
      });
      return;
    }

    if (r.type === 'system' && r.subtype === 'init') {
      setRunStatus('running');
      return;
    }

    if (r.type === 'thinking' && r.subtype === 'delta' && r.text) {
      const chunk = String(r.text);
      setItems((prev) => upsertSingleTurnThinking(prev, chunk, () => nextId('thk')));
      return;
    }

    if (r.type === 'assistant') {
      const rawChunk = (r.message?.content ?? [])
        .filter((c: any) => c?.type === 'text')
        .map((c: any) => String(c.text ?? ''))
        .join('');
      if (!rawChunk) return;

      const isDelta = typeof r.timestamp_ms === 'number';
      if (isDelta) {
        assistantDeltaRef.current += rawChunk;
        const liveText = assistantDeltaRef.current;
        setItems((prev) => upsertSingleTurnAssistant(prev, liveText, () => nextId('ast')));
      } else {
        const finalText = rawChunk.trim();
        if (!finalText) return;
        assistantDeltaRef.current = finalText;
        setItems((prev) =>
          upsertSingleTurnAssistant(prev, finalText, () => nextId('ast'), { isComplete: true }),
        );
      }
      return;
    }

    if (r.type === 'tool_call') {
      const callId = String(r.call_id ?? nextId('tc'));
      const inner = r.tool_call ?? {};
      const toolName = Object.keys(inner)[0] ?? 'tool';
      const payload = inner[toolName] ?? {};
      const args = payload.args ?? {};
      const summary = String(
        args.command ?? args.path ?? args.file_path ?? args.filePath ?? args.pattern ?? args.url ?? toolName,
      );
      const outText =
        payload?.result?.success?.interleavedOutput ??
        payload?.result?.success?.stdout ??
        payload?.result?.success?.content;
      const details = outText
        ? `OUTPUT:\n${String(outText).trim()}\n\nARGS:\n${JSON.stringify(args, null, 2)}`
        : JSON.stringify(args, null, 2);
      const status = String(r.subtype ?? 'running');

      // Reset delta buffer when a new tool starts so post-tool final answer cleanly replaces into the single assistant box
      if (status === 'started') {
        assistantDeltaRef.current = '';
      }

      const cleanToolName = toolName.replace(/ToolCall$/i, '');
      setSessionTools((prev) => (prev.includes(cleanToolName) ? prev : [...prev, cleanToolName]));
      const fileCandidate = args.path ?? args.file_path ?? args.filePath;
      if (typeof fileCandidate === 'string' && looksLikeFilePath(fileCandidate)) {
        setSessionFiles((prev) => (prev.includes(fileCandidate) ? prev : [...prev, fileCandidate]));
      }

      setItems((prev) => {
        const idx = prev.findIndex((it) => it.kind === 'tool' && it.callId === callId);
        if (idx >= 0) {
          const updated = [...prev];
          updated[idx] = {
            ...(updated[idx] as any),
            status,
            summary,
            details,
          };
          return updated;
        }
        const newTool: StreamItem = {
          id: nextId('tool'),
          kind: 'tool',
          callId,
          toolName,
          status,
          summary,
          details,
        };
        // Insert before the turn's single assistant box if one exists so tools stay above the final answer
        const turnStart = findCurrentTurnStart(prev);
        let assistantIdx = -1;
        for (let i = prev.length - 1; i > turnStart; i--) {
          if (prev[i].kind === 'assistant') {
            assistantIdx = i;
            break;
          }
        }
        if (assistantIdx >= 0) {
          const copy = [...prev];
          copy.splice(assistantIdx, 0, newTool);
          return copy;
        }
        return [...prev, newTool];
      });
      return;
    }

    if (r.type === 'result') {
      setRunStatus(r.is_error ? 'error' : 'done');
      if (r.usage) {
        const inTok = Number(r.usage.inputTokens ?? 0);
        const outTok = Number(r.usage.outputTokens ?? 0);
        const cacheTok = Number(r.usage.cacheReadTokens ?? 0);
        if (inTok > 0) setInputTokens(inTok);
        if (outTok > 0) setOutputTokens(outTok);
        if (cacheTok > 0) setCacheReadTokens(cacheTok);
      }
      const resultText = typeof r.result === 'string' ? r.result.trim() : '';
      if (r.is_error) {
        setItems((prev) => [
          ...prev,
          {
            id: nextId('res'),
            kind: 'result',
            text: resultText || 'Turn failed',
            isError: true,
            tokensOut: r.usage?.outputTokens,
            durationMs: r.duration_ms,
          },
        ]);
      } else {
        // Attach completion telemetry directly to the single assistant answer box (never create a 2nd answer box!)
        setItems((prev) =>
          upsertSingleTurnAssistant(
            prev,
            resultText || assistantDeltaRef.current,
            () => nextId('ast'),
            {
              durationMs: r.duration_ms,
              tokensOut: r.usage?.outputTokens,
              isComplete: true,
            },
          ),
        );
      }
      return;
    }

    if (r.type === 'status') {
      setRunStatus(String(r.status ?? 'idle'));
      return;
    }

    if (r.type === 'error' || r.type === 'stderr') {
      const txt = String(r.text ?? '').trim();
      if (!txt) return;
      setItems((prev) => [...prev, { id: nextId('err'), kind: 'status', text: txt }]);
    }
  }

  useEffect(() => {
    let cancelled = false;
    firstServerEventRef.current = true;
    receivedAnyRef.current = false;

    (async () => {
      if (isMac) {
        const live = new LiveSocket(
          (msg) => {
            if (msg.type === 'local:event' && msg.agentId === agent.id) {
              // Ignore standalone status heartbeats if no real transcript events arrived so device cache stays intact
              if (firstServerEventRef.current && msg.raw?.type === 'status') {
                firstServerEventRef.current = false;
                setRunStatus(String(msg.raw.status ?? 'idle'));
                return;
              }
              receivedAnyRef.current = true;
              ingestLocalEvent(msg.raw);
            }
          },
          () => live.send({ type: 'local:subscribe', agentId: agent.id }),
        );
        live.connect();
        liveRef.current = live;

        // Fallback if WebSocket hasn't replayed within 1.2s
        setTimeout(() => {
          if (cancelled || receivedAnyRef.current) return;
          localDetail(agent.id)
            .then((d) => {
              if (!cancelled && !receivedAnyRef.current && d?.events?.length) {
                receivedAnyRef.current = true;
                for (const ev of d.events) ingestLocalEvent(ev.raw);
              }
            })
            .catch(() => {
              /* offline: saved Android device items remain displayed */
            });
        }, 1200);
        return;
      }

      // Cloud SSE stream
      let runId = agent.latestRunId;
      if (!runId) {
        try {
          const d = await agentDetail(agent.id);
          runId = d.agent?.latestRunId ?? d.latestRun?.id;
        } catch {
          /* ignore */
        }
      }
      if (!runId || cancelled) return;
      const live = new LiveSocket(
        (msg) => {
          if (msg.type === 'run:event' && msg.agentId === agent.id) {
            try {
              const data = JSON.parse(msg.data);
              if (msg.event === 'assistant' && data.text) {
                setItems((prev) =>
                  upsertSingleTurnAssistant(prev, String(data.text), () => nextId('ast')),
                );
              } else if (msg.event === 'thinking' && data.text) {
                setItems((prev) =>
                  upsertSingleTurnThinking(prev, String(data.text), () => nextId('thk')),
                );
              } else if (msg.event === 'tool_call') {
                setItems((prev) => [
                  ...prev,
                  {
                    id: nextId('tool'),
                    kind: 'tool',
                    callId: data.callId ?? nextId('c'),
                    toolName: data.name ?? 'tool',
                    status: data.status ?? 'running',
                    summary: data.name ?? 'tool',
                    details: data.args ? JSON.stringify(data.args, null, 2) : undefined,
                  },
                ]);
              }
            } catch {
              /* ignore */
            }
          }
        },
        () => live.send({ type: 'run:subscribe', agentId: agent.id, runId }),
      );
      live.connect();
      liveRef.current = live;
    })();

    return () => {
      cancelled = true;
      liveRef.current?.send(isMac ? { type: 'local:unsubscribe' } : { type: 'run:unsubscribe' });
      liveRef.current?.close();
    };
  }, [agent.id]);

  async function handleFollowup(payload: ComposerSubmitPayload) {
    setBusy(true);
    setRunStatus('running');
    isNearBottomRef.current = true;
    firstServerEventRef.current = false;
    assistantDeltaRef.current = '';

    // Optimistically append the user prompt immediately so the Waiting-for-First-Token small art loader appears at t=0ms
    setItems((prev) => [
      ...prev,
      {
        id: nextId('usr'),
        kind: 'user',
        text: payload.text,
        mode: payload.mode,
        model: payload.model,
        effort: payload.effort,
        contextWindow: payload.context,
        fast: payload.fast,
        attachments: payload.attachments,
      },
    ]);
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);

    try {
      if (isMac) {
        await localPrompt(agent.id, payload.text, {
          mode: payload.mode,
          model: payload.model,
          effort: payload.effort,
          context: payload.context,
          fast: payload.fast,
          thinking: payload.thinking,
          attachments: payload.attachments,
        });
      } else {
        await sendPrompt(agent.id, payload.text);
      }
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 140);
    } catch (e: any) {
      setRunStatus('idle');
      if (e?.code === 'agent_busy') {
        Alert.alert('Agent Busy', 'Wait for the current turn to finish or stop it.');
      } else if (e?.code === 'cli_login_required') {
        Alert.alert('Login Required', 'Run `cursor agent login` once on your Mac.');
      } else {
        Alert.alert('Send Failed', e?.message ?? 'Unknown error');
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleStop() {
    try {
      if (isMac) await localStop(agent.id);
      else await cancelRun(agent.id);
      setRunStatus('idle');
    } catch (e: any) {
      Alert.alert('Stop Failed', e?.message ?? 'Unknown error');
    }
  }

  async function handleShowOnMac() {
    try {
      await localShowOnMac(agent.id);
    } catch (e: any) {
      Alert.alert('Mac Terminal Error', e?.message ?? 'Could not open Terminal on Mac');
    }
  }

  async function handleOpenUrlOnMac(url: string) {
    try {
      await localOpenUrlOnMac(url);
      Alert.alert('Opened on Mac', 'URL launched in your Mac default browser. Tap MAC PEEK to view.');
    } catch (e: any) {
      Alert.alert('Open URL Failed', e?.message ?? 'Could not open browser on Mac');
    }
  }

  async function handleOpenGitDiff() {
    if (!agent.cwd) return;
    setDiffModalOpen(true);
    setLoadingDiff(true);
    try {
      const res = await localGitDiff(agent.cwd);
      setGitDiffData(res);
    } catch {
      setGitDiffData({ branches: [], changedFiles: [], statSummary: '', diff: '' });
    } finally {
      setLoadingDiff(false);
    }
  }

  async function handleGitOperation(
    type: 'checkout' | 'create-branch' | 'commit' | 'push' | 'pull',
    branch?: string,
    message?: string,
  ) {
    if (!agent.cwd) return;
    setGitBusy(true);
    setGitActionOutput('');
    try {
      const res = await localGitAction({ cwd: agent.cwd, type, branch, message });
      setGitActionOutput(res.output || (res.ok ? 'Git operation succeeded' : 'Git operation failed'));
      if (type === 'create-branch') setNewBranchName('');
      if (type === 'commit') setCommitMessage('');
      const refreshed = await localGitDiff(agent.cwd);
      setGitDiffData(refreshed);
    } catch (e: any) {
      setGitActionOutput(e?.message ?? 'Git command failed');
    } finally {
      setGitBusy(false);
    }
  }

  async function handleExecShellCommand(cmdToRun?: string) {
    const command = (cmdToRun ?? shellCmd).trim();
    if (!command) return;
    setShellRunning(true);
    try {
      const res = await localExecShell(agent.cwd ?? '', command);
      setShellOutput(res.output || `(exit code ${res.exitCode})`);
      setShellUrls(res.urls ?? []);
    } catch (e: any) {
      setShellOutput(e?.message ?? 'Command execution failed');
    } finally {
      setShellRunning(false);
    }
  }

  async function handleOpenMacPeek() {
    setPeekModalOpen(true);
    setPeekLoading(true);
    try {
      const res = await localMacScreen();
      setPeekData(res);
    } catch (e: any) {
      setPeekData({
        ok: false,
        frontApp: 'macOS',
        capturedAt: new Date().toISOString(),
        hint: e?.message ?? 'Could not capture Mac display',
      });
    } finally {
      setPeekLoading(false);
    }
  }

  async function handleRenameSave() {
    const nextTitle = renameText.trim();
    if (!nextTitle) return;
    renameLocalAgentOnDevice(agent.id, nextTitle);
    navigation.setOptions({ title: nextTitle.toUpperCase() });
    setRenameModalOpen(false);
    try {
      await localRename(agent.id, nextTitle);
      const updated = await localList(false);
      if (Array.isArray(updated?.agents)) setLocalAgents(updated.agents);
    } catch {
      /* saved on Android device */
    }
  }

  function handleDeleteChat() {
    Alert.alert(
      'Delete Chat Session',
      `Delete "${agent.name || agent.id}" from CUSS and Android device storage?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            deleteLocalAgentOnDevice(agent.id);
            try {
              await localDelete(agent.id);
              const updated = await localList(false);
              if (Array.isArray(updated?.agents)) setLocalAgents(updated.agents);
            } catch {
              /* deleted locally on device */
            }
            navigation.goBack();
          },
        },
      ],
    );
  }

  const isRunning = runStatus === 'running' || runStatus === 'ACTIVE';
  const folderShort = agent.cwd ? agent.cwd.split('/').filter(Boolean).pop() : undefined;
  const usedTokens = inputTokens + cacheReadTokens;
  const turnCount = items.filter((it) => it.kind === 'user').length;
  const lastUserIdx = findCurrentTurnStart(items);
  const hasStartedFirstToken =
    lastUserIdx >= 0
      ? items
          .slice(lastUserIdx + 1)
          .some((it) => it.kind === 'thinking' || it.kind === 'tool' || it.kind === 'assistant')
      : items.some((it) => it.kind === 'thinking' || it.kind === 'tool' || it.kind === 'assistant');

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
    >
      {/* Top Telemetry, Git Studio, Shell/GCP & Mac Screen Peek Bar */}
      <View style={styles.topHudBar}>
        <View style={styles.hudStatusGroup}>
          {isRunning ? <CussCyberOrbLottie size={24} /> : <View style={styles.idleDot} />}
          <View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <Text style={styles.hudStatusText}>{runStatus.toUpperCase()}</Text>
              <View style={styles.deviceSavedPill}>
                <Text style={styles.deviceSavedText}>SAVED</Text>
              </View>
            </View>
            {folderShort ? (
              <View style={styles.hudFolderRow}>
                <FolderGit2 size={10} color={COLORS.muted} />
                <Text style={styles.hudFolderText} numberOfLines={1}>
                  {folderShort}
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.hudActions}
        >
          {isMac && agent.cwd ? (
            <SpringButton style={styles.gitDiffBtn} onPress={handleOpenGitDiff} tiltOnPress>
              <GitBranch size={12} color={COLORS.lime} />
              <Text style={styles.gitDiffBtnText}>GIT</Text>
            </SpringButton>
          ) : null}
          {isMac ? (
            <SpringButton
              style={styles.macTermBtn}
              onPress={() => setShellModalOpen(true)}
              tiltOnPress
            >
              <Terminal size={12} color={COLORS.cyan} />
              <Text style={styles.macTermBtnText}>SHELL / GCP</Text>
            </SpringButton>
          ) : null}
          {isMac ? (
            <SpringButton style={styles.peekBtn} onPress={handleOpenMacPeek} tiltOnPress>
              <Laptop size={12} color={COLORS.amber} />
              <Text style={styles.peekBtnText}>MAC PEEK</Text>
            </SpringButton>
          ) : null}
          {isRunning ? (
            <SpringButton style={styles.hudStopBtn} onPress={handleStop}>
              <Square size={11} color={COLORS.magenta} fill={COLORS.magenta} />
              <Text style={styles.hudStopText}>STOP</Text>
            </SpringButton>
          ) : null}
        </ScrollView>
      </View>

      {/* Parsed Stream Feed (scrolls freely up & down!) */}
      <View style={{ flex: 1 }}>
        <FlatList
          ref={listRef}
          data={items}
          keyExtractor={(it) => it.id}
          contentContainerStyle={styles.feedContent}
          keyboardShouldPersistTaps="handled"
          scrollEventThrottle={16}
          onScroll={(e) => {
            const { contentOffset, layoutMeasurement, contentSize } = e.nativeEvent;
            const distFromBottom =
              contentSize.height - (contentOffset.y + layoutMeasurement.height);
            const nearBottom = distFromBottom < 110;
            isNearBottomRef.current = nearBottom;
            setShowJumpBottom(
              !nearBottom && contentSize.height > layoutMeasurement.height + 140,
            );
          }}
          onContentSizeChange={() => {
            // ONLY auto-scroll during active streaming when the user hasn't scrolled up!
            if (isRunning && isNearBottomRef.current) {
              listRef.current?.scrollToEnd({ animated: false });
            }
          }}
          renderItem={({ item }) => {
            if (item.kind === 'user') {
              return (
                <View style={styles.userBubble}>
                  <View style={styles.userMetaRow}>
                    <Text style={styles.userRoleTag}>YOU</Text>
                    {item.mode ? (
                      <View style={styles.userBadge}>
                        <ModeVectorIcon mode={item.mode} size={10} />
                        <Text style={styles.userBadgeText}>{item.mode.toUpperCase()}</Text>
                      </View>
                    ) : null}
                    {item.model ? (
                      <View style={styles.userBadge}>
                        <Cpu size={10} color={COLORS.cyan} />
                        <Text style={[styles.userBadgeText, { color: COLORS.cyan }]}>
                          {item.model}
                        </Text>
                      </View>
                    ) : null}
                    {item.effort && item.effort !== 'auto' ? (
                      <View style={styles.userBadge}>
                        <Text style={styles.userBadgeText}>{item.effort.toUpperCase()}</Text>
                      </View>
                    ) : null}
                    {item.fast ? <Zap size={11} color={COLORS.amber} fill={COLORS.amber} /> : null}
                  </View>

                  {item.attachments?.files?.length ? (
                    <View style={styles.userFilesRow}>
                      {item.attachments.files.map((f) => (
                        <SpringButton
                          key={f}
                          style={styles.userFileChip}
                          onPress={() => setViewingFilePath(f)}
                        >
                          <FileCode2 size={10} color={COLORS.cyan} />
                          <Text style={styles.userFileChipText}>@{f}</Text>
                          <Eye size={10} color={COLORS.lime} />
                        </SpringButton>
                      ))}
                    </View>
                  ) : null}

                  <Text selectable style={styles.userPromptText}>
                    {item.text}
                  </Text>
                </View>
              );
            }

            if (item.kind === 'thinking') {
              return <ThinkingAccordion text={item.text} />;
            }

            if (item.kind === 'tool') {
              return (
                <ToolCallBlock
                  toolName={item.toolName}
                  status={item.status}
                  summary={item.summary}
                  details={item.details}
                  onOpenOnMac={handleOpenUrlOnMac}
                  onPressFile={(fp) => setViewingFilePath(fp)}
                />
              );
            }

            if (item.kind === 'assistant') {
              return (
                <View style={styles.assistantCard}>
                  <View style={styles.assistantHeader}>
                    <Sparkles size={12} color={COLORS.lime} />
                    <Text style={styles.assistantHeaderLabel}>
                      {isRunning && !item.isComplete
                        ? 'CUSS // STREAMING RESPONSE…'
                        : 'CUSS // FINAL RESPONSE'}
                    </Text>
                    <View style={{ flex: 1 }} />
                    {item.durationMs || item.tokensOut ? (
                      <Text style={styles.resultTelemetry}>
                        {item.durationMs ? `${(item.durationMs / 1000).toFixed(1)}s` : ''}
                        {item.tokensOut ? ` · ${item.tokensOut} TOK` : ''}
                      </Text>
                    ) : null}
                  </View>
                  <MarkdownRenderer
                    content={item.text}
                    onPressFile={(fp) => setViewingFilePath(fp)}
                  />
                </View>
              );
            }

            if (item.kind === 'result') {
              return (
                <View
                  style={[
                    styles.resultBanner,
                    item.isError && { borderColor: COLORS.magenta },
                  ]}
                >
                  <View style={styles.resultTopRow}>
                    <Text
                      style={[
                        styles.resultBadgeText,
                        { color: item.isError ? COLORS.magenta : COLORS.lime },
                      ]}
                    >
                      {item.isError ? 'TURN ERROR' : 'TURN COMPLETED'}
                    </Text>
                    <Text style={styles.resultTelemetry}>
                      {item.durationMs ? `${(item.durationMs / 1000).toFixed(1)}s` : ''}
                      {item.tokensOut ? ` · ${item.tokensOut} OUT TOK` : ''}
                    </Text>
                  </View>
                  {item.isError && item.text ? (
                    <Text style={styles.errorResultBody}>{item.text}</Text>
                  ) : null}
                </View>
              );
            }

            return (
              <View style={styles.statusRow}>
                <Text style={styles.statusRowText}>{item.text}</Text>
              </View>
            );
          }}
          ListEmptyComponent={
            isRunning || busy ? (
              <CussSmallArtLoader
                variant="card"
                title="AWAITING FIRST TOKEN"
                stages={[
                  'DISPATCHING TO MAC CURSOR CLI…',
                  'LOCKING WORKSPACE & @FILE CONTEXT…',
                  'WARMING MODEL REASONING ENGINE…',
                  'SYNTHESIZING FIRST TOKEN…',
                ]}
                accentColor={COLORS.lime}
              />
            ) : (
              <CussEmptyArtPoster
                tag="STREAM // STANDBY"
                title="READY FOR INSTRUCTION"
                subtitle="Pick a mode (Agent, Plan, Ask, Debug, Multi), select your model & effort below, or attach @files to start."
              />
            )
          }
          ListFooterComponent={
            items.length > 0 && (isRunning || busy) ? (
              !hasStartedFirstToken ? (
                <CussSmallArtLoader
                  variant="card"
                  title="AWAITING FIRST TOKEN"
                  stages={[
                    'DISPATCHING TO MAC CURSOR CLI…',
                    'LOADING WORKSPACE & @FILE CONTEXT…',
                    'WARMING MODEL REASONING ENGINE…',
                    'SYNTHESIZING FIRST TOKEN…',
                  ]}
                  accentColor={COLORS.lime}
                />
              ) : (
                <CussSmallArtLoader
                  variant="inline"
                  title="MAC AGENT SYNTHESIZING"
                  stages={[
                    'STREAMING LIVE TOKENS & TELEMETRY…',
                    'EXECUTING WORKSPACE TOOLS…',
                    'KEEPING MAC UMBILICAL ACTIVE…',
                  ]}
                  accentColor={COLORS.cyan}
                />
              )
            ) : null
          }
        />

        {/* Floating Jump-to-Bottom Pill when scrolled up */}
        {showJumpBottom ? (
          <SpringButton
            style={styles.jumpBottomFab}
            onPress={() => {
              isNearBottomRef.current = true;
              setShowJumpBottom(false);
              listRef.current?.scrollToEnd({ animated: true });
            }}
          >
            <ChevronDown size={14} color={COLORS.bg} strokeWidth={2.8} />
            <Text style={styles.jumpBottomText}>LATEST</Text>
          </SpringButton>
        ) : null}
      </View>

      {/* Bottom Pinned Composer Dock (always stays at the very bottom!) */}
      <View style={styles.composerContainer}>
        <CursorComposer
          cwd={agent.cwd}
          busy={busy}
          isRunning={isRunning}
          usedTokens={usedTokens}
          inputTokens={inputTokens}
          outputTokens={outputTokens}
          cacheReadTokens={cacheReadTokens}
          sessionFiles={sessionFiles}
          sessionTools={sessionTools}
          turnCount={turnCount}
          onSubmit={handleFollowup}
          onStop={handleStop}
          onPressFile={(fp) => setViewingFilePath(fp)}
        />
      </View>

      {/* Universal In-App File Viewer & Renderer Modal (renders ANY clicked file!) */}
      <FileViewerModal
        visible={Boolean(viewingFilePath)}
        cwd={agent.cwd}
        filePath={viewingFilePath}
        onClose={() => setViewingFilePath(null)}
      />

      {/* MODAL: Full Workspace Git Studio (Branches, Commit, Push, Pull, Changed Files & Diff) */}
      <Modal
        visible={diffModalOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setDiffModalOpen(false)}
      >
        <View style={styles.diffModalBackdrop}>
          <View style={styles.diffModalSheet}>
            <View style={styles.diffModalHeader}>
              <View>
                <Text style={styles.diffModalTitle}>GIT STUDIO // WORKSPACE</Text>
                <Text style={styles.diffModalSub} numberOfLines={1}>
                  {gitDiffData?.branch ? `BRANCH // ${gitDiffData.branch} · ` : ''}
                  {agent.cwd ?? ''}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <SpringButton style={styles.diffCloseBtn} onPress={handleOpenGitDiff}>
                  <RefreshCw size={15} color={COLORS.lime} />
                </SpringButton>
                <SpringButton style={styles.diffCloseBtn} onPress={() => setDiffModalOpen(false)}>
                  <X size={17} color={COLORS.bone} />
                </SpringButton>
              </View>
            </View>

            {loadingDiff ? (
              <CussSmallArtLoader
                variant="card"
                title="SCANNING GIT WORKSPACE"
                subtitle="Reading branches, uncommitted files & unified diff…"
                accentColor={COLORS.lime}
              />
            ) : (
              <ScrollView contentContainerStyle={{ gap: 10, paddingBottom: 24 }}>
                {gitBusy ? (
                  <CussSmallArtLoader
                    variant="inline"
                    title="RUNNING GIT OPERATION ON MAC"
                    subtitle="Updating repository state…"
                    accentColor={COLORS.cyan}
                  />
                ) : null}
                {/* Branch Switcher + Create Branch */}
                {gitDiffData?.branches && gitDiffData.branches.length > 0 ? (
                  <>
                    <Text style={styles.diffSectionLabel}>SWITCH GIT BRANCH</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                      <View style={{ flexDirection: 'row', gap: 6 }}>
                        {gitDiffData.branches.map((br) => {
                          const active = br === gitDiffData.branch;
                          return (
                            <SpringButton
                              key={br}
                              style={[
                                styles.branchChip,
                                active && { backgroundColor: COLORS.lime, borderColor: COLORS.lime },
                              ]}
                              disabled={gitBusy || active}
                              onPress={() => handleGitOperation('checkout', br)}
                            >
                              <GitBranch size={11} color={active ? COLORS.bg : COLORS.cyan} />
                              <Text
                                style={[
                                  styles.branchChipText,
                                  active && { color: COLORS.bg, fontFamily: FONTS.monoBold },
                                ]}
                              >
                                {br}
                              </Text>
                            </SpringButton>
                          );
                        })}
                      </View>
                    </ScrollView>
                  </>
                ) : null}

                {/* Create New Branch + Pull / Push */}
                <View style={styles.gitActionRow}>
                  <TextInput
                    style={styles.gitInput}
                    placeholder="New branch name (checkout -b)…"
                    placeholderTextColor={COLORS.dim}
                    value={newBranchName}
                    onChangeText={setNewBranchName}
                    autoCapitalize="none"
                  />
                  <SpringButton
                    style={styles.gitMiniBtn}
                    disabled={gitBusy || !newBranchName.trim()}
                    onPress={() => handleGitOperation('create-branch', newBranchName.trim())}
                  >
                    <Plus size={13} color={COLORS.bg} strokeWidth={2.6} />
                    <Text style={styles.gitMiniBtnText}>BRANCH</Text>
                  </SpringButton>
                </View>

                {/* Commit + Push + Pull Controls */}
                <View style={styles.gitActionRow}>
                  <TextInput
                    style={styles.gitInput}
                    placeholder="Commit message (stages all & commits)…"
                    placeholderTextColor={COLORS.dim}
                    value={commitMessage}
                    onChangeText={setCommitMessage}
                  />
                  <SpringButton
                    style={styles.gitMiniBtn}
                    disabled={gitBusy || !commitMessage.trim()}
                    onPress={() => handleGitOperation('commit', undefined, commitMessage.trim())}
                  >
                    <Check size={13} color={COLORS.bg} strokeWidth={2.6} />
                    <Text style={styles.gitMiniBtnText}>COMMIT</Text>
                  </SpringButton>
                </View>

                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <SpringButton
                    style={styles.gitSecondaryBtn}
                    disabled={gitBusy}
                    onPress={() => handleGitOperation('pull')}
                  >
                    <Text style={styles.gitSecondaryBtnText}>GIT PULL</Text>
                  </SpringButton>
                  <SpringButton
                    style={styles.gitSecondaryBtn}
                    disabled={gitBusy}
                    onPress={() => handleGitOperation('push')}
                  >
                    <Text style={styles.gitSecondaryBtnText}>GIT PUSH</Text>
                  </SpringButton>
                </View>

                {gitActionOutput ? (
                  <View style={styles.gitOutputBox}>
                    <Text selectable style={styles.gitOutputText}>
                      {gitActionOutput}
                    </Text>
                  </View>
                ) : null}

                <Text style={styles.diffSectionLabel}>
                  CHANGED FILES ({gitDiffData?.changedFiles?.length ?? 0}) — TAP ANY FILE TO VIEW
                </Text>
                {gitDiffData?.changedFiles?.length ? (
                  gitDiffData.changedFiles.map((cf, i) => (
                    <SpringButton
                      key={`${cf.path}-${i}`}
                      style={styles.changedFileRow}
                      onPress={() => {
                        setDiffModalOpen(false);
                        setViewingFilePath(cf.path);
                      }}
                    >
                      <View
                        style={[
                          styles.statusTag,
                          cf.status.includes('D')
                            ? { borderColor: COLORS.magenta }
                            : cf.status.includes('?') || cf.status.includes('A')
                              ? { borderColor: COLORS.lime }
                              : { borderColor: COLORS.cyan },
                        ]}
                      >
                        <Text
                          style={[
                            styles.statusTagText,
                            cf.status.includes('D')
                              ? { color: COLORS.magenta }
                              : cf.status.includes('?') || cf.status.includes('A')
                                ? { color: COLORS.lime }
                                : { color: COLORS.cyan },
                          ]}
                        >
                          {cf.status}
                        </Text>
                      </View>
                      <Text style={styles.changedFilePath} numberOfLines={1}>
                        {cf.path}
                      </Text>
                      <Eye size={13} color={COLORS.lime} />
                    </SpringButton>
                  ))
                ) : (
                  <Text style={styles.cleanTreeText}>Working tree clean — no uncommitted changes.</Text>
                )}

                {gitDiffData?.diff ? (
                  <>
                    <Text style={styles.diffSectionLabel}>UNIFIED DIFF</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                      <View style={styles.diffCodeBox}>
                        {gitDiffData.diff.split('\n').slice(0, 220).map((ln, idx) => {
                          const isAdd = ln.startsWith('+') && !ln.startsWith('+++');
                          const isDel = ln.startsWith('-') && !ln.startsWith('---');
                          const isHunk = ln.startsWith('@@');
                          return (
                            <Text
                              key={idx}
                              selectable
                              style={[
                                styles.diffLineText,
                                isAdd && { color: COLORS.lime, backgroundColor: 'rgba(212,255,0,0.08)' },
                                isDel && { color: COLORS.magenta, backgroundColor: 'rgba(255,42,133,0.1)' },
                                isHunk && { color: COLORS.cyan },
                              ]}
                            >
                              {ln}
                            </Text>
                          );
                        })}
                      </View>
                    </ScrollView>
                  </>
                ) : null}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* MODAL: Interactive Mac Shell & GCP OAuth Login Helper */}
      <Modal
        visible={shellModalOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setShellModalOpen(false)}
      >
        <View style={styles.diffModalBackdrop}>
          <View style={styles.diffModalSheet}>
            <View style={styles.diffModalHeader}>
              <View>
                <Text style={styles.diffModalTitle}>MAC TERMINAL &amp; GCP AUTH</Text>
                <Text style={styles.diffModalSub} numberOfLines={1}>
                  {agent.cwd ?? 'Run commands or authenticate GCP via Chrome/Brave'}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <SpringButton style={styles.diffCloseBtn} onPress={handleShowOnMac}>
                  <Terminal size={15} color={COLORS.cyan} />
                </SpringButton>
                <SpringButton style={styles.diffCloseBtn} onPress={() => setShellModalOpen(false)}>
                  <X size={17} color={COLORS.bone} />
                </SpringButton>
              </View>
            </View>

            <Text style={styles.diffSectionLabel}>ONE-TAP GCP &amp; WORKSPACE COMMANDS</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ marginBottom: 10 }}
            >
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {[
                  { label: 'GCP AUTH LOGIN (URL)', cmd: 'gcloud auth login --no-launch-browser' },
                  {
                    label: 'GCP ADC LOGIN (URL)',
                    cmd: 'gcloud auth application-default login --no-launch-browser',
                  },
                  { label: 'GCP ACTIVE ACCOUNT', cmd: 'gcloud auth list' },
                  { label: 'BQ RUNNING JOBS', cmd: 'bq ls -j -a -n 20' },
                  { label: 'OPEN MAC TERMINAL', cmd: '__SHOW_ON_MAC__' },
                ].map((preset) => (
                  <SpringButton
                    key={preset.label}
                    style={styles.branchChip}
                    onPress={() => {
                      if (preset.cmd === '__SHOW_ON_MAC__') {
                        void handleShowOnMac();
                      } else {
                        setShellCmd(preset.cmd);
                        void handleExecShellCommand(preset.cmd);
                      }
                    }}
                  >
                    <Terminal size={11} color={COLORS.lime} />
                    <Text style={styles.branchChipText}>{preset.label}</Text>
                  </SpringButton>
                ))}
              </View>
            </ScrollView>

            <View style={styles.gitActionRow}>
              <TextInput
                style={styles.gitInput}
                placeholder="Type any zsh command to execute on Mac…"
                placeholderTextColor={COLORS.dim}
                value={shellCmd}
                onChangeText={setShellCmd}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <SpringButton
                style={styles.gitMiniBtn}
                disabled={shellRunning || !shellCmd.trim()}
                onPress={() => handleExecShellCommand()}
              >
                {shellRunning ? (
                  <ActivityIndicator size="small" color={COLORS.bg} />
                ) : (
                  <>
                    <Send size={12} color={COLORS.bg} />
                    <Text style={styles.gitMiniBtnText}>RUN</Text>
                  </>
                )}
              </SpringButton>
            </View>

            {shellRunning ? (
              <CussSmallArtLoader
                variant="inline"
                title="EXECUTING ZSH ON MAC"
                subtitle="Streaming stdout & scanning for OAuth URLs…"
                accentColor={COLORS.cyan}
              />
            ) : null}

            {shellUrls.length > 0 ? (
              <View style={{ gap: 6, marginTop: 10 }}>
                <Text style={styles.diffSectionLabel}>
                  DETECTED OAUTH / BROWSER LINKS (CHROME / BRAVE)
                </Text>
                {shellUrls.map((u) => (
                  <View key={u} style={styles.oauthUrlCard}>
                    <Text style={styles.oauthUrlText} numberOfLines={1}>
                      {u}
                    </Text>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <SpringButton
                        style={styles.oauthMobileBtn}
                        onPress={() => Linking.openURL(u).catch(() => {})}
                      >
                        <Globe size={12} color={COLORS.bg} />
                        <Text style={styles.oauthMobileBtnText}>OPEN IN ANDROID BROWSER</Text>
                        <ExternalLink size={11} color={COLORS.bg} />
                      </SpringButton>
                      <SpringButton
                        style={styles.oauthMacBtn}
                        onPress={() => handleOpenUrlOnMac(u)}
                      >
                        <Laptop size={12} color={COLORS.cyan} />
                        <Text style={styles.oauthMacBtnText}>MAC BROWSER</Text>
                      </SpringButton>
                    </View>
                  </View>
                ))}
              </View>
            ) : null}

            {shellOutput ? (
              <ScrollView style={{ maxHeight: 260, marginTop: 10 }}>
                <View style={styles.diffCodeBox}>
                  <Text selectable style={styles.diffLineText}>
                    {shellOutput}
                  </Text>
                </View>
              </ScrollView>
            ) : null}
          </View>
        </View>
      </Modal>

      {/* MODAL: Live Mac Screen & Browser Peek */}
      <Modal
        visible={peekModalOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setPeekModalOpen(false)}
      >
        <View style={styles.diffModalBackdrop}>
          <View style={styles.diffModalSheet}>
            <View style={styles.diffModalHeader}>
              <View>
                <Text style={styles.diffModalTitle}>MAC LIVE SCREEN PEEK</Text>
                <Text style={styles.diffModalSub}>
                  {peekData?.frontApp ? `FRONTMOST APP // ${peekData.frontApp}` : 'MAC DISPLAY'}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <SpringButton style={styles.diffCloseBtn} onPress={handleOpenMacPeek}>
                  <RefreshCw size={15} color={COLORS.lime} />
                </SpringButton>
                <SpringButton style={styles.diffCloseBtn} onPress={() => setPeekModalOpen(false)}>
                  <X size={17} color={COLORS.bone} />
                </SpringButton>
              </View>
            </View>

            {peekLoading ? (
              <CussSmallArtLoader
                variant="card"
                title="CAPTURING MAC DISPLAY"
                subtitle="Snapshotting active Mac window & browser…"
                accentColor={COLORS.amber}
              />
            ) : peekData?.ok && peekData.imageBase64 ? (
              <ScrollView contentContainerStyle={{ alignItems: 'center', gap: 10 }}>
                <Image
                  source={{ uri: peekData.imageBase64 }}
                  style={{
                    width: '100%',
                    height: 320,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: COLORS.borderHi,
                    backgroundColor: '#05050A',
                  }}
                  resizeMode="contain"
                />
                <Text style={styles.diffModalSub}>
                  Captured at {new Date(peekData.capturedAt).toLocaleTimeString()}
                </Text>
              </ScrollView>
            ) : (
              <View style={styles.gitOutputBox}>
                <Text style={styles.gitOutputText}>
                  {peekData?.hint ?? 'Unable to capture Mac screen.'}
                </Text>
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* MODAL: Rename Chat */}
      <Modal
        visible={renameModalOpen}
        animationType="fade"
        transparent
        onRequestClose={() => setRenameModalOpen(false)}
      >
        <View style={styles.renameBackdrop}>
          <View style={styles.renameCard}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={styles.diffModalTitle}>RENAME CHAT</Text>
              <SpringButton onPress={() => setRenameModalOpen(false)}>
                <X size={16} color={COLORS.bone} />
              </SpringButton>
            </View>
            <TextInput
              style={styles.gitInput}
              value={renameText}
              onChangeText={setRenameText}
              placeholder="New chat title…"
              placeholderTextColor={COLORS.dim}
              autoFocus
            />
            <SpringButton style={styles.gitMiniBtn} onPress={handleRenameSave}>
              <Check size={14} color={COLORS.bg} strokeWidth={2.8} />
              <Text style={styles.gitMiniBtnText}>SAVE CHAT TITLE</Text>
            </SpringButton>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  headerActionBtn: {
    backgroundColor: COLORS.plate,
    borderWidth: 1,
    borderColor: COLORS.borderHi,
    borderRadius: 8,
    padding: 6,
  },
  topHudBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1.5,
    borderBottomColor: COLORS.borderHi,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  hudStatusGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    maxWidth: '42%',
  },
  idleDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: COLORS.cyan,
  },
  hudStatusText: {
    fontFamily: FONTS.monoBold,
    fontSize: 10.5,
    color: COLORS.lime,
    letterSpacing: 1,
  },
  deviceSavedPill: {
    backgroundColor: COLORS.plate,
    borderWidth: 1,
    borderColor: COLORS.borderHi,
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  deviceSavedText: {
    fontFamily: FONTS.monoBold,
    fontSize: 7.5,
    color: COLORS.cyan,
  },
  hudFolderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 1,
  },
  hudFolderText: {
    fontFamily: FONTS.mono,
    fontSize: 9.5,
    color: COLORS.muted,
  },
  hudActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  gitDiffBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.limeDim,
    borderWidth: 1,
    borderColor: COLORS.lime,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  gitDiffBtnText: {
    fontFamily: FONTS.monoBold,
    fontSize: 9.5,
    color: COLORS.lime,
    letterSpacing: 0.7,
  },
  macTermBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.cyanDim,
    borderWidth: 1,
    borderColor: COLORS.cyan,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  macTermBtnText: {
    fontFamily: FONTS.monoBold,
    fontSize: 9.5,
    color: COLORS.cyan,
    letterSpacing: 0.7,
  },
  peekBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.amberDim,
    borderWidth: 1,
    borderColor: COLORS.amber,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  peekBtnText: {
    fontFamily: FONTS.monoBold,
    fontSize: 9.5,
    color: COLORS.amber,
    letterSpacing: 0.7,
  },
  hudStopBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.magentaDim,
    borderWidth: 1,
    borderColor: COLORS.magenta,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  hudStopText: {
    fontFamily: FONTS.monoBold,
    fontSize: 9.5,
    color: COLORS.magenta,
  },
  feedContent: {
    padding: 14,
    paddingBottom: 24,
    gap: 8,
  },
  jumpBottomFab: {
    position: 'absolute',
    right: 16,
    bottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.lime,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  jumpBottomText: {
    fontFamily: FONTS.monoBold,
    fontSize: 10,
    color: COLORS.bg,
    letterSpacing: 0.8,
  },
  userBubble: {
    alignSelf: 'flex-end',
    width: '90%',
    backgroundColor: COLORS.plateHi,
    borderWidth: 1.5,
    borderColor: COLORS.lime,
    borderRadius: 14,
    padding: 12,
    gap: 6,
    marginVertical: 4,
  },
  userMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  userRoleTag: {
    fontFamily: FONTS.mogi,
    fontSize: 13,
    color: COLORS.lime,
    letterSpacing: 0.8,
  },
  userBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.borderHi,
    borderRadius: 5,
    paddingHorizontal: 5,
    paddingVertical: 1.5,
  },
  userBadgeText: {
    fontFamily: FONTS.monoBold,
    fontSize: 8.5,
    color: COLORS.bone,
  },
  userFilesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
  },
  userFileChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: COLORS.cyanDim,
    borderWidth: 1,
    borderColor: COLORS.cyan,
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  userFileChipText: {
    fontFamily: FONTS.monoBold,
    fontSize: 9.5,
    color: COLORS.cyan,
  },
  userPromptText: {
    fontFamily: FONTS.bodyBold,
    fontSize: 14.5,
    lineHeight: 21,
    color: COLORS.bone,
  },
  assistantCard: {
    backgroundColor: COLORS.surface,
    borderWidth: 1.2,
    borderColor: COLORS.borderHi,
    borderRadius: 14,
    padding: 13,
    marginVertical: 4,
    gap: 6,
  },
  assistantHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    paddingBottom: 6,
    marginBottom: 2,
  },
  assistantHeaderLabel: {
    fontFamily: FONTS.monoBold,
    fontSize: 10,
    color: COLORS.lime,
    letterSpacing: 1.1,
  },
  resultBanner: {
    backgroundColor: COLORS.plate,
    borderWidth: 1,
    borderColor: COLORS.lime,
    borderRadius: 9,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginVertical: 2,
    gap: 4,
  },
  resultTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  resultBadgeText: {
    fontFamily: FONTS.monoBold,
    fontSize: 10,
    letterSpacing: 1,
  },
  resultTelemetry: {
    fontFamily: FONTS.mono,
    fontSize: 10,
    color: COLORS.muted,
  },
  errorResultBody: {
    fontFamily: FONTS.mono,
    fontSize: 11.5,
    color: COLORS.magenta,
  },
  statusRow: {
    alignSelf: 'center',
    backgroundColor: COLORS.plate,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 6,
    paddingHorizontal: 9,
    paddingVertical: 3,
    marginVertical: 2,
  },
  statusRowText: {
    fontFamily: FONTS.mono,
    fontSize: 10,
    color: COLORS.muted,
  },
  composerContainer: {
    paddingHorizontal: 10,
    paddingTop: 6,
    paddingBottom: Platform.OS === 'ios' ? 22 : 10,
    backgroundColor: COLORS.bg,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  diffModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(5,5,11,0.86)',
    justifyContent: 'flex-end',
  },
  diffModalSheet: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 2,
    borderColor: COLORS.lime,
    padding: 18,
    maxHeight: '88%',
  },
  diffModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  diffModalTitle: {
    fontFamily: FONTS.mogi,
    fontSize: 22,
    color: COLORS.lime,
  },
  diffModalSub: {
    fontFamily: FONTS.mono,
    fontSize: 10,
    color: COLORS.muted,
    maxWidth: 250,
  },
  diffCloseBtn: {
    backgroundColor: COLORS.plate,
    borderWidth: 1,
    borderColor: COLORS.borderHi,
    borderRadius: 10,
    padding: 8,
  },
  diffSectionLabel: {
    fontFamily: FONTS.monoBold,
    fontSize: 10,
    color: COLORS.cyan,
    letterSpacing: 1.1,
    marginTop: 4,
  },
  branchChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: COLORS.plate,
    borderWidth: 1,
    borderColor: COLORS.borderHi,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  branchChipText: {
    fontFamily: FONTS.mono,
    fontSize: 11,
    color: COLORS.bone,
  },
  gitActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  gitInput: {
    flex: 1,
    fontFamily: FONTS.mono,
    fontSize: 12,
    color: COLORS.bone,
    backgroundColor: COLORS.plate,
    borderWidth: 1,
    borderColor: COLORS.borderHi,
    borderRadius: 9,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  gitMiniBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    backgroundColor: COLORS.lime,
    borderRadius: 9,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  gitMiniBtnText: {
    fontFamily: FONTS.monoBold,
    fontSize: 10.5,
    color: COLORS.bg,
  },
  gitSecondaryBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.plate,
    borderWidth: 1,
    borderColor: COLORS.cyan,
    borderRadius: 9,
    paddingVertical: 8,
  },
  gitSecondaryBtnText: {
    fontFamily: FONTS.monoBold,
    fontSize: 10.5,
    color: COLORS.cyan,
  },
  gitOutputBox: {
    backgroundColor: COLORS.plate,
    borderWidth: 1,
    borderColor: COLORS.borderHi,
    borderRadius: 9,
    padding: 10,
  },
  gitOutputText: {
    fontFamily: FONTS.mono,
    fontSize: 11,
    color: COLORS.bone,
  },
  changedFileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.plate,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  statusTag: {
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  statusTagText: {
    fontFamily: FONTS.monoBold,
    fontSize: 9.5,
  },
  changedFilePath: {
    flex: 1,
    fontFamily: FONTS.mono,
    fontSize: 11.5,
    color: COLORS.bone,
  },
  cleanTreeText: {
    fontFamily: FONTS.body,
    fontSize: 13,
    color: COLORS.muted,
    paddingVertical: 8,
  },
  diffCodeBox: {
    backgroundColor: '#040408',
    borderWidth: 1,
    borderColor: COLORS.borderHi,
    borderRadius: 10,
    padding: 10,
    minWidth: '100%',
  },
  diffLineText: {
    fontFamily: FONTS.mono,
    fontSize: 11.5,
    color: COLORS.bone,
    lineHeight: 17,
  },
  oauthUrlCard: {
    backgroundColor: COLORS.plate,
    borderWidth: 1,
    borderColor: COLORS.lime,
    borderRadius: 10,
    padding: 10,
    gap: 7,
  },
  oauthUrlText: {
    fontFamily: FONTS.mono,
    fontSize: 10.5,
    color: COLORS.cyan,
  },
  oauthMobileBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    backgroundColor: COLORS.lime,
    borderRadius: 7,
    paddingVertical: 7,
    paddingHorizontal: 8,
  },
  oauthMobileBtnText: {
    fontFamily: FONTS.monoBold,
    fontSize: 9.5,
    color: COLORS.bg,
  },
  oauthMacBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.cyan,
    borderRadius: 7,
    paddingVertical: 7,
    paddingHorizontal: 10,
  },
  oauthMacBtnText: {
    fontFamily: FONTS.monoBold,
    fontSize: 9.5,
    color: COLORS.cyan,
  },
  renameBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(5,5,11,0.86)',
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
});
