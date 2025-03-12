import React, { useEffect, useState, useMemo } from "react";
import * as d3 from "d3";

interface Pin {
  wire: string;
  pinIndex: number;
  port?: string;
  constant?: boolean;
  value?: number;
}

interface Component {
  type: string;
  name: string;
  originalType?: string;
  inputs?: Pin[];
  outputs?: Pin[];
}

interface Interconnect {
  name: string;
  type: string;
  datain: string;
  dataout: string;
}

interface CircuitData {
  module: string;
  ports?: { [key: string]: string };
  wires?: string[];
  components: Component[];
  connections?: any[]; // legacy
  interconnects?: Interconnect[];
  delays?: any[];
  summary?: any;
}

interface CircuitVisualizerProps {
  jsonPath?: string;
  jsonFile?: string;
}

interface NodeDatum extends d3.SimulationNodeDatum {
  id: string;
  type: string;
  component: Component;
  x: number;
  y: number;
  width: number;
  height: number;
  inputPinPositions: { x: number; y: number; wire: string }[];
  outputPinPositions: { x: number; y: number; wire: string }[];
  fixed?: boolean;
}

interface LinkDatum extends d3.SimulationLinkDatum<NodeDatum> {
  name?: string;
  // We override source and target to be NodeDatum
  source: NodeDatum;
  target: NodeDatum;
  // And compute start and end offsets
  start: { x: number; y: number };
  end: { x: number; y: number };
}

