import React, { useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import {
  ChevronDown,
  ChevronRight,
  SpringButton,
  X,
} from './CussIcons';
import { COLORS, FONTS } from '../theme';

/**
 * Verbatim category definitions reverse-engineered from Cursor IDE's
 * `/Applications/Cursor.app/Contents/Resources/app/out/vs/workbench/workbench.desktop.main.js`
 * (`CATEGORY_HELP` & `agent.v1.PromptContextUsageTree`).
 */
export interface ContextCategoryItem {
  id: string;
  label: string;
  color: string;
  tokens: number;
  help: string;
  children?: string[];
}

export function ContextUsageSheet({
  visible,
  onClose,
  modelName,
  limitLabel,
  inputTokens = 0,
  outputTokens = 0,
  cacheReadTokens = 0,
  attachedFiles = [],
  sessionFiles = [],
  sessionTools = [],
  turnCount = 0,
  mcpServerNames = ['21st', 'headroom', 'rea'],
  subagents = [],
  onPressFile,
}: {
  visible: boolean;
  onClose: () => void;
  modelName: string;
  limitLabel: string;
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  attachedFiles?: string[];
  sessionFiles?: string[];
  sessionTools?: string[];
  turnCount?: number;
  mcpServerNames?: string[];
  subagents?: string[];
  onPressFile?: (filePath: string) => void;
}) {
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({
    conversation: true,
    files: true,
    mcp: true,
  });

  const maxTokens =
    limitLabel.toLowerCase() === '1m' || limitLabel.toLowerCase() === 'auto'
      ? 1_000_000
      : limitLabel.toLowerCase() === '500k'
        ? 500_000
        : limitLabel.toLowerCase() === '300k'
          ? 300_000
          : limitLabel.toLowerCase() === '272k'
            ? 272_000
            : limitLabel.toLowerCase() === '256k'
              ? 256_000
              : 200_000;

  const allFiles = Array.from(new Set([...attachedFiles, ...sessionFiles]));
  const allTools = Array.from(
    new Set(['Shell', 'Read', 'Write', 'Edit', 'Grep', 'Glob', 'Task', ...sessionTools]),
  );

  // Estimate breakdown using real telemetry when available, or realistic baseline overhead
  const sysTokens = 3200;
  const toolTokens = 4100 + sessionTools.length * 180;
  const rulesTokens = 850;
  const skillsTokens = 620;
  const mcpTokens = mcpServerNames.length * 1450;
  const subagentTokens = subagents.length * 900;
  const filesTokens = allFiles.length * 1400;
  const cacheTokens = cacheReadTokens > 0 ? cacheReadTokens : 0;
  const convTokens =
    inputTokens > 0
      ? Math.max(inputTokens + outputTokens, 1200)
      : Math.max(turnCount * 850, 600);

  const categories: ContextCategoryItem[] = [
    {
      id: 'system_prompt',
      label: 'System Prompt',
      color: COLORS.lime,
      tokens: sysTokens,
      help:
        'The system prompt is the set of instructions Cursor provides to an agent at the start of every chat. It defines the agent’s tone, sets ground rules, and outlines how it should use tools.',
    },
    {
      id: 'tools',
      label: `Tool Definitions (${allTools.length})`,
      color: COLORS.cyan,
      tokens: toolTokens,
      help:
        'Tool definitions describe everything the agent can do, such as reading files, running commands, or searching the web. Tool definitions help the agent know what its options are, and Cursor manages this for you.',
      children: allTools,
    },
    {
      id: 'rules',
      label: 'Rules (.cursor/rules & CLAUDE.md)',
      color: COLORS.amber,
      tokens: rulesTokens,
      help:
        'Rules are standing instructions the agent follows each turn. Use them to define style conventions, security best practices, or general context for how your project fits together.',
    },
    {
      id: 'skills',
      label: 'Skills (~/.agents/skills)',
      color: '#38BDF8',
      tokens: skillsTokens,
      help:
        'Skills are reusable prompts for common tasks. The agent can invoke skills automatically when they’re appropriate, or you can trigger them yourself via a slash command.',
      children: ['motion-design', 'reverse-engineer-anything', 'canvas'],
    },
    {
      id: 'mcp',
      label: `MCP Servers (${mcpServerNames.length})`,
      color: COLORS.magenta,
      tokens: mcpTokens,
      help:
        'MCP servers connect the agent to outside services like workplace messengers, issue trackers, and design tools. Each additional MCP occupies some of the context window.',
      children: mcpServerNames.map((n) => `mcp:${n}`),
    },
    {
      id: 'subagents',
      label: `Subagents (${subagents.length})`,
      color: COLORS.violet,
      tokens: subagentTokens,
      help:
        'Subagents are focused helpers the main agent can delegate tasks to, in order to complete big jobs in parallel. This workflow helps free up context in the main agent.',
      children: subagents.map((s) => `@${s}`),
    },
    {
      id: 'files',
      label: `Attached & Read @Files (${allFiles.length})`,
      color: '#EC4899',
      tokens: filesTokens,
      help:
        'Workspace files explicitly attached with @file or inspected by Read/Edit/Grep tool calls during this session.',
      children: allFiles.length > 0 ? allFiles.map((f) => (f.startsWith('@') ? f : `@${f}`)) : undefined,
    },
    {
      id: 'summarized_conversation',
      label: 'Prompt Cache & Summarized Context',
      color: '#10F59B',
      tokens: cacheTokens,
      help:
        'Conversations are automatically cached and summarized into a short recap when they get too long. This helps the main agent free up context and maintain space for the task at hand.',
    },
    {
      id: 'conversation',
      label: `Active Conversation (${turnCount || 1} turns)`,
      color: '#F97316',
      tokens: convTokens,
      help:
        'This is the running back-and-forth of your chat: your prompts, the agent’s replies, and the tool call outputs in between.',
    },
  ];

  const totalUsed = categories.reduce((acc, c) => acc + c.tokens, 0);
  const pct = Math.min((totalUsed / maxTokens) * 100, 100);
  const freeTokens = Math.max(maxTokens - totalUsed, 0);

  const ringSize = 86;
  const r = (ringSize - 10) / 2;
  const circ = 2 * Math.PI * r;
  const dash = circ * (1 - Math.max(pct / 100, 0.04));

  function toggleExpand(id: string) {
    setExpandedIds((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View>
              <Text style={styles.eyebrow}>CONTEXT USAGE REPORT</Text>
              <Text style={styles.title}>CONTEXT EXPLORER</Text>
              <Text style={styles.sub}>
                {modelName.toUpperCase()} // {(maxTokens / 1000).toFixed(0)}K WINDOW
              </Text>
            </View>
            <SpringButton style={styles.closeBtn} onPress={onClose}>
              <X size={17} color={COLORS.bone} />
            </SpringButton>
          </View>

          {/* Top Donut Ring + Summary Card */}
          <View style={styles.summaryCard}>
            <View style={styles.donutWrap}>
              <Svg width={ringSize} height={ringSize} viewBox={`0 0 ${ringSize} ${ringSize}`}>
                <Circle
                  cx={ringSize / 2}
                  cy={ringSize / 2}
                  r={r}
                  stroke={COLORS.border}
                  strokeWidth={8}
                  fill="none"
                />
                <Circle
                  cx={ringSize / 2}
                  cy={ringSize / 2}
                  r={r}
                  stroke={pct > 80 ? COLORS.magenta : pct > 50 ? COLORS.amber : COLORS.lime}
                  strokeWidth={8}
                  strokeDasharray={`${circ} ${circ}`}
                  strokeDashoffset={dash}
                  strokeLinecap="round"
                  fill="none"
                  rotation="-90"
                  origin={`${ringSize / 2}, ${ringSize / 2}`}
                />
              </Svg>
              <View style={styles.donutCenter} pointerEvents="none">
                <Text style={styles.donutPct}>{pct < 1 ? pct.toFixed(1) : pct.toFixed(0)}%</Text>
                <Text style={styles.donutLabel}>FULL</Text>
              </View>
            </View>

            <View style={{ flex: 1, gap: 4 }}>
              <Text style={styles.totalNumbers}>
                {(totalUsed / 1000).toFixed(1)}K / {(maxTokens / 1000).toFixed(0)}K TOKENS
              </Text>
              <Text style={styles.freeHeadroom}>
                FREE HEADROOM: {(freeTokens / 1000).toFixed(1)}K TOKENS
              </Text>

              {/* Multi-Color Segmented Distribution Bar */}
              <View style={styles.segmentedBar}>
                {categories.map((c) => {
                  const flexVal = Math.max(c.tokens / Math.max(totalUsed, 1), 0.03);
                  return (
                    <View
                      key={c.id}
                      style={{ flex: flexVal, backgroundColor: c.color, height: '100%' }}
                    />
                  );
                })}
              </View>
            </View>
          </View>

          {/* Expandable 9-Category Context Tree */}
          <ScrollView style={{ maxHeight: 370 }} contentContainerStyle={{ gap: 7, paddingBottom: 18 }}>
            {categories.map((cat) => {
              const catPct = ((cat.tokens / maxTokens) * 100).toFixed(2);
              const open = Boolean(expandedIds[cat.id]);
              return (
                <View key={cat.id} style={styles.catCard}>
                  <SpringButton style={styles.catHeader} onPress={() => toggleExpand(cat.id)}>
                    <View style={[styles.catDot, { backgroundColor: cat.color }]} />
                    <Text style={styles.catName}>{cat.label}</Text>
                    <Text style={styles.catTokens}>
                      {cat.tokens >= 1000
                        ? `${(cat.tokens / 1000).toFixed(1)}K`
                        : `${cat.tokens}`}{' '}
                      ({catPct}%)
                    </Text>
                    {open ? (
                      <ChevronDown size={14} color={COLORS.muted} />
                    ) : (
                      <ChevronRight size={14} color={COLORS.muted} />
                    )}
                  </SpringButton>

                  {open ? (
                    <View style={styles.catBody}>
                      <Text style={styles.catHelp}>{cat.help}</Text>
                      {cat.children && cat.children.length > 0 ? (
                        <View style={styles.childChipsRow}>
                          {cat.children.map((ch) => {
                            const isFileChip = cat.id === 'files' && Boolean(onPressFile);
                            return (
                              <SpringButton
                                key={ch}
                                disabled={!isFileChip}
                                onPress={
                                  isFileChip
                                    ? () => {
                                        onClose();
                                        onPressFile?.(ch.replace(/^@+/, ''));
                                      }
                                    : undefined
                                }
                                style={[styles.childChip, { borderColor: cat.color }]}
                              >
                                <Text style={[styles.childChipText, { color: cat.color }]}>
                                  {ch}
                                </Text>
                              </SpringButton>
                            );
                          })}
                        </View>
                      ) : null}
                    </View>
                  ) : null}
                </View>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(5,5,11,0.86)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 2,
    borderColor: COLORS.cyan,
    padding: 18,
    maxHeight: '88%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  eyebrow: {
    fontFamily: FONTS.monoBold,
    fontSize: 9.5,
    color: COLORS.cyan,
    letterSpacing: 1.4,
  },
  title: {
    fontFamily: FONTS.mogi,
    fontSize: 22,
    color: COLORS.lime,
    letterSpacing: 0.8,
  },
  sub: {
    fontFamily: FONTS.mono,
    fontSize: 10,
    color: COLORS.muted,
    marginTop: 1,
  },
  closeBtn: {
    backgroundColor: COLORS.plate,
    borderWidth: 1,
    borderColor: COLORS.borderHi,
    borderRadius: 10,
    padding: 8,
  },
  summaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: COLORS.plate,
    borderWidth: 1.5,
    borderColor: COLORS.borderHi,
    borderRadius: 16,
    padding: 12,
    marginBottom: 14,
  },
  donutWrap: {
    width: 86,
    height: 86,
    alignItems: 'center',
    justifyContent: 'center',
  },
  donutCenter: {
    position: 'absolute',
    alignItems: 'center',
  },
  donutPct: {
    fontFamily: FONTS.mogiAlt,
    fontSize: 17,
    color: COLORS.bone,
  },
  donutLabel: {
    fontFamily: FONTS.monoBold,
    fontSize: 8,
    color: COLORS.muted,
    letterSpacing: 1,
  },
  totalNumbers: {
    fontFamily: FONTS.monoBold,
    fontSize: 13,
    color: COLORS.bone,
  },
  freeHeadroom: {
    fontFamily: FONTS.mono,
    fontSize: 10.5,
    color: COLORS.cyan,
  },
  segmentedBar: {
    flexDirection: 'row',
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    backgroundColor: COLORS.surface,
    marginTop: 6,
    gap: 1.5,
  },
  catCard: {
    backgroundColor: COLORS.plate,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 11,
    padding: 10,
  },
  catHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  catDot: {
    width: 9,
    height: 9,
    borderRadius: 3,
  },
  catName: {
    flex: 1,
    fontFamily: FONTS.bodyBold,
    fontSize: 13.5,
    color: COLORS.bone,
  },
  catTokens: {
    fontFamily: FONTS.monoBold,
    fontSize: 10.5,
    color: COLORS.muted,
  },
  catBody: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    gap: 7,
  },
  catHelp: {
    fontFamily: FONTS.body,
    fontSize: 12.5,
    lineHeight: 18,
    color: COLORS.muted,
  },
  childChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  childChip: {
    borderWidth: 1,
    borderRadius: 5,
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: COLORS.surface,
  },
  childChipText: {
    fontFamily: FONTS.monoBold,
    fontSize: 9.5,
  },
});
