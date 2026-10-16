import React from 'react';
import { Pressable, StyleProp, ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Path, Polygon, Rect } from 'react-native-svg';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  ArrowUpRight,
  AtSign,
  Bot,
  Brain,
  Bug,
  Check,
  ChevronDown,
  ChevronRight,
  Cloud,
  Code2,
  Compass,
  Copy,
  Cpu,
  Edit3,
  ExternalLink,
  Eye,
  FileCode2,
  FolderGit2,
  Gauge,
  GitBranch,
  Globe,
  Keyboard,
  Layers,
  Laptop,
  MessageSquare,
  Mic,
  Network,
  Plus,
  QrCode,
  RefreshCw,
  Search,
  Send,
  SlidersHorizontal,
  Sparkles,
  Square,
  Terminal,
  Trash2,
  Unplug,
  Wifi,
  X,
  Zap,
} from 'lucide-react-native';
import { COLORS, ExecutionMode, MOTION } from '../theme';

/**
 * Ultra-fast zero-latency interactive pressable wrapper (`unstable_pressDelay={0}`):
 * Responds in <16ms (1 frame) on Android & iOS without per-button worklet overhead or gesture lag.
 */
export function SpringButton({
  onPress,
  disabled,
  style,
  children,
  hitSlop,
  tiltOnPress = false,
}: {
  onPress?: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
  hitSlop?: number;
  tiltOnPress?: boolean;
}) {
  return (
    <Pressable
      disabled={disabled}
      hitSlop={hitSlop ?? 6}
      unstable_pressDelay={0}
      android_ripple={{ color: 'rgba(212, 255, 0, 0.16)', borderless: false }}
      onPress={onPress}
      style={({ pressed }) => [
        style,
        pressed && {
          transform: [{ scale: tiltOnPress ? 0.95 : 0.97 }],
          opacity: 0.85,
        },
      ]}
    >
      {children}
    </Pressable>
  );
}

export function ModeVectorIcon({
  mode,
  size = 15,
  color,
}: {
  mode: ExecutionMode;
  size?: number;
  color?: string;
}) {
  const c =
    color ??
    (mode === 'agent'
      ? COLORS.lime
      : mode === 'plan'
        ? COLORS.cyan
        : mode === 'ask'
          ? COLORS.amber
          : mode === 'debug'
            ? COLORS.magenta
            : COLORS.violet);

  switch (mode) {
    case 'agent':
      return <Bot size={size} color={c} strokeWidth={2.2} />;
    case 'plan':
      return <Compass size={size} color={c} strokeWidth={2.2} />;
    case 'ask':
      return <MessageSquare size={size} color={c} strokeWidth={2.2} />;
    case 'debug':
      return <Bug size={size} color={c} strokeWidth={2.2} />;
    case 'multitask':
      return <Network size={size} color={c} strokeWidth={2.2} />;
  }
}

export function ToolVectorIcon({
  toolName,
  size = 14,
  color = COLORS.cyan,
}: {
  toolName: string;
  size?: number;
  color?: string;
}) {
  const lower = toolName.toLowerCase();
  if (lower.includes('shell') || lower.includes('cmd') || lower.includes('bash')) {
    return <Terminal size={size} color={color} strokeWidth={2.2} />;
  }
  if (lower.includes('read') || lower.includes('file') || lower.includes('edit') || lower.includes('write')) {
    return <FileCode2 size={size} color={color} strokeWidth={2.2} />;
  }
  if (lower.includes('grep') || lower.includes('search') || lower.includes('glob')) {
    return <Search size={size} color={color} strokeWidth={2.2} />;
  }
  if (lower.includes('plan')) {
    return <Compass size={size} color={color} strokeWidth={2.2} />;
  }
  if (lower.includes('computer')) {
    return <Eye size={size} color={color} strokeWidth={2.2} />;
  }
  return <Code2 size={size} color={color} strokeWidth={2.2} />;
}

/** Custom quirky geometric starburst SVG glyph for CUSS accents */
export function CussStarGlyph({ size = 18, color = COLORS.lime }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Polygon
        points="12,1 14.8,8.5 23,9.2 16.5,14.2 18.8,22.2 12,17.6 5.2,22.2 7.5,14.2 1,9.2 9.2,8.5"
        stroke={color}
        strokeWidth={1.8}
        fill="rgba(212,255,0,0.14)"
      />
      <Circle cx="12" cy="12" r="2.5" fill={color} />
    </Svg>
  );
}

/** Circular SVG Context Window Meter (like Cursor's bottom-right token gauge) */
export function CussContextRing({
  usedTokens = 0,
  limitLabel = '1M',
  size = 24,
}: {
  usedTokens?: number;
  limitLabel?: string;
  size?: number;
}) {
  const maxTokens =
    limitLabel.toLowerCase() === '1m'
      ? 1_000_000
      : limitLabel.toLowerCase() === '500k'
        ? 500_000
        : limitLabel.toLowerCase() === '300k'
          ? 300_000
          : 256_000;
  const ratio = Math.min(Math.max(usedTokens / maxTokens, 0.06), 1);
  const r = (size - 5) / 2;
  const circ = 2 * Math.PI * r;
  const dash = circ * (1 - ratio);
  const strokeColor =
    ratio > 0.8 ? COLORS.magenta : ratio > 0.5 ? COLORS.amber : COLORS.cyan;

  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <Circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        stroke={COLORS.border}
        strokeWidth={2.5}
        fill="none"
      />
      <Circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        stroke={strokeColor}
        strokeWidth={2.5}
        strokeDasharray={`${circ} ${circ}`}
        strokeDashoffset={dash}
        strokeLinecap="round"
        fill="none"
        rotation="-90"
        origin={`${size / 2}, ${size / 2}`}
      />
      <Rect
        x={size / 2 - 2}
        y={size / 2 - 2}
        width={4}
        height={4}
        fill={strokeColor}
      />
    </Svg>
  );
}

export {
  Activity,
  AlertTriangle,
  ArrowLeft,
  ArrowUpRight,
  AtSign,
  Bot,
  Brain,
  Bug,
  Check,
  ChevronDown,
  ChevronRight,
  Cloud,
  Code2,
  Compass,
  Copy,
  Cpu,
  Edit3,
  ExternalLink,
  Eye,
  FileCode2,
  FolderGit2,
  Gauge,
  GitBranch,
  Globe,
  Keyboard,
  Layers,
  Laptop,
  MessageSquare,
  Mic,
  Network,
  Plus,
  QrCode,
  RefreshCw,
  Search,
  Send,
  SlidersHorizontal,
  Sparkles,
  Square,
  Terminal,
  Trash2,
  Unplug,
  Wifi,
  X,
  Zap,
};
