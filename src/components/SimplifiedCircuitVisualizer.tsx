import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import * as dagreLib from 'dagre';

const dagre = dagreLib;

// ---------------------------------------------------------------------------
// 1) Type Definitions
// ---------------------------------------------------------------------------
interface ComponentPin {
  wire: string;
  pinIndex: number;
}
interface Connection {
  wire: string;
  from: {
    component: string;
    type: string; // "input" or "output"
    pinIndex: number;
    port?: string;
  };
  to: {
    component: string;
    type: string; // "input" or "output"
    pinIndex: number;
    port?: string;
  };
}
interface ComponentNode {
  name: string;
  type: string;
  inputs: ComponentPin[];
  outputs: ComponentPin[];
}
interface TimingDelay {
  instance: string;
  max_delay?: number;
}
interface TimingData {
  delays: TimingDelay[];
}
interface CircuitData {
  module: string;
  ports: Record<string, string>;
  wires: string[];
  components: ComponentNode[];
  interconnects: { name: string; type: string; datain: string; dataout: string }[];
  connections: Connection[];
  timing?: TimingData;
}
interface PositionedComponent extends ComponentNode {
  x: number;
  y: number;
  width: number;
  height: number;
}
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

// ---------------------------------------------------------------------------
// 2) Helper Functions
// ---------------------------------------------------------------------------
function isLutGnd(name: string): boolean {
  const trimmed = name.trim();
  const cleaned = trimmed.replace(/\\/g, '').toLowerCase();
  const result = cleaned.includes('lut_gnd');
  console.log(`[isLutGnd] name="${name}" trimmed="${trimmed}" cleaned="${cleaned}" => ${result}`);
  return result;
}

function isInterconnect(type: string): boolean {
  return type.toLowerCase().includes('interconnect');
}

// ---------------------------------------------------------------------------
// 3) BFS-based Connection Builder (skips interconnect nodes, omits lut_gnd)
// ---------------------------------------------------------------------------
function buildSimplifiedConnections(circuitData: CircuitData): Connection[] {
  const interconnectNames = new Set([
    ...circuitData.components.filter(c => isInterconnect(c.type)).map(c => c.name),
    ...circuitData.interconnects.map(ic => ic.name),
  ]);
  const realNodes = new Set(
    circuitData.components
      .filter(c => !isInterconnect(c.type) && !isLutGnd(c.name))
      .map(c => c.name)
  );
  console.log("Real nodes found:", [...realNodes]);

  const outMap = new Map<string, Connection[]>();
  const inMap = new Map<string, Connection[]>();
  circuitData.connections
    .filter(conn => !isLutGnd(conn.from.component) && !isLutGnd(conn.to.component))
    .forEach(conn => {
      const fromName = conn.from.component;
      const toName = conn.to.component;
      if (!outMap.has(fromName)) outMap.set(fromName, []);
      outMap.get(fromName)!.push(conn);
      if (!inMap.has(toName)) inMap.set(toName, []);
      inMap.get(toName)!.push(conn);
    });

  const newConnections: Connection[] = [];
  const processedPairs = new Set<string>();

  circuitData.components
    .filter(c => realNodes.has(c.name))
    .forEach(source => {
      source.outputs.forEach(outPin => {
        const queue: { node: string; pin: number; wire: string; path: string[] }[] = [];
        const visited = new Set<string>();
        const initial = outMap.get(source.name) || [];
        initial
          .filter(conn => conn.from.pinIndex === outPin.pinIndex)
          .forEach(conn => {
            const key = `${conn.to.component}-${conn.to.pinIndex}`;
            if (!visited.has(key)) {
              visited.add(key);
              queue.push({
                node: conn.to.component,
                pin: conn.to.pinIndex,
                wire: conn.wire,
                path: [conn.wire],
              });
            }
          });

        while (queue.length > 0) {
          const { node, pin, wire, path } = queue.shift()!;
          if (realNodes.has(node)) {
            const connKey = `${source.name}:${outPin.pinIndex}->${node}:${pin}`;
            if (!processedPairs.has(connKey)) {
              processedPairs.add(connKey);
              newConnections.push({
                wire: path.length > 1 ? path.join('->') : path[0],
                from: { component: source.name, type: "output", pinIndex: outPin.pinIndex },
                to: { component: node, type: "input", pinIndex: pin }
              });
            }
          } else if (interconnectNames.has(node)) {
            const nextConns = outMap.get(node) || [];
            nextConns.forEach(next => {
              if (isLutGnd(next.to.component)) return;
              const key = `${next.to.component}-${next.to.pinIndex}`;
              if (!visited.has(key)) {
                visited.add(key);
                queue.push({
                  node: next.to.component,
                  pin: next.to.pinIndex,
                  wire: next.wire,
                  path: [...path, next.wire],
                });
              }
            });
          }
        }
      });
    });

  console.log(`Built ${newConnections.length} simplified connections`);
  return newConnections;
}

