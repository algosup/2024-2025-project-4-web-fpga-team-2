import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
// Fix dagre import - this is likely the main issue
import dagre from 'dagre';

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

interface Interconnect {
  name: string;
  type: string;
  datain: string;
  dataout: string;
}

interface PortMap {
  [key: string]: string;
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
  comp: ComponentNode;    // the actual component
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

const CircuitVisualizer: React.FC<CircuitVisualizerProps> = ({ jsonPath, jsonFile }) => {
  const [circuitData, setCircuitData] = useState<CircuitData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  const svgRef = useRef<SVGSVGElement>(null);
  const svgId = useMemo(() => `circuit-svg-${Math.random().toString(36).substring(7)}`, []);
  const filePath = useMemo(() => jsonPath || jsonFile || '', [jsonPath, jsonFile]);

  // Fetch the JSON data
  useEffect(() => {
    setError(null);
    if (!filePath) {
      setCircuitData(null);
      return;
    }
    setLoading(true);

    const fullPath = (() => {
      if (filePath.startsWith('http')) return filePath;
      // Check if we're in a browser environment
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
      .then((response) => {
        if (!response.ok) {
          throw new Error(`HTTP error ${response.status}: ${response.statusText}`);
        }
        return response.text();
      })
      .then((text) => {
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
        // Ensure all required arrays and objects exist
        data.interconnects = data.interconnects || [];
        data.wires = data.wires || [];
        data.ports = data.ports || {};
        data.components = data.components || [];
        data.connections = data.connections || [];
        setCircuitData(data);
      })
      .catch((err) => {
        console.error('Error loading circuit:', err);
        setError(err.message || 'Failed to load circuit data');
      })
      .finally(() => setLoading(false));
  }, [filePath]);

  // D3 zoom & auto-fit
  useEffect(() => {
    if (!circuitData || !svgRef.current) return;
    
    const svg = d3.select(svgRef.current);
    const g = svg.select<SVGGElement>('g.main-content');
    
    // Fix the zoom behavior implementation
    const zoomBehavior = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 10])
      .on('zoom', (event) => {
        g.attr('transform', event.transform);
      });
    
    // Apply zoom to SVG element - fixed type casting
    svg.call(zoomBehavior);
    
    // Auto-center and fit to view
    setTimeout(() => {
      const bbox = g.node()?.getBBox();
      if (!bbox) return;
      
      // Get actual SVG dimensions
      const svgWidth = svgRef.current?.clientWidth || +svg.attr('width');
      const svgHeight = svgRef.current?.clientHeight || +svg.attr('height');
      
      // Calculate appropriate scale
      const scale = 0.9 / Math.max(bbox.width / svgWidth, bbox.height / svgHeight);
      
      // Calculate translation to center
      const translate = [
        svgWidth / 2 - scale * (bbox.x + bbox.width / 2),
        svgHeight / 2 - scale * (bbox.y + bbox.height / 2),
      ];
      
      // Apply transform
      svg.call(
        zoomBehavior.transform,
        d3.zoomIdentity.translate(translate[0], translate[1]).scale(scale)
      );
    }, 100); // Increased timeout for better browser rendering cycles
  }, [circuitData]);

  // Layout computation with dagre
  const positionedComponents = useMemo<PositionedComponent[]>(() => {
    if (!circuitData) return [];

    try {
      // Create a new dagre graph
      const g = new dagre.graphlib.Graph();
      
      // Set graph properties
      g.setGraph({
        rankdir: 'LR',   // left-to-right dataflow
        ranksep: 150,    // vertical separation
        nodesep: 100,    // horizontal separation
        edgesep: 50,     // separation between edges
        marginx: 20,
        marginy: 20
      });
      
      // Set default edge label
      g.setDefaultEdgeLabel(() => ({}));

      // Add each component as a node
      circuitData.components.forEach((comp) => {
        // Size depends on number of pins
        const numPins = Math.max(comp.inputs.length, comp.outputs.length);
        const height = Math.max(60, numPins * 20);
        g.setNode(comp.name, { 
          comp, 
          width: 120, 
          height: height,
          label: comp.name // Label is required by dagre
        });
      });

      // Add edges from connections
      const compNames = new Set(circuitData.components.map(c => c.name));
      
      circuitData.connections.forEach(conn => {
        if (compNames.has(conn.from.component) && compNames.has(conn.to.component)) {
          g.setEdge(conn.from.component, conn.to.component);
        }
      });

      // Run the layout
      dagre.layout(g);

      // Extract positioned components
      const finalComps: PositionedComponent[] = [];
      g.nodes().forEach(nodeId => {
        const nodeData = g.node(nodeId);
        if (nodeData && 'comp' in nodeData) {
          finalComps.push({
            ...(nodeData.comp as ComponentNode),
            x: nodeData.x,
            y: nodeData.y,
            width: nodeData.width,
            height: nodeData.height,
          });
        }
      });
      
      return finalComps;
    } catch (error) {
      console.error("Error in dagre layout:", error);
      // Fallback to a simple layout if dagre fails
      return circuitData.components.map((comp, i) => ({
        ...comp,
        x: 200 + (i % 5) * 200,
        y: 100 + Math.floor(i / 5) * 150,
        width: 120,
        height: 60
      }));
    }
  }, [circuitData]);

  // Pin positions calculation
  const pinPositions = useMemo<Record<string, { inputs: Record<number, Position>, outputs: Record<number, Position> }>>(() => {
    const posMap: Record<string, { inputs: Record<number, Position>, outputs: Record<number, Position> }> = {};
    
    positionedComponents.forEach(pc => {
      // Sort inputs & outputs by pin index
      const compInputs = [...pc.inputs].sort((a, b) => a.pinIndex - b.pinIndex);
      const compOutputs = [...pc.outputs].sort((a, b) => a.pinIndex - b.pinIndex);

      // Calculate input pin positions
      const inMap: Record<number, Position> = {};
      compInputs.forEach((pin, i) => {
        const yStep = pc.height / (compInputs.length + 1);
        const pinY = pc.y - pc.height / 2 + (i + 1) * yStep;
        inMap[pin.pinIndex] = { x: pc.x - pc.width / 2, y: pinY };
      });

      // Calculate output pin positions
      const outMap: Record<number, Position> = {};
      compOutputs.forEach((pin, i) => {
        const yStep = pc.height / (compOutputs.length + 1);
        const pinY = pc.y - pc.height / 2 + (i + 1) * yStep;
        outMap[pin.pinIndex] = { x: pc.x + pc.width / 2, y: pinY };
      });

      posMap[pc.name] = { inputs: inMap, outputs: outMap };
    });
    
    return posMap;
  }, [positionedComponents]);

  // Interconnect positions calculation
  const interPos = useMemo<Record<string, { x: number, y: number }>>(() => {
    if (!circuitData) return {};
    
    const result: Record<string, { x: number, y: number }> = {};
    
    circuitData.interconnects.forEach(ic => {
      let srcPos: Position | undefined;
      let tgtPos: Position | undefined;
      
      // Find source and target positions
      positionedComponents.forEach(pc => {
        pc.outputs.forEach(op => {
          if (op.wire === ic.datain) {
            srcPos = pinPositions[pc.name]?.outputs[op.pinIndex];
          }
        });
        
        pc.inputs.forEach(inp => {
          if (inp.wire === ic.dataout) {
            tgtPos = pinPositions[pc.name]?.inputs[inp.pinIndex];
          }
        });
      });

      // Default positions if not found
      if (!srcPos && !tgtPos) {
        // Position it somewhere in the middle as fallback
        result[ic.name] = { x: 400, y: 300 };
      } else if (!srcPos) {
        result[ic.name] = { x: (tgtPos!.x - 100), y: tgtPos!.y };
      } else if (!tgtPos) {
        result[ic.name] = { x: (srcPos.x + 100), y: srcPos.y };
      } else {
        // Average the positions
        result[ic.name] = {
          x: (srcPos.x + tgtPos.x) / 2,
          y: (srcPos.y + tgtPos.y) / 2
        };
      }
    });
    
    return result;
  }, [circuitData, positionedComponents, pinPositions]);

  // Helper to get pin position
  const getPinPos = (end: { component: string; pinIndex: number; port?: string }): Position | undefined => {
    // Check for component
    const pc = positionedComponents.find(c => c.name === end.component);
    if (pc) {
      const isOutput = end.port === 'out';
      const pinPositionsForComponent = pinPositions[pc.name];
      
      if (!pinPositionsForComponent) return undefined;
      
      return isOutput
        ? pinPositionsForComponent.outputs[end.pinIndex]
        : pinPositionsForComponent.inputs[end.pinIndex];
    }
    
    // Check for interconnect
    return interPos[end.component];
  };

  // Render connections with bezier curves
  function renderConnections() {
    if (!circuitData) return null;
    
    return circuitData.connections.map((conn, i) => {
      const source = getPinPos(conn.from);
      const target = getPinPos(conn.to);
      
      if (!source || !target) return null;
      
      // Control points for bezier curve
      const dx = target.x - source.x;
      const controlPointOffset = Math.min(100, Math.abs(dx) * 0.5);
      
      // Create path with control points
      const path = `M${source.x},${source.y} C${source.x + controlPointOffset},${source.y} ${target.x - controlPointOffset},${target.y} ${target.x},${target.y}`;
      
      return (
        <path 
          key={`conn-${i}`} 
          d={path} 
          fill="none" 
          stroke="#fff" 
          strokeWidth={1.5} 
          markerEnd="url(#arrowhead)" 
        />
      );
    });
  }

  if (!filePath) return <div>No circuit file path provided.</div>;
  if (loading) return <div>Loading circuit data...</div>;
  if (error) return <div>Error: {error}</div>;
  if (!circuitData) return <div>No circuit data loaded.</div>;

  // Render
  const width = 1200;
  const height = 800;

  return (
    <div style={{ color: '#fff' }}>
      <h2>Circuit Visualizer – Module: {circuitData.module}</h2>
      <svg
        id={svgId}
        ref={svgRef}
        width={width}
        height={height}
        style={{ border: '1px solid gray', background: '#1E1E1E' }}
      >
        <defs>
          <marker
            id="arrowhead"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#fff" />
          </marker>
        </defs>
        <g className="main-content">
          {/* Components */}
          {positionedComponents.map((pc, i) => (
            <g key={`comp-${i}`} data-name={pc.name}>
              <rect
                x={pc.x - pc.width / 2}
                y={pc.y - pc.height / 2}
                width={pc.width}
                height={pc.height}
                fill="#444"
                stroke="#ccc"
                rx={8}
                ry={8}
              />
              <text
                x={pc.x}
                y={pc.y}
                textAnchor="middle"
                alignmentBaseline="middle"
                fontSize={10}
                fill="#fff"
              >
                {pc.name.split(/[/\\]/).pop()} ({pc.type})
              </text>
              {/* Input pins */}
              {pc.inputs.sort((a, b) => a.pinIndex - b.pinIndex).map(pin => {
                const ppos = pinPositions[pc.name]?.inputs[pin.pinIndex];
                if (!ppos) return null;
                
                return (
                  <g key={`in-${pc.name}-${pin.pinIndex}`}>
                    <circle cx={ppos.x} cy={ppos.y} r={4} fill="blue" />
                    <text
                      x={ppos.x - 6}
                      y={ppos.y + 3}
                      fontSize={8}
                      fill="#fff"
                      textAnchor="end"
                    >
                      {pin.wire.split(/[/\\]/).pop()}
                    </text>
                  </g>
                );
              })}
              {/* Output pins */}
              {pc.outputs.sort((a, b) => a.pinIndex - b.pinIndex).map(pin => {
                const ppos = pinPositions[pc.name]?.outputs[pin.pinIndex];
                if (!ppos) return null;
                
                return (
                  <g key={`out-${pc.name}-${pin.pinIndex}`}>
                    <circle cx={ppos.x} cy={ppos.y} r={4} fill="green" />
                    <text
                      x={ppos.x + 6}
                      y={ppos.y + 3}
                      fontSize={8}
                      fill="#fff"
                      textAnchor="start"
                    >
                      {pin.wire.split(/[/\\]/).pop()}
                    </text>
                  </g>
                );
              })}
            </g>
          ))}

          {/* Interconnects */}
          {circuitData.interconnects.map((ic, i) => {
            const pos = interPos[ic.name];
            if (!pos) return null;
            
            return (
              <g key={`ic-${ic.name}`}>
                <rect
                  x={pos.x - 15}
                  y={pos.y - 10}
                  width={30}
                  height={20}
                  fill="rgba(255, 255, 0, 0.7)"
                  stroke="#333"
                  strokeDasharray="4"
                />
                <text
                  x={pos.x}
                  y={pos.y + 4}
                  textAnchor="middle"
                  fontSize={8}
                  fill="#000"
                >
                  {ic.name.split(/[/\\]/).pop()}
                </text>
              </g>
            );
          })}

          {/* Connections */}
          {renderConnections()}
        </g>
      </svg>

      {/* Summary */}
      {circuitData.summary && (
        <div style={{ marginTop: '20px' }}>
          <h3>Circuit Summary</h3>
          <p>Total Components: {circuitData.components.length}</p>
          <p>Total Interconnects: {circuitData.interconnects.length}</p>
          <p>Total Connections: {circuitData.connections.length}</p>
          {circuitData.summary.total_components && <p>Summary Components: {circuitData.summary.total_components}</p>}
          {circuitData.summary.total_ports && <p>Summary Ports: {circuitData.summary.total_ports}</p>}
          {circuitData.summary.total_interconnects && <p>Summary Interconnects: {circuitData.summary.total_interconnects}</p>}
          {circuitData.summary.total_connections && <p>Summary Connections: {circuitData.summary.total_connections}</p>}
        </div>
      )}
    </div>
  );
};

export default CircuitVisualizer;