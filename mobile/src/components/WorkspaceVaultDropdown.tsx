import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import Svg, { Line, Path, Rect } from 'react-native-svg';
import FadeIn from './FadeIn';
import { CussSmallArtLoader } from './CussArt';
import {
  ArrowUpRight,
  Check,
  ChevronDown,
  ChevronRight,
  CussStarGlyph,
  FolderGit2,
  GitBranch,
  Laptop,
  Search,
  Sparkles,
  SpringButton,
} from './CussIcons';
import { localBrowseDirs } from '../api/client';
import { ProjectEntry } from '../store';
import { COLORS, FONTS, MOTION } from '../theme';

type VaultTab = 'workspaces' | 'disk' | 'raw';

/**
 * Quirky Brutalist-Cybernetic Workspace Vault Dropdown
 * Replaces horizontal chip swiping with a sculptural vertical accordion vault
 * featuring:
 *  1. CURSOR VAULT: Vertical stack of Cursor IDE workspaces (highlights LIVE IN MAC IDE)
 *  2. MAC DISK TREE: Interactive live folder drill-down on the Mac
 *  3. DIRECT PATH: Raw monospace path editor
 */
export default function WorkspaceVaultDropdown({
  cwd,
  onSelectCwd,
  projects,
  activeIdePath,
}: {
  cwd: string;
  onSelectCwd: (nextPath: string) => void;
  projects: ProjectEntry[];
  activeIdePath?: string;
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<VaultTab>('workspaces');
  const [filter, setFilter] = useState('');

  // Live Mac Disk Tree state
  const [browsePath, setBrowsePath] = useState<string>('');
  const [parentPath, setParentPath] = useState<string>('');
  const [dirs, setDirs] = useState<{ name: string; path: string; branch?: string; isGitRepo: boolean }[]>([]);
  const [loadingDirs, setLoadingDirs] = useState(false);

  const chevronRot = useSharedValue(0);

  useEffect(() => {
    chevronRot.value = withSpring(open ? 180 : 0, MOTION.spring.snappy);
  }, [open, chevronRot]);

  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${chevronRot.value}deg` }],
  }));

  useEffect(() => {
    if (open && tab === 'disk') {
      void loadDiskDir(browsePath || cwd || undefined);
    }
  }, [open, tab]);

  async function loadDiskDir(target?: string) {
    setLoadingDirs(true);
    try {
      const res = await localBrowseDirs(target);
      setBrowsePath(res.currentPath);
      setParentPath(res.parentPath);
      setDirs(res.directories ?? []);
    } catch {
      /* ignore */
    } finally {
      setLoadingDirs(false);
    }
  }

  const matchedProject = projects.find((p) => p.path === cwd.trim());
  const folderName =
    matchedProject?.name || cwd.trim().split('/').filter(Boolean).pop() || 'SELECT WORKSPACE';
  const branch = matchedProject?.branch;
  const isLiveInIde =
    Boolean(activeIdePath && cwd.trim() === activeIdePath) || Boolean(matchedProject?.activeInIde);

  const filteredProjects = projects.filter(
    (p) =>
      !filter.trim() ||
      p.name.toLowerCase().includes(filter.trim().toLowerCase()) ||
      p.path.toLowerCase().includes(filter.trim().toLowerCase()) ||
      (p.branch ?? '').toLowerCase().includes(filter.trim().toLowerCase()),
  );

  return (
    <View style={styles.vaultWrapper}>
      {/* Sculptural Brutalist Trigger Plate */}
      <SpringButton
        style={[
          styles.triggerPlate,
          open && { borderColor: COLORS.lime, backgroundColor: COLORS.plateHi },
        ]}
        onPress={() => setOpen((v) => !v)}
      >
        {/* Decorative SVG Cyber-Notch & Corner Crosshairs */}
        <Svg width={18} height={18} viewBox="0 0 18 18" style={styles.cornerSvgTL} pointerEvents="none">
          <Path d="M1 10 L1 1 L10 1" stroke={COLORS.lime} strokeWidth={2} fill="none" />
        </Svg>
        <Svg width={18} height={18} viewBox="0 0 18 18" style={styles.cornerSvgBR} pointerEvents="none">
          <Path d="M17 8 L17 17 L8 17" stroke={COLORS.cyan} strokeWidth={2} fill="none" />
        </Svg>

        <View style={styles.triggerTopBar}>
          <View style={styles.vaultLabelGroup}>
            <CussStarGlyph size={13} color={open ? COLORS.lime : COLORS.cyan} />
            <Text style={styles.vaultLabelText}>
              {open ? 'VAULT UNFURLED // PICK TARGET' : 'WORKSPACE VAULT // TAP TO UNFURL'}
            </Text>
          </View>

          {isLiveInIde ? (
            <View style={styles.liveIdePill}>
              <View style={styles.livePulseDot} />
              <Text style={styles.liveIdePillText}>OPEN IN MAC IDE</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.triggerMainRow}>
          <View style={styles.iconHexBox}>
            <FolderGit2 size={20} color={COLORS.lime} strokeWidth={2.2} />
          </View>

          <View style={{ flex: 1 }}>
            <View style={styles.folderTitleRow}>
              <Text style={styles.folderDisplayTitle} numberOfLines={1}>
                {folderName}
              </Text>
              {branch ? (
                <View style={styles.branchBadge}>
                  <GitBranch size={11} color={COLORS.cyan} />
                  <Text style={styles.branchBadgeText} numberOfLines={1}>
                    {branch}
                  </Text>
                </View>
              ) : null}
            </View>
            <Text style={styles.fullPathSub} numberOfLines={1}>
              {cwd || '/Users/…'}
            </Text>
          </View>

          <Animated.View style={[styles.chevronBox, chevronStyle]}>
            <ChevronDown size={18} color={COLORS.bg} strokeWidth={2.8} />
          </Animated.View>
        </View>
      </SpringButton>

      {/* Unfurled Vertical Accordion Deck (Zero horizontal swiping!) */}
      {open ? (
        <View style={styles.unfurledDeck}>
          {/* 3 Tactical Mode Switcher Tabs */}
          <View style={styles.deckTabRow}>
            {(
              [
                { id: 'workspaces', label: `IDE VAULT (${projects.length})` },
                { id: 'disk', label: 'MAC DISK TREE' },
                { id: 'raw', label: 'RAW PATH' },
              ] as { id: VaultTab; label: string }[]
            ).map((t) => {
              const active = tab === t.id;
              return (
                <SpringButton
                  key={t.id}
                  style={[styles.deckTabBtn, active && styles.deckTabBtnActive]}
                  onPress={() => setTab(t.id)}
                >
                  <Text style={[styles.deckTabText, active && styles.deckTabTextActive]}>
                    {t.label}
                  </Text>
                </SpringButton>
              );
            })}
          </View>

          {tab === 'workspaces' ? (
            <View style={{ gap: 8 }}>
              <View style={styles.searchBar}>
                <Search size={14} color={COLORS.cyan} />
                <TextInput
                  style={styles.searchInput}
                  placeholder="Filter Mac workspaces or git branches…"
                  placeholderTextColor={COLORS.dim}
                  value={filter}
                  onChangeText={setFilter}
                  autoCapitalize="none"
                />
              </View>

              <ScrollView
                style={{ maxHeight: 250 }}
                nestedScrollEnabled
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={{ gap: 7 }}
              >
                {filteredProjects.map((p, idx) => {
                  const selected = cwd.trim() === p.path;
                  const live = p.activeInIde || (activeIdePath && p.path === activeIdePath);
                  return (
                    <FadeIn key={p.path} delay={Math.min(idx * 25, 220)}>
                      <SpringButton
                        style={[
                          styles.workspaceRowCard,
                          live && { borderColor: COLORS.cyan },
                          selected && {
                            borderColor: COLORS.lime,
                            backgroundColor: COLORS.limeDim,
                          },
                        ]}
                        onPress={() => {
                          onSelectCwd(p.path);
                          setOpen(false);
                        }}
                      >
                        <View style={styles.rowIndexBox}>
                          <Text style={styles.rowIndexText}>
                            {String(idx + 1).padStart(2, '0')}
                          </Text>
                        </View>

                        <View style={{ flex: 1, gap: 2 }}>
                          <View style={styles.rowTitleLine}>
                            <Text
                              style={[
                                styles.rowProjectName,
                                selected && { color: COLORS.lime },
                              ]}
                              numberOfLines={1}
                            >
                              {p.name}
                            </Text>
                            {live ? (
                              <View style={styles.ideActiveMiniTag}>
                                <Laptop size={9} color={COLORS.bg} />
                                <Text style={styles.ideActiveMiniText}>IDE OPEN</Text>
                              </View>
                            ) : null}
                            {p.branch ? (
                              <View style={styles.rowBranchPill}>
                                <GitBranch size={10} color={COLORS.cyan} />
                                <Text style={styles.rowBranchText} numberOfLines={1}>
                                  {p.branch}
                                </Text>
                              </View>
                            ) : null}
                          </View>
                          <Text style={styles.rowPathText} numberOfLines={1}>
                            {p.path}
                          </Text>
                        </View>

                        {selected ? (
                          <Check size={17} color={COLORS.lime} strokeWidth={2.8} />
                        ) : (
                          <ArrowUpRight size={15} color={COLORS.muted} />
                        )}
                      </SpringButton>
                    </FadeIn>
                  );
                })}
              </ScrollView>
            </View>
          ) : tab === 'disk' ? (
            <View style={{ gap: 8 }}>
              <View style={styles.diskCurrentBar}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.diskCurrentLabel}>CURRENT MAC DIRECTORY</Text>
                  <Text style={styles.diskCurrentPath} numberOfLines={1}>
                    {browsePath || cwd}
                  </Text>
                </View>
                <SpringButton
                  style={styles.upDirBtn}
                  onPress={() => parentPath && loadDiskDir(parentPath)}
                >
                  <Text style={styles.upDirBtnText}>.. UP</Text>
                </SpringButton>
                <SpringButton
                  style={styles.lockDirBtn}
                  onPress={() => {
                    if (browsePath) onSelectCwd(browsePath);
                    setOpen(false);
                  }}
                >
                  <Check size={13} color={COLORS.bg} strokeWidth={2.8} />
                  <Text style={styles.lockDirBtnText}>USE THIS</Text>
                </SpringButton>
              </View>

              {loadingDirs ? (
                <CussSmallArtLoader
                  variant="inline"
                  title="READING MAC DIRECTORY"
                  subtitle="Scanning folders & git branches on Mac disk…"
                  accentColor={COLORS.lime}
                />
              ) : (
                <ScrollView
                  style={{ maxHeight: 230 }}
                  nestedScrollEnabled
                  keyboardShouldPersistTaps="handled"
                  contentContainerStyle={{ gap: 6 }}
                >
                  {dirs.map((d) => (
                    <View key={d.path} style={styles.diskDirRow}>
                      <SpringButton
                        style={styles.diskDirDrillBtn}
                        onPress={() => loadDiskDir(d.path)}
                      >
                        <FolderGit2
                          size={15}
                          color={d.isGitRepo ? COLORS.lime : COLORS.cyan}
                        />
                        <Text style={styles.diskDirName} numberOfLines={1}>
                          {d.name}/
                        </Text>
                        {d.branch ? (
                          <View style={styles.rowBranchPill}>
                            <GitBranch size={9} color={COLORS.cyan} />
                            <Text style={styles.rowBranchText}>{d.branch}</Text>
                          </View>
                        ) : null}
                        <ChevronRight size={14} color={COLORS.muted} />
                      </SpringButton>

                      <SpringButton
                        style={styles.pickSubdirBtn}
                        onPress={() => {
                          onSelectCwd(d.path);
                          setOpen(false);
                        }}
                      >
                        <Text style={styles.pickSubdirText}>PICK</Text>
                      </SpringButton>
                    </View>
                  ))}
                </ScrollView>
              )}
            </View>
          ) : (
            <View style={{ gap: 8 }}>
              <Text style={styles.diskCurrentLabel}>TYPE OR PASTE ABSOLUTE MAC PATH</Text>
              <TextInput
                style={styles.rawPathInput}
                placeholder="/Users/subramanyadattatrayag/Downloads/project"
                placeholderTextColor={COLORS.dim}
                autoCapitalize="none"
                autoCorrect={false}
                value={cwd}
                onChangeText={onSelectCwd}
              />
              <SpringButton style={styles.lockRawBtn} onPress={() => setOpen(false)}>
                <Sparkles size={14} color={COLORS.bg} />
                <Text style={styles.lockDirBtnText}>LOCK PATH &amp; CLOSE VAULT</Text>
              </SpringButton>
            </View>
          )}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  vaultWrapper: {
    gap: 6,
  },
  triggerPlate: {
    backgroundColor: COLORS.surface,
    borderWidth: 1.5,
    borderColor: COLORS.cyan,
    borderRadius: 16,
    padding: 13,
    gap: 8,
  },
  cornerSvgTL: {
    position: 'absolute',
    top: 5,
    left: 5,
  },
  cornerSvgBR: {
    position: 'absolute',
    bottom: 5,
    right: 5,
  },
  triggerTopBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  vaultLabelGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  vaultLabelText: {
    fontFamily: FONTS.monoBold,
    fontSize: 9.5,
    color: COLORS.cyan,
    letterSpacing: 1.2,
  },
  liveIdePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: COLORS.limeDim,
    borderWidth: 1,
    borderColor: COLORS.lime,
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  livePulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.lime,
  },
  liveIdePillText: {
    fontFamily: FONTS.monoBold,
    fontSize: 8.5,
    color: COLORS.lime,
    letterSpacing: 0.9,
  },
  triggerMainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  iconHexBox: {
    width: 42,
    height: 42,
    borderRadius: 11,
    backgroundColor: COLORS.plate,
    borderWidth: 1.2,
    borderColor: COLORS.lime,
    alignItems: 'center',
    justifyContent: 'center',
  },
  folderTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  folderDisplayTitle: {
    fontFamily: FONTS.mogiAlt,
    fontSize: 20,
    color: COLORS.bone,
    letterSpacing: 0.6,
  },
  branchBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.plate,
    borderWidth: 1,
    borderColor: COLORS.cyan,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    maxWidth: 150,
  },
  branchBadgeText: {
    fontFamily: FONTS.monoBold,
    fontSize: 9.5,
    color: COLORS.cyan,
  },
  fullPathSub: {
    fontFamily: FONTS.mono,
    fontSize: 10.5,
    color: COLORS.muted,
    marginTop: 2,
  },
  chevronBox: {
    width: 32,
    height: 32,
    borderRadius: 9,
    backgroundColor: COLORS.lime,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unfurledDeck: {
    backgroundColor: COLORS.surface,
    borderWidth: 1.5,
    borderColor: COLORS.lime,
    borderRadius: 16,
    padding: 12,
    gap: 10,
  },
  deckTabRow: {
    flexDirection: 'row',
    backgroundColor: COLORS.plate,
    borderRadius: 10,
    padding: 3,
    gap: 4,
  },
  deckTabBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 7,
    borderRadius: 8,
  },
  deckTabBtnActive: {
    backgroundColor: COLORS.lime,
  },
  deckTabText: {
    fontFamily: FONTS.monoBold,
    fontSize: 9.5,
    color: COLORS.muted,
    letterSpacing: 0.7,
  },
  deckTabTextActive: {
    color: COLORS.bg,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.plate,
    borderWidth: 1,
    borderColor: COLORS.borderHi,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  searchInput: {
    flex: 1,
    fontFamily: FONTS.mono,
    fontSize: 12,
    color: COLORS.bone,
  },
  workspaceRowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: COLORS.plate,
    borderWidth: 1.2,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: 10,
  },
  rowIndexBox: {
    width: 26,
    height: 26,
    borderRadius: 6,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.borderHi,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowIndexText: {
    fontFamily: FONTS.monoBold,
    fontSize: 10,
    color: COLORS.lime,
  },
  rowTitleLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  rowProjectName: {
    fontFamily: FONTS.bodyBold,
    fontSize: 14,
    color: COLORS.bone,
  },
  ideActiveMiniTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: COLORS.lime,
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1.5,
  },
  ideActiveMiniText: {
    fontFamily: FONTS.monoBold,
    fontSize: 8,
    color: COLORS.bg,
  },
  rowBranchPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: COLORS.surface,
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    maxWidth: 130,
  },
  rowBranchText: {
    fontFamily: FONTS.mono,
    fontSize: 9.5,
    color: COLORS.cyan,
  },
  rowPathText: {
    fontFamily: FONTS.mono,
    fontSize: 10,
    color: COLORS.muted,
  },
  diskCurrentBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.plate,
    borderWidth: 1,
    borderColor: COLORS.borderHi,
    borderRadius: 10,
    padding: 9,
  },
  diskCurrentLabel: {
    fontFamily: FONTS.monoBold,
    fontSize: 8.5,
    color: COLORS.cyan,
    letterSpacing: 1,
  },
  diskCurrentPath: {
    fontFamily: FONTS.mono,
    fontSize: 11,
    color: COLORS.bone,
    marginTop: 1,
  },
  upDirBtn: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.borderHi,
    borderRadius: 7,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  upDirBtnText: {
    fontFamily: FONTS.monoBold,
    fontSize: 10,
    color: COLORS.bone,
  },
  lockDirBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.lime,
    borderRadius: 7,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  lockDirBtnText: {
    fontFamily: FONTS.monoBold,
    fontSize: 10,
    color: COLORS.bg,
  },
  diskDirRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  diskDirDrillBtn: {
    flex: 1,
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
  diskDirName: {
    flex: 1,
    fontFamily: FONTS.monoBold,
    fontSize: 12,
    color: COLORS.bone,
  },
  pickSubdirBtn: {
    backgroundColor: COLORS.cyanDim,
    borderWidth: 1,
    borderColor: COLORS.cyan,
    borderRadius: 9,
    paddingVertical: 9,
    paddingHorizontal: 10,
  },
  pickSubdirText: {
    fontFamily: FONTS.monoBold,
    fontSize: 10,
    color: COLORS.cyan,
  },
  rawPathInput: {
    fontFamily: FONTS.mono,
    fontSize: 12.5,
    backgroundColor: COLORS.plate,
    color: COLORS.bone,
    borderWidth: 1.2,
    borderColor: COLORS.borderHi,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  lockRawBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: COLORS.lime,
    borderRadius: 10,
    paddingVertical: 11,
  },
});
