import { Easing } from 'react-native-reanimated';

/**
 * CUSS Design System & Motion Constants
 * Grounded in `LottieFiles/motion-design-skill` (Energetic + Playful Hybrid archetype)
 */

export const FONTS = {
  /** Weird liquid-brutalist hero display font: LC Mogi */
  mogi: 'LCMogi-A',
  mogiAlt: 'LCMogi-B',
  mogiWild: 'LCMogi-C',
  mogiVF: 'LCMogi-VF',
  /** Wide geometric brutalist display headers */
  display: 'Unbounded-Variable',
  /** Art-house quirky subheaders */
  syne: 'Syne-Variable',
  /** Highly readable quirky ink-trap body font */
  body: 'SpaceGrotesk-Medium',
  bodyBold: 'SpaceGrotesk-Bold',
  /** Technical monospace for code, diffs, paths, and telemetry */
  mono: 'SpaceMono-Regular',
  monoBold: 'SpaceMono-Bold',
} as const;

export const COLORS = {
  bg: '#07070C',
  surface: '#10111A',
  plate: '#171926',
  plateHi: '#202336',
  border: '#2B2F48',
  borderHi: '#42486E',
  /** Acid Lime — primary active energy & Agent mode */
  lime: '#D4FF00',
  limeDim: 'rgba(212, 255, 0, 0.14)',
  /** Hyper Magenta — thinking, Max mode, & Debug mode */
  magenta: '#FF2A85',
  magentaDim: 'rgba(255, 42, 133, 0.15)',
  /** Electric Cyan — tool calls, @file chips, & Plan mode */
  cyan: '#00F0FF',
  cyanDim: 'rgba(0, 240, 255, 0.14)',
  /** Ultraviolet — Multitask / Subagents mode */
  violet: '#A855F7',
  violetDim: 'rgba(168, 85, 247, 0.16)',
  /** Solar Amber — Ask mode, Fast bolt, & queued state */
  amber: '#FFB703',
  amberDim: 'rgba(255, 183, 3, 0.15)',
  /** Emerald — completed / verified state */
  emerald: '#10F59B',
  /** Warm Bone — primary readable prose */
  bone: '#F4F0EA',
  /** Muted Pewter — secondary labels */
  muted: '#8F95B8',
  dim: '#585E82',
  danger: '#FF3864',
} as const;

export type ExecutionMode = 'agent' | 'plan' | 'ask' | 'debug' | 'multitask';

export const MODE_META: Record<
  ExecutionMode,
  { label: string; short: string; color: string; bg: string; placeholder: string; desc: string }
> = {
  agent: {
    label: 'Agent',
    short: 'AGENT',
    color: COLORS.lime,
    bg: COLORS.limeDim,
    placeholder: 'Tell CUSS what to build, refactor, or ship on your Mac…',
    desc: 'Full autonomy — reads, edits, writes files & runs shell commands',
  },
  plan: {
    label: 'Plan',
    short: 'PLAN',
    color: COLORS.cyan,
    bg: COLORS.cyanDim,
    placeholder: 'Describe a feature or architecture to blueprint first…',
    desc: 'Read-only exploration (--mode plan) — drafts a step-by-step spec before coding',
  },
  ask: {
    label: 'Ask',
    short: 'ASK',
    color: COLORS.amber,
    bg: COLORS.amberDim,
    placeholder: 'Ask anything about how this codebase works…',
    desc: 'Read-only Q&A (--mode ask) — deep code walk-throughs without editing files',
  },
  debug: {
    label: 'Debug',
    short: 'DEBUG',
    color: COLORS.magenta,
    bg: COLORS.magentaDim,
    placeholder: 'Paste a bug, stack trace, or failing behavior to isolate…',
    desc: 'Root-cause hunter — traces logs, isolates state bugs & verifies minimal fixes',
  },
  multitask: {
    label: 'Multitask',
    short: 'MULTI',
    color: COLORS.violet,
    bg: COLORS.violetDim,
    placeholder: 'Orchestrate parallel subagents (@explore, @debug, @shell)…',
    desc: 'Parallel subagent dispatch — splits work across specialized agent tracks',
  },
};

/**
 * Motion Design Constants from `LottieFiles/motion-design-skill`:
 * - Duration Table: micro 100ms, press/toggle 140ms, card 240ms, modal 340ms, ambient 2600ms
 * - Directional Easing: ease-out decelerate for entrances, ease-in accelerate for exits
 * - Spring Parameters: snappy (stiffness 300, damping 20), bouncy (stiffness 220, damping 13)
 */
export const MOTION = {
  duration: {
    micro: 100,
    press: 140,
    icon: 190,
    card: 250,
    modal: 340,
    dramatic: 650,
    ambient: 2600,
  },
  easing: {
    /** MD3 Emphasized Decelerate (0.05, 0.7, 0.1, 1) — signature entrance curve */
    enter: Easing.bezier(0.05, 0.7, 0.1, 1),
    /** MD3 Accelerate (0.3, 0, 1, 1) — exit curve */
    exit: Easing.bezier(0.3, 0, 1, 1),
    /** MD3 Standard (0.2, 0, 0, 1) — on-screen morph */
    standard: Easing.bezier(0.2, 0, 0, 1),
    /** Bounce settle (0.175, 0.885, 0.32, 1.275) */
    playful: Easing.bezier(0.175, 0.885, 0.32, 1.275),
    /** Sine ambient loop */
    ambient: Easing.inOut(Easing.sin),
  },
  spring: {
    snappy: { stiffness: 310, damping: 22, mass: 0.8 },
    bouncy: { stiffness: 230, damping: 13, mass: 0.75 },
    gentle: { stiffness: 150, damping: 22, mass: 1.0 },
  },
  stagger: {
    micro: 35,
    maxBudget: 380,
  },
} as const;