const CircuitVisualizer: React.FC<CircuitVisualizerProps> = ({ jsonPath, jsonFile }) => {
  const [circuitData, setCircuitData] = useState<CircuitData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const svgId = useMemo(() => `circuit-svg-${Math.random().toString(36).substring(7)}`, []);
  const filePath = jsonPath || jsonFile;

  // Fetch JSON data
  useEffect(() => {
    if (!filePath) {
      setError("No circuit file path provided");
      return;
    }
    setLoading(true);
    setError(null);

    const fullPath = (() => {
      if (!filePath) return "";
      if (filePath.startsWith("http")) return filePath;
      // Determine if we're in development mode
      // @ts-ignore
      const isDevelopment =
        process.env.NODE_ENV === "development" ||
        window.location.hostname === "localhost" ||
        window.location.hostname === "127.0.0.1";
      const filename = filePath.split("/").pop();
      const cleanPath = filePath.includes("/uploads/") ? filePath : `/uploads/${filename}`;
      return isDevelopment ? `http://localhost:5001${cleanPath}` : cleanPath;
    })();

    fetch(fullPath, {
      headers: { Accept: "application/json" },
      mode: "cors",
    })
      .then((response) => response.text())
      .then((text) => {
        try {
          const parsed = JSON.parse(text);
          if (!parsed || typeof parsed !== "object") {
            throw new Error("Invalid JSON structure");
          }
          return parsed;
        } catch (err) {
          console.error("JSON Parse Error:", err);
          throw new Error("Invalid JSON format");
        }
      })
      .then((data: CircuitData) => {
        // Ensure defaults
        data.interconnects = data.interconnects || [];
        data.wires = data.wires || [];
        data.ports = data.ports || {};
        data.components = data.components || [];

        // Add port nodes if not already present
        Object.entries(data.ports).forEach(([portName, portType]) => {
          // Check if a component with this port name already exists
          if (!data.components.some(c => c.name === portName)) {
            data.components.push({
              type: portType.toUpperCase() === "INPUT" ? "INPUT_PORT" : "OUTPUT_PORT",
              name: portName,
              // For ports we add a single pin at a default index 0
              inputs: portType.toLowerCase() === "output" ? [{ wire: portName, pinIndex: 0 }] : [],
              outputs: portType.toLowerCase() === "input" ? [{ wire: portName, pinIndex: 0 }] : []
            });
          }
        });

        setCircuitData(data);
      })
      .catch((err) => {
        console.error("Error loading circuit:", err);
        setError(err.message || "Failed to load circuit data");
      })
      .finally(() => {
        setLoading(false);
      });
  }, [filePath]);

  // Compute node pin positions based on component type and pinIndex
  const computeNodeProperties = (comp: Component, x: number, y: number): {
    width: number;
    height: number;
    inputPinPositions: { x: number; y: number; wire: string }[];
    outputPinPositions: { x: number; y: number; wire: string }[];
  } => {
    let width = 50, height = 50;
    const typeU = comp.type.toUpperCase();
    if (typeU === "DFF" || typeU.includes("FLIP")) {
      width = 80; height = 40;
    } else if (typeU === "LUT" || typeU === "MUX") {
      width = 60; height = 45;
    } else if (typeU === "INPUT_PORT") {
      width = 40; height = 40;
    } else if (typeU === "OUTPUT_PORT") {
      width = 40; height = 40;
    }
    const inputPinPositions: { x: number; y: number; wire: string }[] = [];
    const outputPinPositions: { x: number; y: number; wire: string }[] = [];

    if (comp.inputs && comp.inputs.length > 0) {
      const totalIn = comp.inputs.length;
      const spacing = height / (totalIn + 1);
      comp.inputs.forEach(pin => {
        const idx = pin.pinIndex;
        // For ports and other components, input pins are placed on the left side
        inputPinPositions.push({
          x: -width / 2,
          y: -height / 2 + spacing * (idx + 1),
          wire: pin.wire
        });
      });
    }
    if (comp.outputs && comp.outputs.length > 0) {
      const totalOut = comp.outputs.length;
      const spacing = height / (totalOut + 1);
      comp.outputs.forEach(pin => {
        // For ports and other components, output pins are on the right side
        const idx = pin.pinIndex;
        outputPinPositions.push({
          x: width / 2,
          y: -height / 2 + spacing * (idx + 1),
          wire: pin.wire
        });
      });
    }
    return { width, height, inputPinPositions, outputPinPositions };
  };

  // D3 Visualization
  useEffect(() => {
    if (!circuitData) return;
    console.log("Visualizing circuit:", {
      module: circuitData.module,
      components: circuitData.components.length,
      interconnects: circuitData.interconnects?.length || 0,
    });

    const svg = d3.select(`#${svgId}`)
      .attr("width", "100%")
      .attr("height", "100%")
      .style("background", "#f5f5f5");
    svg.selectAll("*").remove();
    const g = svg.append("g");
    const width = (svg.node() as HTMLElement)?.clientWidth || 800;
    const height = (svg.node() as HTMLElement)?.clientHeight || 600;

    // Create simulation nodes for all components (including ports)
    const nodes: NodeDatum[] = circuitData.components.map((comp) => {
      // For port nodes, position them on left (for INPUT_PORT) or right (for OUTPUT_PORT)
      let x: number, y: number;
      if (comp.type === "INPUT_PORT") {
        x = 50;
        // Distribute vertically based on order (you might refine this later)
        y = Math.random() * height;
      } else if (comp.type === "OUTPUT_PORT") {
        x = width - 50;
        y = Math.random() * height;
      } else {
        x = width / 2 + (Math.random() - 0.5) * 100;
        y = height / 2 + (Math.random() - 0.5) * 100;
      }
      const { width: compWidth, height: compHeight, inputPinPositions, outputPinPositions } =
        computeNodeProperties(comp, x, y);
      return {
        id: comp.name,
        type: comp.type,
        component: comp,
        x, y,
        width: compWidth,
        height: compHeight,
        inputPinPositions,
        outputPinPositions,
      };
    });

    // Build a net map that maps net names to an array of { node, direction, pos }
    const netMap: { [net: string]: { node: NodeDatum, direction: "in" | "out", pos: { x: number, y: number } }[] } = {};
    nodes.forEach(node => {
      node.inputPinPositions.forEach(pin => {
        if (!netMap[pin.wire]) netMap[pin.wire] = [];
        netMap[pin.wire].push({
          node,
          direction: "in",
          pos: { x: node.x + pin.x, y: node.y + pin.y }
        });
      });
      node.outputPinPositions.forEach(pin => {
        if (!netMap[pin.wire]) netMap[pin.wire] = [];
        netMap[pin.wire].push({
          node,
          direction: "out",
          pos: { x: node.x + pin.x, y: node.y + pin.y }
        });
      });
    });

    // Create links from interconnects based on the netMap.
    const links: LinkDatum[] = [];
    (circuitData.interconnects || []).forEach(inter => {
      const srcCandidates = netMap[inter.datain] || [];
      const tgtCandidates = netMap[inter.dataout] || [];
      const src = srcCandidates.find(n => n.direction === "out");
      const tgt = tgtCandidates.find(n => n.direction === "in");
      if (src && tgt) {
        links.push({
          source: src.node,
          target: tgt.node,
          name: inter.name,
          start: src.pos,
          end: tgt.pos
        });
      }
    });

    // Draw links
    const linkSelection = g.selectAll(".link")
      .data(links)
      .enter()
      .append("line")
      .attr("class", "link")
      .attr("stroke", "#666")
      .attr("stroke-width", 2)
      .attr("marker-end", "url(#arrow)")
      .attr("x1", d => d.start.x)
      .attr("y1", d => d.start.y)
      .attr("x2", d => d.end.x)
      .attr("y2", d => d.end.y);

    // Define arrow marker
    svg.append("defs").append("marker")
      .attr("id", "arrow")
      .attr("viewBox", "0 -5 10 10")
      .attr("refX", 15)
      .attr("refY", 0)
      .attr("markerWidth", 6)
      .attr("markerHeight", 6)
      .attr("orient", "auto")
      .append("path")
      .attr("d", "M0,-5L10,0L0,5")
      .attr("fill", "#666");

    // Create node groups
    const nodeGroup = g.selectAll(".node")
      .data(nodes)
      .enter()
      .append("g")
      .attr("class", "node")
      .attr("transform", d => `translate(${d.x}, ${d.y})`);

    // Draw shapes based on component type
    nodeGroup.each(function (d: NodeDatum) {
      const group = d3.select(this);
      const type = d.type.toUpperCase();
      let shapeWidth = d.width, shapeHeight = d.height;
      if (type === "INPUT_PORT") {
        group.append("rect")
          .attr("width", shapeWidth)
          .attr("height", shapeHeight)
          .attr("x", -shapeWidth / 2)
          .attr("y", -shapeHeight / 2)
          .attr("fill", "#67a9cf")
          .attr("stroke", "#333")
          .attr("stroke-width", 1.5);
      } else if (type === "OUTPUT_PORT") {
        group.append("rect")
          .attr("width", shapeWidth)
          .attr("height", shapeHeight)
          .attr("x", -shapeWidth / 2)
          .attr("y", -shapeHeight / 2)
          .attr("fill", "#ef8a62")
          .attr("stroke", "#333")
          .attr("stroke-width", 1.5);
      } else if (type === "DFF" || type.includes("FLIP")) {
        group.append("rect")
          .attr("width", shapeWidth)
          .attr("height", shapeHeight)
          .attr("x", -shapeWidth / 2)
          .attr("y", -shapeHeight / 2)
          .attr("fill", "#8da0cb")
          .attr("stroke", "#333")
          .attr("stroke-width", 1.5)
          .attr("rx", 5);
      } else if (type.includes("LUT")) {
        group.append("polygon")
          .attr("points", `0,${-shapeHeight/2} ${-shapeWidth/2},${shapeHeight/2} ${shapeWidth/2},${shapeHeight/2}`)
          .attr("fill", "#e78ac3")
          .attr("stroke", "#333")
          .attr("stroke-width", 1.5);
      } else if (type.includes("MUX")) {
        group.append("polygon")
          .attr("points", `${-shapeWidth/2},${-shapeHeight/2} ${shapeWidth/2},${-shapeHeight/2} ${shapeWidth/2+10},${shapeHeight/2} ${-shapeWidth/2-10},${shapeHeight/2}`)
          .attr("fill", "#a6d854")
          .attr("stroke", "#333")
          .attr("stroke-width", 1.5);
      } else {
        group.append("circle")
          .attr("r", shapeWidth / 2)
          .attr("fill", "#ffd92f")
          .attr("stroke", "#333")
          .attr("stroke-width", 1.5);
      }

      // Draw input pins with labels
      d.inputPinPositions.forEach(pin => {
        group.append("circle")
          .attr("cx", -shapeWidth / 2)
          .attr("cy", pin.y + shapeHeight / 2)
          .attr("r", 3)
          .attr("fill", "#333");
        group.append("text")
          .attr("x", -shapeWidth / 2 - 5)
          .attr("y", pin.y + shapeHeight / 2 + 4)
          .attr("text-anchor", "end")
          .attr("font-size", "8px")
          .text(pin.wire);
      });
      // Draw output pins with labels
      d.outputPinPositions.forEach(pin => {
        group.append("circle")
          .attr("cx", shapeWidth / 2)
          .attr("cy", pin.y + shapeHeight / 2)
          .attr("r", 3)
          .attr("fill", "#333");
        group.append("text")
          .attr("x", shapeWidth / 2 + 5)
          .attr("y", pin.y + shapeHeight / 2 + 4)
          .attr("text-anchor", "start")
          .attr("font-size", "8px")
          .text(pin.wire);
      });
      // Component label
      group.append("text")
        .attr("dy", shapeHeight / 2 + 15)
        .attr("text-anchor", "middle")
        .attr("fill", "#333")
        .text(d.id.length > 15 ? d.id.substring(0, 12) + "..." : d.id);
    });

    // Create a force simulation
    const simulation = d3.forceSimulation<NodeDatum, LinkDatum>(nodes)
      .force("link", d3.forceLink<NodeDatum, LinkDatum>(links).id(d => d.id).distance(150))
      .force("charge", d3.forceManyBody().strength(-300))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .on("tick", ticked);

    function ticked() {
      nodeGroup.attr("transform", d => `translate(${d.x}, ${d.y})`);

      // Update pin positions for each node
      nodes.forEach(node => {
        const { inputPinPositions, outputPinPositions } = computeNodeProperties(node.component, node.x, node.y);
        node.inputPinPositions = inputPinPositions;
        node.outputPinPositions = outputPinPositions;
      });

      // Recompute link start/end positions using netMap lookup
      nodes.forEach(node => {
        // Update netMap based on new node positions (rebuild netMap)
      });
      const newNetMap: { [net: string]: { node: NodeDatum, direction: "in" | "out", pos: { x: number, y: number } }[] } = {};
      nodes.forEach(node => {
        node.inputPinPositions.forEach(pin => {
          if (!newNetMap[pin.wire]) newNetMap[pin.wire] = [];
          newNetMap[pin.wire].push({
            node,
            direction: "in",
            pos: { x: node.x + pin.x, y: node.y + pin.y }
          });
        });
        node.outputPinPositions.forEach(pin => {
          if (!newNetMap[pin.wire]) newNetMap[pin.wire] = [];
          newNetMap[pin.wire].push({
            node,
            direction: "out",
            pos: { x: node.x + pin.x, y: node.y + pin.y }
          });
        });
      });
      // Update links with new positions using the interconnect net names
      links.forEach(link => {
        const srcCandidates = newNetMap[getInterconnectNet(link, "datain")] || [];
        const tgtCandidates = newNetMap[getInterconnectNet(link, "dataout")] || [];
        const src = srcCandidates.find(n => n.direction === "out");
        const tgt = tgtCandidates.find(n => n.direction === "in");
        link.start = src ? { x: src.pos.x, y: src.pos.y } : { x: link.source.x, y: link.source.y };
        link.end = tgt ? { x: tgt.pos.x, y: tgt.pos.y } : { x: link.target.x, y: link.target.y };
      });

      linkSelection
        .attr("x1", d => d.start.x)
        .attr("y1", d => d.start.y)
        .attr("x2", d => d.end.x)
        .attr("y2", d => d.end.y);
    }

    // Helper to get the interconnect net name for a given direction from a link.
    // Here we assume the link name (set from interconnect.name) encodes the net.
    function getInterconnectNet(link: LinkDatum, dir: "datain" | "dataout"): string {
      // In our JSON, the interconnect object has datain and dataout fields.
      // We stored the interconnect name in link.name.
      // To get the net, we can search the original circuitData.interconnects for a matching name.
      const inter = (circuitData?.interconnects || []).find(i => i.name === link.name);
      if (inter) {
        return dir === "datain" ? inter.datain : inter.dataout;
      }
      return "";
    }

    // Zoom behavior
    const zoom = d3.zoom()
      .scaleExtent([0.1, 10])
      .on("zoom", (event) => {
        g.attr("transform", event.transform);
      });
    svg.call(zoom as any);

    // Drag behavior on nodes
    nodeGroup.call(
      d3.drag<SVGGElement, NodeDatum>()
        .on("start", (event, d) => {
          if (!event.active) simulation.alphaTarget(0.3).restart();
          d.fx = d.x;
          d.fy = d.y;
        })
        .on("drag", (event, d) => {
          d.fx = event.x;
          d.fy = event.y;
        })
        .on("end", (event, d) => {
          if (!event.active) simulation.alphaTarget(0);
          d.fx = null;
          d.fy = null;
        })
    );

    return () => {
      simulation.stop();
    };
  }, [circuitData, svgId]);

  if (error) {
    return (
      <div style={{
        width: "100%", height: "100%", display: "flex", justifyContent: "center", alignItems: "center",
        color: "red", backgroundColor: "#ffeeee", padding: "20px", borderRadius: "5px"
      }}>
        <div>
          <h3>Error Loading Circuit</h3>
          <p>{error}</p>
          <small>Check the browser console for more details</small>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{
        width: "100%", height: "100%", display: "flex", justifyContent: "center", alignItems: "center"
      }}>
        <div style={{ textAlign: "center" }}>
          <h3>Loading Circuit...</h3>
          <p>Please wait while we prepare your visualization</p>
        </div>
      </div>
    );
  }

  if (!circuitData) {
    return (
      <div style={{
        width: "100%", height: "100%", display: "flex", justifyContent: "center", alignItems: "center"
      }}>
        <div style={{ textAlign: "center" }}>
          <h3>No Circuit Data</h3>
          <p>Please select a circuit to visualize</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ width: "100%", height: "100%", position: "relative", border: "1px solid #ccc" }}>
      <svg id={svgId} style={{ width: "100%", height: "100%", minHeight: "400px" }}></svg>
      <div style={{
        position: "absolute", bottom: "10px", right: "10px",
        background: "rgba(255,255,255,0.8)", padding: "5px", borderRadius: "5px", fontSize: "12px"
      }}>
        <strong>Circuit:</strong> {circuitData.module}<br />
        <strong>Components:</strong> {circuitData.components.length}<br />
        <strong>Interconnects:</strong> {circuitData.interconnects?.length ?? 0}
      </div>
    </div>
  );
};

export default CircuitVisualizer;