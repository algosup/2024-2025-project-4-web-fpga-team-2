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

interface PortConnectionDraw {
  portName: string;
  fromPos: Position;
  toPos: Position;
  wire: string;
}

interface SignalPropagation {
  wire: string;
  path: SVGPathElement;
  fromComponent: string;
  toComponent: string;
  delay: number;
  value: boolean;
  arrivalTime: number;
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
  outMap.forEach((connections) => {
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

function buildDirectConnections(circuitData: CircuitData): Connection[] {
  if (!circuitData || !circuitData.connections) return [];

  console.log("Building direct connections from JSON data...");
  const connections: Connection[] = [];
  const componentMap: Record<string, ComponentNode> = {};

  // Create map of component names for quick lookup
  circuitData.components.forEach(comp => {
    if (!isLutGnd(comp.name)) {
      componentMap[comp.name] = comp;
    }
  });

  console.log(`Found ${connections.length} direct component connections`);
  return connections;
}

function extractAllConnections(circuitData: CircuitData): Connection[] {
  if (!circuitData || !circuitData.connections) return [];

  console.log("Extracting ALL connections from JSON data...");
  const connections: Connection[] = [];

  // Create a map of all component names for reference
  const componentNameMap = new Map<string, string>();
  circuitData.components.forEach(comp => {
    componentNameMap.set(comp.name, comp.name);
  });

  // Process connections with exact component names
  circuitData.connections.forEach((conn) => {
    if (!conn.wire || !conn.from || !conn.to) return;

    // Skip lut_gnd
    if (isLutGnd(conn.from.component) || isLutGnd(conn.to.component)) return;

    // Add connection with exact component names from the components array
    connections.push({
      wire: conn.wire,
      from: {
        ...conn.from,
        component: componentNameMap.get(conn.from.component) || conn.from.component
      },
      to: {
        ...conn.to,
        component: componentNameMap.get(conn.to.component) || conn.to.component
      }
    });
  });

  console.log(`Extracted ${connections.length} connections from JSON`);
  return connections;
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

  // Return exact components without modifying their names
  return circuitData.components.filter(
    c => !isLutGnd(c.name) && !isInterconnect(c.type)
  ).map(comp => ({
    ...comp,
    // Keep original name for proper matching
    name: comp.name
  }));
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
      console.log(`Processing port ${portName} (${direction}), using wire: ${wireToTrace}`);

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
          console.log(`Added port connection: ${portName} -> ${conn.component}:${conn.pinIndex}`);
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
  const [signalValues, setSignalValues] = useState<Record<string, boolean>>({});
  const [useRealisticTiming, setUseRealisticTiming] = useState<boolean>(true);
  const [showDebug, setShowDebug] = useState<boolean>(false);


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
  const [renderError, setRenderError] = useState<Error | null>(null);
  const [componentStates, setComponentStates] = useState<Record<string, {
    inputs: Record<number, boolean>,
    outputs: Record<number, boolean>,
    lastClock: boolean
  }>>({});

  // This will catch any errors during render
  useEffect(() => {
    window.addEventListener('error', (event) => {
      console.error('Caught render error:', event.error);
      setRenderError(event.error);
    });

    // Check if we can render at all
    try {
      setRenderError(null);
    } catch (err) {
      setRenderError(err as Error);
    }
  }, []);

  // Render a simple recovery UI if there's an error
  if (renderError) {
    return (
      <div className="circuit-error" style={{
        padding: "20px",
        margin: "20px",
        border: "1px solid red",
        background: "#fff"
      }}>
        <h3>Error in Circuit Visualizer</h3>
        <p>There was an error rendering the circuit. Please check the console for details.</p>
        <pre>{renderError.toString()}</pre>
        <button onClick={() => window.location.reload()}>Reload Page</button>
      </div>
    );
  }
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

    Object.entries(circuitData.ports).forEach(([portName, direction]) => {
      map[portName] = findBestPortWire(portName, direction, circuitData.wires);
    });

    console.log("Inferred port wires:", map);
    return map;
  }, [circuitData]);
  function findBestPortWire(portName: string, direction: string, wires: string[]): string {
    // Remove any backslashes for comparison
    const cleanPortName = portName.replace(/\\/g, '');

    // Try to find direct matches first (with and without backslashes)
    const exactMatch = wires.find(w =>
      w === portName || w === cleanPortName ||
      w === `\\${cleanPortName}` || w === `\\${cleanPortName}_input_0_0` ||
      w === `\\${cleanPortName}_output_0_0`
    );

    if (exactMatch) return exactMatch;

    // Look for input/output patterns
    const dirSuffix = direction === 'input' ? 'input_0_0' : 'output_0_0';
    const dirMatch = wires.find(w => w.includes(cleanPortName) && w.includes(dirSuffix));
    if (dirMatch) return dirMatch;

    // Find any wire containing the port name
    const anyMatch = wires.find(w => w.includes(cleanPortName));
    if (anyMatch) return anyMatch;

    return portName; // Fallback to the original port name
  }
  useEffect(() => {
    if (!circuitData) return;

    console.log("Building simplified components and connections...");

    const comps = getSimplifiedComponents(circuitData);

    // Use most direct extraction method first
    let conns = extractAllConnections(circuitData);

    // If no connections found, try other methods
    if (conns.length === 0) {
      console.log("No connections found with direct extraction, trying BFS...");
      conns = buildSimplifiedConnections(circuitData);

      if (conns.length === 0) {
        console.log("Still no connections, trying other methods...");
        conns = buildDirectConnections(circuitData);
      }
    }

    const portConns = buildPortConnections(circuitData, inferredPortWires);

    console.log(`Found ${comps.length} components, ${conns.length} connections, ${portConns.length} port connections`);

    // Log actual component names to help debugging
    if (conns.length > 0) {
      console.log("Component names in connections:",
        [...new Set([
          ...conns.map(c => c.from.component),
          ...conns.map(c => c.to.component)
        ])].slice(0, 10)
      );
    }

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
      // Create empty pin objects to start
      const inputPins: Record<number, Position> = {};
      const outputPins: Record<number, Position> = {};

      // Handle edge case of component with no pins
      if (pc.inputs.length === 0 && pc.outputs.length === 0) {
        inputPins[0] = { x: pc.x - pc.width / 2, y: pc.y };
        outputPins[0] = { x: pc.x + pc.width / 2, y: pc.y };
      } else {
        // Position input pins along left edge
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
        pc.outputs.forEach((pin, i) => {
          const totalPins = pc.outputs.length;
          // Space pins evenly along the right edge
          const yOffset = (i + 1) * (pc.height / (totalPins + 1)) - pc.height / 2;
          outputPins[pin.pinIndex] = {
            x: pc.x + pc.width / 2,
            y: pc.y + yOffset
          };
        });
      }

      // Always add the component to the map
      map[pc.name] = {
        inputs: inputPins,
        outputs: outputPins
      };
    });

    console.log("Pin positions calculated:", Object.keys(map).length, "components");

    return map;
  }, [nodePositions]);

  // -----------------------------------------------------------------------
  // Draw Port Connections.
  // -----------------------------------------------------------------------
  console.log("Building port connections to draw...");
  console.log("Port connections:", portConnections);
  console.log("Port positions:", portPositions);
  console.log("Components:", nodePositions.map(n => n.name));

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

      // If no pin position found, try to create a reasonable fallback
      if (!pinPos) {
        console.warn(`Pin position not found for ${conn.component}:${conn.pinIndex}`);

        // Create a fallback position on the edge of the component
        if (conn.direction === 'input') {
          // For input ports, use left edge of component
          pinPos = {
            x: targetNode.x - targetNode.width / 2,
            y: targetNode.y
          };
        } else {
          // For output ports, use right edge of component
          pinPos = {
            x: targetNode.x + targetNode.width / 2,
            y: targetNode.y
          };
        }
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
    console.log("Port connections to draw:", results);
    console.log("Port positions available:", Object.keys(portPositions));
    console.log("Pin positions available:", Object.keys(pinPositions).map(name =>
      `${name}: ${Object.keys(pinPositions[name]?.inputs || {}).length} inputs, ${Object.keys(pinPositions[name]?.outputs || {}).length} outputs`
    ));
    return results;

  }, [circuitData, portPositions, nodePositions, pinPositions, portConnections]);


  // -----------------------------------------------------------------------
  // Animate pulses on connection paths.
  // -----------------------------------------------------------------------
  function animatePulseOnce(
    pathElement: SVGPathElement,
    durationMs: number,
    color: string,
    value: boolean,
    delay: number = 0,
    reverse: boolean = false // Add parameter to control direction
  ) {
    if (!pathElement || !pathElement.parentNode) {
      console.warn("Cannot animate: missing path element or parent");
      return;
    }

    const parent = pathElement.parentNode as SVGElement;
    const actualDuration = Math.min(Math.max(durationMs, 300), 5000);
    const signalColor = value ? color : '#555';
    const length = pathElement.getTotalLength();

    setTimeout(() => {
      try {
        const circle = d3.select(parent)
          .append("circle")
          .attr("class", "pulse")
          .attr("r", value ? 6 : 4)
          .attr("fill", signalColor)
          .attr("stroke", value ? "white" : "none")
          .attr("stroke-width", value ? 1.5 : 0)
          .style("pointer-events", "none")
          .style("opacity", 0.8);

        if (isNaN(length) || length === 0) {
          console.warn("Path has no length, cannot animate");
          circle.remove();
          return;
        }

        // Set starting position based on direction
        circle.attr("transform", () => {
          // Start from end of path if reversed
          const point = reverse ? pathElement.getPointAtLength(length) : pathElement.getPointAtLength(0);
          return `translate(${point.x},${point.y})`;
        });

        circle
          .transition()
          .duration(actualDuration)
          .ease(d3.easeLinear)
          .attrTween("transform", function () {
            return (t: number) => {
              try {
                // For reversed paths, animate from length to 0
                const point = reverse
                  ? pathElement.getPointAtLength((1 - t) * length)
                  : pathElement.getPointAtLength(t * length);

                return `translate(${point.x},${point.y})`;
              } catch (e) {
                console.error("Error in pulse animation:", e);
                return "translate(0,0)";
              }
            };
          })
          .on("end", () => circle.remove());
      } catch (e) {
        console.error("Failed to animate pulse:", e);
      }
    }, delay);
  }

  // -----------------------------------------------------------------------
  // Build circuit propagation model.
  // -----------------------------------------------------------------------
  function buildCircuitPropagationModel(
    circuitData: CircuitData,
    connections: Connection[]
  ): Map<string, SignalPropagation[]> {
    console.log("Building circuit propagation model...");
    const model = new Map<string, SignalPropagation[]>();
    const svg = d3.select(svgRef.current);

    // Count how many paths we find
    let foundPaths = 0;
    let totalPaths = 0;

    // Helper function to create and add propagation entry - MOVED UP
    function createPropagationEntry(
      pathElement: SVGPathElement,
      conn: Connection,
      delay: number,
      sourceKey: string,
      model: Map<string, SignalPropagation[]>
    ) {
      const propagation: SignalPropagation = {
        wire: conn.wire,
        path: pathElement,
        fromComponent: conn.from.component,
        toComponent: conn.to.component,
        delay,
        value: false,
        arrivalTime: 0
      };

      // Add to model - signals flow from source to destination
      if (!model.has(sourceKey)) {
        model.set(sourceKey, []);
      }
      model.get(sourceKey)!.push(propagation);
    }

    // Initialize with input ports
    Object.entries(circuitData.ports)
      .filter(([_, direction]) => direction === 'input')
      .forEach(([portName, _]) => {
        model.set(portName, []);
      });

    // Add signal propagations for each connection
    connections.forEach((conn, i) => {
      totalPaths++;

      // Define sourceKey for this connection - based on the from component
      let sourceKey = conn.from.component;
      if (circuitData.ports[conn.from.component]) {
        sourceKey = conn.from.component; // It's a port
      }

      // Get delay for this wire
      const delay = getDelayForWire(conn.wire, circuitData);

      // Try to find the path element for this connection by wire name
      const pathElement = svg.select<SVGPathElement>(`path[data-wire="${conn.wire}"]`).node();

      if (!pathElement) {
        // If no path found by wire, try by connection index
        const altPath = svg.select<SVGPathElement>(`path.connection-path:nth-child(${i + 1})`).node();
        if (!altPath) {
          console.warn(`No path found for connection: ${conn.from.component} -> ${conn.to.component} (wire: ${conn.wire})`);
          return;
        }

        // Make sure the path is valid (not inside a component)
        if (altPath.getTotalLength() < 10) {
          console.warn(`Path for ${conn.wire} is too short, likely inside a component`);
          return;
        }

        foundPaths++;

        // Use this alternative path
        createPropagationEntry(altPath, conn, delay, sourceKey, model);
      } else {
        // Validate the path we found
        if (pathElement.getTotalLength() < 10) {
          console.warn(`Path for ${conn.wire} is too short, likely inside a component`);
          return;
        }

        foundPaths++;

        // Use the path we found by wire name
        createPropagationEntry(pathElement, conn, delay, sourceKey, model);
      }
    });

    console.log(`Path elements found: ${foundPaths}/${totalPaths}`);
    console.log("Components in model:", Array.from(model.keys()).slice(0, 10));
    return model;
  }

  // Update the getDelayForWire function to ensure reasonable values
  function getDelayForWire(wire: string, circuit: CircuitData): number {
    if (!circuit || !circuit.timing || !circuit.timing.delays) {
      // Default delay for non-timing circuits
      return 500;
    }

    const found = circuit.timing.delays.find(d => d.instance && d.instance.includes(wire));
    if (found && found.max_delay && found.max_delay > 0) {
      // Convert to milliseconds but cap at reasonable values
      let delay = (found.max_delay / 1000) * 100;
      return Math.min(Math.max(delay, 100), 2000); // Min 100ms, Max 2000ms
    }

    // Default delay value - moderate speed
    return 500;
  }

  // -----------------------------------------------------------------------
  // Simulate clock cycle.
  // -----------------------------------------------------------------------
  function simulateClockCycle(initialInputs: Record<string, boolean>) {
    if (!circuitData || !svgRef.current) return;

    // Create a propagation model based on circuit topology
    const propagationModel = buildCircuitPropagationModel(
      circuitData,
      [...simplifiedConnections, ...portConnections.map(pc => ({
        wire: pc.wire,
        from: { component: pc.portName, type: pc.direction === 'input' ? 'output' : 'input', pinIndex: 0 },
        to: { component: pc.component, type: pc.direction === 'input' ? 'input' : 'output', pinIndex: pc.pinIndex }
      }))]
    );

    // Track component states (copy current state)
    const newComponentStates = { ...componentStates };

    // Initialize states for components that don't have state yet
    simplifiedComponents.forEach(comp => {
      if (!newComponentStates[comp.name]) {
        newComponentStates[comp.name] = {
          inputs: {},
          outputs: {},
          lastClock: false
        };
      }
    });

    // Set initial input values from ports
    const currentValues: Record<string, boolean> = {};
    Object.entries(initialInputs).forEach(([port, value]) => {
      currentValues[port] = value;
      // Initialize port states if needed
      if (!newComponentStates[port]) {
        newComponentStates[port] = {
          inputs: {},
          outputs: { 0: value },
          lastClock: false
        };
      } else {
        // Update port output state
        newComponentStates[port].outputs[0] = value;
      }
    });

    // Queue for signal propagation, with timing
    const signalQueue: Array<{
      component: string,
      componentType: string,
      pinIndex: number,
      value: boolean,
      time: number,
      wire: string,
      path: SVGPathElement | null
    }> = [];

    // Start with input ports
    Object.entries(initialInputs).forEach(([port, value]) => {
      // Find outgoing signals from this port
      const outgoing = propagationModel.get(port) || [];
      outgoing.forEach(signal => {
        const delay = useRealisticTiming ? signal.delay : 200;
        signalQueue.push({
          component: signal.toComponent,
          componentType: simplifiedComponents.find(c => c.name === signal.toComponent)?.type || '',
          pinIndex: parseInt(signal.toComponent.split(':')[1]) || 0,
          value,
          time: delay,
          wire: signal.wire,
          path: signal.path
        });
      });
    });

    // Process queue in time order
    signalQueue.sort((a, b) => a.time - b.time);

    // Used to track which paths we've animated to avoid duplicates
    const animatedPaths = new Set<string>();

    while (signalQueue.length > 0) {
      const { component, componentType, pinIndex, value, time, wire, path } = signalQueue.shift()!;

      // Ensure component has a state
      if (!newComponentStates[component]) {
        newComponentStates[component] = {
          inputs: {},
          outputs: {},
          lastClock: false
        };
      }

      // Update input state for this component
      newComponentStates[component].inputs[pinIndex] = value;

      // Store old outputs to check if they changed
      const oldOutputs = { ...newComponentStates[component].outputs };

      // Process the component's logic to get new outputs
      const foundComponent = simplifiedComponents.find(c => c.name === component);
      const outputs = processComponentLogic(
        component,
        foundComponent?.type || componentType,
        newComponentStates[component].inputs,
        oldOutputs,
        newComponentStates[component].lastClock
      );

      // Update component state with new outputs
      newComponentStates[component].outputs = outputs;

      // Handle clock state for sequential logic
      if ((component.toLowerCase().includes('clk') || component.toLowerCase().includes('clock')) &&
        wire.toLowerCase().includes('clk')) {
        newComponentStates[component].lastClock = value;
      }

      // Check if any outputs changed
      let outputsChanged = false;
      Object.entries(outputs).forEach(([outPinIdxStr, outValue]) => {
        // Convert string key to number explicitly
        const outPinIdx = parseInt(outPinIdxStr);

        // Now use the numeric index to access oldOutputs
        if (oldOutputs[outPinIdx] !== outValue) {
          outputsChanged = true;
        }
      });

      // If outputs changed, propagate to next components
      if (outputsChanged) {
        // Get outgoing signals from this component
        const outgoingSignals = propagationModel.get(component) || [];

        outgoingSignals.forEach(signal => {
          // Calculate delay for this signal
          const signalDelay = useRealisticTiming ? signal.delay : 200;
          const arrivalTime = time + signalDelay;
          const needsReversal = shouldReversePath(signal.path);

          // Create a unique path ID to avoid duplicate animations
          const pathId = `${signal.fromComponent}-${signal.toComponent}-${signal.wire}`;
          if (!animatedPaths.has(pathId) && signal.path) {
            // Animate the signal pulse
            animatePulseOnce(
              signal.path,
              useRealisticTiming ? signalDelay : 1000,
              getWireColor(signal.wire),
              outputs[0] || false,  // This is correct
              time,
              needsReversal
            );
            animatedPaths.add(pathId);
          }

          // Queue up the signal arrival at the next component
          signalQueue.push({
            component: signal.toComponent,
            componentType: '',
            pinIndex: signal.toComponent.includes(':') ?
              parseInt(signal.toComponent.split(':')[1]) : 0,
            value: outputs[0], // FIXED: Always use numeric index 0
            time: arrivalTime,
            wire: signal.wire,
            path: signal.path
          });
        });

        // Resort queue by time
        signalQueue.sort((a, b) => a.time - b.time);
      }
    }

    // Update the component states
    setComponentStates(newComponentStates);

    // Update signal values display
    const newSignalValues: Record<string, boolean> = {};
    Object.entries(newComponentStates).forEach(([component, state]) => {
      if (state.outputs[0] !== undefined) {
        newSignalValues[component] = state.outputs[0];
      }
    });
    setSignalValues(newSignalValues);
  }
  // Add this helper function

  function shouldReversePath(path: SVGPathElement): boolean {
    try {
      // A simple heuristic: if the path ends to the left of where it starts,
      // it's probably going in the wrong direction for typical left-to-right signal flow
      const start = path.getPointAtLength(0);
      const end = path.getPointAtLength(path.getTotalLength());

      // For typical LTR circuit layouts, we want signals to move right
      return end.x < start.x;
    } catch (e) {
      console.error("Error checking path direction:", e);
      return false;
    }
  }

  // -----------------------------------------------------------------------
  // Get color for a wire based on its type.
  // -----------------------------------------------------------------------
  function getWireColor(wire: string): string {
    const wireName = wire.toLowerCase();
    if (wireName.includes('clk')) return '#ffff00'; // Yellow for clock
    if (wireName.includes('reset')) return '#ff0000'; // Red for reset
    if (wireName.includes('d')) return '#00ff00'; // Green for data
    if (wireName.includes('q')) return '#00ffff'; // Cyan for outputs
    return '#ffffff'; // White default
  }

  // -----------------------------------------------------------------------
  // Process component logic based on its name.
  // -----------------------------------------------------------------------

  function processComponentLogic(
    componentName: string,
    componentType: string,
    inputStates: Record<number, boolean>,
    previousOutputs: Record<number, boolean> = {},
    lastClock?: boolean
  ): Record<number, boolean> {
    const type = componentType.toLowerCase();
    const name = componentName.toLowerCase();
    const outputs: Record<number, boolean> = { ...previousOutputs };

    // Special handling based on component type
    if (type.includes('dff') || name.includes('dff') || name.includes('flip') || name.includes('flop')) {
      // D Flip-flop - only changes on clock edge
      // Find clock input (usually has index 0 or 1)
      const clockPinIndex = Object.keys(inputStates).find(idx =>
        parseInt(idx) === 0 || parseInt(idx) === 1
      );

      if (clockPinIndex) {
        const clock = inputStates[parseInt(clockPinIndex)];
        const prevClock = lastClock ?? false;

        // Rising edge detected
        if (clock && !prevClock) {
          // Find data input (not the clock)
          const dataPinIndex = Object.keys(inputStates)
            .find(idx => parseInt(idx) !== parseInt(clockPinIndex));

          if (dataPinIndex) {
            // On clock rising edge, output takes value of D input
            const data = inputStates[parseInt(dataPinIndex)];
            // Usually output is on pin 0
            outputs[0] = data;
          }
        }

        // Update clock state
        return outputs;
      }
    }
    else if (type.includes('and') || name.includes('and')) {
      // AND gate - only true if ALL inputs are true
      const allInputsTrue = Object.values(inputStates).every(val => val);
      outputs[0] = allInputsTrue;
    }
    else if (type.includes('or') || name.includes('or')) {
      // OR gate - true if ANY input is true
      const anyInputTrue = Object.values(inputStates).some(val => val);
      outputs[0] = anyInputTrue;
    }
    else if (type.includes('not') || name.includes('not') || name.includes('inv')) {
      // NOT gate - inverts the input
      outputs[0] = !Object.values(inputStates)[0];
    }
    else if (type.includes('xor')) {
      // XOR gate - true if odd number of inputs are true
      const trueCount = Object.values(inputStates).filter(val => val).length;
      outputs[0] = trueCount % 2 === 1;
    }
    else if (type.includes('nand')) {
      // NAND gate - false only if ALL inputs are true
      const allInputsTrue = Object.values(inputStates).every(val => val);
      outputs[0] = !allInputsTrue;
    }
    else if (type.includes('nor')) {
      // NOR gate - true only if ALL inputs are false
      const anyInputTrue = Object.values(inputStates).some(val => val);
      outputs[0] = !anyInputTrue;
    }
    else if (type.includes('buf') || type.includes('buffer')) {
      // Buffer - passes input to output
      outputs[0] = Object.values(inputStates)[0];
    }
    else {
      // Default passthrough for unknown components
      // Just pass first input to first output
      if (Object.keys(inputStates).length > 0) {
        outputs[0] = Object.values(inputStates)[0];
      }
    }

    return outputs;
  }

  // -----------------------------------------------------------------------
  // Get delay factor for a wire.
  // -----------------------------------------------------------------------


  // -----------------------------------------------------------------------
  // Animate pulses on clock cycle change.
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (!svgRef.current || !circuitData) return;

    // For realistic timing, use our simulation model
    if (useRealisticTiming) {
      // Set up sample input values - in a real app you'd get these from user controls
      const inputValues: Record<string, boolean> = {};

      // Detect clock inputs
      Object.entries(circuitData.ports)
        .filter(([portName, direction]) =>
          direction === 'input' && portName.toLowerCase().includes('clk'))
        .forEach(([portName]) => {
          // Toggle clock on each cycle
          inputValues[portName] = clockCycle % 2 === 0;
        });

      // Set other inputs to sample values
      Object.entries(circuitData.ports)
        .filter(([portName, direction]) =>
          direction === 'input' && !portName.toLowerCase().includes('clk'))
        .forEach(([portName]) => {
          if (portName.toLowerCase().includes('reset')) {
            // Reset is typically active low, so high (true) means not reset
            inputValues[portName] = true;
          } else if (portName.toLowerCase().includes('d')) {
            // Toggle D input every other clock cycle
            inputValues[portName] = Math.floor(clockCycle / 2) % 2 === 0;
          } else {
            // Default other inputs to high
            inputValues[portName] = true;
          }
        });

      // Run the simulation
      simulateClockCycle(inputValues);
    }
    // Basic animation for non-realistic timing
    else {
      const svg = d3.select(svgRef.current);
      svg.selectAll<SVGPathElement, unknown>('path.connection-path')
        .each(function () {
          const wire = this.getAttribute('data-wire') || '';
          const color = getWireColor(wire);
          const baseDuration = 2000;
          const finalDuration = baseDuration / animationSpeed;
          animatePulseOnce(this as SVGPathElement, finalDuration, color, true);
        });
    }
  }, [clockCycle, circuitData, animationSpeed, useRealisticTiming]);

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


      })
      .on('end', function () {
        d3.select(this).classed('dragging', false);
      });
    svg.selectAll<SVGGElement, unknown>('.port-node').call(dragPort as any);
  }, [nodePositions, portPositions]);


  function findBestComponentMatch(componentName: string): PositionedComponent | undefined {
    // Normalize the name by removing backslashes for comparison
    const normalizeForComparison = (name: string) => name.replace(/\\/g, '');
    const normalizedSearchName = normalizeForComparison(componentName);

    // Try exact match with optional backslash
    let match = nodePositions.find(n =>
      n.name === componentName ||
      n.name === componentName.replace(/\\/g, '') ||
      normalizeForComparison(n.name) === normalizedSearchName
    );
    if (match) return match;

    // Try case-insensitive match with normalized names
    match = nodePositions.find(n =>
      normalizeForComparison(n.name).toLowerCase() === normalizedSearchName.toLowerCase()
    );
    if (match) return match;

    // Try fuzzy match with normalized names
    match = nodePositions.find(n => {
      const normalizedNodeName = normalizeForComparison(n.name).toLowerCase();
      const normalizedCompName = normalizedSearchName.toLowerCase();
      return normalizedNodeName.includes(normalizedCompName) ||
        normalizedCompName.includes(normalizedNodeName);
    });

    return match;
  }
  useEffect(() => {
    // Force animation on paths when they first appear
    if (svgRef.current && simplifiedConnections.length > 0) {
      // Wait for SVG to be fully rendered
      setTimeout(() => {
        console.log("Testing animations directly...");
        const svg = d3.select(svgRef.current);

        const paths = svg.selectAll<SVGPathElement, unknown>("path.connection-path")
          .filter(function () {
            const wire = this.getAttribute('data-wire');
            // Explicitly ensure we return a boolean value
            return wire !== null && wire !== "" && this.getTotalLength() >= 10;
          })
          .nodes();

        console.log(`Found ${paths.length} valid path elements to animate`);

        // Animate a few paths to test
        paths.slice(0, Math.min(5, paths.length)).forEach((path, i) => {
          console.log(`Testing animation on path ${i}`);
          // Check if path needs reversal
          const needsReversal = shouldReversePath(path);

          // Use a timeout to stagger animations
          setTimeout(() => {
            animatePulseOnce(path, 1000, "#ffff00", true, 0, needsReversal);
          }, i * 200);
        });
      }, 1000); // Give SVG time to render
    }
  }, [simplifiedConnections.length, svgRef.current]);

  useEffect(() => {
    console.log("RENDER DIAGNOSTICS:");
    console.log("- simplifiedConnections count:", simplifiedConnections.length);
    console.log("- nodePositions count:", nodePositions.length);
    console.log("- pinPositions count:", Object.keys(pinPositions).length);

    if (simplifiedConnections.length > 0 && nodePositions.length > 0) {
      // Check sample connections
      console.log("Sample connections:");
      simplifiedConnections.slice(0, 3).forEach((conn, i) => {
        const fromMatch = findBestComponentMatch(conn.from.component);
        const toMatch = findBestComponentMatch(conn.to.component);
        console.log(`Conn ${i}: ${conn.from.component} → ${conn.to.component}`);
        console.log(`   From match: ${fromMatch?.name || 'MISSING'}`);
        console.log(`   To match: ${toMatch?.name || 'MISSING'}`);
      });
    }
  }, [simplifiedConnections, nodePositions]);

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
  }

  return (
    <div className="simplified-circuit-visualizer">
      <div className="controls">
  <div className="animation-controls">
    <div className="control-group main-controls">
      <button 
        className={`control-button ${isRunning ? 'active' : ''}`}
        onClick={() => setIsRunning(!isRunning)}
        title={isRunning ? "Pause animation" : "Run continuous animation"}
      >
        {isRunning ? "⏸ Pause" : "▶️ Run"}
      </button>
      
      <button 
        className="control-button step-button"
        onClick={() => setClockCycle(c => c + 1)}
        title="Advance one clock cycle"
      >
        ⏭️ Step
      </button>
      
      <div className="cycle-counter">
        Cycle: <span className="cycle-value">{clockCycle}</span>
      </div>
    </div>
    
    <div className="control-group speed-controls">
      <label title="Adjust animation speed">
        <span className="control-label">Speed:</span>
        <input
          type="range"
          min="0.5"
          max="5"
          step="0.5"
          value={animationSpeed}
          onChange={(e) => setAnimationSpeed(parseFloat(e.target.value))}
          className="speed-slider"
        />
        <span className="speed-value">{animationSpeed}×</span>
      </label>
    </div>
    
    <div className="control-group option-controls">
      <label className="checkbox-label" title="Use accurate timing constraints from circuit data">
        <input
          type="checkbox"
          checked={useRealisticTiming}
          onChange={() => setUseRealisticTiming(prev => !prev)}
        />
        <span>Realistic timing</span>
      </label>
      
      <label className="checkbox-label" title="Show component signal states">
        <input
          type="checkbox"
          checked={showDebug}
          onChange={() => setShowDebug(prev => !prev)}
        />
        <span>Show states</span>
      </label>
    </div>
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
            const fromComponent = findBestComponentMatch(conn.from.component);
            const toComponent = findBestComponentMatch(conn.to.component);

            if (!fromComponent || !toComponent) return null;

            // Get pin positions using fallback if needed
            const startPos = pinPositions[fromComponent.name]?.outputs[conn.from.pinIndex] ||
              { x: fromComponent.x + fromComponent.width / 2, y: fromComponent.y };

            const endPos = pinPositions[toComponent.name]?.inputs[conn.to.pinIndex] ||
              { x: toComponent.x - toComponent.width / 2, y: toComponent.y };

            return (
              <path
                key={`conn-${i}`}
                className="connection-path"
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
              {/* Show component state */}
              {showDebug && componentStates[node.name] && (
                <g className="component-state" transform="translate(0, -35)">
                  <rect
                    x={-45}
                    y={-15}
                    width={90}
                    height={20}
                    rx="3"
                    fill="#334"
                    stroke="#88f"
                    strokeWidth="1"
                    opacity="0.7"
                  />
                  <text
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill="#fff"
                    fontSize="10"
                  >
                    {Object.entries(componentStates[node.name].outputs)
                      .map(([pin, val]) => `Out${pin}:${val ? '1' : '0'}`)
                      .join(', ')}
                  </text>
                </g>
              )}

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
