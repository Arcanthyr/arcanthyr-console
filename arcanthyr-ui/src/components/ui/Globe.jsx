import { Suspense, useMemo, useRef, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Sphere, useTexture, Html, Line } from '@react-three/drei';
import * as THREE from 'three';

function latLngToVec3(lat, lng, r = 1) {
  const phi   = (90 - lat)  * (Math.PI / 180);
  const theta = (lng + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -r * Math.sin(phi) * Math.cos(theta),
     r * Math.cos(phi),
     r * Math.sin(phi) * Math.sin(theta),
  );
}

function Arc({ from, to, altitude = 0.25, color = '#4A9EFF' }) {
  const points = useMemo(() => {
    const start = latLngToVec3(from.lat, from.lng, 1.01);
    const end   = latLngToVec3(to.lat,   to.lng,   1.01);
    const mid   = start.clone().add(end).multiplyScalar(0.5)
                    .normalize().multiplyScalar(1 + altitude);
    return new THREE.QuadraticBezierCurve3(start, mid, end).getPoints(60);
  }, [from, to, altitude]);
  return <Line points={points} color={color} transparent opacity={0.45} lineWidth={0.7} />;
}

function Marker({ loc }) {
  const pos = latLngToVec3(loc.lat, loc.lng, 1.022);
  return (
    <group position={pos}>
      <Sphere args={[0.011, 16, 16]}>
        <meshBasicMaterial color="#88c4ff" />
      </Sphere>
      <Html
        occlude
        distanceFactor={300}
        style={{
          fontSize: '6px',
          fontFamily: 'monospace',
          letterSpacing: '0.03em',
          color: 'rgba(160, 200, 255, 0.7)',
          whiteSpace: 'nowrap',
          pointerEvents: 'none',
          userSelect: 'none',
          textShadow: '0 0 2px rgba(74,158,255,0.5)',
        }}
      >
        {loc.label}
      </Html>
    </group>
  );
}

// Camera light that always illuminates the face you're viewing
function CameraLight() {
  const ref = useRef();
  useFrame(({ camera }) => {
    if (ref.current) ref.current.position.copy(camera.position);
  });
  return <pointLight ref={ref} intensity={2.2} distance={12} decay={1} />;
}

function EarthScene({ locations, arcs }) {
  const groupRef   = useRef();
  const dragging   = useRef(false);
  const lastXY     = useRef({ x: 0, y: 0 });
  const { gl, camera } = useThree();

  const texture = useTexture('https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg');

  // Slow auto-rotation, pauses while dragging
  useFrame((_, delta) => {
    if (!dragging.current && groupRef.current) {
      groupRef.current.rotation.y += delta * 0.12;
    }
  });

  useEffect(() => {
    const el = gl.domElement;

    const onDown = (e) => {
      dragging.current = true;
      lastXY.current = { x: e.clientX, y: e.clientY };
      el.style.cursor = 'grabbing';
    };

    const onMove = (e) => {
      if (!dragging.current || !groupRef.current) return;
      const dx = e.clientX - lastXY.current.x;
      const dy = e.clientY - lastXY.current.y;
      lastXY.current = { x: e.clientX, y: e.clientY };

      // Rotate globe directly — 1:1 with mouse movement
      groupRef.current.rotation.y += dx * 0.007;
      groupRef.current.rotation.x  = Math.max(
        -Math.PI / 2,
        Math.min(Math.PI / 2, groupRef.current.rotation.x + dy * 0.007),
      );
    };

    const onUp = () => {
      dragging.current = false;
      el.style.cursor = 'grab';
    };

    // Scroll to zoom
    const onWheel = (e) => {
      camera.position.z = Math.max(1.4, Math.min(5, camera.position.z + e.deltaY * 0.003));
    };

    el.style.cursor = 'grab';
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('wheel', onWheel, { passive: true });
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup',   onUp);

    return () => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('wheel', onWheel);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup',   onUp);
    };
  }, [gl, camera]);

  return (
    <>
      <ambientLight intensity={0.18} />
      <CameraLight />

      <group ref={groupRef}>
        {/* Earth */}
        <Sphere args={[1, 64, 64]}>
          <meshStandardMaterial map={texture} roughness={0.85} metalness={0.05} />
        </Sphere>

        {/* White rim */}
        <Sphere args={[1.012, 48, 48]}>
          <meshBasicMaterial color="white" transparent opacity={0.1} side={THREE.BackSide} />
        </Sphere>

        {/* Atmosphere */}
        <Sphere args={[1.035, 32, 32]}>
          <meshBasicMaterial color="#4488ff" transparent opacity={0.04} side={THREE.BackSide} />
        </Sphere>

        {arcs.map((a, i) => (
          <Arc key={i} from={a.from} to={a.to} altitude={a.altitude} color={a.color} />
        ))}

        {locations.map(loc => <Marker key={loc.name} loc={loc} />)}
      </group>
    </>
  );
}

function LoadingGlobe() {
  return (
    <Sphere args={[1, 32, 32]}>
      <meshBasicMaterial color="#0d1f3c" />
    </Sphere>
  );
}

export default function Globe({ size = 420, locations = [], arcs = [] }) {
  return (
    <div style={{ width: `${size}px`, height: `${size}px` }}>
      <Canvas camera={{ position: [0, 0, 2.6], fov: 42 }}>
        <Suspense fallback={<LoadingGlobe />}>
          <EarthScene locations={locations} arcs={arcs} />
        </Suspense>
      </Canvas>
    </div>
  );
}
