import React, { useState, useEffect, useRef } from 'react';
import {
  Brain,
  Search,
  Sparkles,
  RefreshCw,
  Zap,
  Layers,
  Store,
  ShoppingBag,
  Users,
  Bike,
  Bot,
  CreditCard,
  CheckCircle2,
  ShieldCheck,
  Share2,
  Activity,
  ArrowRight,
  Info,
  Maximize2,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Copy,
  Check,
  TrendingDown,
  Gauge,
  Cpu,
  Lock,
  Compass
} from 'lucide-react';

const CLUSTER_CONFIG = {
  brand: { bg: 'bg-purple-500/20', border: 'border-purple-500/50', text: 'text-purple-400', glow: '#a855f7', label: 'Marca' },
  catalog: { bg: 'bg-rose-500/20', border: 'border-rose-500/50', text: 'text-rose-400', glow: '#f43f5e', label: 'Catálogo' },
  product: { bg: 'bg-amber-500/20', border: 'border-amber-500/50', text: 'text-amber-400', glow: '#f59e0b', label: 'Productos' },
  branches: { bg: 'bg-emerald-500/20', border: 'border-emerald-500/50', text: 'text-emerald-400', glow: '#10b981', label: 'Sucursales' },
  branch: { bg: 'bg-teal-500/20', border: 'border-teal-500/50', text: 'text-teal-400', glow: '#14b8a6', label: 'Sucursal' },
  users_rbac: { bg: 'bg-blue-500/20', border: 'border-blue-500/50', text: 'text-blue-400', glow: '#3b82f6', label: 'Roles RBAC' },
  role: { bg: 'bg-indigo-500/20', border: 'border-indigo-500/50', text: 'text-indigo-400', glow: '#6366f1', label: 'Rol' },
  user: { bg: 'bg-sky-500/20', border: 'border-sky-500/50', text: 'text-sky-400', glow: '#0ea5e9', label: 'Usuario' },
  logistics: { bg: 'bg-cyan-500/20', border: 'border-cyan-500/50', text: 'text-cyan-400', glow: '#06b6d4', label: 'Logística' },
  driver: { bg: 'bg-emerald-500/20', border: 'border-emerald-500/50', text: 'text-emerald-400', glow: '#10b981', label: 'Repartidor' },
  ai_voice: { bg: 'bg-violet-500/20', border: 'border-violet-500/50', text: 'text-violet-400', glow: '#8b5cf6', label: 'IA & Voz' },
  payments: { bg: 'bg-lime-500/20', border: 'border-lime-500/50', text: 'text-lime-400', glow: '#84cc16', label: 'Pagos MP' }
};

