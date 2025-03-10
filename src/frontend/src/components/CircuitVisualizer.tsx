import React, { useEffect, useState, useMemo } from "react";
import * as d3 from "d3";

interface Component {
  type: string;
  name: string;
}

interface Interconnect {
  name: string;
  type: string;
  source?: string;
  target?: string;
  delay?: {
    rise: string;
    fall: string;
  };
}

interface CircuitData {
  module: string;
  ports?: { [key: string]: string };
  wires?: string[];
  components: Component[];
  interconnects?: Interconnect[];
}

interface CircuitVisualizerProps {
  jsonPath?: string;
  jsonFile?: string;
}

interface NodeDatum extends d3.SimulationNodeDatum {
  id: string;
  type: string;
}

interface LinkDatum extends d3.SimulationLinkDatum<NodeDatum> {
  name?: string;
}

const CircuitVisualizer: React.FC<CircuitVisualizerProps> = ({ jsonPath, jsonFile }) => {
  const [circuitData, setCircuitData] = useState<CircuitData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  // Generate a unique SVG id
  const svgId = useMemo(() => `circuit-svg-${Math.random().toString(36).substring(7)}`, []);
  const filePath = jsonPath || jsonFile;

  // Fetch and process the circuit data
  useEffect(() => {
    if (!filePath) {
      setError("No circuit file path provided");
      return;
    }

    setLoading(true);
    setError(null);

    const fullPath = (() => {
      if (!filePath) return "";
      if (filePath.startsWith('http')) return filePath;
      
      // Determine if we're in development mode
      // @ts-ignore
      const isDevelopment = process.env.NODE_ENV === 'development' ||
        window.location.hostname === 'localhost' ||
        window.location.hostname === '127.0.0.1';
      
      const filename = filePath.split('/').pop();
      const cleanPath = filePath.includes('/uploads/')
        ? filePath
        : `/uploads/${filename}`;
      return isDevelopment ? `http://localhost:5001${cleanPath}` : cleanPath;
    })();

    fetch(fullPath, {
      headers: { 'Accept': 'application/json' },
      mode: 'cors'
    })
      .then(response => response.text())
      .then(text => {
        try {
          const parsed = JSON.parse(text);
          if (!parsed || typeof parsed !== 'object') {
            throw new Error("Invalid JSON structure");
          }
          return parsed;
        } catch (err) {
          console.error("JSON Parse Error:", err);
          throw new Error("Invalid JSON format");
        }
      })
      .then((data: CircuitData) => {
        // Ensure default properties exist
        data.interconnects = data.interconnects || [];
        data.wires = data.wires || [];
        data.ports = data.ports || {};
        data.components = data.components || [];

        // Generate interconnects if none exist
        if (data.interconnects.length === 0 && data.wires.length > 0) {
          console.log("Generating interconnects from wires:", data.wires);

          // Example: if module indicates a DFF circuit, try connecting D, LUT and Q
          if (data.module.includes("DFlipFlop") || data.module.includes("DFF")) {
            const dffs = data.components.filter(c => c.type.toUpperCase() === "DFF");
            const luts = data.components.filter(c => c.type.toUpperCase() === "LUT");
            if (luts.length > 0 && dffs.length > 0) {
              data.interconnects.push({
                name: "input_to_lut",
                type: "wire",
                source: "D",
                target: luts[0].name
              });
              for (let i = 0; i < Math.min(luts.length, dffs.length); i++) {
                data.interconnects.push({
                  name: `lut_to_dff_${i}`,
                  type: "wire",
                  source: luts[i].name,
                  target: dffs[i].name
                });
              }
              if (dffs.length > 0) {
                data.interconnects.push({
                  name: "dff_to_output",
                  type: "wire",
                  source: dffs.length > 0 ? dffs[dffs.length - 1].name : "",
                  target: "Q"
                });
              }
            }
          } else {
            // For other circuits, try to generate interconnects from wire naming conventions
            data.wires.forEach(wire => {
              if (wire.includes("_output_") || wire.includes("_input_")) {
                let source: string | undefined;
                let target: string | undefined;
                for (let i = 0; i < data.components.length; i++) {
                  if (wire.includes(data.components[i].name)) {
                    source = data.components[i].name;
                    for (let j = 0; j < data.components.length; j++) {
                      if (i !== j && wire.includes(data.components[j].name)) {
                        target = data.components[j].name;
                        break;
                      }
                    }
                    if (!target) {
                      if (wire.includes("_input_")) {
                        target = data.components[i].name;
                        source = wire.split("_input_")[0];
                        if (!data.components.some(c => c.name === source)) {
                          data.components.push({ type: "INPUT", name: source });
                        }
                      } else if (wire.includes("_output_")) {
                        target = wire.split("_output_")[1] || `out_${i}`;
                        if (!data.components.some(c => c.name === target)) {
                          data.components.push({ type: "OUTPUT", name: target });
                        }
                      }
                    }
                    break;
                  }
                }
                if (source && target) {
                  data.interconnects?.push({
                    name: wire,
                    type: "wire",
                    source,
                    target
                  });
                }
              }
            });
          }
          // Fallback: if still no interconnects, create a basic chain
          if (data.interconnects.length === 0 && data.components.length > 1) {
            for (let i = 0; i < data.components.length - 1; i++) {
              data.interconnects.push({
                name: `auto_connection_${i}`,
                type: "wire",
                source: data.components[i].name,
                target: data.components[i + 1].name
              });
            }
          }
        }

        // Process ports to add missing input/output components
        const inputs = Object.entries(data.ports)
          .filter(([_, type]) => type === "input")
          .map(([name]) => name.replace(/\\/g, ''));
        const outputs = Object.entries(data.ports)
          .filter(([_, type]) => type === "output")
          .map(([name]) => name.replace(/\\/g, ''));
        inputs.forEach(input => {
          if (!data.components.some(c => c.name === input)) {
            data.components.push({ type: "INPUT", name: input });
          }
        });
        outputs.forEach(output => {
          if (!data.components.some(c => c.name === output)) {
            data.components.push({ type: "OUTPUT", name: output });
          }
        });
        setCircuitData(data);
      })
      .catch(err => {
        console.error("Error loading circuit:", err);
        setError(err.message || "Failed to load circuit data");
      })
      .finally(() => {
        setLoading(false);
      });
  }, [filePath]);

  // D3 Visualization using force simulation
  useEffect(() => {
    if (!circuitData) return;
    console.log("Visualizing circuit:", {
      module: circuitData.module,
      components: circuitData.components.length,
      interconnects: circuitData.interconnects?.length || 0
    });

    const svg = d3.select(`#${svgId}`)
      .attr("width", "100%")
      .attr("height", "100%")
      .style("background", "#f5f5f5");

    // Clear any previous content
    svg.selectAll("*").remove();
    const g = svg.append("g");

    const width = (svg.node() as HTMLElement)?.clientWidth || 800;
    const height = (svg.node() as HTMLElement)?.clientHeight || 600;
    let simulation: d3.Simulation<NodeDatum, LinkDatum>;

    // Prepare nodes with initial random positions (or center them)
    const nodes: NodeDatum[] = circuitData.components.map((comp) => ({
      id: comp.name,
      type: comp.type,
      // Start at random positions around the center
      x: width / 2 + (Math.random() - 0.5) * 100,
      y: height / 2 + (Math.random() - 0.5) * 100,
    }));

    // Prepare links from interconnects that have valid source and target
    const links: LinkDatum[] = (circuitData.interconnects || [])
      .filter(ic => ic.source && ic.target)
      .map(ic => ({
        source: ic.source as string,
        target: ic.target as string,
        name: ic.name,
      }));

    // Create link elements
    const linkSelection = g.selectAll(".link")
      .data(links)
      .enter()
      .append("line")
      .attr("class", "link")
      .attr("stroke", "#666")
      .attr("stroke-width", 2)
      .attr("marker-end", "url(#arrow)");

    // Define marker for arrowheads
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
      .attr("class", "node");

    nodeGroup.call(d3.drag<SVGGElement, NodeDatum>()
      .on("start", (event, d) => {
        if (!event.active && simulation) simulation.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
      })
      .on("drag", (event, d) => {
        d.fx = event.x;
        d.fy = event.y;
      })
      .on("end", (event, d) => {
        if (!event.active && simulation) simulation.alphaTarget(0);
        d.fx = null;
        d.fy = null;
      })
    );

    // Append shapes based on component type
    nodeGroup.each(function (d) {
      const group = d3.select(this);
      const type = d.type.toUpperCase();
      if (type === "INPUT") {
        // Diamond shape for inputs
        group.append("polygon")
          .attr("points", "0,-25 25,0 0,25 -25,0")
          .attr("fill", "#67a9cf")
          .attr("stroke", "#333")
          .attr("stroke-width", 1.5);
      } else if (type === "OUTPUT") {
        // Hexagon for outputs
        group.append("polygon")
          .attr("points", "20,-15 20,15 0,30 -20,15 -20,-15 0,-30")
          .attr("fill", "#ef8a62")
          .attr("stroke", "#333")
          .attr("stroke-width", 1.5);
      } else if (type === "DFF" || type.includes("FLIP")) {
        // Rectangle for DFF/flip-flops
        group.append("rect")
          .attr("width", 80)
          .attr("height", 40)
          .attr("x", -40)
          .attr("y", -20)
          .attr("fill", "#8da0cb")
          .attr("stroke", "#333")
          .attr("stroke-width", 1.5)
          .attr("rx", 5);
      } else if (type.includes("LUT")) {
        // Triangle for LUTs
        group.append("polygon")
          .attr("points", "0,-25 -30,20 30,20")
          .attr("fill", "#e78ac3")
          .attr("stroke", "#333")
          .attr("stroke-width", 1.5);
      } else if (type.includes("MUX")) {
        // Trapezoid for MUXes
        group.append("polygon")
          .attr("points", "-20,-25 20,-25 30,20 -30,20")
          .attr("fill", "#a6d854")
          .attr("stroke", "#333")
          .attr("stroke-width", 1.5);
      } else {
        // Default: circle
        group.append("circle")
          .attr("r", 25)
          .attr("fill", "#ffd92f")
          .attr("stroke", "#333")
          .attr("stroke-width", 1.5);
      }
    });

    // Append text for each node (showing both name and type)
    nodeGroup.append("text")
      .attr("dy", 40)
      .attr("text-anchor", "middle")
      .attr("fill", "#333")
      .text((d) => {
        const shortName = d.id.length > 15 ? d.id.substring(0, 12) + "..." : d.id;
        return shortName;
      });
    nodeGroup.append("text")
      .attr("dy", 5)
      .attr("text-anchor", "middle")
      .attr("fill", "#000")
      .attr("font-weight", "bold")
      .text(d => d.type);

    // Create a force simulation for layout
    simulation = d3.forceSimulation(nodes)
      .force("link", d3.forceLink<NodeDatum, LinkDatum>(links as any).id(d => (d as NodeDatum).id).distance(150))
      .force("charge", d3.forceManyBody().strength(-300))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .on("tick", ticked);

    // Update positions on every simulation tick
    function ticked() {
      nodeGroup.attr("transform", d => `translate(${d.x}, ${d.y})`);
      linkSelection
        .attr("x1", d => (d.source as NodeDatum).x || 0)
        .attr("y1", d => (d.source as NodeDatum).y || 0)
        .attr("x2", d => (d.target as NodeDatum).x || 0)
        .attr("y2", d => (d.target as NodeDatum).y || 0);
    }

    // Add zoom behavior
    const zoom = d3.zoom()
      .scaleExtent([0.1, 10])
      .on("zoom", (event) => {
        g.attr("transform", event.transform);
      });
    svg.call(zoom as any);

    // Optional: Force a refresh if the SVG appears empty (debug)
    setTimeout(() => {
      if (svg.selectAll("*").empty()) {
        console.log("SVG appears empty, forcing a redraw");
        g.attr("transform", "translate(50,50)");
      }
    }, 500);

    // Cleanup on unmount
    return () => {
      if (simulation) simulation.stop();
    };
  }, [circuitData, svgId]);

  if (error) {
    return (
      <div style={{
        width: "100%",
        height: "100%",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        color: "red",
        backgroundColor: "#ffeeee",
        padding: "20px",
        borderRadius: "5px"
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
        width: "100%",
        height: "100%",
        display: "flex",
        justifyContent: "center",
        alignItems: "center"
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
        width: "100%",
        height: "100%",
        display: "flex",
        justifyContent: "center",
        alignItems: "center"
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
        position: "absolute",
        bottom: "10px",
        right: "10px",
        background: "rgba(255,255,255,0.8)",
        padding: "5px",
        borderRadius: "5px",
        fontSize: "12px"
      }}>
        <strong>Circuit:</strong> {circuitData.module}<br />
        <strong>Components:</strong> {circuitData.components.length}<br />
        <strong>Interconnects:</strong> {circuitData.interconnects?.length ?? 0}
      </div>
      <div style={{
        position: "absolute",
        top: "10px",
        left: "10px",
        background: "rgba(0,0,0,0.7)",
        color: "white",
        padding: "10px",
        borderRadius: "5px",
        fontSize: "12px",
        maxWidth: "300px",
        maxHeight: "200px",
        overflow: "auto"
      }}>
        <strong>Debug Info:</strong><br />
        Path: {filePath}<br />
        SVG ID: {svgId}<br />
        <button onClick={() => {
          // Force refresh the visualization
          if (circuitData) {
            const copy = { ...circuitData };
            setCircuitData(null);
            setTimeout(() => setCircuitData(copy), 100);
          }
        }}>Force Refresh</button>
      </div>
    </div>
  );
};

export default CircuitVisualizer;