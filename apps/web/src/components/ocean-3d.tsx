"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { COLORMAPS, type ColormapKey } from "@/lib/colormaps";
import { LATS, LONS, N_LAT, N_LON } from "@/lib/sim/grid";
import { Button, Badge } from "@/components/ui";

interface Ocean3DProps {
  values: Float32Array | null;
  vmin: number;
  vmax: number;
  cmap: ColormapKey;
  depthMeters: number;
  selectedCoord: { lat: number; lon: number } | null;
  onPick?: (lat: number, lon: number) => void;
  markers?: { lat: number; lon: number; kind: string; label?: string }[];
}

export function Ocean3D({
  values,
  vmin,
  vmax,
  cmap,
  depthMeters,
  selectedCoord,
  onPick,
  markers = [],
}: Ocean3DProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [wireframe, setWireframe] = useState(false);
  const [waterTurbulence, setWaterTurbulence] = useState(1.0);
  const [showSubsurface, setShowSubsurface] = useState(true);
  const [hoverInfo, setHoverInfo] = useState<{ lat: number; lon: number; val: number } | null>(null);
  const [fps, setFps] = useState(60);

  // References for Three.js state
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const oceanMeshRef = useRef<THREE.Mesh | null>(null);
  const subsurfaceMeshRef = useRef<THREE.Mesh | null>(null);
  const buoysGroupRef = useRef<THREE.Group | null>(null);
  const animFrameRef = useRef<number | null>(null);

  // Setup Three.js scene
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const width = container.clientWidth || 800;
    const height = container.clientHeight || 500;

    // 1. Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x040812);
    scene.fog = new THREE.FogExp2(0x040812, 0.015);
    sceneRef.current = scene;

    // 2. Camera
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(0, 32, 42);
    cameraRef.current = camera;

    // 3. Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.innerHTML = "";
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // 4. OrbitControls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxPolarAngle = Math.PI / 2 - 0.05; // Don't go below sea floor
    controls.minDistance = 10;
    controls.maxDistance = 120;
    controlsRef.current = controls;

    // 5. Lighting (Futuristic Cyber-Ocean Mood)
    const ambientLight = new THREE.AmbientLight(0x132a4a, 1.8);
    scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(0x45d6ff, 2.5);
    sunLight.position.set(25, 45, 20);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 1024;
    sunLight.shadow.mapSize.height = 1024;
    scene.add(sunLight);

    const tealRim = new THREE.DirectionalLight(0x2dd4bf, 1.5);
    tealRim.position.set(-30, 20, -30);
    scene.add(tealRim);

    // Grid Floor / Cyber Bathymetry Grid
    const cyberGrid = new THREE.GridHelper(60, 30, 0x45d6ff, 0x16304e);
    cyberGrid.position.y = -10;
    scene.add(cyberGrid);

    // 6. Ocean Surface Mesh (PlaneGeometry with 120 x 50 segments)
    const gridW = 50;
    const gridH = 26;
    const oceanGeo = new THREE.PlaneGeometry(gridW, gridH, 120, 60);
    oceanGeo.rotateX(-Math.PI / 2);

    // Vertex colors for ocean heat distribution
    const count = oceanGeo.attributes.position.count;
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      colors[i * 3] = 0.05;
      colors[i * 3 + 1] = 0.45;
      colors[i * 3 + 2] = 0.85;
    }
    oceanGeo.setAttribute("color", new THREE.BufferAttribute(colors, 3));

    const oceanMat = new THREE.MeshPhysicalMaterial({
      vertexColors: true,
      metalness: 0.1,
      roughness: 0.2,
      transmission: 0.5,
      transparent: true,
      opacity: 0.94,
      ior: 1.333, // Water refractive index
      clearcoat: 1.0,
      clearcoatRoughness: 0.1,
      wireframe: false,
    });

    const oceanMesh = new THREE.Mesh(oceanGeo, oceanMat);
    oceanMesh.castShadow = true;
    oceanMesh.receiveShadow = true;
    scene.add(oceanMesh);
    oceanMeshRef.current = oceanMesh;

    // 7. Subsurface Thermocline Slice Plane
    const subGeo = new THREE.PlaneGeometry(gridW, gridH, 30, 15);
    subGeo.rotateX(-Math.PI / 2);
    const subMat = new THREE.MeshBasicMaterial({
      color: 0x8b5cf6,
      transparent: true,
      opacity: 0.25,
      wireframe: true,
      side: THREE.DoubleSide,
    });
    const subMesh = new THREE.Mesh(subGeo, subMat);
    subMesh.position.y = -3;
    scene.add(subMesh);
    subsurfaceMeshRef.current = subMesh;

    // 8. Buoys / Argo float group
    const buoysGroup = new THREE.Group();
    scene.add(buoysGroup);
    buoysGroupRef.current = buoysGroup;

    // Animation Loop
    let lastTime = performance.now();
    let frames = 0;
    let fpsTimer = performance.now();

    const animate = (time: number) => {
      animFrameRef.current = requestAnimationFrame(animate);
      controls.update();

      // FPS tracking
      frames++;
      if (time - fpsTimer > 1000) {
        setFps(Math.round((frames * 1000) / (time - fpsTimer)));
        frames = 0;
        fpsTimer = time;
      }

      // Wave animation
      if (oceanMeshRef.current) {
        const pos = oceanMeshRef.current.geometry.attributes.position;
        const t = time * 0.0018 * waterTurbulence;

        for (let i = 0; i < pos.count; i++) {
          const u = pos.getX(i);
          const w = pos.getZ(i);

          // Combined Gerstner-like wave sum
          const wave1 = Math.sin(u * 0.4 + t * 2.2) * 0.7;
          const wave2 = Math.cos(w * 0.5 + t * 1.8) * 0.5;
          const wave3 = Math.sin((u + w) * 0.3 + t * 1.5) * 0.35;
          const ripple = Math.sin(Math.sqrt(u * u + w * w) * 1.2 - t * 3.0) * 0.2;

          const height = (wave1 + wave2 + wave3 + ripple) * (wireframe ? 1.5 : 1.0);
          pos.setY(i, height);
        }
        pos.needsUpdate = true;
        oceanMeshRef.current.geometry.computeVertexNormals();
      }

      // Buoy bobbing
      if (buoysGroupRef.current) {
        const t = time * 0.002;
        buoysGroupRef.current.children.forEach((child, idx) => {
          child.position.y = Math.sin(t * 2.5 + idx * 0.8) * 0.4 + 0.2;
          child.rotation.z = Math.sin(t * 1.5 + idx) * 0.08;
        });
      }

      renderer.render(scene, camera);
    };

    animFrameRef.current = requestAnimationFrame(animate);

    // Resize observer
    const ro = new ResizeObserver(() => {
      if (!container || !camera || !renderer) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    });
    ro.observe(container);

    return () => {
      ro.disconnect();
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      renderer.dispose();
      oceanGeo.dispose();
      oceanMat.dispose();
      container.innerHTML = "";
    };
  }, []);

  // Update wireframe state
  useEffect(() => {
    if (oceanMeshRef.current) {
      const mat = oceanMeshRef.current.material as THREE.MeshPhysicalMaterial;
      mat.wireframe = wireframe;
      mat.needsUpdate = true;
    }
  }, [wireframe]);

  // Update Subsurface Depth Position
  useEffect(() => {
    if (subsurfaceMeshRef.current) {
      // Map depth 0 to 1000m to Y range 0 to -8
      const yOffset = -((depthMeters / 1000) * 8);
      subsurfaceMeshRef.current.position.y = yOffset;
      subsurfaceMeshRef.current.visible = showSubsurface;
    }
  }, [depthMeters, showSubsurface]);

  // Update Ocean Heatmap Colors from Float32Array values
  useEffect(() => {
    if (!oceanMeshRef.current || !values) return;
    const geo = oceanMeshRef.current.geometry;
    const colorAttr = geo.attributes.color;
    if (!colorAttr) return;

    const rgbFunc = COLORMAPS[cmap].rgb;
    const span = vmax - vmin || 1;
    const pos = geo.attributes.position;
    const count = pos.count;

    for (let i = 0; i < count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);

      // Map 3D plane X (-25 to 25) to Lon index (0 to N_LON-1)
      const uNorm = (x + 25) / 50;
      const wNorm = (z + 13) / 26;

      const col = Math.min(N_LON - 1, Math.max(0, Math.floor(uNorm * N_LON)));
      const row = Math.min(N_LAT - 1, Math.max(0, Math.floor((1 - wNorm) * N_LAT)));

      const val = values[row * N_LON + col];
      if (Number.isNaN(val) || val === undefined) {
        // Land / mask color: deep dark obsidian
        colorAttr.setXYZ(i, 0.04, 0.08, 0.12);
      } else {
        const norm = Math.max(0, Math.min(1, (val - vmin) / span));
        const [r, g, b] = rgbFunc(norm);
        colorAttr.setXYZ(i, r / 255, g / 255, b / 255);
      }
    }
    colorAttr.needsUpdate = true;
  }, [values, vmin, vmax, cmap]);

  // Update Argo Buoy markers
  useEffect(() => {
    const group = buoysGroupRef.current;
    if (!group) return;

    // Clear existing
    while (group.children.length > 0) {
      group.remove(group.children[0]);
    }

    const buoyGeo = new THREE.CylinderGeometry(0.25, 0.35, 1.2, 8);
    const buoyMat = new THREE.MeshStandardMaterial({
      color: 0x45d6ff,
      emissive: 0x1b6fae,
      emissiveIntensity: 0.6,
      roughness: 0.3,
    });

    const haloGeo = new THREE.RingGeometry(0.4, 0.7, 16);
    haloGeo.rotateX(-Math.PI / 2);
    const haloMat = new THREE.MeshBasicMaterial({
      color: 0x45d6ff,
      transparent: true,
      opacity: 0.5,
      side: THREE.DoubleSide,
    });

    // Add up to 30 sample Argo floats in 3D
    const argoList = markers.filter((m) => m.kind === "argo").slice(0, 30);
    argoList.forEach((m) => {
      const uNorm = (m.lon - LONS[0]) / (LONS[N_LON - 1] - LONS[0]);
      const wNorm = 1 - (m.lat - LATS[0]) / (LATS[N_LAT - 1] - LATS[0]);
      const x = uNorm * 50 - 25;
      const z = wNorm * 26 - 13;

      const buoy = new THREE.Mesh(buoyGeo, buoyMat);
      buoy.position.set(x, 0, z);

      const halo = new THREE.Mesh(haloGeo, haloMat);
      halo.position.set(0, 0.2, 0);
      buoy.add(halo);

      group.add(buoy);
    });

    // Selected Pin Beacon
    if (selectedCoord) {
      const uNorm = (selectedCoord.lon - LONS[0]) / (LONS[N_LON - 1] - LONS[0]);
      const wNorm = 1 - (selectedCoord.lat - LATS[0]) / (LATS[N_LAT - 1] - LATS[0]);
      const x = uNorm * 50 - 25;
      const z = wNorm * 26 - 13;

      const pinGeo = new THREE.ConeGeometry(0.7, 2.2, 8);
      pinGeo.rotateX(Math.PI);
      const pinMat = new THREE.MeshStandardMaterial({
        color: 0xff3366,
        emissive: 0xff0044,
        emissiveIntensity: 0.8,
      });
      const pin = new THREE.Mesh(pinGeo, pinMat);
      pin.position.set(x, 2.5, z);
      group.add(pin);
    }
  }, [markers, selectedCoord]);

  // Click & hover raycasting on 3D ocean mesh
  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const container = containerRef.current;
      const camera = cameraRef.current;
      const oceanMesh = oceanMeshRef.current;
      if (!container || !camera || !oceanMesh) return;

      const rect = container.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
      );

      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObject(oceanMesh);

      if (intersects.length > 0) {
        const pt = intersects[0].point;
        const uNorm = (pt.x + 25) / 50;
        const wNorm = (pt.z + 13) / 26;

        const lon = LONS[0] + uNorm * (LONS[N_LON - 1] - LONS[0]);
        const lat = LATS[N_LAT - 1] - wNorm * (LATS[N_LAT - 1] - LATS[0]);

        if (lon >= LONS[0] && lon <= LONS[N_LON - 1] && lat >= LATS[0] && lat <= LATS[N_LAT - 1]) {
          onPick?.(Math.round(lat * 100) / 100, Math.round(lon * 100) / 100);
        }
      }
    },
    [onPick]
  );

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden", borderRadius: "var(--r-md)" }}>
      {/* 3D Canvas Container */}
      <div
        ref={containerRef}
        onPointerDown={handlePointerDown}
        style={{ width: "100%", height: "100%", cursor: "grab" }}
      />

      {/* Cyber HUD Floating Controls */}
      <div
        style={{
          position: "absolute",
          top: 12,
          left: 12,
          display: "flex",
          alignItems: "center",
          gap: 8,
          background: "rgba(6, 13, 24, 0.75)",
          backdropFilter: "blur(12px)",
          border: "1px solid rgba(69, 214, 255, 0.25)",
          padding: "6px 12px",
          borderRadius: 999,
          zIndex: 10,
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--fs-xs)", color: "var(--accent)" }}>
          <span
            className="pulse-ring"
            style={{ width: 8, height: 8, borderRadius: "50%", background: "#45d6ff", display: "inline-block" }}
          />
          <b>3D DIGITAL TWIN</b>
        </span>
        <span style={{ color: "var(--text-3)" }}>|</span>
        <Badge tone="accent">{fps} FPS</Badge>
        <Badge tone="ok">{markers.length} Probes Active</Badge>
      </div>

      {/* Interactive Controls Bar */}
      <div
        style={{
          position: "absolute",
          top: 12,
          right: 12,
          display: "flex",
          alignItems: "center",
          gap: 8,
          background: "rgba(6, 13, 24, 0.75)",
          backdropFilter: "blur(12px)",
          border: "1px solid rgba(125, 178, 240, 0.2)",
          padding: "4px 8px",
          borderRadius: "var(--r-sm)",
          zIndex: 10,
        }}
      >
        <Button
          variant="ghost"
          active={wireframe}
          onClick={() => setWireframe((w) => !w)}
          title="Toggle Cyber Wireframe Mesh"
        >
          {wireframe ? "🕸️ Wireframe" : "🌊 Shaded"}
        </Button>
        <Button
          variant="ghost"
          active={showSubsurface}
          onClick={() => setShowSubsurface((s) => !s)}
          title="Show Subsurface Thermocline Slice Plane"
        >
          {showSubsurface ? `📐 Slice ${depthMeters}m` : "📐 Hide Slice"}
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            if (controlsRef.current && cameraRef.current) {
              cameraRef.current.position.set(0, 32, 42);
              controlsRef.current.target.set(0, 0, 0);
              controlsRef.current.update();
            }
          }}
          title="Reset Camera View"
        >
          ↺ Reset View
        </Button>
      </div>

      {/* Dynamic guidance overlay at bottom */}
      <div
        style={{
          position: "absolute",
          bottom: 12,
          left: 12,
          right: 12,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          background: "rgba(4, 10, 20, 0.8)",
          backdropFilter: "blur(10px)",
          border: "1px solid rgba(69, 214, 255, 0.2)",
          padding: "6px 14px",
          borderRadius: "var(--r-sm)",
          fontSize: "var(--fs-xs)",
          color: "var(--text-1)",
          zIndex: 10,
          pointerEvents: "none",
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ color: "var(--accent)" }}>🖱️ Click anywhere</span> on the 3D water surface to probe deep vertical profiles.
        </span>
        <span style={{ color: "var(--text-3)", display: "flex", alignItems: "center", gap: 12 }}>
          <span>Orbit: <b>Left Click + Drag</b></span>
          <span>Zoom: <b>Scroll</b></span>
          <span>Pan: <b>Right Click + Drag</b></span>
        </span>
      </div>
    </div>
  );
}