function getSimplifiedComponents(circuitData: CircuitData): ComponentNode[] {
  return circuitData.components.filter(
    c => !isInterconnect(c.type) && !isLutGnd(c.name)
  );
}

// ---------------------------------------------------------------------------
// 4) Build Port Connections (with fallback logic for clock, D, Q).
// ---------------------------------------------------------------------------
function buildPortConnections(
  circuitData: CircuitData,
  inferredPortWires: Record<string, string> = {}
): Array<{ portName: string; direction: string; component: string; pinIndex: number; wire: string }> {
  if (!circuitData) return [];
  const portConnections: Array<{ portName: string; direction: string; component: string; pinIndex: number; wire: string }> = [];

  // Phase 1: Direct Netlist Connections
  Object.entries(circuitData.ports).forEach(([portName, direction]) => {
    const isInput = direction === 'input';
    const directConns = circuitData.connections.filter(conn => {
      if (isInput) {
        return conn.from.port === portName || conn.from.component === portName;
      } else {
        return conn.to.port === portName || conn.to.component === portName;
      }
    });
    directConns.forEach(conn => {
      const compName = isInput ? conn.to.component : conn.from.component;
      const comp = circuitData.components.find(c =>
        c.name === compName && !isInterconnect(c.type) && !isLutGnd(c.name)
      );
      if (comp) {
        portConnections.push({
          portName,
          direction,
          component: compName,
          pinIndex: isInput ? conn.to.pinIndex : conn.from.pinIndex,
          wire: conn.wire
        });
      }
    });
  });

  // Phase 2: Inferred Wires for Unconnected Ports
  const connectedPorts = new Set(portConnections.map(pc => pc.portName));
  Object.entries(circuitData.ports).forEach(([portName, direction]) => {
    if (connectedPorts.has(portName)) return;
    const inferredWire = inferredPortWires[portName];
    if (!inferredWire) return;
    const isInput = direction === 'input';
    circuitData.components.forEach(comp => {
      if (isInterconnect(comp.type) || isLutGnd(comp.name)) return;
      if (isInput) {
        comp.inputs.forEach(pin => {
          if (pin.wire === inferredWire) {
            portConnections.push({
              portName,
              direction,
              component: comp.name,
              pinIndex: pin.pinIndex,
              wire: inferredWire
            });
          }
        });
      } else {
        comp.outputs.forEach(pin => {
          if (pin.wire === inferredWire) {
            portConnections.push({
              portName,
              direction,
              component: comp.name,
              pinIndex: pin.pinIndex,
              wire: inferredWire
            });
          }
        });
      }
    });
  });

  // Phase 3: BFS from Unconnected INPUT Ports
  const normalizeWire = (w: string) => w.trim().replace(/\\/g, '').toLowerCase();
  const outMap = new Map<string, Connection[]>();
  circuitData.connections.forEach(conn => {
    const key = conn.from.port ? conn.from.port : conn.from.component;
    if (!outMap.has(key)) outMap.set(key, []);
    outMap.get(key)!.push(conn);
  });

  Object.entries(circuitData.ports).forEach(([portName, direction]) => {
    if (direction !== 'input') return;
    if (connectedPorts.has(portName)) return;
    const queue: Array<{ node: string; wire: string }> = [];
    const visited = new Set<string>();
    (outMap.get(portName) || []).forEach(conn => {
      const target = conn.to.component;
      const key = `${target}-${conn.to.pinIndex}`;
      if (!visited.has(key)) {
        visited.add(key);
        queue.push({ node: target, wire: conn.wire });
      }
    });
    while (queue.length > 0) {
      const { node, wire } = queue.shift()!;
      const comp = circuitData.components.find(c => c.name === node);
      if (comp && !isInterconnect(comp.type) && !isLutGnd(comp.name)) {
        const matchingPin = comp.inputs.find(pin => normalizeWire(pin.wire) === normalizeWire(wire));
        if (matchingPin) {
          portConnections.push({
            portName,
            direction: 'input',
            component: comp.name,
            pinIndex: matchingPin.pinIndex,
            wire
          });
          break;
        }
      } else {
        (outMap.get(node) || []).forEach(nextConn => {
          const nextName = nextConn.to.port ?? nextConn.to.component;
          const key = `${nextName}-${nextConn.to.pinIndex}`;
          if (!visited.has(key)) {
            visited.add(key);
            queue.push({ node: nextName, wire: nextConn.wire });
          }
        });
      }
    }
  });

  console.log("Final portConnections:", portConnections);
  return portConnections;
}

