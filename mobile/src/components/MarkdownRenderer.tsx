import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Linking,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  Brain,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  ExternalLink,
  Eye,
  FileCode2,
  Globe,
  Laptop,
  Layers,
  Search,
  SpringButton,
  ToolVectorIcon,
  X,
} from './CussIcons';
import { localFileContent, WorkspaceFileContent } from '../api/client';
import { CussSmallArtLoader } from './CussArt';
import { COLORS, FONTS } from '../theme';

type MdBlock =
  | { kind: 'heading'; level: number; text: string }
  | { kind: 'code'; lang: string; code: string }
  | { kind: 'bullet'; text: string }
  | { kind: 'ordered'; num: string; text: string }
  | { kind: 'quote'; text: string }
  | { kind: 'table'; rows: string[][] }
  | { kind: 'hr' }
  | { kind: 'paragraph'; text: string };

/** Parse raw markdown string into structured AST blocks so raw .md syntax is never exposed. */
export function parseMarkdownBlocks(raw: string): MdBlock[] {
  const blocks: MdBlock[] = [];
  const lines = raw.replace(/\r\n/g, '\n').split('\n');
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block ```lang
    const fence = /^```([a-zA-Z0-9_-]*)\s*$/.exec(line.trim());
    if (fence) {
      const lang = (fence[1] || 'code').toUpperCase();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i].trim())) {
        codeLines.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++; // skip closing ```
      blocks.push({ kind: 'code', lang, code: codeLines.join('\n') });
      continue;
    }

    if (!line.trim()) {
      i++;
      continue;
    }

    // Horizontal rule
    if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line.trim())) {
      blocks.push({ kind: 'hr' });
      i++;
      continue;
    }

    // Heading #, ##, ###
    const heading = /^(#{1,4})\s+(.+)$/.exec(line.trim());
    if (heading) {
      blocks.push({ kind: 'heading', level: heading[1].length, text: heading[2].trim() });
      i++;
      continue;
    }

    // Markdown table
    if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        const rowLine = lines[i].trim();
        // Skip separator row |---|---|
        if (!/^\|[\s:-]+\|/.test(rowLine)) {
          const cells = rowLine
            .slice(1, -1)
            .split('|')
            .map((c) => c.trim());
          rows.push(cells);
        }
        i++;
      }
      if (rows.length > 0) blocks.push({ kind: 'table', rows });
      continue;
    }

    // Blockquote
    if (line.trim().startsWith('>')) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        quoteLines.push(lines[i].trim().replace(/^>\s?/, ''));
        i++;
      }
      blocks.push({ kind: 'quote', text: quoteLines.join(' ') });
      continue;
    }

    // Unordered list item
    const bullet = /^(\s*)[-*+]\s+(.+)$/.exec(line);
    if (bullet) {
      blocks.push({ kind: 'bullet', text: bullet[2].trim() });
      i++;
      continue;
    }

    // Ordered list item
    const ordered = /^(\s*)(\d+)\.\s+(.+)$/.exec(line);
    if (ordered) {
      blocks.push({ kind: 'ordered', num: ordered[2], text: ordered[3].trim() });
      i++;
      continue;
    }

    // Paragraph (coalesce consecutive plain lines)
    const paraLines: string[] = [line.trim()];
    i++;
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !/^(```|#{1,4}\s|[-*+]\s|\d+\.\s|>\s?|\|)/.test(lines[i].trim())
    ) {
      paraLines.push(lines[i].trim());
      i++;
    }
    blocks.push({ kind: 'paragraph', text: paraLines.join(' ') });
  }

  return blocks;
}

const FILE_PATH_PATTERN =
  /^(?:@?[\w.~-]+\/[\w./-]+|@?[\w.-]+\.(?:tsx?|jsx?|mjs|cjs|py|json|jsonl|md|mdx|sh|zsh|ya?ml|toml|sql|html?|css|scss|svg|csv|tsv|rs|go|java|kt|swift|rb|php|c|cpp|h|xml|graphql|prisma|env|lock|txt|pdf|png|jpe?g|gif|webp|bmp))(?::\d+(?::\d+)?|#L\d+)?$/i;

export function looksLikeFilePath(candidate: string): boolean {
  const trimmed = candidate.trim().replace(/^@+/, '');
  if (!trimmed || trimmed.length > 220 || /\s/.test(trimmed) || /^https?:\/\//i.test(trimmed)) {
    return false;
  }
  return FILE_PATH_PATTERN.test(trimmed);
}

/** Parse inline **bold**, *italic*, `code`, @file, and URLs into styled/tappable <Text> spans. */
export function renderInlineMarkdown(
  text: string,
  onPressFile?: (filePath: string) => void,
): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const tokenRegex =
    /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|@[a-zA-Z0-9_./:-]+|\[[^\]]+\]\([^)]+\)|https?:\/\/[^\s"'<>)+]+)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let k = 0;

  while ((match = tokenRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(<Text key={`t-${k++}`}>{text.slice(lastIndex, match.index)}</Text>);
    }
    const tok = match[0];
    if (tok.startsWith('`') && tok.endsWith('`')) {
      const inner = tok.slice(1, -1).trim();
      const isFile = Boolean(onPressFile && looksLikeFilePath(inner));
      nodes.push(
        <Text
          key={`c-${k++}`}
          style={[styles.inlineCode, isFile && styles.inlineFileLink]}
          onPress={isFile ? () => onPressFile?.(inner.replace(/^@+/, '')) : undefined}
        >
          {inner}
        </Text>,
      );
    } else if (tok.startsWith('**') && tok.endsWith('**')) {
      nodes.push(
        <Text key={`b-${k++}`} style={styles.boldText}>
          {tok.slice(2, -2)}
        </Text>,
      );
    } else if (tok.startsWith('*') && tok.endsWith('*')) {
      nodes.push(
        <Text key={`i-${k++}`} style={styles.italicText}>
          {tok.slice(1, -1)}
        </Text>,
      );
    } else if (tok.startsWith('@')) {
      const rawRef = tok.slice(1);
      nodes.push(
        <Text
          key={`a-${k++}`}
          style={styles.atMention}
          onPress={onPressFile ? () => onPressFile(rawRef) : undefined}
        >
          {tok}
        </Text>,
      );
    } else if (tok.startsWith('[')) {
      const lm = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(tok);
      const target = lm?.[2];
      const isWeb = Boolean(target && /^https?:\/\//i.test(target));
      nodes.push(
        <Text
          key={`l-${k++}`}
          style={styles.linkText}
          onPress={() => {
            if (!target) return;
            if (isWeb) {
              Linking.openURL(target).catch(() => {});
            } else if (onPressFile) {
              onPressFile(target);
            }
          }}
        >
          {lm ? lm[1] : tok}
        </Text>,
      );
    } else if (/^https?:\/\//i.test(tok)) {
      nodes.push(
        <Text
          key={`u-${k++}`}
          style={styles.linkText}
          onPress={() => Linking.openURL(tok).catch(() => {})}
        >
          {tok}
        </Text>,
      );
    }
    lastIndex = tokenRegex.lastIndex;
  }

  if (lastIndex < text.length) {
    nodes.push(<Text key={`end-${k++}`}>{text.slice(lastIndex)}</Text>);
  }
  return nodes;
}

function CodeBlockCard({ lang, code }: { lang: string; code: string }) {
  const [copied, setCopied] = useState(false);
  const codeLines = code.split('\n');

  return (
    <View style={styles.codeCard}>
      <View style={styles.codeHeader}>
        <View style={styles.codeLangBadge}>
          <Text style={styles.codeLangText}>{lang || 'CODE'}</Text>
        </View>
        <Text style={styles.codeLineCount}>{codeLines.length} LN</Text>
        <SpringButton
          style={styles.copyBtn}
          onPress={() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1600);
          }}
        >
          {copied ? (
            <Check size={13} color={COLORS.lime} strokeWidth={2.5} />
          ) : (
            <Copy size={13} color={COLORS.muted} strokeWidth={2.2} />
          )}
          <Text style={[styles.copyBtnText, copied && { color: COLORS.lime }]}>
            {copied ? 'COPIED' : 'SELECT'}
          </Text>
        </SpringButton>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={styles.codeBody}>
          {codeLines.map((ln, idx) => (
            <View key={idx} style={styles.codeRow}>
              <Text style={styles.codeGutter}>{String(idx + 1).padStart(2, '0')}</Text>
              <Text selectable style={styles.codeText}>
                {ln || ' '}
              </Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

export function MarkdownRenderer({
  content,
  onPressFile,
}: {
  content: string;
  onPressFile?: (filePath: string) => void;
}) {
  const blocks = parseMarkdownBlocks(content);
  return (
    <View style={styles.mdContainer}>
      {blocks.map((b, idx) => {
        switch (b.kind) {
          case 'heading':
            return (
              <View
                key={idx}
                style={[
                  styles.headingWrap,
                  b.level === 1 && { borderLeftColor: COLORS.lime },
                  b.level === 2 && { borderLeftColor: COLORS.cyan },
                ]}
              >
                <Text
                  selectable
                  style={[
                    styles.headingText,
                    b.level === 1 && styles.h1Text,
                    b.level === 2 && styles.h2Text,
                  ]}
                >
                  {renderInlineMarkdown(b.text, onPressFile)}
                </Text>
              </View>
            );
          case 'code':
            return <CodeBlockCard key={idx} lang={b.lang} code={b.code} />;
          case 'bullet':
            return (
              <View key={idx} style={styles.listRow}>
                <View style={styles.bulletDiamond} />
                <Text selectable style={styles.paragraphText}>
                  {renderInlineMarkdown(b.text, onPressFile)}
                </Text>
              </View>
            );
          case 'ordered':
            return (
              <View key={idx} style={styles.listRow}>
                <Text style={styles.orderedNum}>{b.num}.</Text>
                <Text selectable style={styles.paragraphText}>
                  {renderInlineMarkdown(b.text, onPressFile)}
                </Text>
              </View>
            );
          case 'quote':
            return (
              <View key={idx} style={styles.quoteBlock}>
                <Text selectable style={styles.quoteText}>
                  {renderInlineMarkdown(b.text, onPressFile)}
                </Text>
              </View>
            );
          case 'table':
            return (
              <ScrollView key={idx} horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.tableBox}>
                  {b.rows.map((r, rIdx) => (
                    <View
                      key={rIdx}
                      style={[styles.tableRow, rIdx === 0 && styles.tableHeaderRow]}
                    >
                      {r.map((cell, cIdx) => (
                        <Text
                          key={cIdx}
                          style={[styles.tableCell, rIdx === 0 && styles.tableHeaderCell]}
                        >
                          {renderInlineMarkdown(cell, onPressFile)}
                        </Text>
                      ))}
                    </View>
                  ))}
                </View>
              </ScrollView>
            );
          case 'hr':
            return <View key={idx} style={styles.hrLine} />;
          case 'paragraph':
          default:
            return (
              <Text key={idx} selectable style={styles.paragraphText}>
                {renderInlineMarkdown(b.text, onPressFile)}
              </Text>
            );
        }
      })}
    </View>
  );
}

/** Collapsible Extended Thinking Accordion (replicates Cursor's Thought block) */
export function ThinkingAccordion({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const words = text.trim().split(/\s+/).filter(Boolean).length;

  return (
    <View style={styles.thinkingBox}>
      <SpringButton style={styles.thinkingHeader} onPress={() => setOpen((v) => !v)}>
        <Brain size={14} color={COLORS.magenta} strokeWidth={2.2} />
        <Text style={styles.thinkingTitle}>THOUGHT PROCESS</Text>
        <Text style={styles.thinkingMeta}>{words} WORDS</Text>
        <View style={{ flex: 1 }} />
        {open ? (
          <ChevronDown size={15} color={COLORS.muted} />
        ) : (
          <ChevronRight size={15} color={COLORS.muted} />
        )}
      </SpringButton>
      {open ? (
        <View style={styles.thinkingBody}>
          <Text selectable style={styles.thinkingText}>
            {text.trim()}
          </Text>
        </View>
      ) : (
        <Text numberOfLines={1} style={styles.thinkingPreview}>
          {text.trim().replace(/\s+/g, ' ')}
        </Text>
      )}
    </View>
  );
}

/** Interactive Tool Call Card (replicates Cursor's tool step rows with expandable args + OAuth/Browser URL actions + File Viewer action) */
export function ToolCallBlock({
  toolName,
  status,
  summary,
  details,
  onOpenOnMac,
  onPressFile,
}: {
  toolName: string;
  status: string;
  summary: string;
  details?: string;
  onOpenOnMac?: (url: string) => void;
  onPressFile?: (filePath: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const isDone = status === 'completed' || status === 'done';

  // Detect any OAuth / login / web URLs inside the tool output or summary
  const detectedUrls = Array.from(
    new Set(
      `${summary}\n${details ?? ''}`.match(/https?:\/\/[^\s"'<>)+\\]+/g) ?? [],
    ),
  ).slice(0, 3);

  // Detect if this tool call targets a file that the user can click to view/render
  const lowerTool = toolName.toLowerCase();
  const isFileTool =
    lowerTool.includes('read') ||
    lowerTool.includes('edit') ||
    lowerTool.includes('write') ||
    lowerTool.includes('file') ||
    lowerTool.includes('view');
  const candidateFile =
    looksLikeFilePath(summary) || (isFileTool && summary && !/\s/.test(summary.trim()))
      ? summary.trim()
      : undefined;

  return (
    <View style={[styles.toolCard, isDone ? styles.toolCardDone : styles.toolCardRunning]}>
      <View style={styles.toolHeader}>
        <SpringButton
          style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}
          onPress={() => setExpanded((v) => !v)}
        >
          <ToolVectorIcon toolName={toolName} size={15} color={isDone ? COLORS.lime : COLORS.cyan} />
          <Text style={styles.toolNameText}>
            {toolName.replace(/ToolCall$/i, '').toUpperCase()}
          </Text>
          <Text numberOfLines={1} style={styles.toolSummaryText}>
            {summary}
          </Text>
        </SpringButton>

        {candidateFile && onPressFile ? (
          <SpringButton
            style={styles.toolViewFileBtn}
            onPress={() => onPressFile(candidateFile)}
          >
            <Eye size={11} color={COLORS.cyan} />
            <Text style={styles.toolViewFileText}>VIEW FILE</Text>
          </SpringButton>
        ) : null}

        <View style={[styles.toolStatusBadge, { borderColor: isDone ? COLORS.lime : COLORS.cyan }]}>
          <Text style={[styles.toolStatusText, { color: isDone ? COLORS.lime : COLORS.cyan }]}>
            {isDone ? 'OK' : 'RUN'}
          </Text>
        </View>
      </View>

      {detectedUrls.length > 0 ? (
        <View style={styles.toolUrlBar}>
          {detectedUrls.map((u) => (
            <View key={u} style={styles.toolUrlItem}>
              <Text style={styles.toolUrlText} numberOfLines={1}>
                {u}
              </Text>
              <View style={styles.toolUrlBtnsRow}>
                <SpringButton
                  style={styles.urlMobileBtn}
                  onPress={() => Linking.openURL(u).catch(() => {})}
                >
                  <Globe size={11} color={COLORS.bg} />
                  <Text style={styles.urlMobileBtnText}>MOBILE BROWSER</Text>
                  <ExternalLink size={10} color={COLORS.bg} />
                </SpringButton>
                {onOpenOnMac ? (
                  <SpringButton
                    style={styles.urlMacBtn}
                    onPress={() => onOpenOnMac(u)}
                  >
                    <Laptop size={11} color={COLORS.cyan} />
                    <Text style={styles.urlMacBtnText}>MAC BROWSER</Text>
                  </SpringButton>
                ) : null}
              </View>
            </View>
          ))}
        </View>
      ) : null}

      {expanded && details ? (
        <View style={styles.toolDetailsBox}>
          <Text selectable style={styles.toolDetailsText}>
            {details}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

/**
 * Universal In-App File Viewer & Renderer Modal
 * Renders ANY file clicked anywhere in CUSS:
 *  - Markdown (.md, .mdx): Rendered Markdown preview OR numbered source code
 *  - CSV / TSV (.csv, .tsv): Rendered Data Table Grid OR raw source
 *  - Images (.png, .jpg, .gif, .webp): Rendered inline image preview
 *  - Source Code / JSON / Config (.ts, .tsx, .py, .json, .sh, etc.): Numbered lines + live search filter
 *  - Binary (.ttf, .db, .pdf, .bin): Hex + ASCII inspector
 */
export function FileViewerModal({
  visible,
  cwd,
  filePath,
  onClose,
}: {
  visible: boolean;
  cwd?: string;
  filePath: string | null;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [fileData, setFileData] = useState<WorkspaceFileContent | null>(null);
  const [viewMode, setViewMode] = useState<'rendered' | 'source'>('rendered');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (!visible || !filePath) return;
    let alive = true;
    setLoading(true);
    setSearchQuery('');
    localFileContent(cwd, filePath)
      .then((res) => {
        if (!alive) return;
        setFileData(res);
        setViewMode(res.kind === 'markdown' || res.kind === 'csv' ? 'rendered' : 'source');
      })
      .catch((e: any) => {
        if (!alive) return;
        setFileData({
          ok: false,
          kind: 'code',
          name: filePath,
          relativePath: filePath,
          absolutePath: filePath,
          size: 0,
          language: 'ERROR',
          content: '',
          lineCount: 0,
          error: e?.message ?? 'Could not load file from Mac bridge',
        });
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [visible, cwd, filePath]);

  const rawLines = (fileData?.content ?? '').split(/\r?\n/);
  const filteredLines = searchQuery.trim()
    ? rawLines
        .map((ln, idx) => ({ ln, num: idx + 1 }))
        .filter((r) => r.ln.toLowerCase().includes(searchQuery.trim().toLowerCase()))
    : rawLines.map((ln, idx) => ({ ln, num: idx + 1 }));

  const csvRows =
    fileData?.kind === 'csv'
      ? rawLines
          .filter((l) => l.trim().length > 0)
          .slice(0, 120)
          .map((l) => (fileData.language === 'TSV' ? l.split('\t') : l.split(',')))
      : [];

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.viewerBackdrop}>
        <View style={styles.viewerSheet}>
          {/* Top Header */}
          <View style={styles.viewerHeader}>
            <View style={{ flex: 1, paddingRight: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                <FileCode2 size={15} color={COLORS.lime} />
                <Text style={styles.viewerTitle} numberOfLines={1}>
                  {fileData?.name ?? filePath ?? 'FILE VIEWER'}
                </Text>
              </View>
              <Text style={styles.viewerPathSub} numberOfLines={1}>
                {fileData?.relativePath ?? filePath ?? ''}
              </Text>
            </View>
            <SpringButton style={styles.viewerCloseBtn} onPress={onClose}>
              <X size={17} color={COLORS.bone} />
            </SpringButton>
          </View>

          {/* Telemetry & View Mode Bar */}
          {fileData && fileData.ok ? (
            <View style={styles.viewerMetaStrip}>
              <View style={styles.viewerBadge}>
                <Text style={styles.viewerBadgeText}>{fileData.language}</Text>
              </View>
              {fileData.lineCount > 0 ? (
                <Text style={styles.viewerMetaText}>{fileData.lineCount} LINES</Text>
              ) : null}
              <Text style={styles.viewerMetaText}>
                {fileData.size >= 1024
                  ? `${(fileData.size / 1024).toFixed(1)} KB`
                  : `${fileData.size} B`}
              </Text>
              <View style={{ flex: 1 }} />
              {fileData.kind === 'markdown' || fileData.kind === 'csv' ? (
                <View style={styles.viewerToggleGroup}>
                  <SpringButton
                    style={[
                      styles.viewerToggleBtn,
                      viewMode === 'rendered' && styles.viewerToggleBtnActive,
                    ]}
                    onPress={() => setViewMode('rendered')}
                  >
                    <Layers
                      size={11}
                      color={viewMode === 'rendered' ? COLORS.bg : COLORS.muted}
                    />
                    <Text
                      style={[
                        styles.viewerToggleText,
                        viewMode === 'rendered' && { color: COLORS.bg },
                      ]}
                    >
                      RENDERED
                    </Text>
                  </SpringButton>
                  <SpringButton
                    style={[
                      styles.viewerToggleBtn,
                      viewMode === 'source' && styles.viewerToggleBtnActive,
                    ]}
                    onPress={() => setViewMode('source')}
                  >
                    <Text
                      style={[
                        styles.viewerToggleText,
                        viewMode === 'source' && { color: COLORS.bg },
                      ]}
                    >
                      SOURCE
                    </Text>
                  </SpringButton>
                </View>
              ) : null}
            </View>
          ) : null}

          {/* In-File Search Input (when viewing source code/text) */}
          {fileData?.ok && fileData.kind !== 'image' && viewMode === 'source' ? (
            <View style={styles.viewerSearchRow}>
              <Search size={14} color={COLORS.cyan} />
              <TextInput
                style={styles.viewerSearchInput}
                placeholder="Search inside file…"
                placeholderTextColor={COLORS.dim}
                value={searchQuery}
                onChangeText={setSearchQuery}
                autoCapitalize="none"
              />
              {searchQuery ? (
                <Text style={styles.viewerMatchCount}>{filteredLines.length} HITS</Text>
              ) : null}
            </View>
          ) : null}

          {/* Main File Body */}
          {loading ? (
            <CussSmallArtLoader
              variant="card"
              title="RENDERING WORKSPACE FILE"
              subtitle="Streaming file bytes & syntax AST from Mac…"
              accentColor={COLORS.lime}
            />
          ) : !fileData?.ok ? (
            <View style={styles.viewerErrorCard}>
              <Text style={styles.viewerErrorText}>
                {fileData?.error ?? 'Unable to read file.'}
              </Text>
            </View>
          ) : fileData.kind === 'image' && fileData.imageBase64 ? (
            <ScrollView contentContainerStyle={{ alignItems: 'center', paddingVertical: 14 }}>
              <Image
                source={{ uri: fileData.imageBase64 }}
                style={{ width: '100%', height: 360, borderRadius: 12, backgroundColor: '#05050A' }}
                resizeMode="contain"
              />
            </ScrollView>
          ) : fileData.kind === 'markdown' && viewMode === 'rendered' ? (
            <ScrollView
              style={styles.viewerMarkdownScroll}
              contentContainerStyle={{ padding: 12, paddingBottom: 28 }}
            >
              <MarkdownRenderer content={fileData.content} />
            </ScrollView>
          ) : fileData.kind === 'csv' && viewMode === 'rendered' ? (
            <ScrollView style={{ maxHeight: 460 }}>
              <ScrollView horizontal showsHorizontalScrollIndicator>
                <View style={styles.tableBox}>
                  {csvRows.map((r, rIdx) => (
                    <View
                      key={rIdx}
                      style={[styles.tableRow, rIdx === 0 && styles.tableHeaderRow]}
                    >
                      {r.map((cell, cIdx) => (
                        <Text
                          key={cIdx}
                          style={[styles.tableCell, rIdx === 0 && styles.tableHeaderCell]}
                        >
                          {cell.trim()}
                        </Text>
                      ))}
                    </View>
                  ))}
                </View>
              </ScrollView>
            </ScrollView>
          ) : (
            <ScrollView style={styles.viewerCodeScroll} contentContainerStyle={{ paddingBottom: 24 }}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.codeBody}>
                  {filteredLines.slice(0, 800).map(({ ln, num }) => {
                    const isHighlighted = fileData.highlightLine === num;
                    return (
                      <View
                        key={num}
                        style={[
                          styles.codeRow,
                          isHighlighted && {
                            backgroundColor: 'rgba(212, 255, 0, 0.16)',
                            borderLeftWidth: 3,
                            borderLeftColor: COLORS.lime,
                            paddingLeft: 4,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.codeGutter,
                            isHighlighted && { color: COLORS.lime, fontFamily: FONTS.monoBold },
                          ]}
                        >
                          {String(num).padStart(3, '0')}
                        </Text>
                        <Text selectable style={styles.codeText}>
                          {ln || ' '}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              </ScrollView>
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  mdContainer: {
    gap: 8,
  },
  headingWrap: {
    borderLeftWidth: 3,
    borderLeftColor: COLORS.violet,
    paddingLeft: 10,
    marginTop: 6,
    marginBottom: 2,
  },
  headingText: {
    fontFamily: FONTS.syne,
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.bone,
  },
  h1Text: {
    fontFamily: FONTS.mogi,
    fontSize: 20,
    color: COLORS.lime,
    letterSpacing: 0.6,
  },
  h2Text: {
    fontFamily: FONTS.display,
    fontSize: 16,
    color: COLORS.cyan,
  },
  paragraphText: {
    flex: 1,
    fontFamily: FONTS.body,
    fontSize: 14.5,
    lineHeight: 22,
    color: COLORS.bone,
  },
  boldText: {
    fontFamily: FONTS.bodyBold,
    color: '#FFFFFF',
  },
  italicText: {
    fontStyle: 'italic',
    color: COLORS.muted,
  },
  inlineCode: {
    fontFamily: FONTS.monoBold,
    fontSize: 12.5,
    color: COLORS.lime,
    backgroundColor: COLORS.plateHi,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  atMention: {
    fontFamily: FONTS.monoBold,
    fontSize: 12.5,
    color: COLORS.cyan,
    backgroundColor: COLORS.cyanDim,
  },
  linkText: {
    fontFamily: FONTS.bodyBold,
    color: COLORS.cyan,
    textDecorationLine: 'underline',
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
    paddingLeft: 4,
  },
  bulletDiamond: {
    width: 6,
    height: 6,
    backgroundColor: COLORS.lime,
    transform: [{ rotate: '45deg' }],
    marginTop: 8,
  },
  orderedNum: {
    fontFamily: FONTS.monoBold,
    fontSize: 12.5,
    color: COLORS.cyan,
    marginTop: 2,
    minWidth: 18,
  },
  quoteBlock: {
    borderLeftWidth: 3,
    borderLeftColor: COLORS.magenta,
    backgroundColor: COLORS.plate,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  quoteText: {
    fontFamily: FONTS.body,
    fontSize: 13.5,
    color: COLORS.muted,
    fontStyle: 'italic',
    lineHeight: 20,
  },
  hrLine: {
    height: 1.5,
    backgroundColor: COLORS.border,
    marginVertical: 6,
  },
  codeCard: {
    backgroundColor: '#050509',
    borderWidth: 1.5,
    borderColor: COLORS.borderHi,
    borderRadius: 12,
    overflow: 'hidden',
    marginVertical: 4,
  },
  codeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.plate,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    gap: 8,
  },
  codeLangBadge: {
    backgroundColor: COLORS.limeDim,
    borderWidth: 1,
    borderColor: COLORS.lime,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  codeLangText: {
    fontFamily: FONTS.monoBold,
    fontSize: 10,
    color: COLORS.lime,
    letterSpacing: 1,
  },
  codeLineCount: {
    fontFamily: FONTS.mono,
    fontSize: 10,
    color: COLORS.muted,
    flex: 1,
  },
  copyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: COLORS.surface,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  copyBtnText: {
    fontFamily: FONTS.monoBold,
    fontSize: 9.5,
    color: COLORS.muted,
  },
  codeBody: {
    paddingVertical: 10,
    paddingHorizontal: 10,
    minWidth: '100%',
  },
  codeRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 1.5,
  },
  codeGutter: {
    fontFamily: FONTS.mono,
    fontSize: 11,
    color: COLORS.dim,
    width: 26,
    marginRight: 8,
  },
  codeText: {
    fontFamily: FONTS.mono,
    fontSize: 12.5,
    color: '#E2E8F0',
    lineHeight: 18,
  },
  tableBox: {
    borderWidth: 1,
    borderColor: COLORS.borderHi,
    borderRadius: 8,
    overflow: 'hidden',
    marginVertical: 4,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  tableHeaderRow: {
    backgroundColor: COLORS.plateHi,
  },
  tableCell: {
    fontFamily: FONTS.body,
    fontSize: 12.5,
    color: COLORS.bone,
    paddingVertical: 6,
    paddingHorizontal: 10,
    minWidth: 90,
    borderRightWidth: 1,
    borderRightColor: COLORS.border,
  },
  tableHeaderCell: {
    fontFamily: FONTS.bodyBold,
    color: COLORS.lime,
  },
  thinkingBox: {
    backgroundColor: 'rgba(255, 42, 133, 0.07)',
    borderWidth: 1,
    borderColor: 'rgba(255, 42, 133, 0.35)',
    borderRadius: 12,
    padding: 10,
    marginVertical: 3,
  },
  thinkingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  thinkingTitle: {
    fontFamily: FONTS.monoBold,
    fontSize: 10.5,
    color: COLORS.magenta,
    letterSpacing: 1.1,
  },
  thinkingMeta: {
    fontFamily: FONTS.mono,
    fontSize: 9.5,
    color: COLORS.muted,
  },
  thinkingPreview: {
    fontFamily: FONTS.body,
    fontSize: 12,
    color: COLORS.muted,
    marginTop: 5,
    fontStyle: 'italic',
  },
  thinkingBody: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 42, 133, 0.2)',
  },
  thinkingText: {
    fontFamily: FONTS.body,
    fontSize: 13,
    lineHeight: 19,
    color: '#D5D9F0',
  },
  toolCard: {
    backgroundColor: COLORS.surface,
    borderWidth: 1.2,
    borderRadius: 11,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginVertical: 3,
  },
  toolCardRunning: {
    borderColor: COLORS.cyan,
  },
  toolCardDone: {
    borderColor: COLORS.borderHi,
  },
  toolHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  toolNameText: {
    fontFamily: FONTS.monoBold,
    fontSize: 10.5,
    color: COLORS.cyan,
    letterSpacing: 0.8,
  },
  toolSummaryText: {
    flex: 1,
    fontFamily: FONTS.mono,
    fontSize: 11.5,
    color: COLORS.bone,
  },
  toolStatusBadge: {
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  toolStatusText: {
    fontFamily: FONTS.monoBold,
    fontSize: 9,
    letterSpacing: 0.8,
  },
  toolDetailsBox: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  toolDetailsText: {
    fontFamily: FONTS.mono,
    fontSize: 11,
    color: COLORS.muted,
    lineHeight: 16,
  },
  toolUrlBar: {
    marginTop: 7,
    paddingTop: 7,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    gap: 6,
  },
  toolUrlItem: {
    backgroundColor: COLORS.plate,
    borderWidth: 1,
    borderColor: COLORS.borderHi,
    borderRadius: 8,
    padding: 8,
    gap: 6,
  },
  toolUrlText: {
    fontFamily: FONTS.mono,
    fontSize: 10.5,
    color: COLORS.cyan,
  },
  toolUrlBtnsRow: {
    flexDirection: 'row',
    gap: 6,
  },
  urlMobileBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    backgroundColor: COLORS.lime,
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  urlMobileBtnText: {
    fontFamily: FONTS.monoBold,
    fontSize: 9.5,
    color: COLORS.bg,
  },
  urlMacBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.cyan,
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  urlMacBtnText: {
    fontFamily: FONTS.monoBold,
    fontSize: 9.5,
    color: COLORS.cyan,
  },
  inlineFileLink: {
    color: COLORS.cyan,
    textDecorationLine: 'underline',
    backgroundColor: COLORS.cyanDim,
  },
  toolViewFileBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.cyanDim,
    borderWidth: 1,
    borderColor: COLORS.cyan,
    borderRadius: 5,
    paddingHorizontal: 6,
    paddingVertical: 2.5,
  },
  toolViewFileText: {
    fontFamily: FONTS.monoBold,
    fontSize: 8.5,
    color: COLORS.cyan,
    letterSpacing: 0.7,
  },
  viewerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(5, 5, 11, 0.88)',
    justifyContent: 'flex-end',
  },
  viewerSheet: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 2,
    borderColor: COLORS.lime,
    padding: 16,
    maxHeight: '90%',
    gap: 10,
  },
  viewerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  viewerTitle: {
    fontFamily: FONTS.mogiAlt,
    fontSize: 20,
    color: COLORS.lime,
  },
  viewerPathSub: {
    fontFamily: FONTS.mono,
    fontSize: 10,
    color: COLORS.muted,
    marginTop: 2,
  },
  viewerCloseBtn: {
    backgroundColor: COLORS.plate,
    borderWidth: 1,
    borderColor: COLORS.borderHi,
    borderRadius: 10,
    padding: 8,
  },
  viewerMetaStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.plate,
    borderWidth: 1,
    borderColor: COLORS.borderHi,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  viewerBadge: {
    backgroundColor: COLORS.limeDim,
    borderWidth: 1,
    borderColor: COLORS.lime,
    borderRadius: 5,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  viewerBadgeText: {
    fontFamily: FONTS.monoBold,
    fontSize: 9,
    color: COLORS.lime,
    letterSpacing: 0.8,
  },
  viewerMetaText: {
    fontFamily: FONTS.mono,
    fontSize: 10,
    color: COLORS.muted,
  },
  viewerToggleGroup: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    borderRadius: 7,
    padding: 2,
    gap: 3,
    borderWidth: 1,
    borderColor: COLORS.borderHi,
  },
  viewerToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  viewerToggleBtnActive: {
    backgroundColor: COLORS.lime,
  },
  viewerToggleText: {
    fontFamily: FONTS.monoBold,
    fontSize: 9,
    color: COLORS.muted,
  },
  viewerSearchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.plate,
    borderWidth: 1,
    borderColor: COLORS.cyan,
    borderRadius: 9,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  viewerSearchInput: {
    flex: 1,
    fontFamily: FONTS.mono,
    fontSize: 12,
    color: COLORS.bone,
  },
  viewerMatchCount: {
    fontFamily: FONTS.monoBold,
    fontSize: 9.5,
    color: COLORS.cyan,
  },
  viewerCodeScroll: {
    maxHeight: 480,
    backgroundColor: '#05050A',
    borderWidth: 1,
    borderColor: COLORS.borderHi,
    borderRadius: 12,
  },
  viewerMarkdownScroll: {
    maxHeight: 480,
    backgroundColor: COLORS.plate,
    borderWidth: 1,
    borderColor: COLORS.borderHi,
    borderRadius: 12,
  },
  viewerErrorCard: {
    backgroundColor: COLORS.magentaDim,
    borderWidth: 1,
    borderColor: COLORS.magenta,
    borderRadius: 12,
    padding: 16,
  },
  viewerErrorText: {
    fontFamily: FONTS.mono,
    fontSize: 12,
    color: COLORS.magenta,
  },
});
