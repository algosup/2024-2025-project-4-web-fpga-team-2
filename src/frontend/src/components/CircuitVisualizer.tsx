import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import * as dagreLib from 'dagre';

const dagre = dagreLib;

interface ComponentPin {
  wire: string;
  pinIndex: number;
  port?: string;
  constant?: boolean;
  value?: 0 | 1;
}

interface ComponentNode {
  name: string;
  type: string;
  inputs: ComponentPin[];
  outputs: ComponentPin[];
}

interface Interconnect {
  name: string;
  type: string;
  datain: string;
  dataout: string;
}

interface Connection {
  from: {
    component: string;
    type: string;
    port?: string;
    pinIndex: number;
  };
  to: {
    component: string;
    type: string;
    port?: string;
    pinIndex: number;
  };
  wire: string;
}

interface PortMap {
  [key: string]: string; // e.g. { "\\D": "input", "\\clk": "input", "\\Q": "output" }
}

interface CircuitData {
  module: string;
  ports: PortMap;
  wires: string[];
  components: ComponentNode[];
  interconnects: Interconnect[];
  connections: Connection[];
  summary?: any;
  timing?: any;
}

interface CircuitVisualizerProps {
  jsonPath?: string;
  jsonFile?: string;
}

/** Node info stored by Dagre after layout. */
interface DagreNode {
  comp: ComponentNode;
  width: number;
  height: number;
  x: number;
  y: number;
}

