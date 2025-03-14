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

/** We'll store the final layout in an array of "Positioned Components." */
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

const CircuitVisualizer: React.FC<CircuitVisualizerProps> = ({ jsonPath, jsonFile }) => {
  const [circuitData, setCircuitData] = useState<CircuitData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  const svgRef = useRef<SVGSVGElement>(null);
  const svgId = useMemo(() => `circuit-svg-${Math.random().toString(36).substring(7)}`, []);
  const filePath = useMemo(() => jsonPath || jsonFile || '', [jsonPath, jsonFile]);

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
      const svgWidth = svgRef.current?.clientWidth || +svg.attr('width');
      const svgHeight = svgRef.current?.clientHeight || +svg.attr('height');
      const scale = Math.min(0.9, 0.9 / Math.max(bbox.width / svgWidth, bbox.height / svgHeight));
      const translate = [
        svgWidth / 2 - scale * (bbox.x + bbox.width / 2),
        svgHeight / 2 - scale * (bbox.y + bbox.height / 2),
      ];
      svg.call(zoomBehavior.transform as any, d3.zoomIdentity.translate(translate[0], translate[1]).scale(scale));
    }, 100);
  }, [circuitData]);

  // 3) Merge components and interconnects into one array
  const allNodes = useMemo<ComponentNode[]>(() => {
    if (!circuitData) return [];
    // For interconnects, assign pins using their datain and dataout.
    const interNodes = circuitData.interconnects.map(ic => ({
      name: ic.name,
      type: ic.type, // e.g., "interconnect"
      inputs: [{ wire: ic.datain, pinIndex: 0 }],
      outputs: [{ wire: ic.dataout, pinIndex: 0 }]
    }));
    return [...circuitData.components, ...interNodes];
  }, [circuitData]);

  // 4) Run Dagre Layout on all nodes (components and interconnects)
  const positionedComponents = useMemo<PositionedComponent[]>(() => {
    if (!circuitData) return [];
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
      return finalNodes;
    } catch (error) {
      console.error('Error in dagre layout:', error);
      return allNodes.map((node, i) => ({
        ...node,
        x: 200 + i * 200,
        y: 200,
        width: node.type.toLowerCase().includes('interconnect') ? 80 : 150,
        height: node.type.toLowerCase().includes('interconnect') ? 30 : 80
      }));
    }
  }, [circuitData, allNodes]);

  // 5) Compute pin positions for each node.
  // For nodes without defined pins (or interconnects), assign default center pin.
  const pinPositions = useMemo<Record<string, { inputs: Record<number, Position>, outputs: Record<number, Position> }>>(() => {
    const posMap: Record<string, { inputs: Record<number, Position>, outputs: Record<number, Position> }> = {};
    positionedComponents.forEach(pc => {
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
  }, [positionedComponents]);

  // 6) Manually position top-level ports (they remain outside of Dagre)
  const svgWidth = 1200;
  const lastComponentXPosition = positionedComponents.reduce((max, pc) => Math.max(max, pc.x), 0) + 200;
  const firstComponentXPosition = positionedComponents.reduce((min, pc) => Math.min(min, pc.x), 0) - 200;
  const portPositions = useMemo<Record<string, Position>>(() => {
    // If there's no circuitData yet, return an empty object
    if (!circuitData) return {};
  
    let inputCount = 0;
    let outputCount = 0;
    const pos: Record<string, Position> = {};
  
    Object.entries(circuitData.ports).forEach(([portName, direction]) => {
      const isInput = (direction === "input");
      if (isInput) {
        pos[portName] = { x: firstComponentXPosition, y: 100 + inputCount * 80 };
        inputCount++;
      } else {
        pos[portName] = { x: lastComponentXPosition, y: 100 + outputCount * 80 };
        outputCount++;
      }
    });
  
    return pos;
  }, [circuitData, svgWidth]);

  // 7) Infer port wire names based on naming conventions.
  // For input ports, look for wires that contain the port name and "_output_".
  // For output ports, look for wires that contain the port name and "_input_".
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

  // 8) Build connections from ports to internal nodes using inferred wires.
  // For each port, we search all positioned nodes for a pin whose wire exactly matches the inferred wire.
  const portConnectionsToDraw = useMemo<PortConnectionDraw[]>(() => {
    if (!circuitData) return [];
    const results: PortConnectionDraw[] = [];
    Object.entries(circuitData.ports).forEach(([portName, dir]) => {
      const portPos = portPositions[portName];
      if (!portPos) return;
      const wire = inferredPortWires[portName];
      if (!wire) return;
      positionedComponents.forEach((node) => {
        // Check node inputs
        node.inputs.forEach((pin) => {
          if (pin.wire === wire) {
            const pinPos = pinPositions[node.name]?.inputs[pin.pinIndex];
            if (pinPos) {
              // For an input port, draw a line from port -> pin.
              results.push({ portName, fromPos: portPos, toPos: pinPos, wire });
            }
          }
        });
        // Check node outputs
        node.outputs.forEach((pin) => {
          if (pin.wire === wire) {
            const pinPos = pinPositions[node.name]?.outputs[pin.pinIndex];
            if (pinPos) {
              // For an output port, draw a line from pin -> port.
              results.push({ portName, fromPos: pinPos, toPos: portPos, wire });
            }
          }
        });
      });
    });
    return results;
  }, [circuitData, portPositions, positionedComponents, pinPositions, inferredPortWires]);

  // 9) Helper to get pin positions for drawing normal internal connections.
  const getPinPos = (end: { component: string; pinIndex: number; type: string; port?: string }): Position | undefined => {
    const node = positionedComponents.find(c => c.name === end.component);
    if (!node) return undefined;
    const isOutput = (end.type.toLowerCase() === 'output' || (end.port && end.port.toLowerCase() === 'out'));
    const map = pinPositions[node.name];
    if (!map) return undefined;
    const index = end.pinIndex || 0;
    return isOutput ? map.outputs[index] : map.inputs[index];
  };

  // 10) Render everything
  if (!filePath) return <div>No circuit file path provided.</div>;
  if (loading) return <div>Loading circuit data...</div>;
  if (error) return <div>Error: {error}</div>;
  if (!circuitData) return <div>No circuit data loaded.</div>;

  return (
    <div style={{ color: '#fff'}}>
      <svg id={svgId} ref={svgRef} style={{ backgroundColor: "#313131", backgroundImage: "radial-gradient(rgba(255, 255 255, 0.171) 2px, transparent 0)", backgroundSize: "30px 30px", backgroundPosition: "-5px -5px", width: '100%', height: '100vh' }}>
        <defs>
          <marker id="arrowhead" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#fff" />
          </marker>
        </defs>
        <g className="main-content">
          {/* Render all nodes (components and interconnects) */}
          {positionedComponents.map((node) => {
            // For interconnects, use a different style
            if (node.type.toLowerCase().includes('interconnect')) {
              return (
                <g key={`node-${node.name}`}>
                  <rect x={node.x - node.width / 2} y={node.y - node.height / 2}
                        width={node.width} height={node.height}
                        fill="#ffffcc" stroke="#999" strokeDasharray="4" />
                  <text x={node.x} y={node.y} textAnchor="middle" alignmentBaseline="middle" fontSize={10} fill="#000">
                    {node.name.split(/[/\\]/).pop()}
                  </text>
                </g>
              );
            }
            // Otherwise, render as a regular component.
            let fill = '#444', stroke = '#ccc', textFill = '#fff';
            const t = node.type.toUpperCase();
            if (t.includes('INPUT')) { fill = '#a8d5ff'; stroke = '#4285F4'; textFill = '#000'; }
            else if (t.includes('OUTPUT')) { fill = '#ffb3b3'; stroke = '#EA4335'; textFill = '#000'; }
            else if (t.includes('DFF') || t.includes('FLIP')) { fill = '#c5e1a5'; stroke = '#34A853'; textFill = '#000'; }
            else if (t.includes('LUT')) { fill = '#fff176'; stroke = '#FBBC05'; textFill = '#000'; }
            return (
              <g key={`node-${node.name}`}>
                <rect x={node.x - node.width / 2} y={node.y - node.height / 2}
                      width={node.width} height={node.height}
                      fill={fill} stroke={stroke} strokeWidth={2} rx={8} ry={8} />
                <text x={node.x} y={node.y} textAnchor="middle" alignmentBaseline="middle"
                      fontSize={12} fill={textFill} fontWeight="bold">
                  {node.name}
                </text>
                <text x={node.x} y={node.y + 14} textAnchor="middle" alignmentBaseline="middle"
                      fontSize={9} fill={textFill}>
                  {node.type}
                </text>
                {/* Render pins for non-interconnect nodes */}
                {node.inputs.sort((a, b) => a.pinIndex - b.pinIndex).map(pin => {
                  const pos = pinPositions[node.name]?.inputs[pin.pinIndex];
                  if (!pos) return null;
                  return (
                    <g key={`pin-in-${node.name}-${pin.pinIndex}`}>
                      <circle cx={pos.x} cy={pos.y} r={4} fill="blue" />
                      <text x={pos.x - 6} y={pos.y + 3} fontSize={8} fill="#fff" textAnchor="end">
                        {pin.wire.replace(/.*[\\/]/,'').substring(0,10)}
                        {pin.constant && (pin.value === 1 ? ' (1)' : ' (0)')}
                      </text>
                    </g>
                  );
                })}
                {node.outputs.sort((a, b) => a.pinIndex - b.pinIndex).map(pin => {
                  const pos = pinPositions[node.name]?.outputs[pin.pinIndex];
                  if (!pos) return null;
                  return (
                    <g key={`pin-out-${node.name}-${pin.pinIndex}`}>
                      <circle cx={pos.x} cy={pos.y} r={4} fill="green" />
                      <text x={pos.x + 6} y={pos.y + 3} fontSize={8} fill="#fff" textAnchor="start">
                        {pin.wire.replace(/.*[\\/]/,'').substring(0,10)}
                      </text>
                    </g>
                  );
                })}
              </g>
            );
          })}

          {/* Render connections between internal nodes */}
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

          {/* Render top-level ports */}
          {Object.entries(circuitData.ports).map(([portName, dir]) => {
            const pos = portPositions[portName];
            if (!pos) return null;
            const isInput = (dir === 'input');
            const fill = isInput ? '#a8d5ff' : '#ffb3b3';
            const stroke = isInput ? '#4285F4' : '#EA4335';
            return (
              <g key={`port-${portName}`}>
                <rect x={pos.x - 40} y={pos.y - 15} width={80} height={30}
                      fill={fill} stroke={stroke} strokeWidth={2} rx={6} ry={6} />
                <text x={pos.x} y={pos.y + 2} textAnchor="middle" alignmentBaseline="middle"
                      fontSize={10} fill="#000" fontWeight="bold">
                  {portName}
                </text>
              </g>
            );
          })}

          {/* Render connections from ports to internal nodes */}
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
        </g>
      </svg>
    </div>
  );
};

export default CircuitVisualizer;