// ---------------------------------------------------------------------------
// 5) Main React Component
// ---------------------------------------------------------------------------
interface SimplifiedCircuitVisualizerProps {
  jsonPath?: string;
  jsonFile?: string;
}

const SimplifiedCircuitVisualizer: React.FC<SimplifiedCircuitVisualizerProps> = ({ jsonPath, jsonFile }) => {
  const [circuitData, setCircuitData] = useState<CircuitData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [nodePositions, setNodePositions] = useState<PositionedComponent[]>([]);
  const [clockCycle, setClockCycle] = useState<number>(0);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [animationSpeed, setAnimationSpeed] = useState<number>(1);
  // IMPORTANT: Declare customPortPositions state for port dragging.
  const [customPortPositions, setCustomPortPositions] = useState<Record<string, Position>>({
    "\\clk": { x: 100, y: 100 },
    "\\async_reset": { x: 100, y: 200 },
    "\\D": { x: 100, y: 300 },
    "\\Q": { x: 100, y: 400 }
  });
  const [portPositions, setPortPositions] = useState<Record<string, Position>>({});
  const [portConnections, setPortConnections] = useState<Array<{
    portName: string;
    direction: string;
    component: string;
    pinIndex: number;
    wire: string;
  }>>([]);
  const [simplifiedConnections, setSimplifiedConnections] = useState<Connection[]>([]);
  const [simplifiedComponents, setSimplifiedComponents] = useState<ComponentNode[]>([]);
  
  // For port positioning
  const svgWidth = 1200;
  const svgId = useMemo(() => `circuit-svg-${Math.random().toString(36).substr(2, 9)}`, []);
  const svgRef = useRef<SVGSVGElement>(null);
  const filePath = useMemo(() => jsonPath || jsonFile || '', [jsonPath, jsonFile]);
  
  // -----------------------------------------------------------------------
  // Load JSON data.
  // -----------------------------------------------------------------------
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
        console.log('Components before filter:', data.components.map(c => c.name));
        // Filter out any LUT GND.
        data.components = data.components.filter(c => !isLutGnd(c.name));
        const validNames = new Set(data.components.map(c => c.name));
        data.connections = data.connections.filter(conn =>
          validNames.has(conn.from.component) && validNames.has(conn.to.component)
        );
        console.log('Components after filter:', data.components.map(c => c.name));
        setCircuitData(data);
      })
      .catch(err => {
        console.error('Error loading circuit:', err);
        setError(err.message || 'Failed to load circuit data');
      })
      .finally(() => setLoading(false));
  }, [filePath]);
  
  // -----------------------------------------------------------------------
  // Build simplified netlist (BFS) & port connections.
  // -----------------------------------------------------------------------
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
    console.log("Inferred port wires:", map);
    return map;
  }, [circuitData]);
  
  useEffect(() => {
    if (!circuitData) return;
    const comps = getSimplifiedComponents(circuitData);
    const conns = buildSimplifiedConnections(circuitData);
    const portConns = buildPortConnections(circuitData, inferredPortWires);
    setSimplifiedComponents(comps);
    setSimplifiedConnections(conns);
    setPortConnections(portConns);
  }, [circuitData, inferredPortWires]);
  
  // -----------------------------------------------------------------------
  // Run Dagre Layout.
  // -----------------------------------------------------------------------
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
  
  useEffect(() => {
    if (!circuitData || simplifiedComponents.length === 0) return;
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
      simplifiedComponents.forEach(node => {
        const numPins = Math.max(node.inputs.length, node.outputs.length);
        const width = 75;
        const height = node.type.toLowerCase().includes('interconnect') ? 40 : Math.max(60, numPins * 18);
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
      const newPositions: PositionedComponent[] = [];
      g.nodes().forEach(nodeId => {
        const nodeData = g.node(nodeId);
        if (nodeData && 'comp' in nodeData) {
          newPositions.push({
            ...(nodeData.comp as ComponentNode),
            x: nodeData.x,
            y: nodeData.y,
            width: nodeData.width,
            height: nodeData.height,
          });
        }
      });
      if (newPositions.length > 0) {
        setNodePositions(newPositions);
      }
    } catch (err) {
      console.error("Dagre layout error:", err);
    }
  }, [circuitData, simplifiedComponents, simplifiedConnections]);
  
  // -----------------------------------------------------------------------
  // Calculate default port positions.
  // -----------------------------------------------------------------------
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
  
  useEffect(() => {
    if (Object.keys(defaultPortPositions).length > 0 && Object.keys(portPositions).length === 0) {
      setPortPositions(defaultPortPositions);
    }
  }, [defaultPortPositions]);
  
  // -----------------------------------------------------------------------
  // Compute Pin Positions.
  // -----------------------------------------------------------------------
  const pinPositions = useMemo<Record<string, { inputs: Record<number, Position>, outputs: Record<number, Position> }>>(() => {
    const map: Record<string, { inputs: Record<number, Position>, outputs: Record<number, Position> }> = {};
    nodePositions.forEach(pc => {
      if (pc.inputs.length === 0 && pc.outputs.length === 0) {
        map[pc.name] = {
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
        map[pc.name] = { inputs: inMap, outputs: outMap };
      }
    });
    console.log("Pin positions:", map);
    return map;
  }, [nodePositions]);
  
  // -----------------------------------------------------------------------
  // Draw Port Connections (ignoring interconnect and LUT GND nodes).
  // -----------------------------------------------------------------------
  const portConnectionsToDraw = useMemo<Array<PortConnectionDraw>>(() => {
    if (!circuitData || !nodePositions.length) return [];
    const results: PortConnectionDraw[] = [];
    Object.entries(circuitData.ports).forEach(([portName, direction]) => {
      const portPos = portPositions[portName];
      if (!portPos) return;
      const wire = inferredPortWires[portName];
      if (!wire) return;
      // Only consider nodes that are NOT interconnect and NOT LUT GND.
      nodePositions
        .filter(node => !isInterconnect(node.type) && !isLutGnd(node.name))
        .forEach((node) => {
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
    console.log(`Drawing ${results.length} port connections`);
    return results;
  }, [circuitData, portPositions, nodePositions, pinPositions, inferredPortWires]);
  
  // -----------------------------------------------------------------------
  // Get timing data for a component.
  // -----------------------------------------------------------------------
  const getTimingForComponent = (componentName: string): TimingDelay[] => {
    if (!circuitData?.timing?.delays) return [];
    return circuitData.timing.delays.filter((delay: TimingDelay) =>
      delay.instance && delay.instance.includes(componentName.replace(/^\\/, ""))
    );
  };
  
  // -----------------------------------------------------------------------
  // Modified getDelayForWire.
  // -----------------------------------------------------------------------
  function getDelayForWire(wire: string, circuit: CircuitData): number {
    if (!circuit.timing || !circuit.timing.delays) return 2000;
    const found = circuit.timing.delays.find(d => d.instance.includes(wire));
    if (found && found.max_delay && found.max_delay > 0) {
      return (found.max_delay / 1000) * 100;
    }
    console.log("No delay found for wire:", wire);
    return 2000;
  }
  
  // -----------------------------------------------------------------------
  // Animate pulses on connection paths.
  // -----------------------------------------------------------------------
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
  
  // -----------------------------------------------------------------------
  // Animate pulses.
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (!svgRef.current || !circuitData) return;
    const svg = d3.select(svgRef.current);
    svg.selectAll<SVGPathElement, unknown>('path.simplified-conn')
      .each(function () {
        const wire = this.getAttribute('data-wire') || '';
        let color = 'red';
        if (wire.toLowerCase().includes('clk')) color = 'yellow';
        const baseDuration = getDelayForWire(wire, circuitData);
        const finalDuration = baseDuration / animationSpeed;
        animatePulseOnce(this as SVGPathElement, finalDuration, color);
      });
  }, [clockCycle, circuitData, animationSpeed]);
  
  // -----------------------------------------------------------------------
  // Auto-increment clock.
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (!isRunning) return;
    const timer = setInterval(() => {
      setClockCycle(c => c + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [isRunning]);
  
  // -----------------------------------------------------------------------
  // Zoom & Pan.
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (!svgRef.current) return;
    const svg = d3.select(svgRef.current);
    const zoom = d3.zoom()
      .scaleExtent([0.1, 4])
      .on('zoom', event => {
        d3.select('.main-content').attr('transform', event.transform);
      });
    svg.call(zoom as any);
    return () => {
      svg.on('.zoom', null);
    };
  }, []);
  
  // -----------------------------------------------------------------------
  // Drag Behavior for Nodes.
  // -----------------------------------------------------------------------
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
          })
      );
  }, [nodePositions]);
  
  // -----------------------------------------------------------------------
  // Drag Behavior for Ports.
  // -----------------------------------------------------------------------
  useEffect(() => {
    d3.selectAll<SVGGElement, unknown>('.draggable-port')
      .call(
        d3.drag<SVGGElement, unknown>()
          .on('start', function (event) {
            event.sourceEvent.stopPropagation();
            d3.select(this).raise();
          })
          .on('drag', function (event) {
            event.sourceEvent.stopPropagation();
            const portName = d3.select(this).attr('data-port-name');
            d3.select(this).attr('transform', `translate(${event.x},${event.y})`);
            setCustomPortPositions((prev: Record<string, Position>) => ({
              ...prev,
              [portName]: { x: event.x, y: event.y }
            }));
          })
      );
  }, []); // Attach once
  
  // -----------------------------------------------------------------------
  // Render.
  // -----------------------------------------------------------------------
  if (!filePath) return <div>No JSON file provided.</div>;
  if (loading) return <div>Loading circuit data...</div>;
  if (error) return <div style={{ color: 'red' }}>Error: {error}</div>;
  if (!circuitData) return <div>No circuit data loaded.</div>;
  
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
        {/* Background rect to capture zoom events */}
        <rect x="0" y="0" width="100%" height="100%" fill="transparent" style={{ pointerEvents: 'all' }} />
        {/* Main circuit content (nodes and connections) */}
        <g className="main-content">
          {nodePositions.map((node) => (
            <g
              key={`node-${node.name}`}
              className="draggable"
              data-node-id={node.name}
              transform={`translate(${node.x},${node.y})`}
            >
              <rect
                x={-node.width / 2}
                y={-node.height / 2}
                width={node.width}
                height={node.height}
                fill={node.type.toLowerCase().includes('dff') ? '#c5e1a5' : '#fff176'}
                stroke="#444"
                strokeWidth={2}
                rx={6}
                ry={6}
              />
              {node.inputs.map(pin => {
                const p = pinPositions[node.name]?.inputs[pin.pinIndex];
                if (!p) return null;
                return (
                  <circle
                    key={`in-${node.name}-${pin.pinIndex}`}
                    cx={-node.width / 2}
                    cy={p.y - node.y}
                    r={4}
                    fill="blue"
                  />
                );
              })}
              {node.outputs.map(pin => {
                const p = pinPositions[node.name]?.outputs[pin.pinIndex];
                if (!p) return null;
                return (
                  <circle
                    key={`out-${node.name}-${pin.pinIndex}`}
                    cx={node.width / 2}
                    cy={p.y - node.y}
                    r={4}
                    fill="green"
                  />
                );
              })}
              <g style={{ pointerEvents: 'none' }}>
                <text
                  x={0}
                  y={0}
                  textAnchor="middle"
                  alignmentBaseline="middle"
                  fontSize={10}
                  fill="#000"
                  fontWeight="bold"
                  fontStyle="italic"
                >
                  {node.type}
                </text>
              </g>
            </g>
          ))}
  
          {simplifiedConnections.map((conn, i) => {
            const fromNode = nodePositions.find(n => n.name === conn.from.component);
            const toNode = nodePositions.find(n => n.name === conn.to.component);
            if (!fromNode || !toNode) return null;
            const fromPinPos = pinPositions[fromNode.name]?.outputs[conn.from.pinIndex];
            const toPinPos = pinPositions[toNode.name]?.inputs[conn.to.pinIndex];
            if (!fromPinPos || !toPinPos) return null;
            const dx = toPinPos.x - fromPinPos.x;
            const cpx1 = fromPinPos.x + Math.max(40, Math.abs(dx) * 0.25);
            const cpx2 = toPinPos.x - Math.max(40, Math.abs(dx) * 0.25);
            const pathData = `M${fromPinPos.x},${fromPinPos.y} C${cpx1},${fromPinPos.y} ${cpx2},${toPinPos.y} ${toPinPos.x},${toPinPos.y}`;
            return (
              <path
                key={`conn-${i}`}
                className="simplified-conn"
                data-wire={conn.wire}
                d={pathData}
                fill="none"
                stroke="#fff"
                strokeWidth={1.5}
                markerEnd="url(#arrowhead)"
              />
            );
          })}
        </g>
  
        {/* Ports layer (not transformed by zoom) */}
        <g className="ports-layer">
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
                style={{ pointerEvents: 'all' }}
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
            const ctrl = Math.min(100, Math.abs(dx) / 2);
            const path = `M${pcd.fromPos.x},${pcd.fromPos.y} C${pcd.fromPos.x + ctrl},${pcd.fromPos.y} ${pcd.toPos.x - ctrl},${pcd.toPos.y} ${pcd.toPos.x},${pcd.toPos.y}`;
            return (
              <path
                key={`portline-${i}`}
                className="simplified-conn"
                data-wire={pcd.wire}
                d={path}
                fill="none"
                stroke="#ff9800"
                strokeWidth={2.5}
                strokeDasharray="5,3"
                markerEnd="url(#arrowhead)"
              />
            );
          })}
        </g>
      </svg>
    </div>
  );
};
export default SimplifiedCircuitVisualizer;