export function SplineEmbed({ url }: { url?: string }) {
  const [loading, setLoading] = useState(true);
  const targetUrl = url || "https://app.spline.design/community/file/97e7b76a-149a-467b-8c6e-67b11680c16c";

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", minHeight: 400, borderRadius: "var(--r-md)", overflow: "hidden", background: "#050b14" }}>
      {loading && (
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, zIndex: 2 }}>
          <div className="pulse-ring" style={{ width: 36, height: 36, borderRadius: "50%", background: "var(--accent)" }} />
          <span style={{ fontSize: "var(--fs-sm)", color: "var(--accent-strong)" }}>Connecting to Spline 3D Ocean Stream…</span>
        </div>
      )}

      <iframe
        src={targetUrl}
        title="Spline 3D Ocean Model"
        style={{ width: "100%", height: "100%", border: "none", display: "block" }}
        onLoad={() => setLoading(false)}
        allow="accelerometer; autoplay; camera; gyroscope; microphone"
      />

      <div
        style={{
          position: "absolute",
          top: 12,
          right: 12,
          background: "rgba(6, 13, 24, 0.8)",
          backdropFilter: "blur(12px)",
          border: "1px solid rgba(69, 214, 255, 0.3)",
          padding: "6px 12px",
          borderRadius: 999,
          fontSize: "var(--fs-xs)",
          color: "var(--accent)",
          zIndex: 5,
        }}
      >
        ✨ Spline 3D Ocean Wave Canvas
      </div>
    </div>
  );
}
