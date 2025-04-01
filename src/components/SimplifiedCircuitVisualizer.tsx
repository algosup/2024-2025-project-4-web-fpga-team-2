import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import * as dagreLib from 'dagre';
import "../styles/components/simplifiedCircuitVisualizer.css";

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
  if (!name) return false;
  const trimmed = name.trim();
  const cleaned = trimmed.replace(/\\/g, '').toLowerCase();
  const result = cleaned.includes('lut_gnd');
  return result;
}

function isInterconnect(type: string): boolean {
  return type.toLowerCase().includes('interconnect');
}

// ---------------------------------------------------------------------------
// 3) BFS-based Connection Builder (skips interconnect nodes, omits lut_gnd)
// ---------------------------------------------------------------------------
function buildSimplifiedConnections(circuitData: CircuitData): Connection[] {
  const outMap = new Map<string, Connection[]>();
  const inMap = new Map<string, Connection[]>();
  const realNodes = new Set<string>();

  circuitData.connections.forEach(conn => {
    if (isLutGnd(conn.from.component) || isLutGnd(conn.to.component)) return;

    if (!outMap.has(conn.from.component)) outMap.set(conn.from.component, []);
    if (!inMap.has(conn.to.component)) inMap.set(conn.to.component, []);

    outMap.get(conn.from.component)?.push(conn);
    inMap.get(conn.to.component)?.push(conn);

    realNodes.add(conn.from.component);
    realNodes.add(conn.to.component);
  });

  const simplifiedConnections: Connection[] = [];
  outMap.forEach((connections, component) => {
    connections.forEach(conn => {
      const realSource = traceToRealSource(
        conn.from.component,
        conn.from.pinIndex,
        outMap,
        realNodes
      );
      const realDestination = traceToRealDestination(
        conn.to.component,
        conn.to.pinIndex,
        inMap,
        realNodes
      );

      simplifiedConnections.push({
        wire: conn.wire,
        from: { ...realSource, type: 'output' },
        to: { ...realDestination, type: 'input' }
      });
    });
  });

  return simplifiedConnections;
}

function traceToRealSource(
  startComp: string,
  startPin: number,
  outMap: Map<string, Connection[]>,
  realNodes: Set<string>
): { component: string, pinIndex: number } {
  const visited = new Set<string>();
  const queue: Array<{ component: string, pinIndex: number }> = [{ component: startComp, pinIndex: startPin }];

  console.log(`Tracing source starting from ${startComp}:${startPin}`);

  while (queue.length) {
    const cur = queue.shift()!;
    console.log(`Visiting ${cur.component}:${cur.pinIndex}`);

    if (realNodes.has(cur.component)) {
      console.log(`Found real source: ${cur.component}:${cur.pinIndex}`);
      return cur;
    }
    if (visited.has(cur.component)) continue;
    visited.add(cur.component);

    const outConns = outMap.get(cur.component) || [];
    outConns.forEach(conn => {
      console.log(`Queueing to ${conn.to.component}:${conn.to.pinIndex}`);
      queue.push({ component: conn.to.component, pinIndex: conn.to.pinIndex });
    });
  }

  console.warn(`No real source found for ${startComp}, defaulting back`);
  return { component: startComp, pinIndex: startPin };
}

function traceToRealDestination(
  startComp: string,
  startPin: number,
  inMap: Map<string, Connection[]>,
  realNodes: Set<string>
): { component: string, pinIndex: number } {
  const visited = new Set<string>();
  const queue: Array<{ component: string, pinIndex: number }> = [{ component: startComp, pinIndex: startPin }];
  console.log(`Tracing destination starting from ${startComp}:${startPin}`);

  while (queue.length) {
    const cur = queue.shift()!;
    console.log(`Visiting ${cur.component}:${cur.pinIndex}`);

    if (realNodes.has(cur.component)) {
      console.log(`Found real destination: ${cur.component}:${cur.pinIndex}`);
      return cur;
    }
    if (visited.has(cur.component)) continue;
    visited.add(cur.component);

    const inConns = inMap.get(cur.component) || [];
    inConns.forEach(conn => {
      console.log(`Queueing from ${conn.from.component}:${conn.from.pinIndex}`);
      queue.push({ component: conn.from.component, pinIndex: conn.from.pinIndex });
    });
  }

  console.warn(`No real destination found for ${startComp}, defaulting back`);
  return { component: startComp, pinIndex: startPin };
}


