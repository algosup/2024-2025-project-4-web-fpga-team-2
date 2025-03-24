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

interface TimingDelay {
  cellType: string;
  instance: string;
  type: string;
  inputPort?: string;
  outputPort?: string;
  rise?: { min: number; typ: number; max: number };
  fall?: { min: number; typ: number; max: number };
  max_delay?: number; // in picoseconds
}

interface TimingData {
  delays: TimingDelay[];
  summary?: {
    total_delays: number;
    max_delay: number;
    components_with_timing: number;
  };
}

interface CircuitData {
  module: string;
  ports: Record<string, string>;
  wires: string[];
  components: ComponentNode[];
  interconnects: Interconnect[];
  connections: Connection[];
  summary?: any;
  timing?: TimingData;
}

/** For storing node positions. */
interface PositionedComponent extends ComponentNode {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** For storing positions. */
interface Position {
  x: number;
  y: number;
}

/** For drawing port connection lines. */
interface PortConnectionDraw {
  portName: string;
  fromPos: Position;
  toPos: Position;
  wire: string;
}

interface CircuitVisualizerProps {
  jsonPath?: string;
  jsonFile?: string;
}

const CircuitVisualizer: React.FC<CircuitVisualizerProps> = ({ jsonPath, jsonFile }) => {
  const [circuitData, setCircuitData] = useState<CircuitData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [nodePositions, setNodePositions] = useState<PositionedComponent[]>([]);
  const [customPortPositions, setCustomPortPositions] = useState<Record<string, Position>>({
    "\\clk": { x: 100, y: 100 },
    "\\async_reset": { x: 100, y: 200 },
    "\\D": { x: 100, y: 300 },
    "\\Q": { x: 100, y: 400 }
  });
  const [hoveredNode, setHoveredNode] = useState<PositionedComponent | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [animationSpeed, setAnimationSpeed] = useState<number>(1);
  const [animateFlow, setAnimateFlow] = useState<boolean>(false);
  const [clockCycle, setClockCycle] = useState<number>(0);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const svgWidth = 1200;
  const svgHeight = 800;
  const svgId = useMemo(() => `circuit-svg-${Math.random().toString(36).substring(7)}`, []);
  const filePath = useMemo(() => jsonPath || jsonFile || '', [jsonPath, jsonFile]);
  const [showTimingInfo, setShowTimingInfo] = useState<boolean>(false);
  const [timingDetails, setTimingDetails] = useState<TimingDelay[] | null>(null);

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

  // 3) Merge components and interconnects into one array.
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

  // 4) Run Dagre Layout.
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

  // 5) Compute pin positions.
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

  const portPositions = useMemo<Record<string, Position>>(() => {
    if (!circuitData) return {};
    const merged: Record<string, Position> = {};
    Object.entries(circuitData.ports).forEach(([portName]) => {
      merged[portName] = customPortPositions[portName] || defaultPortPositions[portName];
    });
    return merged;
  }, [circuitData, customPortPositions, defaultPortPositions]);

  // 7) Infer port wires.
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

  const portConnectionsToDraw = useMemo<PortConnectionDraw[]>(() => {
    if (!circuitData) return [];
    const results: PortConnectionDraw[] = [];
    // For each port, find its position and determine the matching wire.
    Object.entries(circuitData.ports).forEach(([portName, direction]) => {
      const portPos = portPositions[portName];
      if (!portPos) return;
      const wire = inferredPortWires[portName];
      if (!wire) return;
      // For each node, check if any pin (input or output) has a matching wire.
      nodePositions.forEach((node) => {
        // Check inputs.
        node.inputs.forEach((pin) => {
          if (pin.wire === wire) {
            const pinPos = pinPositions[node.name]?.inputs[pin.pinIndex];
            if (pinPos) {
              results.push({ portName, fromPos: portPos, toPos: pinPos, wire });
            }
          }
        });
        // Check outputs.
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
    return results;
  }, [circuitData, portPositions, nodePositions, pinPositions, inferredPortWires]);
  // 8) Get timing data for a component.
  const getTimingForComponent = (componentName: string): TimingDelay[] => {
    if (!circuitData?.timing?.delays) return [];
    // Here we simply check if the delay’s instance includes the component name.
    return circuitData.timing.delays.filter((delay: TimingDelay) =>
      delay.instance && delay.instance.includes(componentName.replace(/^\\/, ""))
    );
  };

  // 9) Modified getDelayForWire that now uses component type info.
  function getDelayForWire(wire: string, circuitData: CircuitData, compType: string, compName: string): number {
    if (!circuitData?.timing?.delays) return 2000;
    let found: TimingDelay | undefined;
    // If the source is an interconnect, match by instance exactly.
    if (compType.toLowerCase() === "interconnect") {
      found = circuitData.timing.delays.find((d: TimingDelay) => d.instance === compName);
    } else {
      found = circuitData.timing.delays.find((d: TimingDelay) => d.instance && d.instance.includes(wire));
    }
    if (found && found.max_delay && found.max_delay > 0) {
      // Convert picoseconds to a visible duration (adjust multiplier as needed).
      return (found.max_delay / 1000) * 100;
    }
    console.log("No delay found for wire:", wire);
    return 2000;
  }
  function getDelayColor(delays: TimingDelay[]): string {
    if (!delays || delays.length === 0) return "#444"; // default color
    // You could use the number of delays as a proxy for "delay intensity"
    const delayCount = delays.length;
    if (delayCount > 5) return "#e74c3c"; // red for high delay
    if (delayCount > 3) return "#f39c12"; // orange for medium delay
    return "#2ecc71"; // green for low delay
  }
  // 10) Animate pulse on a given path with a specified color.
  function animatePulseOnce(pathElement: SVGPathElement, durationMs: number, color: string) {
    const parent = pathElement.parentNode as SVGElement;
    const circle = d3.select(parent)
      .append("circle")
      .attr("class", "pulse")
      .attr("r", 4)
      .attr("fill", color)
      .style("pointer-events", "none");

    circle
      .attr("transform", () => {
        const p0 = pathElement.getPointAtLength(0);
        return `translate(${p0.x},${p0.y})`;
      })
      .transition()
      .duration(durationMs)
      .ease(d3.easeLinear)
      .attrTween("transform", function () {
        const length = pathElement.getTotalLength();
        return (t: number) => {
          const p = pathElement.getPointAtLength(t * length);
          return `translate(${p.x},${p.y})`;
        };
      })
      .on("end", () => circle.remove());
  }

  // 11) Load JSON file.
  useEffect(() => {
    if (!filePath) return;
    fetch(filePath)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP error ${res.status} – ${res.statusText}`);
        return res.json();
      })
      .then((data: CircuitData) => {
        setCircuitData(data);
      })
      .catch(err => console.error("Error loading circuit data:", err));
  }, [jsonPath, jsonFile]);

  // 12) Helper to get pin positions for a connection end.
  const getPinPos = (end: { component: string; pinIndex: number; type: string; port?: string }): Position | undefined => {
    const node = nodePositions.find(c => c.name === end.component);
    if (!node) return undefined;
    const isOutput = end.type.toLowerCase() === 'output' || (end.port && end.port.toLowerCase() === 'out');
    const map = pinPositions[node.name];
    if (!map) return undefined;
    const index = end.pinIndex || 0;
    return isOutput ? map.outputs[index] : map.inputs[index];
  };

  // 13) Attach drag behavior to nodes.
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
            setHoveredNode(prev => (prev && prev.name === nodeId ? { ...prev, x: event.x, y: event.y } : prev));
          })
      );
  }, [nodePositions]);

  // 14) Attach drag behavior to ports.
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

  // 15) Clock cycle timer.
  useEffect(() => {
    if (!isRunning) return;
    const timer = setInterval(() => {
      setClockCycle(prev => prev + 1);
    }, 1000); // Adjust clock period (1 second per cycle)
    return () => clearInterval(timer);
  }, [isRunning]);

  // 16) Animate data flow on connection paths.
  useEffect(() => {
    if (!svgRef.current || !circuitData) return;
    const svg = d3.select(svgRef.current);
    svg.selectAll<SVGPathElement, unknown>("path.data-flow-connection")
      .each(function () {
        const wire = this.getAttribute("data-wire") || "";
        let color = "red";
        if (wire.toLowerCase().includes("clk")) {
          color = "yellow";
        } else if (wire.toLowerCase().includes("async")) {
          color = "blue";
        }
        // We no longer use unifyName here.
        // In a real scenario you might pass additional info about the connection.
        const baseDuration = wire ? getDelayForWire(wire, circuitData, "interconnect", wire) : 2000;
        const finalDuration = baseDuration / animationSpeed;
        animatePulseOnce(this, finalDuration, color);
      });
  }, [clockCycle, circuitData, animationSpeed]);

  // 17) Render the visual elements.
  if (!filePath) return <div>No circuit file path provided.</div>;
  if (loading) return <div>Loading circuit data...</div>;
  if (error) return <div>Error: {error}</div>;
  if (!circuitData) return <div>No circuit data loaded.</div>;

  const renderConnections = () => {
    if (!circuitData) return null;
    return circuitData.connections.map((conn: Connection, i: number) => {
      // For demonstration, compute a dummy bezier path between two fixed points.
      // (You should replace this with the proper pin positions.)
      const start = { x: 100, y: 100 };
      const end = { x: 300, y: 300 };
      const dx = end.x - start.x;
      const controlOffset = Math.min(100, Math.abs(dx) / 2);
      const path = `M${start.x},${start.y} C${start.x + controlOffset},${start.y} ${end.x - controlOffset},${end.y} ${end.x},${end.y}`;
      return (
        <path
          key={`conn-${i}`}
          className="data-flow-connection"
          data-wire={conn.wire}
          d={path}
          fill="none"
          stroke="#fff"
          strokeWidth={1.5}
          markerEnd="url(#arrowhead)"
        />
      );
    });
  };
  return (
    <div style={{ color: '#fff' }}>
      <div style={{ marginBottom: "1rem" }}>
        <button onClick={() => setClockCycle(c => c + 1)} style={{ marginRight: "1rem" }}>
          Next Cycle
        </button>
        <button onClick={() => setIsRunning(r => !r)} style={{ marginRight: "1rem" }}>
          {isRunning ? "Pause" : "Run"}
        </button>
        <span style={{ marginRight: "1rem" }}>Clock Cycle: {clockCycle}</span>
        <label style={{ marginRight: "0.5rem" }}>Animation Speed: {animationSpeed.toFixed(1)}x</label>
        <input
          type="range"
          min="0.1"
          max="5"
          step="0.1"
          value={animationSpeed}
          onChange={(e) => setAnimationSpeed(parseFloat(e.target.value))}
        />
      </div>
      <svg id={svgId} ref={svgRef} style={{ backgroundColor: "#313131", width: '100%', height: '100vh' }}>
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
          {nodePositions.map((node) => {
            const handleMouseEnter = () => {
              setHoveredNode(node);
              if (showTimingInfo) {
                setTimingDetails(getTimingForComponent(node.name));
              }
            };
            const handleMouseLeave = () => {
              setHoveredNode(null);
              setTimingDetails(null);
            };
    
            if (node.type.toLowerCase().includes('interconnect')) {
              const fill = showTimingInfo
                ? getDelayColor(getTimingForComponent(node.name))
                : "#ffffcc";
    
              return (
                <g
                  key={`node-${node.name}`}
                  className="draggable"
                  data-node-id={node.name}
                  transform={`translate(${node.x},${node.y})`}
                  onMouseEnter={handleMouseEnter}
                  onMouseLeave={handleMouseLeave}
                >
                  <rect
                    x={-node.width / 2}
                    y={-node.height / 2}
                    width={node.width}
                    height={node.height}
                    fill={fill}
                    stroke="#999"
                    strokeDasharray="4"
                  />
                  <text
                    x={0}
                    y={0}
                    textAnchor="middle"
                    alignmentBaseline="middle"
                    fontSize={10}
                    fill="#000"
                  >
                    {node.type}
                  </text>
                </g>
              );
            }
    
            let fill = '#444', stroke = '#ccc', textFill = '#fff';
            const t = node.type.toUpperCase();
    
            if (showTimingInfo) {
              fill = getDelayColor(getTimingForComponent(node.name));
              stroke = fill !== "#444" ? fill.replace(')', ', 0.8)').replace('rgb', 'rgba') : '#ccc';
            } else {
              if (t.includes('INPUT')) { fill = '#a8d5ff'; stroke = '#4285F4'; textFill = '#000'; }
              else if (t.includes('OUTPUT')) { fill = '#ffb3b3'; stroke = '#EA4335'; textFill = '#000'; }
              else if (t.includes('DFF') || t.includes('FLIP')) { fill = '#c5e1a5'; stroke = '#34A853'; textFill = '#000'; }
              else if (t.includes('LUT')) { fill = '#fff176'; stroke = '#FBBC05'; textFill = '#000'; }
            }
    
            return (
              <g
                key={`node-${node.name}`}
                className="draggable"
                data-node-id={node.name}
                transform={`translate(${node.x},${node.y})`}
                onMouseEnter={handleMouseEnter}
                onMouseLeave={handleMouseLeave}
              >
                <rect
                  x={-node.width / 2}
                  y={-node.height / 2}
                  width={node.width}
                  height={node.height}
                  fill={fill}
                  stroke={stroke}
                  strokeWidth={2}
                  rx={8}
                  ry={8}
                />
                <text
                  x={0}
                  y={0}
                  textAnchor="middle"
                  alignmentBaseline="middle"
                  fontSize={12}
                  fill={textFill}
                  fontWeight="bold"
                >
                  {node.type}
                </text>
                {node.inputs.sort((a, b) => a.pinIndex - b.pinIndex).map(pin => {
                  const pos = pinPositions[node.name]?.inputs[pin.pinIndex];
                  if (!pos) return null;
                  return (
                    <g key={`pin-in-${node.name}-${pin.pinIndex}`}>
                      <circle cx={-node.width / 2} cy={pos.y - node.y} r={4} fill="blue" />
                      <text
                        x={-node.width / 2 - 6}
                        y={pos.y - node.y + 3}
                        fontSize={8}
                        fill="#fff"
                        textAnchor="end"
                      >
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
                      <text
                        x={node.width / 2 + 6}
                        y={pos.y - node.y + 3}
                        fontSize={8}
                        fill="#fff"
                        textAnchor="start"
                      >
                        {pin.wire.replace(/.*[\\/]/, '').substring(0, 10)}
                      </text>
                    </g>
                  );
                })}
              </g>
            );
          })}
    
          {circuitData.connections.map((conn, i) => {
            const fromPos = getPinPos(conn.from);
            const toPos = getPinPos(conn.to);
            if (!fromPos || !toPos) return null;
            const dx = toPos.x - fromPos.x;
            const controlOffset = Math.min(50, Math.abs(dx) / 2);
            const path = `M${fromPos.x},${fromPos.y} C${fromPos.x + controlOffset},${fromPos.y} ${toPos.x - controlOffset},${toPos.y} ${toPos.x},${toPos.y}`;
            return (
              <path
                key={`conn-${i}`}
                className="data-flow-connection"
                data-wire={conn.wire}
                d={path}
                fill="none"
                stroke="#fff"
                strokeWidth={1.5}
                markerEnd="url(#arrowhead)"
              />
            );
          })}
    
          {Object.entries(circuitData.ports).map(([portName, dir]) => {
            const standardPorts = ["\\D", "\\clk", "\\Q", "\\async_reset"];
            if (!standardPorts.includes(portName)) return null;
            const pos = portPositions[portName];
            if (!pos) return null;
            const isInput = (dir === 'input');
            const fill = isInput ? '#a8d5ff' : '#ffb3b3';
            const stroke = isInput ? '#4285F4' : '#EA4335';
            return (
              <g
                key={`port-${portName}`}
                className="draggable-port"
                data-port-name={portName}
                transform={`translate(${pos.x},${pos.y})`}
              >
                <rect
                  x={-40}
                  y={-15}
                  width={80}
                  height={30}
                  fill={fill}
                  stroke={stroke}
                  strokeWidth={2}
                  rx={6}
                  ry={6}
                />
                <text
                  x={0}
                  y={2}
                  textAnchor="middle"
                  alignmentBaseline="middle"
                  fontSize={10}
                  fill="#000"
                  fontWeight="bold"
                >
                  {portName}
                </text>
              </g>
            );
          })}
    
          {portConnectionsToDraw.map((pcd, i) => {
            const dx = pcd.toPos.x - pcd.fromPos.x;
            const controlOffset = Math.min(100, Math.abs(dx) / 2);
            const path = `M${pcd.fromPos.x},${pcd.fromPos.y} C${pcd.fromPos.x + controlOffset},${pcd.fromPos.y} ${pcd.toPos.x - controlOffset},${pcd.toPos.y} ${pcd.toPos.x},${pcd.toPos.y}`;
            return (
              <path
                key={`portline-${i}`}
                className="data-flow-connection"
                data-wire={pcd.wire}
                d={path}
                fill="none"
                stroke="#fff"
                strokeWidth={1.5}
                markerEnd="url(#arrowhead)"
              />
            );
          })}
    
          {hoveredNode && (() => {
            const inputLines = hoveredNode.inputs.length;
            const outputLines = hoveredNode.outputs.length;
            let tooltipHeight = 40 + 16 * (inputLines + outputLines + 2);
            let tooltipContentLines = [
              hoveredNode.name,
              "Inputs:",
              ...hoveredNode.inputs.map(pin => pin.wire),
              "Outputs:",
              ...hoveredNode.outputs.map(pin => pin.wire)
            ];
            if (showTimingInfo && timingDetails && timingDetails.length > 0) {
              tooltipContentLines = [
                hoveredNode.name,
                `Timing Details (${timingDetails.length} delays):`,
                ...timingDetails.slice(0, 5).map((delay: any, i: number) => {
                  const delayValue = delay.max_delay !== undefined ? delay.max_delay : null;
                  const displayValue = delayValue !== null ? `(${(delayValue / 1000).toFixed(2)}ns)` : '';
                  return `${i + 1}. ${delay.cellType || delay.type}: ${delay.inputPort || ""} → ${delay.outputPort || ""} ${displayValue}`;
                })
              ];
              if (timingDetails.length > 5) {
                tooltipContentLines.push(`...and ${timingDetails.length - 5} more`);
              }
              tooltipHeight = 40 + (tooltipContentLines.length * 16);
            }
            const tooltipWidth = 250;
            return (
              <g
                className="tooltip"
                transform={`translate(${hoveredNode.x + hoveredNode.width / 2 + 10}, ${hoveredNode.y - 20})`}
              >
                <rect
                  x={0}
                  y={0}
                  width={tooltipWidth}
                  height={tooltipHeight}
                  fill="#fff"
                  stroke="#000"
                  rx={5}
                  ry={5}
                  opacity={0.9}
                />
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