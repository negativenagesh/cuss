import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  Check,
  ChevronRight,
  FolderGit2,
  GitBranch,
  Laptop,
  RefreshCw,
  Search,
  SpringButton,
  X,
} from './CussIcons';
import { localBrowseDirs, localProjects } from '../api/client';
import { ProjectEntry, useStore } from '../store';
import { COLORS, FONTS } from '../theme';

type BrowseDirsResponse = Awaited<ReturnType<typeof localBrowseDirs>>;

interface Props {
  visible: boolean;
  onClose: () => void;
  onSelectDirectory?: (cwd: string) => void;
}

export default function DirectoryPickerModal({
  visible,
  onClose,
  onSelectDirectory,
}: Props) {
  const {
    projects,
    setProjects,
    ideState,
    selectedCwd,
    setSelectedCwd,
  } = useStore();

  const [tab, setTab] = useState<'projects' | 'browse'>('projects');
  const [search, setSearch] = useState('');
  const [customPath, setCustomPath] = useState(selectedCwd || '');
  const [browseData, setBrowseData] = useState<BrowseDirsResponse | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setCustomPath(selectedCwd || ideState?.activeWorkspace?.path || '');
    setLoading(true);
    Promise.all([
      localProjects().catch(() => null),
      localBrowseDirs(selectedCwd || ideState?.activeWorkspace?.path || undefined).catch(() => null),
    ])
      .then(([projRes, dirRes]) => {
        if (projRes?.projects && Array.isArray(projRes.projects)) {
          setProjects(projRes.projects);
        }
        if (dirRes) {
          setBrowseData(dirRes);
        }
      })
      .finally(() => setLoading(false));
  }, [visible]);

  async function navigateFolder(targetPath?: string) {
    setLoading(true);
    try {
      const res = await localBrowseDirs(targetPath);
      setBrowseData(res);
      setCustomPath(res.currentPath);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }

  function pick(path: string) {
    const clean = path.trim();
    if (!clean) return;
    setSelectedCwd(clean);
    onSelectDirectory?.(clean);
    onClose();
  }

  const filteredProjects = (Array.isArray(projects) ? projects : []).filter((p) => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return (
      p.name.toLowerCase().includes(q) ||
      p.path.toLowerCase().includes(q) ||
      (p.branch && p.branch.toLowerCase().includes(q))
    );
  });

  const activePath = selectedCwd || ideState?.activeWorkspace?.path || '';

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onClose}
    >
      <View style={s.backdrop}>
        <View style={s.sheet}>
          {/* Header */}
          <View style={s.header}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
              <FolderGit2 size={16} color={COLORS.lime} />
              <View style={{ flex: 1 }}>
                <Text style={s.title}>SELECT MAC WORKING DIRECTORY</Text>
                <Text style={s.subtitle} numberOfLines={1}>
                  {activePath ? `ACTIVE // ${activePath}` : 'Choose project folder or browse Mac'}
                </Text>
              </View>
            </View>
            <SpringButton style={s.closeBtn} onPress={onClose}>
              <X size={15} color={COLORS.bone} />
            </SpringButton>
          </View>

          {/* Mode Tabs: DISCOVERED PROJECTS vs BROWSE MAC FOLDERS */}
          <View style={s.tabBar}>
            <SpringButton
              style={[s.tabBtn, tab === 'projects' && s.tabBtnActive]}
              onPress={() => setTab('projects')}
            >
              <FolderGit2 size={12} color={tab === 'projects' ? COLORS.bg : COLORS.bone} />
              <Text style={[s.tabText, tab === 'projects' && { color: COLORS.bg }]}>
                PROJECTS ({projects.length})
              </Text>
            </SpringButton>
            <SpringButton
              style={[s.tabBtn, tab === 'browse' && s.tabBtnActive]}
              onPress={() => {
                setTab('browse');
                if (!browseData) void navigateFolder(activePath || undefined);
              }}
            >
              <Laptop size={12} color={tab === 'browse' ? COLORS.bg : COLORS.bone} />
              <Text style={[s.tabText, tab === 'browse' && { color: COLORS.bg }]}>
                BROWSE MAC FOLDERS
              </Text>
            </SpringButton>
          </View>

          {tab === 'projects' ? (
            <View style={{ flex: 1, gap: 10 }}>
              {/* Search Box */}
              <View style={s.searchBox}>
                <Search size={13} color={COLORS.muted} />
                <TextInput
                  style={s.searchInput}
                  placeholder="Search project name, path, or git branch…"
                  placeholderTextColor={COLORS.dim}
                  value={search}
                  onChangeText={setSearch}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                {search ? (
                  <SpringButton onPress={() => setSearch('')}>
                    <X size={13} color={COLORS.muted} />
                  </SpringButton>
                ) : null}
              </View>

              <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: 8, paddingBottom: 16 }}>
                {/* Active Mac Cursor IDE Workspace Pin */}
                {ideState?.activeWorkspace ? (
                  <SpringButton
                    style={[
                      s.projCard,
                      activePath === ideState.activeWorkspace.path && s.projCardActive,
                    ]}
                    onPress={() => pick(ideState.activeWorkspace!.path)}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <View style={s.ideBadge}>
                        <Text style={s.ideBadgeText}>MAC IDE ACTIVE</Text>
                      </View>
                      <Text style={s.projName} numberOfLines={1}>
                        {ideState.activeWorkspace.name}
                      </Text>
                      {ideState.activeWorkspace.branch ? (
                        <View style={s.branchBadge}>
                          <GitBranch size={10} color={COLORS.cyan} />
                          <Text style={s.branchText}>{ideState.activeWorkspace.branch}</Text>
                        </View>
                      ) : null}
                      <View style={{ flex: 1 }} />
                      {activePath === ideState.activeWorkspace.path ? (
                        <Check size={15} color={COLORS.lime} strokeWidth={2.8} />
                      ) : null}
                    </View>
                    <Text style={s.projPath} numberOfLines={1}>
                      {ideState.activeWorkspace.path}
                    </Text>
                  </SpringButton>
                ) : null}

                {filteredProjects.map((proj: ProjectEntry) => {
                  const isSelected = activePath === proj.path;
                  return (
                    <SpringButton
                      key={proj.path}
                      style={[s.projCard, isSelected && s.projCardActive]}
                      onPress={() => pick(proj.path)}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <FolderGit2
                          size={14}
                          color={isSelected ? COLORS.lime : COLORS.cyan}
                        />
                        <Text
                          style={[s.projName, isSelected && { color: COLORS.lime }]}
                          numberOfLines={1}
                        >
                          {proj.name}
                        </Text>
                        {proj.source === 'worktree' ? (
                          <View style={[s.ideBadge, { backgroundColor: COLORS.violetDim, borderColor: COLORS.violet }]}>
                            <Text style={[s.ideBadgeText, { color: COLORS.violet }]}>WORKTREE</Text>
                          </View>
                        ) : null}
                        {proj.branch ? (
                          <View style={s.branchBadge}>
                            <GitBranch size={10} color={COLORS.cyan} />
                            <Text style={s.branchText}>{proj.branch}</Text>
                          </View>
                        ) : null}
                        <View style={{ flex: 1 }} />
                        {isSelected ? (
                          <Check size={15} color={COLORS.lime} strokeWidth={2.8} />
                        ) : null}
                      </View>
                      <Text style={s.projPath} numberOfLines={1}>
                        {proj.path}
                      </Text>
                    </SpringButton>
                  );
                })}
              </ScrollView>
            </View>
          ) : (
            <View style={{ flex: 1, gap: 10 }}>
              {/* Current Folder Bar + USE THIS FOLDER CTA */}
              <View style={s.currentDirBar}>
                <View style={{ flex: 1 }}>
                  <Text style={s.currentDirLabel}>CURRENT MAC FOLDER</Text>
                  <Text style={s.currentDirValue} numberOfLines={1}>
                    {browseData?.currentPath || customPath || '~'}
                  </Text>
                </View>
                <SpringButton
                  style={s.useFolderBtn}
                  onPress={() => pick(browseData?.currentPath || customPath)}
                >
                  <Check size={13} color={COLORS.bg} strokeWidth={2.8} />
                  <Text style={s.useFolderBtnText}>SELECT THIS</Text>
                </SpringButton>
              </View>

              {/* Quick Jump Bookmarks */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxHeight: 34 }}>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {browseData?.parentPath ? (
                    <SpringButton
                      style={s.jumpChip}
                      onPress={() => void navigateFolder(browseData.parentPath)}
                    >
                      <Text style={[s.jumpChipText, { color: COLORS.amber }]}>⬆ PARENT (..)</Text>
                    </SpringButton>
                  ) : null}
                  {[
                    { label: '~ HOME', path: '' },
                    { label: 'DOWNLOADS', path: '/Users/subramanyadattatrayag/Downloads' },
                    { label: 'CUSS REPO', path: '/Users/subramanyadattatrayag/Downloads/cuss' },
                  ].map((bm) => (
                    <SpringButton
                      key={bm.label}
                      style={s.jumpChip}
                      onPress={() => void navigateFolder(bm.path || undefined)}
                    >
                      <Text style={s.jumpChipText}>{bm.label}</Text>
                    </SpringButton>
                  ))}
                </View>
              </ScrollView>

              {/* Subdirectory List */}
              {loading ? (
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                  <ActivityIndicator color={COLORS.lime} />
                </View>
              ) : (
                <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: 6, paddingBottom: 16 }}>
                  {(browseData?.directories ?? []).map((entry) => (
                    <View key={entry.path} style={s.dirRow}>
                      <SpringButton
                        style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}
                        onPress={() => void navigateFolder(entry.path)}
                      >
                        <FolderGit2
                          size={14}
                          color={entry.isGitRepo ? COLORS.lime : COLORS.cyan}
                        />
                        <Text style={s.dirName} numberOfLines={1}>
                          {entry.name}
                        </Text>
                        {entry.isGitRepo ? (
                          <View style={s.gitTag}>
                            <Text style={s.gitTagText}>GIT</Text>
                          </View>
                        ) : null}
                        <View style={{ flex: 1 }} />
                        <ChevronRight size={14} color={COLORS.muted} />
                      </SpringButton>
                      <SpringButton
                        style={s.pickMiniBtn}
                        onPress={() => pick(entry.path)}
                      >
                        <Text style={s.pickMiniText}>USE</Text>
                      </SpringButton>
                    </View>
                  ))}
                </ScrollView>
              )}

              {/* Direct Custom Path Input */}
              <View style={s.customRow}>
                <TextInput
                  style={s.customInput}
                  placeholder="/Users/…/your-project"
                  placeholderTextColor={COLORS.dim}
                  value={customPath}
                  onChangeText={setCustomPath}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <SpringButton
                  style={s.useFolderBtn}
                  onPress={() => pick(customPath)}
                >
                  <Text style={s.useFolderBtnText}>SET PATH</Text>
                </SpringButton>
              </View>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(5, 5, 10, 0.86)',
    justifyContent: 'flex-end',
  },
  sheet: {
    height: '86%',
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
    justifyContent: 'space-between',
  },
  title: {
    fontFamily: FONTS.monoBold,
    fontSize: 13,
    color: COLORS.lime,
    letterSpacing: 1,
  },
  subtitle: {
    fontFamily: FONTS.mono,
    fontSize: 10,
    color: COLORS.muted,
    marginTop: 2,
  },
  closeBtn: {
    padding: 8,
    borderRadius: 9,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.borderHi,
  },
  tabBar: {
    flexDirection: 'row',
    gap: 8,
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.borderHi,
    backgroundColor: COLORS.surface,
  },
  tabBtnActive: {
    backgroundColor: COLORS.lime,
    borderColor: COLORS.lime,
  },
  tabText: {
    fontFamily: FONTS.monoBold,
    fontSize: 10.5,
    color: COLORS.bone,
    letterSpacing: 0.7,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.borderHi,
    borderRadius: 10,
    paddingHorizontal: 11,
    paddingVertical: 8,
  },
  searchInput: {
    flex: 1,
    fontFamily: FONTS.mono,
    fontSize: 12,
    color: COLORS.bone,
    padding: 0,
  },
  projCard: {
    backgroundColor: COLORS.surface,
    borderWidth: 1.2,
    borderColor: COLORS.borderHi,
    borderRadius: 12,
    padding: 12,
    gap: 5,
  },
  projCardActive: {
    borderColor: COLORS.lime,
    backgroundColor: COLORS.limeDim,
  },
  projName: {
    fontFamily: FONTS.bodyBold,
    fontSize: 14,
    color: COLORS.bone,
  },
  projPath: {
    fontFamily: FONTS.mono,
    fontSize: 10.5,
    color: COLORS.muted,
  },
  ideBadge: {
    backgroundColor: COLORS.limeDim,
    borderWidth: 1,
    borderColor: COLORS.lime,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  ideBadgeText: {
    fontFamily: FONTS.monoBold,
    fontSize: 8.5,
    color: COLORS.lime,
    letterSpacing: 0.6,
  },
  branchBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.cyanDim,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  branchText: {
    fontFamily: FONTS.monoBold,
    fontSize: 9.5,
    color: COLORS.cyan,
  },
  currentDirBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: COLORS.surface,
    borderWidth: 1.2,
    borderColor: COLORS.cyan,
    borderRadius: 11,
    padding: 10,
  },
  currentDirLabel: {
    fontFamily: FONTS.monoBold,
    fontSize: 8.5,
    color: COLORS.cyan,
    letterSpacing: 0.8,
  },
  currentDirValue: {
    fontFamily: FONTS.mono,
    fontSize: 11,
    color: COLORS.bone,
    marginTop: 2,
  },
  useFolderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: COLORS.lime,
    borderRadius: 9,
    paddingHorizontal: 11,
    paddingVertical: 8,
  },
  useFolderBtnText: {
    fontFamily: FONTS.monoBold,
    fontSize: 10,
    color: COLORS.bg,
    letterSpacing: 0.6,
  },
  jumpChip: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.borderHi,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  jumpChipText: {
    fontFamily: FONTS.monoBold,
    fontSize: 9.5,
    color: COLORS.cyan,
  },
  dirRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 11,
    paddingVertical: 9,
  },
  dirName: {
    fontFamily: FONTS.bodyBold,
    fontSize: 13,
    color: COLORS.bone,
    maxWidth: 210,
  },
  gitTag: {
    backgroundColor: COLORS.limeDim,
    borderWidth: 1,
    borderColor: COLORS.lime,
    borderRadius: 5,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  gitTagText: {
    fontFamily: FONTS.monoBold,
    fontSize: 8,
    color: COLORS.lime,
  },
  pickMiniBtn: {
    backgroundColor: COLORS.cyanDim,
    borderWidth: 1,
    borderColor: COLORS.cyan,
    borderRadius: 7,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  pickMiniText: {
    fontFamily: FONTS.monoBold,
    fontSize: 9.5,
    color: COLORS.cyan,
  },
  customRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  customInput: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.borderHi,
    borderRadius: 10,
    paddingHorizontal: 11,
    paddingVertical: 8,
    fontFamily: FONTS.mono,
    fontSize: 11.5,
    color: COLORS.bone,
  },
});
