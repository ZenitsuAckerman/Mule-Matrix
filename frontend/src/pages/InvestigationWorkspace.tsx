import React, { useState, useEffect, useRef } from 'react';
import {
  Download,
  RotateCcw,
  FileText,
  Maximize2,
  Minimize2,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  ChevronLeft,
  ChevronRight,
  ShieldAlert,
  ArrowRight
} from 'lucide-react';
import cytoscape from 'cytoscape';
import { api } from '../lib/api';
import { InvestigationDetail, LineageNode, LineageEdge } from '../types/api';
import { useTheme } from '../context/ThemeContext';
import { RippleGrid } from '../components/RippleGrid';

interface InvestigationWorkspaceProps {
  initialContext?: { alert_id?: string; root_account_id?: string };
}

export const InvestigationWorkspace: React.FC<InvestigationWorkspaceProps> = ({ initialContext }) => {
  const { theme } = useTheme();
  const [investigation, setInvestigation] = useState<InvestigationDetail | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [viewMode, setViewMode] = useState<'COMBINED' | 'BACKWARD' | 'FORWARD'>('COMBINED');
  
  const [selectedEntity, setSelectedEntity] = useState<LineageNode | LineageEdge | null>(null);
  const [activeTabPanel, setActiveTabPanel] = useState<'timeline' | 'hops' | 'paths'>('timeline');
  const [isFullScreen, setIsFullScreen] = useState<boolean>(false);

  const graphContainerRef = useRef<HTMLDivElement>(null);
  const graphCardRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<cytoscape.Core | null>(null);

  const toggleFullScreen = () => {
    setIsFullScreen(prev => !prev);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullScreen) {
        setIsFullScreen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullScreen]);

  useEffect(() => {
    const timer = setTimeout(() => {
      cyRef.current?.resize();
      cyRef.current?.fit();
    }, 150);
    return () => clearTimeout(timer);
  }, [isFullScreen]);

  const initWorkspace = async () => {
    setLoading(true);
    try {
      if (initialContext?.root_account_id) {
        const inv = await api.createInvestigation({
          root_account_id: initialContext.root_account_id,
          alert_id: initialContext.alert_id,
          lookback_hours: 72,
          lookahead_hours: 72
        });
        setInvestigation(inv);
      } else {
        const alerts = await api.getAlerts({ limit: 1 });
        if (alerts.length > 0) {
          const inv = await api.createInvestigation({
            root_account_id: alerts[0].account_id,
            alert_id: alerts[0].id,
            lookback_hours: 72,
            lookahead_hours: 72
          });
          setInvestigation(inv);
        } else {
          setInvestigation(null);
        }
      }
    } catch (e) {
      console.error(e);
      setInvestigation(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    initWorkspace();
  }, [initialContext]);

  const handleRetrace = async () => {
    if (!investigation) return;
    setLoading(true);
    try {
      const updated = await api.retraceInvestigation(investigation.id, {
        lookback_hours: 72,
        lookahead_hours: 72,
        max_hops: 12
      });
      setInvestigation(updated);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  // Sequential Lineage Traversal Player State (Ordered chronologically)
  const sortedEdges = React.useMemo(() => {
    if (!investigation?.edges) return [];
    return [...investigation.edges].sort((a, b) => {
      const tA = a.posted_at ? new Date(a.posted_at).getTime() : 0;
      const tB = b.posted_at ? new Date(b.posted_at).getTime() : 0;
      if (tA !== tB) return tA - tB;
      return a.hop_depth - b.hop_depth;
    });
  }, [investigation]);

  const totalHops = Math.max(1, sortedEdges.length);
  const [currentHop, setCurrentHop] = useState<number>(1);
  const [isPlaying, setIsPlaying] = useState<boolean>(true);

  // Auto-play timer for sequential real-time lineage visualization
  useEffect(() => {
    if (!isPlaying) return;
    if (currentHop >= totalHops) {
      setIsPlaying(false);
      return;
    }
    const timer = setTimeout(() => {
      setCurrentHop(prev => Math.min(totalHops, prev + 1));
    }, 1400);
    return () => clearTimeout(timer);
  }, [isPlaying, currentHop, totalHops]);

  // Cytoscape rendering with Swiss styling and sequential reveal
  useEffect(() => {
    if (!graphContainerRef.current) return;
    if (!investigation) {
      if (cyRef.current) {
        cyRef.current.destroy();
        cyRef.current = null;
      }
      return;
    }

    if (cyRef.current) {
      cyRef.current.destroy();
      cyRef.current = null;
    }

    let activeEdges = sortedEdges.slice(0, currentHop);

    if (viewMode === 'BACKWARD') {
      activeEdges = activeEdges.filter(e => e.direction === 'BACKWARD');
    } else if (viewMode === 'FORWARD') {
      activeEdges = activeEdges.filter(e => e.direction === 'FORWARD');
    }

    const activeAccountIds = new Set<string>([investigation.root_account_id]);
    activeEdges.forEach(e => {
      activeAccountIds.add(e.source_account_id);
      activeAccountIds.add(e.destination_account_id);
    });

    let visibleNodes = investigation.nodes.filter(n => activeAccountIds.has(n.account_id)).slice(0, 30);

    const isDark = theme === 'dark';
    const elements: cytoscape.ElementDefinition[] = [];

    // Nodes
    visibleNodes.forEach(node => {
      let bgColor = isDark ? '#1C1D21' : '#FFFFFF';
      let borderColor = isDark ? '#4A4D57' : '#111111';
      let textColor = isDark ? '#FFFFFF' : '#111111';
      let size = 46;

      if (node.direction === 'ROOT') {
        bgColor = '#E30613'; // Swiss vivid red
        borderColor = '#FFFFFF';
        textColor = '#FFFFFF';
        size = 54;
      } else if (node.is_off_ramp) {
        bgColor = '#8B0000';
        borderColor = '#E30613';
        textColor = '#FFFFFF';
        size = 48;
      } else if (node.is_origin) {
        bgColor = '#0F766E';
        borderColor = '#14B8A6';
        textColor = '#FFFFFF';
        size = 48;
      } else if (node.direction === 'BACKWARD') {
        bgColor = isDark ? '#1E293B' : '#F1F5F9';
        borderColor = '#0284C7';
        textColor = isDark ? '#FFFFFF' : '#0F172A';
      } else if (node.direction === 'FORWARD') {
        bgColor = isDark ? '#1E293B' : '#F1F5F9';
        borderColor = '#475569';
        textColor = isDark ? '#FFFFFF' : '#0F172A';
      }

      elements.push({
        group: 'nodes',
        data: {
          id: node.account_id,
          label: `${node.account_ref}\n${node.bank_code}`,
          raw: node,
          color: bgColor,
          borderColor,
          textColor,
          size
        }
      });
    });

    // Edges
    activeEdges.forEach((edge, idx) => {
      const isLatest = idx === activeEdges.length - 1;
      elements.push({
        group: 'edges',
        data: {
          id: edge.id,
          source: edge.source_account_id,
          target: edge.destination_account_id,
          amount_formatted: `₹${(edge.amount_minor / 100).toLocaleString()}`,
          raw: edge,
          isLatest
        }
      });
    });

    const cy = cytoscape({
      container: graphContainerRef.current,
      elements,
      style: [
        {
          selector: 'node',
          style: {
            'background-color': 'data(color)',
            'border-width': 2,
            'border-color': 'data(borderColor)',
            'label': 'data(label)',
            'color': 'data(textColor)',
            'font-size': '10px',
            'font-family': 'Inter, Helvetica Neue, sans-serif',
            'font-weight': 'bold',
            'text-valign': 'center',
            'text-halign': 'center',
            'text-wrap': 'wrap',
            'width': 'data(size)',
            'height': 'data(size)'
          } as any
        },
        {
          selector: 'node:selected',
          style: {
            'border-width': 4,
            'border-color': '#E30613',
            'width': 58,
            'height': 58
          }
        },
        {
          selector: 'edge',
          style: {
            'width': 2,
            'line-color': isDark ? '#3E414A' : '#A3A3A3',
            'target-arrow-color': isDark ? '#3E414A' : '#A3A3A3',
            'target-arrow-shape': 'triangle',
            'curve-style': 'bezier',
            'label': 'data(amount_formatted)',
            'font-size': '10px',
            'font-family': 'JetBrains Mono, monospace',
            'color': isDark ? '#FFFFFF' : '#111111',
            'font-weight': '700',
            'text-background-opacity': 1,
            'text-background-color': isDark ? '#151619' : '#FFFFFF',
            'text-background-padding': '3px',
            'text-background-shape': 'rectangle',
            'text-border-color': isDark ? '#3E414A' : '#D4D4D4',
            'text-border-width': 1,
            'text-border-opacity': 1
          } as any
        },
        {
          selector: 'edge[?isLatest]',
          style: {
            'line-color': '#E30613',
            'target-arrow-color': '#E30613',
            'width': 3.5,
            'text-border-color': '#E30613',
            'color': '#E30613'
          } as any
        },
        {
          selector: 'edge:selected',
          style: {
            'line-color': '#E30613',
            'target-arrow-color': '#E30613',
            'width': 3.5
          }
        }
      ],
      layout: {
        name: 'breadthfirst',
        directed: true,
        roots: [investigation.root_account_id],
        padding: 40,
        spacingFactor: 1.25
      }
    });

    cy.on('tap', 'node', (evt) => {
      setSelectedEntity(evt.target.data('raw'));
    });
    cy.on('tap', 'edge', (evt) => {
      setSelectedEntity(evt.target.data('raw'));
    });

    cyRef.current = cy;
  }, [investigation, viewMode, theme, currentHop, sortedEdges]);

  const handleExport = (format: 'html' | 'json') => {
    if (!investigation) return;
    window.open(api.getExportUrl(investigation.id, format), '_blank');
  };

  const activeMovement = sortedEdges[currentHop - 1];

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* Swiss Case Dossier Header */}
      <div className="border-b-2 border-neutral-900 dark:border-neutral-100 pb-5">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2 text-[11px] font-mono uppercase tracking-widest text-swiss-red font-bold">
              <span>FORENSIC LINEAGE</span>
              <span className="text-neutral-400">—</span>
              <span className="text-neutral-500">RECONSTRUCTED WORKSPACE</span>
            </div>
            <h1 className="text-3xl md:text-5xl font-black uppercase tracking-tight text-neutral-900 dark:text-neutral-100 mt-1">
              Lineage Reconstruction.
            </h1>
            <div className="flex items-center space-x-3 text-xs font-mono text-neutral-500 dark:text-neutral-400 mt-1">
              <span>DOSSIER: <strong className="text-neutral-900 dark:text-neutral-100">#{investigation ? investigation.id.slice(0, 8) : 'NONE'}</strong></span>
              <span>•</span>
              <span>TRIGGER ACCOUNT: <strong className="text-swiss-red font-bold">{investigation?.root_account_ref || 'NONE'}</strong> {investigation ? `(${investigation.root_bank_code})` : ''}</span>
            </div>
          </div>

          {/* Action CTAs in Swiss Button Form */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => handleExport('html')}
              disabled={!investigation}
              className="border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 hover:border-neutral-900 text-neutral-800 dark:text-neutral-200 font-mono font-bold px-3 py-2 text-xs uppercase tracking-wider flex items-center space-x-1.5 transition-colors disabled:opacity-40"
            >
              <Download className="w-3.5 h-3.5 text-swiss-red" />
              <span>EXPORT HTML</span>
            </button>
            <button
              onClick={() => handleExport('json')}
              disabled={!investigation}
              className="border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 hover:border-neutral-900 text-neutral-800 dark:text-neutral-200 font-mono font-bold px-3 py-2 text-xs uppercase tracking-wider flex items-center space-x-1.5 transition-colors disabled:opacity-40"
            >
              <FileText className="w-3.5 h-3.5 text-neutral-500" />
              <span>EXPORT JSON</span>
            </button>
            <button
              onClick={handleRetrace}
              disabled={loading || !investigation}
              className="bg-swiss-red hover:bg-swiss-redHover text-white font-mono font-bold px-4 py-2 text-xs uppercase tracking-wider flex items-center space-x-2 transition-colors disabled:opacity-50"
            >
              <RotateCcw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>RE-RUN TRACE</span>
            </button>
          </div>
        </div>

        {/* Modular Metrics Grid (6 Cells) */}
        {investigation?.summary_metrics_json && (
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mt-6">
            <div className="border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#151619] p-3">
              <span className="text-[10px] font-mono uppercase tracking-widest text-neutral-500 block">
                NODES
              </span>
              <span className="text-2xl font-black font-mono text-neutral-900 dark:text-white tabular-nums mt-0.5 block">
                {investigation.summary_metrics_json.accounts_discovered}
              </span>
            </div>

            <div className="border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#151619] p-3">
              <span className="text-[10px] font-mono uppercase tracking-widest text-neutral-500 block">
                BANKS
              </span>
              <span className="text-2xl font-black font-mono text-neutral-900 dark:text-white tabular-nums mt-0.5 block">
                {investigation.summary_metrics_json.banks_crossed}
              </span>
            </div>

            <div className="border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#151619] p-3">
              <span className="text-[10px] font-mono uppercase tracking-widest text-neutral-500 block">
                MOVEMENTS
              </span>
              <span className="text-2xl font-black font-mono text-neutral-900 dark:text-white tabular-nums mt-0.5 block">
                {investigation.summary_metrics_json.transactions_traversed}
              </span>
            </div>

            <div className="border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#151619] p-3">
              <span className="text-[10px] font-mono uppercase tracking-widest text-neutral-500 block">
                MAX DEPTH
              </span>
              <span className="text-2xl font-black font-mono text-neutral-900 dark:text-white tabular-nums mt-0.5 block">
                {investigation.summary_metrics_json.max_hop_depth} <span className="text-xs font-normal text-neutral-400">HOPS</span>
              </span>
            </div>

            <div className="border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#151619] p-3">
              <span className="text-[10px] font-mono uppercase tracking-widest text-neutral-500 block">
                OFF-RAMPS
              </span>
              <span className="text-2xl font-black font-mono text-swiss-red tabular-nums mt-0.5 block">
                {investigation.summary_metrics_json.off_ramps_found}
              </span>
            </div>

            <div className="border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#151619] p-3">
              <span className="text-[10px] font-mono uppercase tracking-widest text-neutral-500 block">
                CONFIDENCE
              </span>
              <span className="text-2xl font-black font-mono text-neutral-900 dark:text-white tabular-nums mt-0.5 block">
                {Math.round(investigation.summary_metrics_json.avg_confidence * 100)}%
              </span>
            </div>
          </div>
        )}

        {/* Regulatory Architecture Sub-Deck */}
        <div className="mt-4 p-3 border border-neutral-300 dark:border-neutral-700 bg-neutral-100 dark:bg-neutral-900/60 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs font-mono">
          <div className="flex items-center space-x-2">
            <span className="w-2 h-2 bg-swiss-red inline-block" />
            <span className="text-neutral-700 dark:text-neutral-300">
              <strong>REGULATORY PROTOCOL:</strong> Zero-PII CBDC / Programmable Token Allocation Engine. Inter-bank flows reconstructed without raw customer account ledger exposures.
            </span>
          </div>
          <span className="text-[10px] font-bold border border-neutral-400 dark:border-neutral-600 px-2 py-0.5 uppercase tracking-wider text-neutral-600 dark:text-neutral-400 whitespace-nowrap">
            SEC-72 AUDIT READY
          </span>
        </div>
      </div>

      {/* Main Workspace: Graph Canvas (8 Cols) + Inspector (4 Cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Graph Canvas Column */}
        <div
          ref={graphCardRef}
          className={`${
            isFullScreen
              ? 'fixed inset-0 z-50 bg-[#FAFAFA] dark:bg-[#0C0D0E] p-6 flex flex-col w-screen h-screen m-0'
              : 'lg:col-span-8 bg-white dark:bg-[#151619] border border-neutral-200 dark:border-neutral-800 p-5 flex flex-col h-[620px] relative'
          }`}
        >
          {/* Top Tape-Deck & Filter Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b-2 border-neutral-900 dark:border-neutral-100 z-10">
            {/* View Mode Segmented Controls */}
            <div className="flex border border-neutral-300 dark:border-neutral-700 text-xs font-mono">
              <button
                onClick={() => setViewMode('COMBINED')}
                className={`px-3 py-1.5 uppercase font-bold transition-colors ${
                  viewMode === 'COMBINED'
                    ? 'bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900'
                    : 'bg-transparent text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800'
                }`}
              >
                COMBINED
              </button>
              <button
                onClick={() => setViewMode('BACKWARD')}
                className={`px-3 py-1.5 uppercase font-bold border-l border-neutral-300 dark:border-neutral-700 transition-colors ${
                  viewMode === 'BACKWARD'
                    ? 'bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900'
                    : 'bg-transparent text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800'
                }`}
              >
                BACKWARD (ORIGIN)
              </button>
              <button
                onClick={() => setViewMode('FORWARD')}
                className={`px-3 py-1.5 uppercase font-bold border-l border-neutral-300 dark:border-neutral-700 transition-colors ${
                  viewMode === 'FORWARD'
                    ? 'bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900'
                    : 'bg-transparent text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800'
                }`}
              >
                FORWARD (SPLIT)
              </button>
            </div>

            {/* Tape-Deck Traversal Controls */}
            <div className="flex items-center space-x-1.5 border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900 p-1 text-xs font-mono">
              <button
                onClick={() => {
                  setCurrentHop(1);
                  setIsPlaying(false);
                }}
                className="px-2 py-1 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-800"
                title="Restart flow"
              >
                <SkipBack className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => {
                  setIsPlaying(false);
                  setCurrentHop(prev => Math.max(1, prev - 1));
                }}
                disabled={currentHop <= 1}
                className="px-2 py-1 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-800 disabled:opacity-30"
                title="Previous hop"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setIsPlaying(!isPlaying)}
                className="px-3 py-1 bg-swiss-red hover:bg-swiss-redHover text-white font-bold flex items-center space-x-1 uppercase text-[10px] tracking-wider"
              >
                {isPlaying ? (
                  <>
                    <Pause className="w-3 h-3" />
                    <span>PAUSE</span>
                  </>
                ) : (
                  <>
                    <Play className="w-3 h-3" />
                    <span>PLAY</span>
                  </>
                )}
              </button>
              <button
                onClick={() => {
                  setIsPlaying(false);
                  setCurrentHop(prev => Math.min(totalHops, prev + 1));
                }}
                disabled={currentHop >= totalHops}
                className="px-2 py-1 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-800 disabled:opacity-30"
                title="Next hop"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => {
                  setCurrentHop(totalHops);
                  setIsPlaying(false);
                }}
                className="px-2 py-1 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-800 text-[10px] font-bold"
                title="Reveal all"
              >
                ALL ({totalHops})
              </button>
              <span className="font-mono text-[10px] px-2 py-0.5 bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900 font-bold uppercase tracking-wider">
                HOP {String(currentHop).padStart(2, '0')}/{String(totalHops).padStart(2, '0')}
              </span>
            </div>

            <div className="flex items-center space-x-2">
              <button
                onClick={() => cyRef.current?.fit()}
                className="p-1.5 border border-neutral-300 dark:border-neutral-700 text-neutral-600 dark:text-neutral-400 hover:border-neutral-900 hover:text-neutral-900 dark:hover:text-white transition-colors text-xs flex items-center space-x-1 font-mono uppercase font-bold"
                title="Fit to Canvas"
              >
                <Maximize2 className="w-3.5 h-3.5" />
                <span>FIT</span>
              </button>

              <button
                onClick={toggleFullScreen}
                className={`p-1.5 border text-xs flex items-center space-x-1.5 font-mono uppercase font-bold transition-colors ${
                  isFullScreen
                    ? 'bg-swiss-red text-white border-swiss-red hover:bg-swiss-redHover'
                    : 'border-neutral-300 dark:border-neutral-700 text-neutral-600 dark:text-neutral-400 hover:border-neutral-900 hover:text-neutral-900 dark:hover:text-white'
                }`}
                title={isFullScreen ? 'Exit Full Screen (Esc)' : 'Expand Graph to Full Screen'}
              >
                {isFullScreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                <span>{isFullScreen ? 'EXIT FULLSCREEN' : 'FULLSCREEN'}</span>
              </button>
            </div>
          </div>

          {/* Graph & RippleGrid Canvas */}
          <div
            style={{ width: '100%', height: isFullScreen ? 'calc(100vh - 140px)' : '540px', position: 'relative' }}
            className="border border-neutral-200 dark:border-neutral-800 bg-[#FAFAFA] dark:bg-[#0C0D0E] mt-3 overflow-hidden flex-1 min-h-0"
          >
            {/* RippleGrid Component directly inside the box */}
            <div className="absolute inset-0 z-0">
              <RippleGrid
                color={theme === 'dark' ? '#ffffff' : '#000000'}
                cellSize={46}
                rippleStrength={1.4}
                rippleSpeed={1.1}
                glow={0.7}
                autoRipple="center"
                rippleInterval={2.2}
                lightMode={theme === 'light'}
                fade={0.2}
                opacity={theme === 'dark' ? 0.75 : 0.65}
              />
            </div>

            {/* Cytoscape Lineage Graph DOM */}
            <div
              ref={graphContainerRef}
              className="absolute inset-0 z-10 bg-transparent"
            />

            {/* Empty State Overlay when no active investigation */}
            {!investigation && !loading && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6 pointer-events-none z-20">
                <div className="bg-white/90 dark:bg-black/90 backdrop-blur-md border border-neutral-300 dark:border-neutral-700 p-5 shadow-2xl max-w-md">
                  <div className="flex items-center justify-center space-x-2 text-swiss-red font-mono text-[10px] font-bold uppercase tracking-widest mb-1.5">
                    <span className="w-2 h-2 bg-swiss-red inline-block" />
                    <span>SURVEILLANCE RIPPLEGRID MATRIX</span>
                  </div>
                  <h3 className="text-sm font-black font-mono uppercase text-neutral-900 dark:text-white">
                    Awaiting Lineage Trace Injection
                  </h3>
                  <p className="text-[11px] font-mono text-neutral-500 dark:text-neutral-400 mt-2 leading-relaxed">
                    Interactive WebGL RippleGrid active. Move cursor or click to pulse the grid. Run a scenario in the Simulator or select an alert to project forensic transaction lineage.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Active Movement Narrative Bar */}
          {activeMovement && (
            <div className="mt-3 p-3 bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900 text-xs font-mono flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center space-x-3">
                <span className="bg-swiss-red text-white text-[9px] font-bold px-2 py-0.5 uppercase tracking-wider">
                  ACTIVE HOP {activeMovement.hop_depth}
                </span>
                <span className="font-bold">
                  {activeMovement.source_account_ref} ({activeMovement.source_bank_code}) ➔ {activeMovement.destination_account_ref} ({activeMovement.destination_bank_code})
                </span>
                <span className="text-neutral-400 dark:text-neutral-600">•</span>
                <span className="text-swiss-red font-black tabular-nums text-sm">
                  ₹{(activeMovement.amount_minor / 100).toLocaleString()}
                </span>
                <span className="text-[10px] text-neutral-400 dark:text-neutral-600 uppercase font-sans">
                  via {activeMovement.rail}
                </span>
              </div>

              <div className="flex items-center space-x-3 text-[10px]">
                {activeMovement.allocation_method && (
                  <span className="border border-neutral-700 dark:border-neutral-300 px-2 py-0.5 uppercase tracking-wider">
                    TOKEN: {activeMovement.allocation_method}
                  </span>
                )}
                <span className="font-bold text-emerald-400 dark:text-emerald-700">
                  CONFIDENCE: {Math.round(activeMovement.confidence * 100)}%
                </span>
              </div>
            </div>
          )}

          {/* Swiss Graph Node Legend */}
          <div className="mt-2.5 flex flex-wrap items-center justify-between text-[10px] font-mono uppercase tracking-wider text-neutral-500 pt-2 border-t border-neutral-200 dark:border-neutral-800">
            <div className="flex flex-wrap items-center gap-4">
              <span className="flex items-center space-x-1.5 text-swiss-red font-bold">
                <span className="w-2.5 h-2.5 bg-swiss-red inline-block"></span>
                <span>ROOT TRIGGER</span>
              </span>
              <span className="flex items-center space-x-1.5 text-teal-600 dark:text-teal-400 font-bold">
                <span className="w-2.5 h-2.5 bg-teal-600 inline-block"></span>
                <span>ORIGIN CANDIDATE</span>
              </span>
              <span className="flex items-center space-x-1.5 text-neutral-700 dark:text-neutral-300 font-bold">
                <span className="w-2.5 h-2.5 border border-neutral-500 inline-block"></span>
                <span>TRANSIT MULE</span>
              </span>
              <span className="flex items-center space-x-1.5 text-red-700 dark:text-red-400 font-bold">
                <span className="w-2.5 h-2.5 bg-red-800 inline-block"></span>
                <span>TERMINAL OFF-RAMP</span>
              </span>
            </div>
            <span>STRICT TOPOLOGY CAPPED AT 30 NODES</span>
          </div>
        </div>

        {/* Selected Entity Inspector (4 Cols) */}
        <div className="lg:col-span-4 bg-white dark:bg-[#151619] border border-neutral-200 dark:border-neutral-800 p-6 h-[620px] overflow-y-auto space-y-6">
          <div className="flex items-center justify-between pb-3 border-b-2 border-neutral-900 dark:border-neutral-100">
            <div className="flex items-center space-x-2">
              <span className="w-1.5 h-1.5 bg-swiss-red inline-block" />
              <h2 className="text-xs font-bold uppercase tracking-widest text-neutral-900 dark:text-white font-mono">
                Entity Inspector
              </h2>
            </div>
            <span className="text-[9px] font-mono text-neutral-400 uppercase">INTERACTION DRILLDOWN</span>
          </div>

          {selectedEntity ? (
            'account_ref' in selectedEntity ? (
              <div className="space-y-5 text-xs font-mono">
                <div className="p-4 border-2 border-neutral-900 dark:border-neutral-100 bg-neutral-50 dark:bg-neutral-900">
                  <span className="text-[9px] text-neutral-500 uppercase tracking-widest font-bold">
                    INSPECTED ACCOUNT
                  </span>
                  <div className="text-xl font-black text-neutral-900 dark:text-white mt-1">
                    {selectedEntity.account_ref}
                  </div>
                  <div className="text-xs text-neutral-600 dark:text-neutral-400 mt-1 flex items-center gap-2">
                    <span>BANK:</span>
                    <strong className="text-neutral-900 dark:text-neutral-100 font-bold">
                      {selectedEntity.bank_name} ({selectedEntity.bank_code})
                    </strong>
                  </div>
                </div>

                <div className="border-b border-neutral-200 dark:border-neutral-800 pb-3">
                  <span className="text-[10px] text-neutral-500 uppercase tracking-wider block mb-1">
                    TOPOLOGICAL ROLE
                  </span>
                  <div>
                    <span className={`text-[10px] font-bold px-2 py-0.5 uppercase tracking-wider ${
                      selectedEntity.is_off_ramp ? 'bg-swiss-red text-white' :
                      selectedEntity.is_origin ? 'bg-teal-700 text-white' :
                      selectedEntity.direction === 'ROOT' ? 'bg-swiss-red text-white' :
                      'border border-neutral-400 text-neutral-800 dark:text-neutral-200'
                    }`}>
                      {selectedEntity.direction} {selectedEntity.is_off_ramp ? '• OFF-RAMP' : ''} {selectedEntity.is_origin ? '• ORIGIN' : ''}
                    </span>
                  </div>
                </div>

                <div className="border-b border-neutral-200 dark:border-neutral-800 pb-3">
                  <span className="text-[10px] text-neutral-500 uppercase tracking-wider block mb-0.5">
                    HOP DISTANCE
                  </span>
                  <div className="text-base font-black text-neutral-900 dark:text-neutral-100">
                    {selectedEntity.hop_depth} HOPS FROM TRIGGER
                  </div>
                </div>

                <div className="border-b border-neutral-200 dark:border-neutral-800 pb-3">
                  <span className="text-[10px] text-neutral-500 uppercase tracking-wider block mb-0.5">
                    ATTRIBUTED FUND VOLUME
                  </span>
                  <div className="text-2xl font-black text-neutral-900 dark:text-white tabular-nums">
                    ₹{(selectedEntity.amount_attributed_minor / 100).toLocaleString()}
                  </div>
                </div>

                <div>
                  <span className="text-[10px] text-neutral-500 uppercase tracking-wider block mb-1">
                    UNCERTAINTY & METRIC
                  </span>
                  <div className="text-neutral-800 dark:text-neutral-200 font-sans text-xs">
                    {selectedEntity.evidence_type}
                  </div>
                  <div className="mt-2 text-xs flex items-center justify-between border border-neutral-200 dark:border-neutral-800 p-2">
                    <span className="text-neutral-500">UNCERTAINTY INDEX:</span>
                    <span className="font-bold text-neutral-900 dark:text-neutral-100">
                      {(selectedEntity.uncertainty * 100).toFixed(1)}%
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-5 text-xs font-mono">
                <div className="p-4 border-2 border-neutral-900 dark:border-neutral-100 bg-neutral-50 dark:bg-neutral-900">
                  <span className="text-[9px] text-neutral-500 uppercase tracking-widest font-bold">
                    MOVEMENT VOLUME
                  </span>
                  <div className="text-2xl font-black text-swiss-red tabular-nums mt-1">
                    ₹{(selectedEntity.amount_minor / 100).toLocaleString()}
                  </div>
                  <div className="text-xs text-neutral-600 dark:text-neutral-400 mt-1 uppercase">
                    VIA {selectedEntity.rail} • HOP DEPTH #{selectedEntity.hop_depth}
                  </div>
                </div>

                <div className="border-b border-neutral-200 dark:border-neutral-800 pb-3 space-y-2">
                  <span className="text-[10px] text-neutral-500 uppercase tracking-wider block">
                    TRANSACTION ENDPOINTS
                  </span>
                  <div className="text-xs space-y-1">
                    <div>
                      <span className="text-neutral-400">SRC: </span>
                      <strong className="text-neutral-900 dark:text-neutral-100">
                        {selectedEntity.source_account_ref} ({selectedEntity.source_bank_code})
                      </strong>
                    </div>
                    <div>
                      <span className="text-neutral-400">DST: </span>
                      <strong className="text-neutral-900 dark:text-neutral-100">
                        {selectedEntity.destination_account_ref} ({selectedEntity.destination_bank_code})
                      </strong>
                    </div>
                  </div>
                  {selectedEntity.is_cross_bank && (
                    <span className="mt-2 inline-block text-[9px] font-bold uppercase tracking-wider border border-swiss-red text-swiss-red px-2 py-0.5">
                      INTER-BANK CLEARING
                    </span>
                  )}
                </div>

                <div>
                  <span className="text-[10px] text-neutral-500 uppercase tracking-wider block mb-1">
                    ALLOCATION RULE & CONFIDENCE
                  </span>
                  <div className="text-neutral-800 dark:text-neutral-200 font-bold">
                    {selectedEntity.allocation_method}
                  </div>
                  <div className="mt-2 text-xs flex items-center justify-between border border-neutral-200 dark:border-neutral-800 p-2">
                    <span className="text-neutral-500">LINEAGE CONFIDENCE:</span>
                    <span className="font-bold text-emerald-600 dark:text-emerald-400">
                      {(selectedEntity.confidence * 100).toFixed(0)}%
                    </span>
                  </div>
                </div>
              </div>
            )
          ) : (
            <div className="py-24 text-center text-neutral-400 font-mono text-xs">
              TAP ANY GRAPH NODE OR EDGE TO AUDIT METRICS, ENDPOINTS, AND UNCERTAINTY.
            </div>
          )}
        </div>
      </div>

      {/* Structured Swiss Evidence Tabs & Data Tables */}
      <div className="bg-white dark:bg-[#151619] border border-neutral-200 dark:border-neutral-800 p-6 space-y-6">
        <div className="flex flex-wrap items-center space-x-6 border-b-2 border-neutral-900 dark:border-neutral-100 pb-3">
          <button
            onClick={() => setActiveTabPanel('timeline')}
            className={`text-xs font-mono font-bold uppercase tracking-wider transition-colors pb-1 ${
              activeTabPanel === 'timeline'
                ? 'text-swiss-red border-b-2 border-swiss-red'
                : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-200'
            }`}
          >
            CHRONOLOGICAL TIMELINE ({investigation?.timeline.length || 0})
          </button>
          <button
            onClick={() => setActiveTabPanel('hops')}
            className={`text-xs font-mono font-bold uppercase tracking-wider transition-colors pb-1 ${
              activeTabPanel === 'hops'
                ? 'text-swiss-red border-b-2 border-swiss-red'
                : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-200'
            }`}
          >
            HOP EVIDENCE ROWS ({investigation?.edges.length || 0})
          </button>
          <button
            onClick={() => setActiveTabPanel('paths')}
            className={`text-xs font-mono font-bold uppercase tracking-wider transition-colors pb-1 ${
              activeTabPanel === 'paths'
                ? 'text-swiss-red border-b-2 border-swiss-red'
                : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-200'
            }`}
          >
            CANDIDATE PATHS ({investigation?.candidate_paths.length || 0})
          </button>
        </div>

        {activeTabPanel === 'timeline' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead>
                <tr className="border-b-2 border-neutral-900 dark:border-neutral-100 text-[10px] uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                  <th className="pb-2.5 font-bold">TIMESTAMP (UTC)</th>
                  <th className="pb-2.5 font-bold">SOURCE</th>
                  <th className="pb-2.5 font-bold">DESTINATION</th>
                  <th className="pb-2.5 font-bold">RAIL</th>
                  <th className="pb-2.5 font-bold">AMOUNT</th>
                  <th className="pb-2.5 font-bold">RULE</th>
                  <th className="pb-2.5 font-bold">CONFIDENCE</th>
                  <th className="pb-2.5 font-bold">MEMO</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                {(!investigation || !investigation.timeline?.length) ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-neutral-400 font-mono text-xs">
                      No chronological timeline events recorded.
                    </td>
                  </tr>
                ) : (
                  investigation.timeline.map((item, idx) => (
                    <tr key={idx} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/30">
                      <td className="py-2.5 text-neutral-500">{item.timestamp}</td>
                      <td className="py-2.5 font-bold text-neutral-900 dark:text-neutral-100">
                        {item.source_account_ref} ({item.source_bank_code})
                      </td>
                      <td className="py-2.5 font-bold text-neutral-900 dark:text-neutral-100">
                        {item.destination_account_ref} ({item.destination_bank_code})
                      </td>
                      <td className="py-2.5 text-neutral-600 dark:text-neutral-400 font-sans">{item.rail}</td>
                      <td className="py-2.5 font-black text-neutral-900 dark:text-white tabular-nums">
                        ₹{(item.amount_minor / 100).toLocaleString()}
                      </td>
                      <td className="py-2.5 text-neutral-500 text-[10px]">{item.allocation_method}</td>
                      <td className="py-2.5 text-emerald-600 dark:text-emerald-400 font-bold">
                        {Math.round(item.confidence * 100)}%
                      </td>
                      <td className="py-2.5 text-neutral-400 italic text-[11px] font-sans">{item.memo || '—'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {activeTabPanel === 'hops' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead>
                <tr className="border-b-2 border-neutral-900 dark:border-neutral-100 text-[10px] uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                  <th className="pb-2.5 font-bold">HOP</th>
                  <th className="pb-2.5 font-bold">DIRECTION</th>
                  <th className="pb-2.5 font-bold">SOURCE</th>
                  <th className="pb-2.5 font-bold">DESTINATION</th>
                  <th className="pb-2.5 font-bold">AMOUNT</th>
                  <th className="pb-2.5 font-bold">CROSS-BANK</th>
                  <th className="pb-2.5 font-bold">CONFIDENCE</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                {(!investigation || !investigation.edges?.length) ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-neutral-400 font-mono text-xs">
                      No hop movements found in active dossier.
                    </td>
                  </tr>
                ) : (
                  investigation.edges.map((e, idx) => (
                    <tr key={idx} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/30">
                      <td className="py-2.5 font-bold text-swiss-red">HOP {e.hop_depth}</td>
                      <td className="py-2.5">
                        <span className="text-[10px] font-bold border border-neutral-300 dark:border-neutral-700 px-1.5 py-0.5">
                          {e.direction}
                        </span>
                      </td>
                      <td className="py-2.5 font-bold">{e.source_account_ref} ({e.source_bank_code})</td>
                      <td className="py-2.5 font-bold">{e.destination_account_ref} ({e.destination_bank_code})</td>
                      <td className="py-2.5 font-black text-neutral-900 dark:text-white tabular-nums">
                        ₹{(e.amount_minor / 100).toLocaleString()}
                      </td>
                      <td className="py-2.5">
                        {e.is_cross_bank ? (
                          <span className="text-[9px] font-bold uppercase tracking-wider bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900 px-1.5 py-0.5">
                            YES
                          </span>
                        ) : (
                          <span className="text-neutral-400">NO</span>
                        )}
                      </td>
                      <td className="py-2.5 text-emerald-600 dark:text-emerald-400 font-bold">
                        {Math.round(e.confidence * 100)}%
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {activeTabPanel === 'paths' && (
          <div className="space-y-3 font-mono text-xs">
            {(!investigation || !investigation.candidate_paths?.length) ? (
              <div className="py-8 text-center text-neutral-400 font-mono text-xs">
                No candidate paths reconstructed.
              </div>
            ) : (
              investigation.candidate_paths.map((p, idx) => (
                <div key={idx} className="p-4 border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/60 flex items-center space-x-3">
                  <span className="text-swiss-red font-bold uppercase text-[10px]">
                    PATH #{String(idx + 1).padStart(2, '0')}:
                  </span>
                  <span className="text-neutral-900 dark:text-neutral-100 font-bold">
                    {p.join('  ⟶  ')}
                  </span>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
};