export default function NeuralMemoryView({ socket }) {
  const [availableChats, setAvailableChats] = useState([]);
  const [selectedChatId, setSelectedChatId] = useState('global'); // 'global' | jid
  const [mapData, setMapData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedNode, setSelectedNode] = useState(null);
  const [hoveredNode, setHoveredNode] = useState(null);
  const [filterCategory, setFilterCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [testQuery, setTestQuery] = useState('Don Juan quiere 1 combo asadazo y pagar con Mercado Pago en Locelso 7100');
  const [activatedNodes, setActivatedNodes] = useState([]);
  const [contextPreview, setContextPreview] = useState(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDraggingCanvas, setIsDraggingCanvas] = useState(false);
  const [draggedNode, setDraggedNode] = useState(null);
  
  const canvasRef = useRef(null);
  const animFrameRef = useRef(null);
  const nodesPhysicsRef = useRef([]);
  const lastMousePosRef = useRef({ x: 0, y: 0 });
  const particlesRef = useRef([]);

  const fetchAvailableChats = async () => {
    try {
      const res = await fetch('/api/leads');
      if (res.ok) {
        const data = await res.json();
        setAvailableChats(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error('Error fetching leads for neural memory:', err);
    }
  };

  const fetchMap = async (targetChatId = selectedChatId) => {
    setIsLoading(true);
    try {
      const url = targetChatId === 'global'
        ? '/api/neural-memory/map'
        : `/api/neural-memory/chat/${encodeURIComponent(targetChatId)}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setMapData(data);
        initPhysicsNodes(data);
        if (data.nodes?.length > 0) {
          setSelectedNode(data.nodes[0]);
        }
      }
    } catch (err) {
      console.error('Error cargando mapa mental:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchContextPreview = async () => {
    try {
      const res = await fetch('/api/neural-memory/context');
      if (res.ok) {
        const data = await res.json();
        setContextPreview(data);
      }
    } catch (err) {}
  };

  useEffect(() => {
    fetchAvailableChats();
    fetchMap('global');
    fetchContextPreview();
  }, []);

  // Real-time socket sync for active conversation mental map
  useEffect(() => {
    if (!socket) return;
    const handleNewMsg = (data) => {
      if (selectedChatId !== 'global' && data?.chatId === selectedChatId) {
        fetchMap(selectedChatId);
      }
    };
    socket.on('message:new', handleNewMsg);
    socket.on('lead:updated', () => {
      fetchAvailableChats();
      if (selectedChatId !== 'global') fetchMap(selectedChatId);
    });
    return () => {
      socket.off('message:new', handleNewMsg);
      socket.off('lead:updated');
    };
  }, [socket, selectedChatId]);

  const initPhysicsNodes = (data) => {
    if (!data?.nodes) return;
    const width = 900;
    const height = 650;
    const center = { x: width / 2, y: height / 2 };

    const nodes = data.nodes.map((node, i) => {
      let x = center.x;
      let y = center.y;
      let radius = 12;

      if (node.id === 'node_brand') {
        radius = 28;
      } else if (node.type === 'cluster') {
        const clusters = data.nodes.filter(n => n.type === 'cluster');
        const idx = clusters.findIndex(c => c.id === node.id);
        const angle = (idx / Math.max(1, clusters.length)) * Math.PI * 2 - Math.PI / 2;
        const dist = 180;
        x = center.x + Math.cos(angle) * dist;
        y = center.y + Math.sin(angle) * dist;
        radius = 18;
      } else {
        const leaves = data.nodes.filter(n => n.type !== 'cluster' && n.id !== 'node_brand');
        const idx = leaves.findIndex(l => l.id === node.id);
        const angle = (idx / Math.max(1, leaves.length)) * Math.PI * 2;
        const dist = 280 + (i % 3) * 35;
        x = center.x + Math.cos(angle) * dist;
        y = center.y + Math.sin(angle) * dist;
        radius = 10;
      }

      return {
        ...node,
        x,
        y,
        vx: 0,
        vy: 0,
        radius,
        targetRadius: radius
      };
    });

    nodesPhysicsRef.current = nodes;

    const particles = [];
    for (let p = 0; p < 24; p++) {
      particles.push({
        edgeIndex: Math.floor(Math.random() * (data.edges?.length || 1)),
        progress: Math.random(),
        speed: 0.004 + Math.random() * 0.006,
        size: 2 + Math.random() * 2
      });
    }
    particlesRef.current = particles;
  };

  const handleSimulateSynapse = async () => {
    if (!testQuery) return;
    setIsSimulating(true);
    try {
      const res = await fetch('/api/neural-memory/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: testQuery })
      });
      if (res.ok) {
        const data = await res.json();
        const matchedIds = (data.results || []).map(n => n.id);
        setActivatedNodes(matchedIds);
        if (data.results && data.results[0]) {
          setSelectedNode(data.results[0]);
        }
      }
    } catch (err) {
      console.error('Error simulando activación:', err);
    } finally {
      setIsSimulating(false);
    }
  };

  const handleCopyPrompt = () => {
    if (contextPreview?.contextPrompt) {
      navigator.clipboard.writeText(contextPreview.contextPrompt);
      setCopiedPrompt(true);
      setTimeout(() => setCopiedPrompt(false), 2000);
    }
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const render = () => {
      const width = canvas.width;
      const height = canvas.height;
      const nodes = nodesPhysicsRef.current;
      const edges = mapData?.edges || [];

      if (nodes.length > 0) {
        for (let i = 0; i < nodes.length; i++) {
          const n1 = nodes[i];
          if (draggedNode && draggedNode.id === n1.id) continue;

          const dx = width / 2 - n1.x;
          const dy = height / 2 - n1.y;
          n1.vx += dx * 0.0003;
          n1.vy += dy * 0.0003;

          for (let j = i + 1; j < nodes.length; j++) {
            const n2 = nodes[j];
            const distDx = n2.x - n1.x;
            const distDy = n2.y - n1.y;
            const dist = Math.sqrt(distDx * distDx + distDy * distDy) || 1;
            const minDist = n1.radius + n2.radius + 30;
            if (dist < minDist) {
              const force = (minDist - dist) / dist * 0.05;
              n1.vx -= distDx * force;
              n1.vy -= distDy * force;
              n2.vx += distDx * force;
              n2.vy += distDy * force;
            }
          }

          n1.vx *= 0.88;
          n1.vy *= 0.88;
          n1.x += n1.vx;
          n1.y += n1.vy;
        }
      }

      ctx.clearRect(0, 0, width, height);

      ctx.save();
      ctx.translate(pan.x, pan.y);
      ctx.scale(zoom, zoom);

      ctx.strokeStyle = 'rgba(168, 85, 247, 0.04)';
      ctx.lineWidth = 1;
      const gridSize = 40;
      const startX = -pan.x / zoom - 200;
      const endX = (width - pan.x) / zoom + 200;
      const startY = -pan.y / zoom - 200;
      const endY = (height - pan.y) / zoom + 200;

      for (let x = startX - (startX % gridSize); x < endX; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, startY);
        ctx.lineTo(x, endY);
        ctx.stroke();
      }
      for (let y = startY - (startY % gridSize); y < endY; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(startX, y);
        ctx.lineTo(endX, y);
        ctx.stroke();
      }

      const nodeMap = new Map(nodes.map(n => [n.id, n]));

      edges.forEach((edge) => {
        const fromNode = nodeMap.get(edge.from);
        const toNode = nodeMap.get(edge.to);
        if (!fromNode || !toNode) return;

        const isConnectedToSelected = selectedNode && (edge.from === selectedNode.id || edge.to === selectedNode.id);
        const isActivated = activatedNodes.includes(edge.from) || activatedNodes.includes(edge.to);

        ctx.beginPath();
        ctx.moveTo(fromNode.x, fromNode.y);
        ctx.lineTo(toNode.x, toNode.y);

        if (isConnectedToSelected || isActivated) {
          ctx.strokeStyle = isActivated ? 'rgba(244, 63, 94, 0.85)' : 'rgba(168, 85, 247, 0.85)';
          ctx.lineWidth = 2.5;
          ctx.shadowColor = isActivated ? '#f43f5e' : '#a855f7';
          ctx.shadowBlur = 10;
        } else {
          ctx.strokeStyle = 'rgba(148, 163, 184, 0.12)';
          ctx.lineWidth = 1;
          ctx.shadowBlur = 0;
        }
        ctx.stroke();
        ctx.shadowBlur = 0;
      });

      particlesRef.current.forEach(p => {
        const edge = edges[p.edgeIndex];
        if (!edge) return;
        const fromNode = nodeMap.get(edge.from);
        const toNode = nodeMap.get(edge.to);
        if (!fromNode || !toNode) return;

        p.progress += p.speed;
        if (p.progress >= 1) p.progress = 0;

        const curX = fromNode.x + (toNode.x - fromNode.x) * p.progress;
        const curY = fromNode.y + (toNode.y - fromNode.y) * p.progress;
        const isHot = activatedNodes.includes(edge.from) || activatedNodes.includes(edge.to);

        ctx.beginPath();
        ctx.arc(curX, curY, p.size, 0, Math.PI * 2);
        ctx.fillStyle = isHot ? '#f43f5e' : '#38bdf8';
        ctx.shadowColor = isHot ? '#f43f5e' : '#38bdf8';
        ctx.shadowBlur = 8;
        ctx.fill();
        ctx.shadowBlur = 0;
      });

      nodes.forEach(node => {
        const isSelected = selectedNode?.id === node.id;
        const isHovered = hoveredNode?.id === node.id;
        const isActivated = activatedNodes.includes(node.id);
        const isFiltered = filterCategory !== 'all' && node.category !== filterCategory;
        const conf = CLUSTER_CONFIG[node.category] || { glow: '#8b5cf6', text: 'text-purple-400' };

        const currentRadius = isSelected ? node.radius * 1.3 : isHovered ? node.radius * 1.15 : node.radius;

        if (isSelected || isActivated || isHovered) {
          ctx.beginPath();
          ctx.arc(node.x, node.y, currentRadius + 8, 0, Math.PI * 2);
          ctx.fillStyle = isActivated ? 'rgba(244, 63, 94, 0.25)' : 'rgba(168, 85, 247, 0.25)';
          ctx.fill();
        }

        ctx.beginPath();
        ctx.arc(node.x, node.y, currentRadius, 0, Math.PI * 2);
        ctx.fillStyle = isFiltered ? 'rgba(30, 41, 59, 0.4)' : isActivated ? '#f43f5e' : isSelected ? '#a855f7' : '#0f172a';
        ctx.strokeStyle = isFiltered ? 'rgba(71, 85, 105, 0.3)' : conf.glow;
        ctx.lineWidth = isSelected ? 3 : 2;
        ctx.shadowColor = conf.glow;
        ctx.shadowBlur = isSelected || isActivated ? 14 : 4;
        ctx.fill();
        ctx.stroke();
        ctx.shadowBlur = 0;

        ctx.font = `${Math.round(currentRadius * 0.9)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#ffffff';
        ctx.fillText(node.icon || '•', node.x, node.y + 1);

        if (zoom >= 0.75 || isSelected || isHovered || node.type === 'cluster' || node.id === 'node_brand') {
          ctx.font = isSelected ? 'bold 12px Inter, sans-serif' : '10px Inter, sans-serif';
          ctx.fillStyle = isSelected ? '#ffffff' : isActivated ? '#fca5a5' : isFiltered ? 'rgba(148, 163, 184, 0.4)' : '#cbd5e1';
          ctx.fillText(node.label || '', node.x, node.y + currentRadius + 13);
        }
      });

      ctx.restore();
      animFrameRef.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [mapData, selectedNode, hoveredNode, activatedNodes, filterCategory, zoom, pan, draggedNode]);

  const getCanvasCoords = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const clientX = e.clientX - rect.left;
    const clientY = e.clientY - rect.top;
    return {
      x: (clientX - pan.x) / zoom,
      y: (clientY - pan.y) / zoom,
      rawX: clientX,
      rawY: clientY
    };
  };

  const handleMouseDown = (e) => {
    const { x, y, rawX, rawY } = getCanvasCoords(e);
    lastMousePosRef.current = { x: rawX, y: rawY };

    const nodes = nodesPhysicsRef.current;
    const clicked = nodes.find(n => {
      const dist = Math.sqrt((n.x - x) ** 2 + (n.y - y) ** 2);
      return dist <= n.radius + 6;
    });

    if (clicked) {
      setSelectedNode(clicked);
      setDraggedNode(clicked);
    } else {
      setIsDraggingCanvas(true);
    }
  };

  const handleMouseMove = (e) => {
    const { x, y, rawX, rawY } = getCanvasCoords(e);
    const dx = rawX - lastMousePosRef.current.x;
    const dy = rawY - lastMousePosRef.current.y;
    lastMousePosRef.current = { x: rawX, y: rawY };

    if (draggedNode) {
      draggedNode.x = x;
      draggedNode.y = y;
      draggedNode.vx = 0;
      draggedNode.vy = 0;
    } else if (isDraggingCanvas) {
      setPan(prev => ({ x: prev.x + dx, y: prev.y + dy }));
    } else {
      const nodes = nodesPhysicsRef.current;
      const hovered = nodes.find(n => {
        const dist = Math.sqrt((n.x - x) ** 2 + (n.y - y) ** 2);
        return dist <= n.radius + 6;
      });
      setHoveredNode(hovered || null);
    }
  };

  const handleMouseUp = () => {
    setDraggedNode(null);
    setIsDraggingCanvas(false);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onWheelNative = (e) => {
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
      setZoom(prev => Math.max(0.4, Math.min(2.5, prev * zoomFactor)));
    };

    canvas.addEventListener('wheel', onWheelNative, { passive: false });
    return () => {
      canvas.removeEventListener('wheel', onWheelNative);
    };
  }, []);

  const resetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const categories = [
    { id: 'all', label: 'Todo el Ecosistema', icon: Layers },
    { id: 'brand', label: 'Identidad & Marca', icon: Sparkles },
    { id: 'catalog', label: 'Catálogo & Ofertas', icon: ShoppingBag },
    { id: 'branches', label: '6 Sucursales Córdoba', icon: Store },
    { id: 'users_rbac', label: 'Usuarios & Roles RBAC', icon: ShieldCheck },
    { id: 'logistics', label: 'Logística & Reparto', icon: Bike },
    { id: 'payments', label: 'Cobranzas Mercado Pago', icon: CreditCard },
    { id: 'ai_voice', label: 'IA & Agente de Voz', icon: Bot }
  ];

  return (
    <div className="flex flex-col h-full bg-slate-950 text-slate-100 overflow-hidden select-none">
      {/* Header Superior con Métricas de Red Neuronal y Ahorro de Tokens */}
      <div className="bg-slate-900/90 border-b border-slate-800/80 px-6 py-4 backdrop-blur-md flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-purple-500/20 border border-purple-500/40 rounded-xl text-purple-400 shadow-lg shadow-purple-500/10">
            <Brain className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-white tracking-tight">Red Neuronal & Mapa Mental Cognitivo</h1>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                100% Sincronizado
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Topología viva del ecosistema: Catálogo estricto, 6 Sucursales, Roles RBAC, Clientes, Logística e IA.
            </p>
          </div>
        </div>

        {/* Selector de Grafo: Sistema Global vs Conversación de Cliente */}
        <div className="flex items-center gap-2 bg-slate-800/90 border border-purple-500/30 rounded-2xl px-3.5 py-2 shadow-lg">
          <Brain className="w-4 h-4 text-purple-400 shrink-0 animate-pulse" />
          <select
            value={selectedChatId}
            onChange={(e) => {
              const val = e.target.value;
              setSelectedChatId(val);
              fetchMap(val);
            }}
            className="bg-transparent text-xs font-bold text-white focus:outline-none cursor-pointer max-w-[260px] truncate"
          >
            <option value="global" className="bg-[#111b21] text-emerald-400 font-bold">🌐 Grafo del Sistema Global</option>
            <optgroup label="💬 Conversaciones en Vivo y Pasadas" className="bg-[#111b21] text-purple-300">
              {availableChats.map(c => (
                <option key={c.jid || c.id} value={c.jid || c.id} className="bg-[#111b21] text-white">
                  👤 {c.name || c.pushName || 'Cliente'} — {c.phone || c.jid?.split('@')[0]}
                </option>
              ))}
            </optgroup>
          </select>
        </div>

        {/* Métricas de Token Optimizer */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="bg-slate-800/70 border border-slate-700/60 rounded-xl px-3.5 py-2 flex items-center gap-3">
            <div className="p-1.5 bg-emerald-500/20 text-emerald-400 rounded-lg">
              <TrendingDown className="w-4 h-4" />
            </div>
            <div>
              <div className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Ahorro de Tokens</div>
              <div className="text-sm font-bold text-emerald-400">{contextPreview?.metrics?.tokenSavingsPercent || 88}% Menos Costo</div>
            </div>
          </div>

          <div className="bg-slate-800/70 border border-slate-700/60 rounded-xl px-3.5 py-2 flex items-center gap-3">
            <div className="p-1.5 bg-purple-500/20 text-purple-400 rounded-lg">
              <Cpu className="w-4 h-4" />
            </div>
            <div>
              <div className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Vector Cognitivo</div>
              <div className="text-sm font-bold text-purple-300">{contextPreview?.metrics?.neuralVectorTokens || 420} tokens</div>
            </div>
          </div>

          <button
            onClick={fetchMap}
            disabled={isLoading}
            className="p-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 rounded-xl transition-all hover:scale-105 active:scale-95"
            title="Recargar Grafo Neuronal"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-purple-400' : ''}`} />
          </button>
        </div>
      </div>

      {/* Barra de Filtros y Búsqueda */}
      <div className="bg-slate-900/60 border-b border-slate-800/60 px-6 py-2.5 flex items-center justify-between gap-4 overflow-x-auto">
        <div className="flex items-center gap-1.5 overflow-x-auto py-1 scrollbar-none">
          {categories.map(cat => {
            const Icon = cat.icon;
            const isSelected = filterCategory === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => setFilterCategory(cat.id)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
                  isSelected
                    ? 'bg-purple-600 text-white shadow-md shadow-purple-600/20'
                    : 'bg-slate-800/60 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{cat.label}</span>
              </button>
            );
          })}
        </div>

        <div className="relative min-w-[220px]">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar nodo o sinapsis..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 bg-slate-800/80 border border-slate-700/60 rounded-lg text-xs text-white placeholder-slate-400 focus:outline-none focus:border-purple-500 transition-all"
          />
        </div>
      </div>

      {/* Contenedor Principal: Canvas Gráfico + Panel Inspector */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Canvas del Grafo Interactivo */}
        <div className="flex-1 relative bg-slate-950 overflow-hidden cursor-crosshair">
          <canvas
            ref={canvasRef}
            width={900}
            height={650}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            className="w-full h-full block"
          />

          {/* Controles Flotantes de Zoom / Pan */}
          <div className="absolute bottom-6 left-6 flex items-center gap-1.5 bg-slate-900/90 border border-slate-800 rounded-xl p-1.5 backdrop-blur-md shadow-2xl">
            <button
              onClick={() => setZoom(prev => Math.min(2.5, prev * 1.2))}
              className="p-2 hover:bg-slate-800 text-slate-300 hover:text-white rounded-lg transition-colors"
              title="Acercar"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <button
              onClick={() => setZoom(prev => Math.max(0.4, prev * 0.8))}
              className="p-2 hover:bg-slate-800 text-slate-300 hover:text-white rounded-lg transition-colors"
              title="Alejar"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <button
              onClick={resetView}
              className="p-2 hover:bg-slate-800 text-slate-300 hover:text-white rounded-lg transition-colors"
              title="Centrar y Resetear Vista"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
            <div className="h-4 w-px bg-slate-700 mx-1" />
            <span className="text-[11px] text-slate-400 font-mono px-2">{Math.round(zoom * 100)}%</span>
          </div>

          {/* Leyenda de Interacción */}
          <div className="absolute top-4 left-6 pointer-events-none bg-slate-900/70 border border-slate-800/60 rounded-lg px-3 py-1.5 text-[11px] text-slate-400 backdrop-blur-sm">
            💡 <span className="text-slate-300 font-medium">Arrastrá nodos</span> para reacomodar | <span className="text-slate-300 font-medium">Rueda</span> para zoom | <span className="text-slate-300 font-medium">Click</span> para inspeccionar
          </div>
        </div>

        {/* Panel Lateral: Inspector de Nodo + Simulador de Sinapsis */}
        <div className="w-96 border-l border-slate-800/80 bg-slate-900/95 flex flex-col justify-between overflow-y-auto backdrop-blur-lg">
          {/* Ficha del Nodo Seleccionado */}
          <div className="p-5 space-y-4">
            {selectedNode ? (
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-purple-500/20 border border-purple-500/40 flex items-center justify-center text-2xl shadow-lg shadow-purple-500/10">
                      {selectedNode.icon || '🧠'}
                    </div>
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-400 border border-purple-500/30">
                        {CLUSTER_CONFIG[selectedNode.category]?.label || selectedNode.category}
                      </span>
                      <h2 className="text-base font-bold text-white mt-1 leading-snug">{selectedNode.label}</h2>
                    </div>
                  </div>
                </div>

                <div className="p-3.5 bg-slate-800/50 border border-slate-700/50 rounded-xl text-xs text-slate-300 leading-relaxed">
                  {selectedNode.summary || 'Entidad central modelada dentro del grafo neuronal cognitivo de República de la Carne.'}
                </div>

                {/* Detalles y Atributos Específicos */}
                {selectedNode.details && (
                  <div className="space-y-2">
                    <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Atributos & Sinapsis</div>
                    <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3 space-y-1.5 font-mono text-xs text-slate-300">
                      {Object.entries(selectedNode.details).map(([key, val]) => (
                        <div key={key} className="flex items-start justify-between gap-2">
                          <span className="text-slate-500 capitalize">{key.replace(/_/g, ' ')}:</span>
                          <span className="text-right text-purple-300 font-medium break-all">
                            {typeof val === 'object' ? JSON.stringify(val) : String(val)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Sinapsis Conectadas */}
                <div className="space-y-2">
                  <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                    <span>Conexiones Sinápticas</span>
                    <span className="text-purple-400 font-mono">
                      {(mapData?.edges || []).filter(e => e.from === selectedNode.id || e.to === selectedNode.id).length}
                    </span>
                  </div>
                  <div className="space-y-1 max-h-36 overflow-y-auto pr-1">
                    {(mapData?.edges || [])
                      .filter(e => e.from === selectedNode.id || e.to === selectedNode.id)
                      .map((edge, i) => {
                        const targetId = edge.from === selectedNode.id ? edge.to : edge.from;
                        const targetNode = mapData?.nodes?.find(n => n.id === targetId);
                        return (
                          <button
                            key={i}
                            onClick={() => targetNode && setSelectedNode(targetNode)}
                            className="w-full flex items-center justify-between p-2 rounded-lg bg-slate-800/40 hover:bg-slate-800 text-left text-xs text-slate-300 transition-colors group"
                          >
                            <span className="flex items-center gap-1.5">
                              <span>{targetNode?.icon || '•'}</span>
                              <span className="group-hover:text-purple-300 font-medium">{targetNode?.label || targetId}</span>
                            </span>
                            <span className="text-[10px] text-slate-500 font-mono">{edge.label}</span>
                          </button>
                        );
                      })}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-12 text-slate-500 space-y-2">
                <Brain className="w-8 h-8 mx-auto opacity-40 animate-pulse" />
                <p className="text-xs">Selecciona cualquier nodo del grafo para inspeccionar sus sinapsis y atributos.</p>
              </div>
            )}
          </div>

          {/* Probador y Simulador de Activación Sináptica */}
          <div className="p-5 border-t border-slate-800/80 bg-slate-950/60 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold text-white uppercase tracking-wider">
                <Zap className="w-3.5 h-3.5 text-amber-400" />
                <span>Simulador de Sinapsis</span>
              </div>
              <button
                onClick={handleCopyPrompt}
                className="flex items-center gap-1 text-[11px] text-purple-400 hover:text-purple-300 font-medium"
                title="Copiar prompt cognitivo optimizado"
              >
                {copiedPrompt ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                <span>{copiedPrompt ? 'Copiado' : 'Copiar Contexto'}</span>
              </button>
            </div>

            <textarea
              rows={2}
              value={testQuery}
              onChange={(e) => setTestQuery(e.target.value)}
              placeholder="Ingresa una consulta de prueba para activar la red..."
              className="w-full p-2.5 bg-slate-900 border border-slate-700/70 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 resize-none font-sans"
            />

            <button
              onClick={handleSimulateSynapse}
              disabled={isSimulating || !testQuery}
              className="w-full py-2.5 px-4 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 disabled:opacity-50 text-white rounded-xl text-xs font-semibold shadow-lg shadow-purple-600/20 transition-all flex items-center justify-center gap-2"
            >
              <Sparkles className={`w-3.5 h-3.5 ${isSimulating ? 'animate-spin' : ''}`} />
              <span>{isSimulating ? 'Propagando Impulso...' : 'Disparar Activación Sináptica'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
