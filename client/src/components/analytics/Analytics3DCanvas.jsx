import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { Eye, RotateCcw, Play, Pause, Layers, Trophy, PieChart, Sparkles } from 'lucide-react';

export default function Analytics3DCanvas({ stats, theme = 'dark' }) {
  const containerRef = useRef(null);
  const [viewMode, setViewMode] = useState('branches'); // 'branches' | 'cuts' | 'channels'
  const [autoRotate, setAutoRotate] = useState(true);
  const [hoveredData, setHoveredData] = useState(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  // Refs de Three.js para animación y limpieza
  const sceneRef = useRef(null);
  const rendererRef = useRef(null);
  const cameraRef = useRef(null);
  const animFrameIdRef = useRef(null);
  const interactiveObjectsRef = useRef([]);
  const groupRef = useRef(null);

  // Manejo de interacción de mouse para órbita simple sin dependencia externa
  const isDraggingRef = useRef(false);
  const previousMousePositionRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    if (!containerRef.current) return;

    const width = containerRef.current.clientWidth || 600;
    const height = 380;

    // 1. Escena
    const scene = new THREE.Scene();
    sceneRef.current = scene;
    scene.background = new THREE.Color(0x0b1120); // Slate-900 oscuro premium
    scene.fog = new THREE.FogExp2(0x0b1120, 0.025);

    // 2. Cámara
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(0, 15, 26);
    camera.lookAt(0, 2, 0);
    cameraRef.current = camera;

    // 3. Renderer con antialiasing
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    rendererRef.current = renderer;

    // Limpiar canvas previo si hubiera
    while (containerRef.current.firstChild) {
      containerRef.current.removeChild(containerRef.current.firstChild);
    }
    containerRef.current.appendChild(renderer.domElement);

    // 4. Luces de Escena
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0x38bdf8, 1.8); // Cyan vibrante
    dirLight.position.set(12, 20, 15);
    dirLight.castShadow = true;
    scene.add(dirLight);

    const backLight = new THREE.DirectionalLight(0xa855f7, 1.2); // Púrpura secundario
    backLight.position.set(-15, 10, -10);
    scene.add(backLight);

    // Grid Floor Neón
    const gridHelper = new THREE.GridHelper(30, 30, 0x0284c7, 0x1e293b);
    gridHelper.position.y = 0;
    scene.add(gridHelper);

    // Partículas de fondo estilo HUD Tecnológico
    const particleGeo = new THREE.BufferGeometry();
    const particleCount = 200;
    const posArray = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount * 3; i += 3) {
      posArray[i] = (Math.random() - 0.5) * 40;
      posArray[i + 1] = Math.random() * 20;
      posArray[i + 2] = (Math.random() - 0.5) * 40;
    }
    particleGeo.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
    const particleMat = new THREE.PointsMaterial({
      size: 0.18,
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.6
    });
    const particles = new THREE.Points(particleGeo, particleMat);
    scene.add(particles);

    // Grupo de Contenido Dinámico
    const mainGroup = new THREE.Group();
    scene.add(mainGroup);
    groupRef.current = mainGroup;

    // Render inicial según modo
    buildVisualization(viewMode, mainGroup, stats);

    // 5. Loop de Animación
    let clock = new THREE.Clock();
    const animate = () => {
      animFrameIdRef.current = requestAnimationFrame(animate);
      const delta = clock.getDelta();

      if (autoRotate && groupRef.current && !isDraggingRef.current) {
        groupRef.current.rotation.y += 0.005;
      }

      // Animación suave de partículas flotantes
      particles.rotation.y += 0.001;

      // Animación flotante de anillos/luces de los objetos
      interactiveObjectsRef.current.forEach((obj, idx) => {
        if (obj.userData?.pulseRing) {
          obj.userData.pulseRing.rotation.z += 0.02;
        }
      });

      renderer.render(scene, camera);
    };
    animate();

    // 6. Resize listener
    const handleResize = () => {
      if (!containerRef.current) return;
      const newW = containerRef.current.clientWidth;
      camera.aspect = newW / height;
      camera.updateProjectionMatrix();
      renderer.setSize(newW, height);
    };
    window.addEventListener('resize', handleResize);

    // Cleanup al desmontar
    return () => {
      window.removeEventListener('resize', handleResize);
      if (animFrameIdRef.current) cancelAnimationFrame(animFrameIdRef.current);
      if (renderer.domElement && renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, []);

  // Actualizar contenido al cambiar viewMode o stats
  useEffect(() => {
    if (!groupRef.current || !sceneRef.current) return;
    buildVisualization(viewMode, groupRef.current, stats);
  }, [viewMode, stats]);

  // Constructor de Gráficos 3D según modo
  const buildVisualization = (mode, group, currentStats) => {
    // Vaciar grupo anterior
    while (group.children.length > 0) {
      const obj = group.children[0];
      group.remove(obj);
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
        else obj.material.dispose();
      }
    }
    interactiveObjectsRef.current = [];
    setHoveredData(null);

    if (mode === 'branches') {
      // ---------------------------------------------------------
      // MODO 1: MATRIZ 3D ISOMÉTRICA DE SUCURSALES
      // ---------------------------------------------------------
      const branches = currentStats?.branchStats?.length > 0 ? currentStats.branchStats : [
        { name: 'Central', totalRevenue: 1250000, ordersCount: 45, averageTicket: 27700, sharePct: 35 },
        { name: 'Norte', totalRevenue: 950000, ordersCount: 38, averageTicket: 25000, sharePct: 26 },
        { name: 'Sur', totalRevenue: 720000, ordersCount: 29, averageTicket: 24800, sharePct: 20 },
        { name: 'Oeste', totalRevenue: 430000, ordersCount: 19, averageTicket: 22600, sharePct: 12 },
        { name: 'Palermo VIP', totalRevenue: 280000, ordersCount: 10, averageTicket: 28000, sharePct: 7 }
      ];

      const maxRev = Math.max(...branches.map(b => b.totalRevenue), 1);
      const colors = [0x10b981, 0x06b6d4, 0x3b82f6, 0x8b5cf6, 0xf59e0b, 0xec4899];

      const barWidth = 1.6;
      const spacing = 3.2;
      const startX = -((branches.length - 1) * spacing) / 2;

      branches.forEach((b, idx) => {
        const height = Math.max(1.2, (b.totalRevenue / maxRev) * 10);
        const geo = new THREE.BoxGeometry(barWidth, height, barWidth);
        const col = colors[idx % colors.length];

        const mat = new THREE.MeshPhysicalMaterial({
          color: col,
          metalness: 0.2,
          roughness: 0.1,
          transmission: 0.3, // Efecto glassmorphism neón
          opacity: 0.95,
          transparent: true,
          emissive: col,
          emissiveIntensity: 0.25
        });

        const barMesh = new THREE.Mesh(geo, mat);
        barMesh.position.set(startX + idx * spacing, height / 2, 0);
        barMesh.castShadow = true;
        barMesh.receiveShadow = true;

        // Base circular con glow
        const ringGeo = new THREE.TorusGeometry(barWidth * 0.9, 0.08, 16, 32);
        const ringMat = new THREE.MeshBasicMaterial({ color: col });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.rotation.x = Math.PI / 2;
        ring.position.set(startX + idx * spacing, 0.05, 0);
        group.add(ring);

        // Luz flotante en la cima de cada barra
        const crownGeo = new THREE.ConeGeometry(0.4, 0.6, 4);
        const crownMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
        const crown = new THREE.Mesh(crownGeo, crownMat);
        crown.rotation.x = Math.PI;
        crown.position.set(startX + idx * spacing, height + 0.5, 0);
        group.add(crown);

        barMesh.userData = {
          type: 'branch',
          data: b,
          originalColor: col,
          pulseRing: ring
        };

        group.add(barMesh);
        interactiveObjectsRef.current.push(barMesh);
      });

    } else if (mode === 'cuts') {
      // ---------------------------------------------------------
      // MODO 2: PODIO 3D DE CORTES ESTRELLA
      // ---------------------------------------------------------
      const cuts = currentStats?.topProducts?.slice(0, 5) || [
        { name: 'Asado Especial', totalKgSold: 145, totalRevenue: 1377500, marginEstimate: 413250 },
        { name: 'Vacío Premium', totalKgSold: 110, totalRevenue: 1155000, marginEstimate: 346500 },
        { name: 'Bife de Chorizo', totalKgSold: 88, totalRevenue: 1012000, marginEstimate: 323800 },
        { name: 'Matambre', totalKgSold: 65, totalRevenue: 617500, marginEstimate: 185250 },
        { name: 'Nalga para Milanesa', totalKgSold: 54, totalRevenue: 459000, marginEstimate: 137700 }
      ];

      const podiumHeights = [9, 7, 5.5, 4, 3];
      const podiumColors = [0xf59e0b, 0x94a3b8, 0xd97706, 0x06b6d4, 0x10b981]; // Oro, Plata, Bronce, Cyan, Verde

      const radius = 6.5;
      const angleStep = (Math.PI * 2) / cuts.length;

      cuts.forEach((cut, idx) => {
        const height = podiumHeights[idx] || 3;
        const angle = idx * angleStep;
        const x = Math.sin(angle) * radius;
        const z = Math.cos(angle) * radius;

        // Cilindro del podio
        const geo = new THREE.CylinderGeometry(1.4, 1.6, height, 32);
        const col = podiumColors[idx] || 0x38bdf8;
        const mat = new THREE.MeshStandardMaterial({
          color: col,
          metalness: 0.6,
          roughness: 0.3,
          emissive: col,
          emissiveIntensity: idx === 0 ? 0.35 : 0.15
        });

        const cylinder = new THREE.Mesh(geo, mat);
        cylinder.position.set(x, height / 2, z);
        cylinder.castShadow = true;

        // Trofeo flotante o esfera holográfica en la cima
        const orbGeo = new THREE.DodecahedronGeometry(0.7, 1);
        const orbMat = new THREE.MeshPhysicalMaterial({
          color: 0xffffff,
          transmission: 0.8,
          roughness: 0.1,
          emissive: col,
          emissiveIntensity: 0.5
        });
        const orb = new THREE.Mesh(orbGeo, orbMat);
        orb.position.set(x, height + 1.2, z);
        group.add(orb);

        cylinder.userData = {
          type: 'cut',
          rank: idx + 1,
          data: cut,
          originalColor: col,
          pulseRing: orb
        };

        group.add(cylinder);
        interactiveObjectsRef.current.push(cylinder);
      });

    } else if (mode === 'channels') {
      // ---------------------------------------------------------
      // MODO 3: ANILLO 3D DE CANALES (POS vs WhatsApp vs Web)
      // ---------------------------------------------------------
      const channels = [
        {
          key: 'pos',
          name: 'POS Mostrador',
          revenue: currentStats?.channelBreakdown?.pos?.revenue || 1850000,
          color: 0x10b981 // Verde
        },
        {
          key: 'whatsapp',
          name: 'WhatsApp Bot / CRM',
          revenue: currentStats?.channelBreakdown?.whatsapp?.revenue || 1240000,
          color: 0x22c55e // Esmeralda WhatsApp
        },
        {
          key: 'web',
          name: 'Web / E-commerce',
          revenue: currentStats?.channelBreakdown?.web?.revenue || 540000,
          color: 0x3b82f6 // Azul Web
        }
      ];

      const totalRev = channels.reduce((sum, c) => sum + c.revenue, 0) || 1;
      let startAngle = 0;

      channels.forEach((c) => {
        const slicePct = c.revenue / totalRev;
        const arc = slicePct * (Math.PI * 2);

        // Cilindro seccionado o arco toroidal
        const torusGeo = new THREE.TorusGeometry(5.5, 1.2, 16, 64, arc);
        const mat = new THREE.MeshPhysicalMaterial({
          color: c.color,
          metalness: 0.4,
          roughness: 0.2,
          emissive: c.color,
          emissiveIntensity: 0.35,
          transmission: 0.2,
          transparent: true,
          opacity: 0.95
        });

        const segment = new THREE.Mesh(torusGeo, mat);
        segment.rotation.x = Math.PI / 2;
        segment.rotation.z = startAngle;
        segment.position.y = 3;

        segment.userData = {
          type: 'channel',
          data: c,
          slicePct: Math.round(slicePct * 100),
          originalColor: c.color
        };

        group.add(segment);
        interactiveObjectsRef.current.push(segment);

        startAngle += arc;
      });

      // Esfera central con logo holográfico / KPI
      const coreGeo = new THREE.SphereGeometry(2.2, 32, 32);
      const coreMat = new THREE.MeshStandardMaterial({
        color: 0x1e293b,
        metalness: 0.9,
        roughness: 0.1,
        emissive: 0x0284c7,
        emissiveIntensity: 0.2
      });
      const core = new THREE.Mesh(coreGeo, coreMat);
      core.position.y = 3;
      group.add(core);
    }
  };

  // Manejo de Interacción de Mouse para Raycaster (Tooltips 3D) y Giro Manual
  const handleMouseDown = (e) => {
    isDraggingRef.current = true;
    previousMousePositionRef.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = (e) => {
    if (!containerRef.current || !rendererRef.current || !cameraRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    setMousePos({ x: mouseX, y: mouseY });

    // Drag orbit
    if (isDraggingRef.current && groupRef.current) {
      const deltaX = e.clientX - previousMousePositionRef.current.x;
      const deltaY = e.clientY - previousMousePositionRef.current.y;

      groupRef.current.rotation.y += deltaX * 0.008;
      groupRef.current.rotation.x = Math.max(-0.4, Math.min(0.6, groupRef.current.rotation.x + deltaY * 0.005));

      previousMousePositionRef.current = { x: e.clientX, y: e.clientY };
      return;
    }

    // Raycasting para tooltips 3D
    const normalizedX = (mouseX / rect.width) * 2 - 1;
    const normalizedY = -(mouseY / rect.height) * 2 + 1;

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(normalizedX, normalizedY), cameraRef.current);

    const intersects = raycaster.intersectObjects(interactiveObjectsRef.current);

    if (intersects.length > 0) {
      const hit = intersects[0].object;
      if (hit.userData) {
        setHoveredData(hit.userData);
        hit.material.emissiveIntensity = 0.7; // Resaltar
      }
    } else {
      setHoveredData(null);
      // Restaurar emissive
      interactiveObjectsRef.current.forEach(obj => {
        if (obj.material) obj.material.emissiveIntensity = 0.25;
      });
    }
  };

  const handleMouseUp = () => {
    isDraggingRef.current = false;
  };

  const resetCamera = () => {
    if (groupRef.current) {
      groupRef.current.rotation.set(0, 0, 0);
    }
    if (cameraRef.current) {
      cameraRef.current.position.set(0, 15, 26);
      cameraRef.current.lookAt(0, 2, 0);
    }
  };

  return (
    <div className="relative rounded-2xl overflow-hidden border border-slate-700/60 bg-gradient-to-b from-slate-900/90 to-slate-950/90 shadow-2xl backdrop-blur-md">
      {/* Header con Controles del Canvas 3D */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 border-b border-slate-800/80 bg-slate-900/60">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
            <Layers className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              Visualización 3D en Tiempo Real
              <span className="px-2 py-0.5 text-[10px] uppercase font-mono tracking-wider bg-cyan-500/20 text-cyan-300 rounded-full border border-cyan-500/30">
                WebGL 60FPS
              </span>
            </h3>
            <p className="text-xs text-slate-400">
              {viewMode === 'branches' && 'Matriz de Facturación y Carga por Sucursal'}
              {viewMode === 'cuts' && 'Podio de Rendimiento de Cortes Más Rentables'}
              {viewMode === 'channels' && 'Distribución Omnicanal (POS / WhatsApp / Web)'}
            </p>
          </div>
        </div>

        {/* Selector de Modo 3D y Controles de Vista */}
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg bg-slate-800/80 p-0.5 border border-slate-700/60">
            <button
              onClick={() => setViewMode('branches')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md flex items-center gap-1.5 transition-all ${
                viewMode === 'branches'
                  ? 'bg-cyan-500 text-slate-950 font-bold shadow-lg shadow-cyan-500/25'
                  : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              Sucursales
            </button>
            <button
              onClick={() => setViewMode('cuts')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md flex items-center gap-1.5 transition-all ${
                viewMode === 'cuts'
                  ? 'bg-cyan-500 text-slate-950 font-bold shadow-lg shadow-cyan-500/25'
                  : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
              }`}
            >
              <Trophy className="w-3.5 h-3.5" />
              Podio Cortes
            </button>
            <button
              onClick={() => setViewMode('channels')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md flex items-center gap-1.5 transition-all ${
                viewMode === 'channels'
                  ? 'bg-cyan-500 text-slate-950 font-bold shadow-lg shadow-cyan-500/25'
                  : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
              }`}
            >
              <PieChart className="w-3.5 h-3.5" />
              Canales
            </button>
          </div>

          <button
            onClick={() => setAutoRotate(!autoRotate)}
            title={autoRotate ? 'Pausar Rotación' : 'Activar Auto-Rotación'}
            className="p-2 rounded-lg bg-slate-800/80 text-slate-300 hover:text-white hover:bg-slate-700/60 border border-slate-700/60 transition-colors"
          >
            {autoRotate ? <Pause className="w-4 h-4 text-cyan-400" /> : <Play className="w-4 h-4" />}
          </button>

          <button
            onClick={resetCamera}
            title="Centrar Cámara"
            className="p-2 rounded-lg bg-slate-800/80 text-slate-300 hover:text-white hover:bg-slate-700/60 border border-slate-700/60 transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Contenedor WebGL */}
      <div
        ref={containerRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        className="w-full h-[380px] cursor-grab active:cursor-grabbing relative overflow-hidden"
      />

      {/* Tooltip Flotante 3D al hacer Hover */}
      {hoveredData && (
        <div
          className="absolute pointer-events-none z-30 transition-all duration-75"
          style={{
            left: Math.min(mousePos.x + 15, (containerRef.current?.clientWidth || 500) - 240),
            top: Math.max(15, mousePos.y - 80)
          }}
        >
          <div className="bg-slate-900/95 border border-cyan-500/40 rounded-xl p-3 shadow-2xl backdrop-blur-md text-white min-w-[210px] animate-in fade-in zoom-in-95">
            {hoveredData.type === 'branch' && (
              <div>
                <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-1.5 mb-2">
                  <span className="font-bold text-sm text-cyan-300 flex items-center gap-1.5">
                    🏢 {hoveredData.data.name}
                  </span>
                  <span className="text-[11px] font-mono bg-cyan-950 text-cyan-400 px-1.5 py-0.5 rounded border border-cyan-800">
                    {hoveredData.data.sharePct}% cuota
                  </span>
                </div>
                <div className="text-xs space-y-1 text-slate-300">
                  <div className="flex justify-between">
                    <span>Facturación:</span>
                    <strong className="text-emerald-400 font-mono">${hoveredData.data.totalRevenue?.toLocaleString('es-AR')}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Pedidos:</span>
                    <strong className="text-white font-mono">{hoveredData.data.ordersCount}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Ticket Promedio:</span>
                    <strong className="text-slate-200 font-mono">${hoveredData.data.averageTicket?.toLocaleString('es-AR')}</strong>
                  </div>
                </div>
              </div>
            )}

            {hoveredData.type === 'cut' && (
              <div>
                <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-1.5 mb-2">
                  <span className="font-bold text-sm text-amber-300 flex items-center gap-1.5">
                    🥩 #{hoveredData.rank} {hoveredData.data.name}
                  </span>
                </div>
                <div className="text-xs space-y-1 text-slate-300">
                  <div className="flex justify-between">
                    <span>Kg Despachados:</span>
                    <strong className="text-white font-mono">{hoveredData.data.totalKgSold} kg</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Total Facturado:</span>
                    <strong className="text-emerald-400 font-mono">${hoveredData.data.totalRevenue?.toLocaleString('es-AR')}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Margen Estimado:</span>
                    <strong className="text-cyan-400 font-mono">${hoveredData.data.marginEstimate?.toLocaleString('es-AR')}</strong>
                  </div>
                </div>
              </div>
            )}

            {hoveredData.type === 'channel' && (
              <div>
                <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-1.5 mb-2">
                  <span className="font-bold text-sm text-cyan-300">
                    {hoveredData.data.name}
                  </span>
                  <span className="text-xs font-mono font-bold text-emerald-400">
                    {hoveredData.slicePct}%
                  </span>
                </div>
                <div className="text-xs space-y-1 text-slate-300">
                  <div className="flex justify-between">
                    <span>Facturación:</span>
                    <strong className="text-emerald-400 font-mono">${hoveredData.data.revenue?.toLocaleString('es-AR')}</strong>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Footer Guía de Interacción */}
      <div className="flex items-center justify-between px-5 py-2.5 text-[11px] text-slate-400 border-t border-slate-800/80 bg-slate-900/60">
        <span className="flex items-center gap-1.5">
          <Eye className="w-3.5 h-3.5 text-cyan-400" />
          Arrastra con el ratón para rotar el modelo en 360°. Pasa el cursor por las barras para ver datos detallados.
        </span>
        <span className="hidden sm:inline text-slate-500">
          Renderizado con Three.js WebGL & Luces PBR
        </span>
      </div>
    </div>
  );
}