/** Positioned component includes position and size. */
interface PositionedComponent extends ComponentNode {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** For storing pin positions. */
interface Position {
  x: number;
  y: number;
}

/** For drawing lines from ports to pins */
interface PortConnectionDraw {
  portName: string;
  fromPos: Position;
  toPos: Position;
  wire: string;
}

interface TimingDelay {
  instance?: string;
  cellType: string;
  inputPort?: string;
  outputPort?: string;
  delay?: number;
  max_delay?: number;
  min_delay?: number;
}

const CircuitVisualizer: React.FC<CircuitVisualizerProps> = ({ jsonPath, jsonFile }) => {
  const [circuitData, setCircuitData] = useState<CircuitData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  // State for node positions (updated by layout and drag)
  const [nodePositions, setNodePositions] = useState<PositionedComponent[]>([]);
  // State for custom port positions (can be preset or updated via dragging)
  const [customPortPositions, setCustomPortPositions] = useState<Record<string, Position>>({
    "\\clk": { x: 100, y: 100 },
    "\\async_reset": { x: 100, y: 200 },
    "\\D": { x: 100, y: 300 },
    "\\Q": { x: 100, y: 400 }
  });
  // State for hovered node (for tooltip)
  const [hoveredNode, setHoveredNode] = useState<PositionedComponent | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const svgId = useMemo(() => `circuit-svg-${Math.random().toString(36).substring(7)}`, []);
  const filePath = useMemo(() => jsonPath || jsonFile || '', [jsonPath, jsonFile]);
  const [showTimingInfo, setShowTimingInfo] = useState<boolean>(false);
  const [timingDetails, setTimingDetails] = useState<TimingDelay[] | null>(null);
  const svgWidth = 1200;
  const svgHeight = 800;

  // 1) Load JSON data
  useEffect(() => {
    setError(null);
    if (!filePath) {
      setCircuitData(null);
      return;
    }
    setLoading(true);
    const fullPath = (() => {
      if (filePath.startsWith('http')) return filePath;
      if (typeof window !== 'undefined') {
        const isDev =
          process.env.NODE_ENV === 'development' ||
          window.location.hostname === 'localhost' ||
          window.location.hostname === '127.0.0.1';
        const filename = filePath.split('/').pop();
        const cleanPath = filePath.includes('/uploads/') ? filePath : `/uploads/${filename}`;
        return isDev ? `http://localhost:5001${cleanPath}` : cleanPath;
      }
      return filePath;
    })();
    fetch(fullPath, { headers: { Accept: 'application/json' }, mode: 'cors' })
      .then(response => {
        if (!response.ok) throw new Error(`HTTP error ${response.status}: ${response.statusText}`);
        return response.text();
      })
      .then(text => {
        try {
          const parsed = JSON.parse(text);
          if (!parsed || typeof parsed !== 'object') throw new Error('Invalid JSON structure');
          return parsed;
        } catch (err) {
          console.error('JSON Parse Error:', err);
          throw new Error('Invalid JSON format');
        }
      })
      .then((data: CircuitData) => {
        data.interconnects = data.interconnects || [];
        data.wires = data.wires || [];
        data.ports = data.ports || {};
        data.components = data.components || [];
        data.connections = data.connections || [];
        setCircuitData(data);
      })
      .catch(err => {
        console.error('Error loading circuit:', err);
        setError(err.message || 'Failed to load circuit data');
      })
      .finally(() => setLoading(false));
  }, [filePath]);

  // 2) D3 Zoom & Pan
  useEffect(() => {
    if (!circuitData || !svgRef.current) return;
    const svg = d3.select(svgRef.current);
    const g = svg.select<SVGGElement>('g.main-content');
    const zoomBehavior = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 10])
      .on('zoom', event => {
        g.attr('transform', event.transform);
      });
    svg.call(zoomBehavior as any);
    setTimeout(() => {
      const bbox = g.node()?.getBBox();
      if (!bbox) return;
      const svgW = svgRef.current?.clientWidth || +svg.attr('width');
      const svgH = svgRef.current?.clientHeight || +svg.attr('height');
      const scale = Math.min(0.9, 0.9 / Math.max(bbox.width / svgW, bbox.height / svgH));
      const translate = [
        svgW / 2 - scale * (bbox.x + bbox.width / 2),
        svgH / 2 - scale * (bbox.y + bbox.height / 2),
      ];
      svg.call(zoomBehavior.transform as any, d3.zoomIdentity.translate(translate[0], translate[1]).scale(scale));
    }, 100);
  }, [circuitData]);

  // 3) Merge components and interconnects into one array
  const allNodes = useMemo<ComponentNode[]>(() => {
    if (!circuitData) return [];
    const interNodes = circuitData.interconnects.map(ic => ({
      name: ic.name,
      type: ic.type,
      inputs: [{ wire: ic.datain, pinIndex: 0 }],
      outputs: [{ wire: ic.dataout, pinIndex: 0 }]
    }));
    return [...circuitData.components, ...interNodes];
  }, [circuitData]);

  // 4) Run Dagre Layout on all nodes and update nodePositions state.
  useEffect(() => {
    if (!circuitData) return;
    try {
      const g = new dagre.graphlib.Graph();
      g.setGraph({
        rankdir: 'LR',
        ranksep: 50,
        nodesep: 50,
        edgesep: 25,
        marginx: 25,
        marginy: 25,
        acyclicer: 'greedy',
        ranker: 'longest-path'
      });
      g.setDefaultEdgeLabel(() => ({}));
      allNodes.forEach(node => {
        let width = 75;
        let height = 40;
        if (node.type.toLowerCase().includes('interconnect')) {
          width = 40;
          height = 40;
        } else {
          const numPins = Math.max(node.inputs.length, node.outputs.length);
          height = Math.max(60, numPins * 18);
        }
        g.setNode(node.name, {
          comp: node,
          width,
          height,
          label: node.name,
        });
      });
      const nodeNames = new Set(allNodes.map(n => n.name));
      circuitData.connections.forEach(conn => {
        const fromComp = conn.from.component;
        const toComp = conn.to.component;
        if (nodeNames.has(fromComp) && nodeNames.has(toComp)) {
          g.setEdge(fromComp, toComp, { weight: 1, minlen: 3 });
        }
      });
      dagre.layout(g);
      const finalNodes: PositionedComponent[] = [];
      g.nodes().forEach(nodeId => {
        const nodeData = g.node(nodeId);
        if (nodeData && 'comp' in nodeData) {
          finalNodes.push({
            ...(nodeData.comp as ComponentNode),
            x: nodeData.x,
            y: nodeData.y,
            width: nodeData.width,
            height: nodeData.height,
          });
        }
      });
      setNodePositions(finalNodes);
    } catch (error) {
      console.error('Error in dagre layout:', error);
      setNodePositions(allNodes.map((node, i) => ({
        ...node,
        x: 200 + i * 200,
        y: 200,
        width: node.type.toLowerCase().includes('interconnect') ? 80 : 150,
        height: node.type.toLowerCase().includes('interconnect') ? 30 : 80
      })));
    }
  }, [circuitData, allNodes]);

  // 5) Compute pin positions based on nodePositions.
  const pinPositions = useMemo<Record<string, { inputs: Record<number, Position>, outputs: Record<number, Position> }>>(() => {
    const posMap: Record<string, { inputs: Record<number, Position>, outputs: Record<number, Position> }> = {};
    nodePositions.forEach(pc => {
      if (pc.inputs.length === 0 && pc.outputs.length === 0) {
        posMap[pc.name] = {
          inputs: { 0: { x: pc.x, y: pc.y } },
          outputs: { 0: { x: pc.x, y: pc.y } }
        };
      } else {
        const compInputs = [...(pc.inputs || [])].sort((a, b) => a.pinIndex - b.pinIndex);
        const compOutputs = [...(pc.outputs || [])].sort((a, b) => a.pinIndex - b.pinIndex);
        const inMap: Record<number, Position> = {};
        compInputs.forEach((pin, i) => {
          const yStep = pc.height / (compInputs.length + 1);
          const pinY = pc.y - pc.height / 2 + (i + 1) * yStep;
          inMap[pin.pinIndex] = { x: pc.x - pc.width / 2, y: pinY };
        });
        const outMap: Record<number, Position> = {};
        compOutputs.forEach((pin, i) => {
          const yStep = pc.height / (compOutputs.length + 1);
          const pinY = pc.y - pc.height / 2 + (i + 1) * yStep;
          outMap[pin.pinIndex] = { x: pc.x + pc.width / 2, y: pinY };
        });
        posMap[pc.name] = { inputs: inMap, outputs: outMap };
      }
    });
    return posMap;
  }, [nodePositions]);

  // 6) Calculate default port positions.
  const defaultPortPositions = useMemo<Record<string, Position>>(() => {
    if (!circuitData) return {};
    let inputCount = 0;
    let outputCount = 0;
    const pos: Record<string, Position> = {};
    Object.entries(circuitData.ports).forEach(([portName, direction]) => {
      const isInput = (direction === "input");
      if (isInput) {
        pos[portName] = { x: 50, y: 100 + inputCount * 80 };
        inputCount++;
      } else {
        pos[portName] = { x: svgWidth - 50, y: 100 + outputCount * 80 };
        outputCount++;
      }
    });
    return pos;
  }, [circuitData, svgWidth]);

  // Use custom port positions if defined; otherwise, fallback to defaults.
  const portPositions = useMemo<Record<string, Position>>(() => {
    if (!circuitData) return {};
    const merged: Record<string, Position> = {};
    Object.entries(circuitData.ports).forEach(([portName]) => {
      merged[portName] = customPortPositions[portName] || defaultPortPositions[portName];
    });
    return merged;
  }, [circuitData, customPortPositions, defaultPortPositions]);

  // 7) Infer port wire names based on naming conventions.
  const inferredPortWires = useMemo<Record<string, string>>(() => {
    if (!circuitData) return {};
    const map: Record<string, string> = {};
    Object.entries(circuitData.ports).forEach(([portName, dir]) => {
      let candidate = "";
      if (dir === "input") {
        candidate = circuitData.wires.find(w => w.indexOf(portName) !== -1 && w.includes("_output_")) || portName;
      } else {
        candidate = circuitData.wires.find(w => w.indexOf(portName) !== -1 && w.includes("_input_")) || portName;
      }
      map[portName] = candidate;
    });
    return map;
  }, [circuitData]);

  // First, update the getTimingForComponent function to better extract timing data
  const getTimingForComponent = (componentName: string): TimingDelay[] => {
    if (!circuitData?.timing?.delays) return [];

    // Debug to console to see what's in the timing data
    console.log("Timing data structure:", circuitData.timing);

    // Filter delays related to this component
    return circuitData.timing.delays.filter((delay: any) =>
      delay.instance && delay.instance.includes(componentName.replace(/\\/g, "\\\\"))
    );
  };

  // Add this function to get color based on delay value
  const getDelayColor = (delays: any[]): string => {
    if (!delays || delays.length === 0) return "#444"; // Default color

    // In a real implementation, you might normalize this based on max delay
    const delayCount = delays.length;
    if (delayCount > 5) return "#e74c3c"; // Red for high delay
    if (delayCount > 3) return "#f39c12"; // Orange for medium delay
    return "#2ecc71"; // Green for low delay
  };

  // 8) Build connections from ports to nodes.
  const portConnectionsToDraw = useMemo<PortConnectionDraw[]>(() => {
    if (!circuitData) return [];
    const results: PortConnectionDraw[] = [];
    Object.entries(circuitData.ports).forEach(([portName, dir]) => {
      const portPos = portPositions[portName];
      if (!portPos) return;
      const wire = inferredPortWires[portName];
      if (!wire) return;
      nodePositions.forEach((node) => {
        node.inputs.forEach((pin) => {
          if (pin.wire === wire) {
            const pinPos = pinPositions[node.name]?.inputs[pin.pinIndex];
            if (pinPos) {
              results.push({ portName, fromPos: portPos, toPos: pinPos, wire });
            }
          }
        });
        node.outputs.forEach((pin) => {
          if (pin.wire === wire) {
            const pinPos = pinPositions[node.name]?.outputs[pin.pinIndex];
            if (pinPos) {
              results.push({ portName, fromPos: pinPos, toPos: portPos, wire });
            }
          }
        });
      });
    });

    // Add this function to extract timing data for a component

    return results;
  }, [circuitData, portPositions, nodePositions, pinPositions, inferredPortWires]);

  // 9) Helper to get pin positions for internal connections.
  const getPinPos = (end: { component: string; pinIndex: number; type: string; port?: string }): Position | undefined => {
    const node = nodePositions.find(c => c.name === end.component);
    if (!node) return undefined;
    const isOutput = (end.type.toLowerCase() === 'output' || (end.port && end.port.toLowerCase() === 'out'));
    const map = pinPositions[node.name];
    if (!map) return undefined;
    const index = end.pinIndex || 0;
    return isOutput ? map.outputs[index] : map.inputs[index];
  };

  // 10) Attach drag behavior to nodes.
  useEffect(() => {
    d3.selectAll<SVGGElement, unknown>('.draggable')
      .call(
        d3.drag<SVGGElement, unknown>()
          .on('start', function (event) {
            d3.select(this).raise();
          })
          .on('drag', function (event) {
            const nodeId = d3.select(this).attr('data-node-id');
            d3.select(this).attr('transform', `translate(${event.x},${event.y})`);
            setNodePositions(prev =>
              prev.map(node =>
                node.name === nodeId ? { ...node, x: event.x, y: event.y } : node
              )
            );
            // If the dragged node is currently hovered, update its position in hoveredNode as well
            setHoveredNode(prev => (prev && prev.name === nodeId ? { ...prev, x: event.x, y: event.y } : prev));
          })
      );
  }, [nodePositions]);

  // 11) Attach drag behavior to ports so that they are movable.
  useEffect(() => {
    d3.selectAll<SVGGElement, unknown>('.draggable-port')
      .call(
        d3.drag<SVGGElement, unknown>()
          .on('start', function (event) {
            d3.select(this).raise();
          })
          .on('drag', function (event) {
            const portName = d3.select(this).attr('data-port-name');
            d3.select(this).attr('transform', `translate(${event.x},${event.y})`);
            setCustomPortPositions(prev => ({
              ...prev,
              [portName]: { x: event.x, y: event.y }
            }));
          })
      );
  }, [portPositions]);

  // 12) Render everything.
  if (!filePath) return <div>No circuit file path provided.</div>;
  if (loading) return <div>Loading circuit data...</div>;
  if (error) return <div>Error: {error}</div>;
  if (!circuitData) return <div>No circuit data loaded.</div>;

  return (

    <div style={{ color: '#fff' }}>
      {/* Timing toggle button */}
      <button
        onClick={() => setShowTimingInfo(!showTimingInfo)}
        style={{
          position: 'absolute',
          top: '10px',
          right: '10px',
          zIndex: 100,
          padding: '8px 12px',
          backgroundColor: showTimingInfo ? '#e74c3c' : '#3498db',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer'
        }}
      >
        {showTimingInfo ? 'Hide Timing' : 'Show Timing'}
      </button>

      <svg id={svgId} ref={svgRef} style={{ backgroundColor: "#313131", width: '100%', height: '100vh' }}>
        <defs>
          <marker id="arrowhead" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#fff" />
          </marker>
        </defs>
        <g className="main-content">
          {/* Render all nodes (components and interconnects) */}
          {nodePositions.map((node) => {
            // Set up hover handlers for the tooltip
            const handleMouseEnter = () => {
              setHoveredNode(node);
              // If timing display is on, fetch timing data for this node
              if (showTimingInfo) {
                setTimingDetails(getTimingForComponent(node.name));
              }
            };
            const handleMouseLeave = () => {
              setHoveredNode(null);
              setTimingDetails(null);
            };

            if (node.type.toLowerCase().includes('interconnect')) {
              // Interconnect node rendering with timing colors
              const fill = showTimingInfo ?
                getDelayColor(getTimingForComponent(node.name)) : "#ffffcc";

              return (
                <g
                  key={`node-${node.name}`}
                  className="draggable"
                  data-node-id={node.name}
                  transform={`translate(${node.x},${node.y})`}
                  onMouseEnter={handleMouseEnter}
                  onMouseLeave={handleMouseLeave}
                >
                  <rect x={-node.width / 2} y={-node.height / 2} width={node.width} height={node.height}
                    fill={fill} stroke="#999" strokeDasharray="4" />
                  <text x={0} y={0} textAnchor="middle" alignmentBaseline="middle" fontSize={10} fill="#000">
                    {node.type}
                  </text>
                </g>
              );
            }

            // For regular nodes, calculate fill based on timing if enabled
            let fill = '#444', stroke = '#ccc', textFill = '#fff';
            const t = node.type.toUpperCase();

            if (showTimingInfo) {
              // Use timing data to determine color
              fill = getDelayColor(getTimingForComponent(node.name));
              stroke = fill !== "#444" ? fill.replace(')', ', 0.8)').replace('rgb', 'rgba') : '#ccc';
            } else {
              // Original color logic
              if (t.includes('INPUT')) { fill = '#a8d5ff'; stroke = '#4285F4'; textFill = '#000'; }
              else if (t.includes('OUTPUT')) { fill = '#ffb3b3'; stroke = '#EA4335'; textFill = '#000'; }
              else if (t.includes('DFF') || t.includes('FLIP')) { fill = '#c5e1a5'; stroke = '#34A853'; textFill = '#000'; }
              else if (t.includes('LUT')) { fill = '#fff176'; stroke = '#FBBC05'; textFill = '#000'; }
            }

            // Rest of the node rendering remains the same
            return (
              <g
                key={`node-${node.name}`}
                className="draggable"
                data-node-id={node.name}
                transform={`translate(${node.x},${node.y})`}
                onMouseEnter={handleMouseEnter}
                onMouseLeave={handleMouseLeave}
              >
                <rect x={-node.width / 2} y={-node.height / 2} width={node.width} height={node.height}
                  fill={fill} stroke={stroke} strokeWidth={2} rx={8} ry={8} />
                <text x={0} y={0} textAnchor="middle" alignmentBaseline="middle"
                  fontSize={12} fill={textFill} fontWeight="bold">
                  {node.type}
                </text>
                {/* Optionally remove the second text element if it's not needed */}
                {/* Render pins as before */}
                {node.inputs.sort((a, b) => a.pinIndex - b.pinIndex).map(pin => {
                  const pos = pinPositions[node.name]?.inputs[pin.pinIndex];
                  if (!pos) return null;
                  return (
                    <g key={`pin-in-${node.name}-${pin.pinIndex}`}>
                      <circle cx={-node.width / 2} cy={pos.y - node.y} r={4} fill="blue" />
                      <text x={-node.width / 2 - 6} y={pos.y - node.y + 3} fontSize={8} fill="#fff" textAnchor="end">
                        {pin.wire.replace(/.*[\\/]/, '').substring(0, 10)}
                      </text>
                    </g>
                  );
                })}
                {node.outputs.sort((a, b) => a.pinIndex - b.pinIndex).map(pin => {
                  const pos = pinPositions[node.name]?.outputs[pin.pinIndex];
                  if (!pos) return null;
                  return (
                    <g key={`pin-out-${node.name}-${pin.pinIndex}`}>
                      <circle cx={node.width / 2} cy={pos.y - node.y} r={4} fill="green" />
                      <text x={node.width / 2 + 6} y={pos.y - node.y + 3} fontSize={8} fill="#fff" textAnchor="start">
                        {pin.wire.replace(/.*[\\/]/, '').substring(0, 10)}
                      </text>
                    </g>
                  );
                })}
              </g>
            );
          })}


          {/* Render internal connections */}
          {circuitData.connections.map((conn, i) => {
            const fromPos = getPinPos(conn.from);
            const toPos = getPinPos(conn.to);
            if (!fromPos || !toPos) return null;
            const dx = toPos.x - fromPos.x;
            const controlOffset = Math.min(50, Math.abs(dx) / 2);
            const path = `M${fromPos.x},${fromPos.y} 
                          C${fromPos.x + controlOffset},${fromPos.y} 
                            ${toPos.x - controlOffset},${toPos.y} 
                            ${toPos.x},${toPos.y}`;
            return (
              <path key={`conn-${i}`} d={path} fill="none" stroke="#fff" strokeWidth={1.5} markerEnd="url(#arrowhead)" />
            );
          })}

          {/* Render ports */}
          {Object.entries(circuitData.ports).map(([portName, dir]) => {
            // Filtering standard ports if desired.
            const standardPorts = ["\\D", "\\clk", "\\Q", "\\async_reset"];
            if (!standardPorts.includes(portName)) return null;
            const pos = portPositions[portName];
            if (!pos) return null;
            const isInput = (dir === 'input');
            const fill = isInput ? '#a8d5ff' : '#ffb3b3';
            const stroke = isInput ? '#4285F4' : '#EA4335';
            return (
              <g key={`port-${portName}`} className="draggable-port" data-port-name={portName} transform={`translate(${pos.x},${pos.y})`}>
                <rect x={-40} y={-15} width={80} height={30}
                  fill={fill} stroke={stroke} strokeWidth={2} rx={6} ry={6} />
                <text x={0} y={2} textAnchor="middle" alignmentBaseline="middle"
                  fontSize={10} fill="#000" fontWeight="bold">
                  {portName}
                </text>
              </g>
            );
          })}

          {/* Render connections from ports to nodes */}
          {portConnectionsToDraw.map((pcd, i) => {
            const dx = pcd.toPos.x - pcd.fromPos.x;
            const controlOffset = Math.min(100, Math.abs(dx) / 2);
            const path = `M${pcd.fromPos.x},${pcd.fromPos.y}
                          C${pcd.fromPos.x + controlOffset},${pcd.fromPos.y}
                            ${pcd.toPos.x - controlOffset},${pcd.toPos.y}
                            ${pcd.toPos.x},${pcd.toPos.y}`;
            return (
              <path key={`portline-${i}`} d={path} fill="none" stroke="#fff" strokeWidth={1.5} markerEnd="url(#arrowhead)" />
            );
          })}

          {/* Render tooltip if a node is hovered */}
          {hoveredNode && (() => {
            const inputLines = hoveredNode.inputs.length;
            const outputLines = hoveredNode.outputs.length;

            // Calculate tooltip height dynamically
            let tooltipHeight = 40 + 16 * (inputLines + outputLines + 2);
            let tooltipContentLines = [
              hoveredNode.name,
              "Inputs:",
              ...hoveredNode.inputs.map(pin => pin.wire),
              "Outputs:",
              ...hoveredNode.outputs.map(pin => pin.wire)
            ];

            // Add timing information if enabled and available
            if (showTimingInfo && timingDetails && timingDetails.length > 0) {
              tooltipContentLines = [
                hoveredNode.name,
                `Timing Details (${timingDetails.length} delays):`,
                ...timingDetails.slice(0, 5).map((delay: any, i) => {
                  // Extract delay value, checking multiple possible properties
                  const delayValue =
                    delay.delay_ps !== undefined ? delay.delay_ps :
                      delay.delay !== undefined ? delay.delay :
                        delay.delay !== undefined ? delay.delay :
                          delay.value !== undefined ? delay.value :
                            delay.time !== undefined ? delay.time :
                              delay.max_delay !== undefined ? delay.max_delay :
                                null;
                  // Convert picoseconds to nanoseconds if needed
                  const displayValue = delayValue !== null ?
                    `(${(delayValue / 1000).toFixed(2)}ns)` : '';
                  // After setting timing details
                  console.log("Raw timing data for component:", JSON.stringify(timingDetails, null, 2));
                  // Format the timing line with port info and delay if available
                  return `${i + 1}. ${delay.cellType || delay.type || 'Cell'}: ` +
                    `${delay.inputPort || delay.from || ''} → ${delay.outputPort || delay.to || ''}` +
                    (delayValue !== null ? ` (${delayValue}ns)` : '');
                })
              ];

              // Show a message if there are more delays
              if (timingDetails.length > 5) {
                tooltipContentLines.push(`...and ${timingDetails.length - 5} more`);
              }

              // Adjust tooltip height based on content
              tooltipHeight = 40 + (tooltipContentLines.length * 16);
            }

            // Set minimum sizes with padding
            const tooltipWidth = 250;

            return (
              <g
                className="tooltip"
                transform={`translate(${hoveredNode.x + hoveredNode.width / 2 + 10}, ${hoveredNode.y - 20})`}
              >
                <rect x={0} y={0} width={tooltipWidth} height={tooltipHeight}
                  fill="#fff" stroke="#000" rx={5} ry={5} opacity={0.9} />

                {tooltipContentLines.map((line, i) => (
                  <text
                    key={`tooltip-line-${i}`}
                    x={10}
                    y={16 + i * 16}
                    fontSize={i === 0 ? "12" : "10"}
                    fill="#000"
                    fontWeight={i === 0 || line.includes("Inputs:") || line.includes("Outputs:") || line.includes("Timing") ? "bold" : "normal"}
                  >
                    {line}
                  </text>
                ))}
              </g>
            );
          })()}
        </g>
      </svg>
    </div>
  );
};

export default CircuitVisualizer;