function getSimplifiedComponents(circuitData: CircuitData): ComponentNode[] {
  if (!circuitData || !circuitData.components) return [];
  return circuitData.components.filter(
    c => !isLutGnd(c.name) && !isInterconnect(c.type)
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

  // Create a wire-to-component map for direct lookups
  const wireComponentMap: Record<string, Array<{ component: string; isInput: boolean; pinIndex: number }>> = {};

  circuitData.components.forEach(comp => {
    if (isLutGnd(comp.name)) return;

    // Map input pins
    comp.inputs.forEach(pin => {
      if (!wireComponentMap[pin.wire]) wireComponentMap[pin.wire] = [];
      wireComponentMap[pin.wire].push({
        component: comp.name,
        isInput: true,
        pinIndex: pin.pinIndex
      });
    });

    // Map output pins
    comp.outputs.forEach(pin => {
      if (!wireComponentMap[pin.wire]) wireComponentMap[pin.wire] = [];
      wireComponentMap[pin.wire].push({
        component: comp.name,
        isInput: false,
        pinIndex: pin.pinIndex
      });
    });
  });

  // Map interconnects for wire tracing
  const wireToWireMap: Record<string, string[]> = {};
  circuitData.interconnects.forEach(ic => {
    if (!wireToWireMap[ic.datain]) wireToWireMap[ic.datain] = [];
    wireToWireMap[ic.datain].push(ic.dataout);

    if (!wireToWireMap[ic.dataout]) wireToWireMap[ic.dataout] = [];
    wireToWireMap[ic.dataout].push(ic.datain);
  });

  // Process each port
  Object.entries(circuitData.ports).forEach(([portName, direction]) => {
    const isInput = direction === 'input';
    const wireToTrace = inferredPortWires[portName] || portName;

    const visitedWires = new Set<string>();
    const pendingWires = [wireToTrace];

    // BFS to find all connected components
    while (pendingWires.length > 0) {
      const currentWire = pendingWires.shift()!;
      if (visitedWires.has(currentWire)) continue;
      visitedWires.add(currentWire);

      // Check direct connections to this wire
      const connectedComponents = wireComponentMap[currentWire] || [];
      connectedComponents.forEach(conn => {
        // For input ports, we want component inputs; for output ports, we want component outputs
        if ((isInput && conn.isInput) || (!isInput && !conn.isInput)) {
          portConnections.push({
            portName,
            direction,
            component: conn.component,
            pinIndex: conn.pinIndex,
            wire: currentWire
          });
        }
      });

      const connectedWires = wireToWireMap[currentWire] || [];
      pendingWires.push(...connectedWires.filter(w => !visitedWires.has(w)));
    }
  });

  console.log("Built port connections:", portConnections);
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
  // Custom port positions for port dragging.
  // Custom port positions for port dragging - accessed via setter
  const [customPortPositions, setCustomPortPositions] = useState<Record<string, Position>>({});
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

  const svgWidth = 1200;
  const svgHeight = 800;
  const svgId = useMemo(() => `circuit-svg-${Math.random().toString(36).substring(2, 11)}`, []);
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

    console.log(`Fetching circuit data from: ${fullPath}`);

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
        // Set defaults for missing properties
        data.interconnects = data.interconnects || [];
        data.wires = data.wires || [];
        data.ports = data.ports || {};
        data.components = data.components || [];

        // Filter out LUT_GND components
        console.log('Components before filter:', data.components.length);
        data.components = data.components.filter(c => !isLutGnd(c.name));
        console.log('Components after filter:', data.components.length);

        // Build valid component names set


        console.log(`Loaded ${data.components.length} components and ${data.connections.length} connections`);
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

    // First try exact matches
    Object.entries(circuitData.ports).forEach(([portName, dir]) => {
      // Try to find direct wire matches first
      if (circuitData.wires.includes(portName)) {
        map[portName] = portName;
        return;
      }

      // Look for wires that contain the port name
      const matchingWires = circuitData.wires.filter(w =>
        w.includes(portName) ||
        w.includes(portName.replace('\\', ''))
      );

      if (matchingWires.length > 0) {
        // For input ports, prefer wires with "input" in the name
        // For output ports, prefer wires with "output" in the name
        const directionLabel = dir === 'input' ? 'input' : 'output';
        const bestMatch = matchingWires.find(w => w.includes(directionLabel)) || matchingWires[0];
        map[portName] = bestMatch;
      } else {
        // Fallback to the port name itself
        map[portName] = portName;
      }
    });

    console.log("Inferred port wires:", map);
    return map;
  }, [circuitData]);

  useEffect(() => {
    if (!circuitData) return;

    console.log("Building simplified components and connections...");

    const comps = getSimplifiedComponents(circuitData);
    const conns = buildSimplifiedConnections(circuitData);
    const portConns = buildPortConnections(circuitData, inferredPortWires);

    console.log(`Found ${comps.length} components, ${conns.length} connections, ${portConns.length} port connections`);

    setSimplifiedComponents(comps);
    setSimplifiedConnections(conns);
    setPortConnections(portConns);
  }, [circuitData, inferredPortWires]);

  // -----------------------------------------------------------------------
  // Run Dagre Layout.
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (!circuitData || simplifiedComponents.length === 0) return;

    console.log("Running Dagre layout...");

    try {
      const g = new dagre.graphlib.Graph();
      g.setGraph({
        rankdir: 'LR',
        ranksep: 75,
        nodesep: 50,
        edgesep: 25,
        marginx: 50,
        marginy: 50,
        acyclicer: 'greedy',
        ranker: 'network-simplex'
      });
      g.setDefaultEdgeLabel(() => ({}));

      // Add nodes to the graph
      simplifiedComponents.forEach(node => {
        const numPins = Math.max(node.inputs.length || 1, node.outputs.length || 1);
        const width = 120;
        const height = Math.max(60, numPins * 20);
        g.setNode(node.name, {
          comp: node,
          width,
          height,
          label: node.name,
        });
      });

      // Add edges to the graph
      simplifiedConnections.forEach(conn => {
        g.setEdge(conn.from.component, conn.to.component, {
          weight: 1,
          minlen: 1
        });
      });

      // Run the layout algorithm
      dagre.layout(g);

      // Extract the positioned nodes
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
        console.log(`Layout complete with ${newPositions.length} positioned nodes`);
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

    const inputPorts: string[] = [];
    const outputPorts: string[] = [];
    const pos: Record<string, Position> = {};
    // Separate input and output ports
    Object.entries(circuitData.ports).forEach(([portName, direction]) => {
      if (direction === "input") {
        inputPorts.push(portName);
      } else {
        outputPorts.push(portName);
      }
    });

    // Position input ports on the left side
    inputPorts.forEach((portName, index) => {
      pos[portName] = {
        x: 100,
        y: 100 + index * 80
      };
    });

    // Position output ports on the right side
    outputPorts.forEach((portName, index) => {
      pos[portName] = {
        x: svgWidth - 100,
        y: 100 + index * 80
      };
    });

    return pos;
  }, [circuitData, svgWidth]);

  useEffect(() => {
    if (Object.keys(defaultPortPositions).length > 0) {
      setPortPositions(prev => {
        // Keep existing positions for ports already positioned,
        // use defaults for others
        const newPositions = { ...prev };
        Object.entries(defaultPortPositions).forEach(([portName, position]) => {
          if (!prev[portName]) {
            newPositions[portName] = position;
          }
        });
        return newPositions;
      });
    }
  }, [defaultPortPositions]);

  // -----------------------------------------------------------------------
  // Compute Pin Positions.
  // -----------------------------------------------------------------------
  const pinPositions = useMemo<Record<string, { inputs: Record<number, Position>, outputs: Record<number, Position> }>>(() => {
    const map: Record<string, { inputs: Record<number, Position>, outputs: Record<number, Position> }> = {};

    nodePositions.forEach(pc => {
      // Handle edge case of component with no pins
      if (pc.inputs.length === 0 && pc.outputs.length === 0) {
        map[pc.name] = {
          inputs: { 0: { x: pc.x - pc.width / 2, y: pc.y } },
          outputs: { 0: { x: pc.x + pc.width / 2, y: pc.y } }
        };
        return;
      }

      // Position input pins along left edge
      const inputPins: Record<number, Position> = {};
      pc.inputs.forEach((pin, i) => {
        const totalPins = pc.inputs.length;
        // Space pins evenly along the left edge
        const yOffset = (i + 1) * (pc.height / (totalPins + 1)) - pc.height / 2;
        inputPins[pin.pinIndex] = {
          x: pc.x - pc.width / 2,
          y: pc.y + yOffset
        };
      });

      // Position output pins along right edge
      const outputPins: Record<number, Position> = {};
      pc.outputs.forEach((pin, i) => {
        const totalPins = pc.outputs.length;
        // Space pins evenly along the right edge
        const yOffset = (i + 1) * (pc.height / (totalPins + 1)) - pc.height / 2;
        outputPins[pin.pinIndex] = {
          x: pc.x + pc.width / 2,
          y: pc.y + yOffset
        };
      });

      map[pc.name] = {
        inputs: inputPins,
        outputs: outputPins
      };
    });

    return map;
  }, [nodePositions]);

  // -----------------------------------------------------------------------
  // Draw Port Connections.
  // -----------------------------------------------------------------------
  const portConnectionsToDraw = useMemo<Array<PortConnectionDraw>>(() => {
    if (!circuitData || !nodePositions.length || !portConnections.length) return [];

    const results: PortConnectionDraw[] = [];

    // Track processed connections to avoid duplicates
    const processedKeys = new Set<string>();

    portConnections.forEach(conn => {
      const portPos = portPositions[conn.portName];
      if (!portPos) {
        console.warn(`No position found for port ${conn.portName}`);
        return;
      }

      // Find the target component
      const targetNode = nodePositions.find(node => node.name === conn.component);
      if (!targetNode) {
        console.warn(`Component ${conn.component} not found in positions`);
        return;
      }

      // Get the relevant pin position
      let pinPos: Position | undefined;
      if (conn.direction === 'input') {
        // For input ports connecting to components
        pinPos = pinPositions[targetNode.name]?.inputs[conn.pinIndex];
      } else {
        // For output ports connecting from components
        pinPos = pinPositions[targetNode.name]?.outputs[conn.pinIndex];
      }

      if (!pinPos) {
        console.warn(`No pin position found for ${conn.component}:${conn.pinIndex}`);
        return;
      }

      // Create a unique key for this connection
      const connKey = `${conn.portName}-${conn.component}-${conn.pinIndex}`;
      if (processedKeys.has(connKey)) return;
      processedKeys.add(connKey);

      // For input ports, draw from port to component
      // For output ports, draw from component to port
      if (conn.direction === 'input') {
        results.push({
          portName: conn.portName,
          fromPos: portPos,
          toPos: pinPos,
          wire: conn.wire
        });
      } else {
        results.push({
          portName: conn.portName,
          fromPos: pinPos,
          toPos: portPos,
          wire: conn.wire
        });
      }
    });

    console.log(`Drawing ${results.length} port connections`);
    return results;
  }, [circuitData, portPositions, nodePositions, pinPositions, portConnections]);

  // -----------------------------------------------------------------------
  // Animate pulses on connection paths.
  // -----------------------------------------------------------------------
  function animatePulseOnce(pathElement: SVGPathElement, durationMs: number, color: string) {
    if (!pathElement || !pathElement.parentNode) return;

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
  // Get delay factor for a wire.
  // -----------------------------------------------------------------------
  function getDelayForWire(wire: string, circuit: CircuitData): number {
    if (!circuit || !circuit.timing || !circuit.timing.delays) return 2000;

    const found = circuit.timing.delays.find(d => d.instance && d.instance.includes(wire));
    if (found && found.max_delay && found.max_delay > 0) {
      return (found.max_delay / 1000) * 100;
    }

    // Default delay value
    return 2000;
  }

  // -----------------------------------------------------------------------
  // Animate pulses on clock cycle change.
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (!svgRef.current || !circuitData) return;

    // Animate all connections
    const svg = d3.select(svgRef.current);
    svg.selectAll<SVGPathElement, unknown>('path.connection-path')
      .each(function () {
        const wire = this.getAttribute('data-wire') || '';

        // Determine color based on wire type
        let color = '#fff';
        if (wire.toLowerCase().includes('clk')) {
          color = '#ffff00'; // Yellow for clock signals
        } else if (wire.toLowerCase().includes('reset')) {
          color = '#ff0000'; // Red for reset signals
        } else if (wire.toLowerCase().includes('d')) {
          color = '#00ff00'; // Green for data signals
        } else if (wire.toLowerCase().includes('q')) {
          color = '#00ffff'; // Cyan for output signals
        }

        // Calculate delay based on wire and animation speed
        const baseDuration = getDelayForWire(wire, circuitData);
        const finalDuration = baseDuration / animationSpeed;

        // Run the animation
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

    // Get reference to SVG
    const svg = d3.select(svgRef.current);

    // Clear any existing zoom behavior
    svg.on('.zoom', null);

    // Create zoom behavior
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .on('zoom', (event) => {
        // Store transform for reference by other functions
        const transform = event.transform;
        (window as any).__currentTransform = transform;

        // Apply zoom transform to content layers
        svg.select('.main-content').attr('transform', transform);
      });

    // Apply zoom behavior to SVG
    svg.call(zoom);

    // Set initial zoom level to fit content
    const initialTransform = d3.zoomIdentity.translate(50, 50).scale(0.8);
    svg.call(zoom.transform, initialTransform);

    return () => {
      // Cleanup
      svg.on('.zoom', null);
    };
  }, [nodePositions.length > 0]);
  // -----------------------------------------------------------------------
  // Drag-and-drop functionality.
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (!svgRef.current) return;

    const svg = d3.select(svgRef.current);

    // Handle component node dragging
    const dragNode = d3.drag<SVGGElement, unknown>()
      .on('start', function () {
        d3.select(this).raise().classed('dragging', true);
      })
      .on('drag', function (event) {
        const nodeId = this.getAttribute('data-id');
        if (!nodeId) return;

        const transform = (window as any).__currentTransform || d3.zoomIdentity;
        const x = event.x / transform.k - transform.x / transform.k;
        const y = event.y / transform.k - transform.y / transform.k;

        d3.select(this).attr('transform', `translate(${x}, ${y})`);

        setNodePositions(prev => prev.map(node =>
          node.name === nodeId ? { ...node, x, y } : node
        ));
      })
      .on('end', function () {
        d3.select(this).classed('dragging', false);
      });
    svg.selectAll<SVGGElement, unknown>('.component-node').call(dragNode as any);

    // Handle port dragging
    const dragPort = d3.drag<SVGGElement, unknown>()
      .on('start', function () {
        d3.select(this).raise().classed('dragging', true);
      })
      .on('drag', function (event) {
        const portName = this.getAttribute('data-port');
        if (!portName) return;

        const transform = (window as any).__currentTransform || d3.zoomIdentity;
        const x = event.x / transform.k - transform.x / transform.k;
        const y = event.y / transform.k - transform.y / transform.k;

        d3.select(this).attr('transform', `translate(${x}, ${y})`);

        setPortPositions(prev => ({
          ...prev,
          [portName]: { x, y }
        }));

        setCustomPortPositions(prev => ({
          ...prev,
          [portName]: { x, y }
        }));
      })
      .on('end', function () {
        d3.select(this).classed('dragging', false);
      });
    svg.selectAll<SVGGElement, unknown>('.port-node').call(dragPort as any);
  }, [nodePositions, portPositions]);

  // -----------------------------------------------------------------------
  // Rendering.
  // -----------------------------------------------------------------------
  if (error) {
    return <div className="circuit-error">Error: {error}</div>;
  }

  if (loading) {
    return <div className="circuit-loading">Loading circuit data...</div>;
  }

  if (!circuitData) {
    return <div className="circuit-empty">No circuit data available</div>;
  }

  // Function to generate path between points
  function generatePath(start: Position, end: Position): string {
    const dx = end.x - start.x;
    const dy = end.y - start.y;

    // If horizontal or vertical distance is very small, use a straight line
    if (Math.abs(dx) < 20 || Math.abs(dy) < 20) {
      return `M ${start.x},${start.y} L ${end.x},${end.y}`;
    }

    const midX = start.x + dx / 2;
    return `M ${start.x},${start.y} C ${midX},${start.y} ${midX},${end.y} ${end.x},${end.y}`;
  };

  return (
    <div className="simplified-circuit-visualizer">
      <div className="controls">
        <div className="animation-controls">
          <button onClick={() => setIsRunning(!isRunning)}>
            {isRunning ? "Pause" : "Run Animation"}
          </button>
          <button onClick={() => setClockCycle(c => c + 1)}>
            Step Cycle
          </button>
          <span>Clock Cycle: {clockCycle}</span>
          <label>
            Speed:
            <input
              type="range"
              min="0.5"
              max="5"
              step="0.5"
              value={animationSpeed}
              onChange={(e) => setAnimationSpeed(parseFloat(e.target.value))}
            />
            {animationSpeed}x
          </label>
        </div>
        {circuitData.module && (
          <div className="module-name">Module: {circuitData.module}</div>
        )}
      </div>

      <svg
        id={svgId}
        ref={svgRef}
        className="circuit-svg"
        width={svgWidth}
        height={svgHeight}
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
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
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#888" />
          </marker>
        </defs>

        <g className="main-content">
          {/* Connection lines */}
          {simplifiedConnections.map((conn, i) => {
            const fromComponent = nodePositions.find(n => n.name === conn.from.component);
            const toComponent = nodePositions.find(n => n.name === conn.to.component);

            if (!fromComponent || !toComponent) return null;

            const startPos = pinPositions[fromComponent.name]?.outputs[conn.from.pinIndex];
            const endPos = pinPositions[toComponent.name]?.inputs[conn.to.pinIndex];

            if (!startPos || !endPos) return null;

            return (
              <path
                key={`conn-${i}`}
                className={`connection-path ${isInterconnect(conn.wire) ? 'hidden-interconnect' : ''}`}
                d={generatePath(startPos, endPos)}
                stroke="#888"
                strokeWidth="2"
                fill="none"
                markerEnd="url(#arrowhead)"
                data-wire={conn.wire}
              />
            );
          })}

          {/* Port connections */}
          {portConnectionsToDraw.map((conn, i) => (
            <path
              key={`port-${i}`}
              className="connection-path port-connection"
              d={generatePath(conn.fromPos, conn.toPos)}
              stroke="#66f"
              strokeWidth="2"
              fill="none"
              markerEnd="url(#arrowhead)"
              data-wire={conn.wire}
            />
          ))}

          {/* Component nodes */}
          {nodePositions.map(node => (
            <g
              key={node.name}
              className="component-node"
              data-id={node.name}
              transform={`translate(${node.x}, ${node.y})`}
            >
              <rect
                x={-node.width / 2}
                y={-node.height / 2}
                width={node.width}
                height={node.height}
                rx="5"
                ry="5"
                fill="#334"
                stroke="#88f"
                strokeWidth="2"
              />
              <text
                textAnchor="middle"
                dominantBaseline="middle"
                fill="#fff"
                fontSize="12"
              >
                {node.name.length > 15 ? `${node.name.substring(0, 12)}...` : node.name}
                <tspan x="0" dy="15" fontSize="10">({node.type})</tspan>
              </text>

              {/* Input pins */}
              {node.inputs.map((pin, i) => {
                const pinPos = pinPositions[node.name]?.inputs[pin.pinIndex];
                if (!pinPos) return null;
                const relX = pinPos.x - node.x;
                const relY = pinPos.y - node.y;

                return (
                  <g key={`in-${i}`} transform={`translate(${relX}, ${relY})`}>
                    <circle r="3" fill="#5af" />
                    <text x="-5" y="-5" textAnchor="end" fill="#aaa" fontSize="10">
                      {pin.pinIndex}
                    </text>
                  </g>
                );
              })}

              {/* Output pins */}
              {node.outputs.map((pin, i) => {
                const pinPos = pinPositions[node.name]?.outputs[pin.pinIndex];
                if (!pinPos) return null;
                const relX = pinPos.x - node.x;
                const relY = pinPos.y - node.y;

                return (
                  <g key={`out-${i}`} transform={`translate(${relX}, ${relY})`}>
                    <circle r="3" fill="#fa5" />
                    <text x="5" y="-5" textAnchor="start" fill="#aaa" fontSize="10">
                      {pin.pinIndex}
                    </text>
                  </g>
                );
              })}
            </g>
          ))}

          {/* Port nodes */}
          {Object.entries(portPositions).map(([portName, pos]) => (
            <g
              key={portName}
              className="port-node"
              data-port={portName}
              transform={`translate(${pos.x}, ${pos.y})`}
            >
              <rect
                x="-50"
                y="-20"
                width="100"
                height="40"
                rx="20"
                ry="20"
                fill={circuitData.ports[portName] === 'input' ? '#353' : '#533'}
                stroke={circuitData.ports[portName] === 'input' ? '#5f5' : '#f55'}
                strokeWidth="2"
              />
              <text
                textAnchor="middle"
                dominantBaseline="middle"
                fill="#fff"
                fontSize="14"
              >
                {portName}
                <tspan x="0" dy="15" fontSize="10">
                  ({circuitData.ports[portName]})
                </tspan>
              </text>
            </g>
          ))}
        </g>
      </svg>
    </div>
  );
};
export default SimplifiedCircuitVisualizer;
