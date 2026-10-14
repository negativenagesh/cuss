import React, { useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { Agent } from '../store';
import { COLORS } from '../theme';

const STATUS_COLOR: Record<string, string> = {
  ACTIVE: COLORS.lime,
  running: COLORS.lime,
  queued: COLORS.amber,
  IDLE: COLORS.cyan,
  idle: COLORS.cyan,
  done: COLORS.violet,
  error: COLORS.magenta,
  ARCHIVED: '#555c7a',
};

/** One pulsing satellite orb per agent, orbiting the CUSS cybernetic core. */
function Orb({ agent, index, total }: { agent: Agent; index: number; total: number }) {
  const mesh = useRef<THREE.Mesh>(null);
  const halo = useRef<THREE.Mesh>(null);
  const color = STATUS_COLOR[agent.status] ?? COLORS.cyan;
  const isActive = agent.status === 'ACTIVE' || agent.status === 'running';
  const radius = 2.0 + (index % 3) * 0.75;
  const speed = (isActive ? 0.65 : 0.25) + (index % 5) * 0.08;
  const phase = (index / Math.max(total, 1)) * Math.PI * 2;

  useFrame(({ clock }) => {
    const t = clock.elapsedTime * speed + phase;
    const x = Math.cos(t) * radius;
    const y = Math.sin(t * 1.4) * 0.55;
    const z = Math.sin(t) * radius;
    if (mesh.current) {
      mesh.current.position.set(x, y, z);
      mesh.current.rotation.set(t, t * 0.7, 0);
      const pulse = isActive ? 1 + Math.sin(clock.elapsedTime * 5) * 0.22 : 1;
      mesh.current.scale.setScalar(pulse);
    }
    if (halo.current) {
      halo.current.position.set(x, y, z);
      halo.current.rotation.set(-t, t * 0.5, 0);
      const haloScale = isActive ? 1.55 + Math.cos(clock.elapsedTime * 4) * 0.25 : 1.25;
      halo.current.scale.setScalar(haloScale);
    }
  });

  return (
    <group>
      <mesh ref={mesh}>
        <octahedronGeometry args={[0.22, 1]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={isActive ? 2.1 : 0.7}
        />
      </mesh>
      <mesh ref={halo}>
        <icosahedronGeometry args={[0.26, 0]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={0.5}
          wireframe
        />
      </mesh>
    </group>
  );
}

function CyberCore({ activeCount }: { activeCount: number }) {
  const outer = useRef<THREE.Mesh>(null);
  const inner = useRef<THREE.Mesh>(null);
  const ring = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const boost = activeCount > 0 ? 1.8 : 1;
    outer.current?.rotation.set(t * 0.25 * boost, t * 0.4 * boost, 0);
    inner.current?.rotation.set(-t * 0.5 * boost, -t * 0.3 * boost, t * 0.2);
    ring.current?.rotation.set(Math.PI / 2.6 + Math.sin(t * 0.6) * 0.15, t * 0.2, 0);
  });

  return (
    <group>
      <mesh ref={outer}>
        <icosahedronGeometry args={[0.78, 1]} />
        <meshStandardMaterial
          color={COLORS.lime}
          emissive={COLORS.lime}
          emissiveIntensity={0.95}
          wireframe
        />
      </mesh>
      <mesh ref={inner}>
        <octahedronGeometry args={[0.42, 0]} />
        <meshStandardMaterial
          color={COLORS.magenta}
          emissive={COLORS.magenta}
          emissiveIntensity={1.4}
        />
      </mesh>
      <mesh ref={ring}>
        <torusGeometry args={[2.15, 0.018, 12, 64]} />
        <meshStandardMaterial
          color={COLORS.cyan}
          emissive={COLORS.cyan}
          emissiveIntensity={0.8}
        />
      </mesh>
    </group>
  );
}

export default function AgentField({ agents }: { agents: Agent[] }) {
  const orbs = useMemo(() => agents.slice(0, 24), [agents]);
  const activeCount = useMemo(
    () => orbs.filter((a) => a.status === 'ACTIVE' || a.status === 'running').length,
    [orbs],
  );

  return (
    <Canvas camera={{ position: [0, 1.5, 5.6], fov: 52 }}>
      <ambientLight intensity={0.5} />
      <pointLight position={[5, 5, 5]} intensity={65} />
      <pointLight position={[-4, -3, 3]} intensity={35} color={COLORS.magenta} />
      <CyberCore activeCount={activeCount} />
      {orbs.map((a, i) => (
        <Orb key={a.id} agent={a} index={i} total={orbs.length} />
      ))}
    </Canvas>
  );
}
