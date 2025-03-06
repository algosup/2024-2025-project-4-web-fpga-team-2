import React, { useEffect, useState } from "react";
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

// Accept both jsonPath and jsonFile props for backward compatibility
interface CircuitVisualizerProps {
  jsonPath?: string;
  jsonFile?: string;
}

interface Link {
  source: {
    id: string;
    type: string;
    x: number;
    y: number;
  };
  target: {
    id: string;
    type: string;
    x: number;
    y: number;
  };
  name?: string;
}

interface ComponentNode {
  id: string;
  type: string;
  x: number;
  y: number;
}

const CircuitVisualizer: React.FC<CircuitVisualizerProps> = ({ jsonPath, jsonFile }) => {
  const [circuitData, setCircuitData] = useState<CircuitData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const svgId = React.useMemo(() => `circuit-svg-${Math.random().toString(36).substring(7)}`, []);


  // Use either jsonPath or jsonFile prop
  const filePath = jsonPath || jsonFile;
  console.log("Attempting to fetch circuit data from path:", filePath);
  useEffect(() => {
    if (!filePath) {
      setError("No circuit file path provided");
      return;
    }

    setLoading(true);
    setError(null);

    // Replace your URL construction logic with this:
    // Update the URL construction logic
    const fullPath = (() => {
      // If no path provided
      if (!filePath) {
        console.error("No file path provided");
        return "";
      }

      // For development testing with absolute paths
      if (filePath.startsWith('http')) {
        return filePath;
      }

      // Check if we're in development mode
      // @ts-ignore
      const isDevelopment = process.env.NODE_ENV === 'development' ||
        window.location.hostname === 'localhost' ||
        window.location.hostname === '127.0.0.1';

      // Get the filename - strip any directory paths
      const filename = filePath.split('/').pop();

      // If the path already has /uploads/, don't add it again
      const cleanPath = filePath.includes('/uploads/')
        ? filePath
        : `/uploads/${filename}`;

      // For local development with Express server
      if (isDevelopment) {
        // Ensure we don't have duplicate /uploads/ in the path
        return `http://localhost:5001${cleanPath}`;
      }

      // For production deployment
      return cleanPath;
    })();

    console.log("Final URL to fetch:", fullPath);

    fetch(fullPath, {
      headers: {
        'Accept': 'application/json',
      },
      mode: 'cors' // Try with CORS mode
    })
      .then(response => response.text())
      .then(text => {
        console.log("🔍 Raw JSON response:", text.substring(0, 200) + "...");
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
        console.log("✅ Parsed JSON:", data);

        // Add empty arrays for missing properties
        if (!data.interconnects) data.interconnects = [];
        if (!data.wires) data.wires = [];
        if (!data.ports) data.ports = {};
        if (!data.components) data.components = []; // Add this line

        // Generate interconnects from wires if available
        if (data.interconnects.length === 0 && data.wires && data.wires.length > 0) {
          console.log("Generating interconnects from wires:", data.wires);

          // For DFF circuits, create connections between components
          if (data.module.includes("DFlipFlop") || data.module.includes("DFF")) {
            // Find the DFF components and LUTs
            const dffs = data.components.filter(c => c.type === "DFF");
            const luts = data.components.filter(c => c.type === "LUT");

            console.log("Found DFFs:", dffs.length, "and LUTs:", luts.length);

            // Connect from inputs to first LUT
            if (luts.length > 0 && dffs.length > 0) {
              data.interconnects?.push({
                name: "input_to_lut",
                type: "wire",
                source: "D",
                target: luts[0].name
              });

              // Connect from LUTs to DFFs
              for (let i = 0; i < Math.min(luts.length, dffs.length); i++) {
                data.interconnects?.push({
                  name: `lut_to_dff_${i}`,
                  type: "wire",
                  source: luts[i].name,
                  target: dffs[i].name
                });
              }

              // Connect from last DFF to output
              if (dffs.length > 0) {
                data.interconnects.push({
                  name: "dff_to_output",
                  type: "wire",
                  source: dffs[dffs.length - 1].name,
                  target: "Q"
                });
              }
              // If we still have no interconnects, create a basic chain
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
          } else {
            // Replace lines 198-204 with this corrected code:
            // For other circuits, create some basic connections from wires
            // For other circuits, create some basic connections from wires
            data.wires.forEach(wire => {
              if (wire.includes("_output_") || wire.includes("_input_")) {
                const parts = wire.split("_");
                let source: string | null = null; // Add explicit type
                let target: string | null = null; // Add explicit type

                // Try to find component names in the wire name
                for (let i = 0; i < data.components.length; i++) {
                  if (wire.includes(data.components[i].name)) {
                    // Found a component referenced in the wire
                    source = data.components[i].name;

                    // Try to find another component for the target
                    for (let j = 0; j < data.components.length; j++) {
                      if (i !== j && wire.includes(data.components[j].name)) {
                        target = data.components[j].name;
                        break;
                      }
                    }

                    // If no second component found, try to determine if this is input or output
                    if (!target) {
                      if (wire.includes("_input_")) {
                        // For input wires, component is the target
                        target = source;
                        source = wire.split("_input_")[0];

                        // Add the source as a component if it doesn't exist
                        if (!data.components.some(c => c.name === source)) {
                          data.components.push({
                            type: "INPUT",
                            name: source
                          });
                        }
                      } else if (wire.includes("_output_")) {
                        // For output wires, component is the source
                        target = wire.split("_output_")[1] || `out_${i}`;

                        // Add the target as a component if it doesn't exist
                        if (!data.components.some(c => c.name === target)) {
                          data.components.push({
                            type: "OUTPUT",
                            name: target
                          });
                        }
                      }
                    }
                    break;
                  }
                }

                // If we found both source and target, add an interconnect
                if (source && target) {
                  data.interconnects?.push({
                    name: wire,
                    type: "wire",
                    source: source,
                    target: target
                  });
                }
              }
            });
          }
          // If we still have no interconnects, create a basic chain
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

        if (data.ports) {
          const inputs = Object.entries(data.ports)
            .filter(([_, type]) => type === "input")
            .map(([name]) => name.replace(/\\/g, ''));

          const outputs = Object.entries(data.ports)
            .filter(([_, type]) => type === "output")
            .map(([name]) => name.replace(/\\/g, ''));

          console.log("Found inputs:", inputs, "and outputs:", outputs);

          // Add input nodes as components
          inputs.forEach(input => {
            if (!data.components.some(c => c.name === input)) {
              data.components.push({
                type: "INPUT",
                name: input
              });
            }
          });

          // Add output nodes as components
          outputs.forEach(output => {
            if (!data.components.some(c => c.name === output)) {
              data.components.push({
                type: "OUTPUT",
                name: output
              });
            }
          });
        }
        setCircuitData(data);
      })
      .catch(err => {
        console.error("❌ Error loading circuit:", err);
        setError(err.message || "Failed to load circuit data");
      })
      .finally(() => {
        setLoading(false);
      });
  }, [filePath]);



  useEffect(() => {
    if (!circuitData) return;
    console.log("D3 Visualization Effect Running. Circuit Data:",
      circuitData ? {
        module: circuitData.module,
        components: circuitData.components.length,
        interconnects: circuitData.interconnects?.length || 0
      } : "No data");

    // After creating components:

    const svg = d3.select(`#${svgId}`)
      .attr("width", "100%")
      .attr("height", "100%")
      .style("background", "#f5f5f5");

    svg.selectAll("*").remove();

    const g = svg.append("g");

    // Positioning Variables
    const width = 800;
    const height = 600;
    const spacingX = 200;
    const spacingY = 100;

    // Parse and Position Components
    const components = circuitData.components.map((comp, index) => ({
      id: comp.name,
      type: comp.type,
      x: 100 + (index % 4) * spacingX,
      y: 100 + Math.floor(index / 4) * spacingY,
    }));

    // Map Components for Quick Lookup
    const componentMap = new Map(components.map((comp) => [comp.id, comp]));

    // Parse Interconnects - handle both formats
    // Update this section (around line 200) to add missing components automatically
    // For other circuits, create some basic connections from wires
    // Correct:
    let links: Link[] = [];

    if (circuitData.interconnects && circuitData.interconnects.length > 0) {
      // Create links from interconnects
      links = circuitData.interconnects
        .filter(ic => ic.source && ic.target)
        .map(ic => {
          const source = componentMap.get(ic.source || "");
          const target = componentMap.get(ic.target || "");

          if (source && target) {
            return {
              source,
              target,
              name: ic.name
            };
          }
          return null;
        })
        .filter(Boolean) as Link[];
    }
    console.log("🟢 Components:", components);
    console.log("Link data structure sample:", links.length > 0 ? links[0] : "No links");

    links = links.map(link => {
      if (!link.source.x || !link.source.y) {
        console.warn("Missing coordinates in source:", link.source);
        // Set default values
        link.source.x = link.source.x || 100;
        link.source.y = link.source.y || 100;
      }
      if (!link.target.x || !link.target.y) {
        console.warn("Missing coordinates in target:", link.target);
        // Set default values
        link.target.x = link.target.x || 300;
        link.target.y = link.target.y || 100;
      }
      return link;
    });

    // Draw Components
    // First, define nodeGroups without drag handlers
    const nodeGroups = g.selectAll(".node")
      .data(components)
      .enter()
      .append("g")
      .attr("transform", (d) => `translate(${d.x},${d.y})`);

    // Add different shapes based on component type
    nodeGroups.each(function (d) {
      const group = d3.select(this);
      if (d.type.toUpperCase() === "INPUT") {
        // Diamond for inputs
        group.append("polygon")
          .attr("points", "0,-25 25,0 0,25 -25,0")
          .attr("fill", "#67a9cf")
          .attr("stroke", "#333")
          .attr("stroke-width", 1.5);
      } else if (d.type.toUpperCase() === "OUTPUT") {
        // Hexagon for outputs
        group.append("polygon")
          .attr("points", "20,-15 20,15 0,30 -20,15 -20,-15 0,-30")
          .attr("fill", "#ef8a62")
          .attr("stroke", "#333")
          .attr("stroke-width", 1.5);
      } else if (d.type.toUpperCase() === "DFF" || d.type.toUpperCase().includes("FLIP")) {
        // Rectangle for flip-flops
        group.append("rect")
          .attr("width", 80)
          .attr("height", 40)
          .attr("fill", "#8da0cb")
          .attr("stroke", "#333")
          .attr("stroke-width", 1.5)
          .attr("x", -40)
          .attr("y", -20)
          .attr("rx", 5);
      } else if (d.type.toUpperCase().includes("LUT")) {
        // Triangle for LUTs
        group.append("polygon")
          .attr("points", "0,-25 -30,20 30,20")
          .attr("fill", "#e78ac3")
          .attr("stroke", "#333")
          .attr("stroke-width", 1.5);
      } else if (d.type.toUpperCase().includes("MUX")) {
        // Trapezoid for MUXes
        group.append("polygon")
          .attr("points", "-20,-25 20,-25 30,20 -30,20")
          .attr("fill", "#a6d854")
          .attr("stroke", "#333")
          .attr("stroke-width", 1.5);
      } else {
        // Circle for others
        group.append("circle")
          .attr("r", 25)
          .attr("fill", "#ffd92f")
          .attr("stroke", "#333")
          .attr("stroke-width", 1.5);
      }
    });

    // Add text labels
    // Line 525: Fix the text label
    nodeGroups.append("text")
      .attr("y", 35)
      .attr("text-anchor", "middle")
      .attr("fill", "#333")
      .text((d: ComponentNode) => {
        // Shorten name for display
        const name = d.id;
        if (name.length > 15) {
          return name.substring(0, 12) + '...';
        }
        return name;
      });

    // Line 539: Fix the type label
    nodeGroups.append("text")
      .attr("y", 0)
      .attr("text-anchor", "middle")
      .attr("fill", "#000")
      .attr("font-weight", "bold")
      .text((d: ComponentNode) => d.type);

    // Line 546: Fix line endpoints
    const linkLines = g.selectAll(".link")
      .data(links)
      .enter()
      .append("line")
      .attr("class", "link")
      .attr("x1", (d: Link) => d.source.x || 0)
      .attr("y1", (d: Link) => d.source.y || 0)
      .attr("x2", (d: Link) => d.target.x || 0)
      .attr("y2", (d: Link) => d.target.y || 0)
      .attr("stroke", "#666")
      .attr("stroke-width", 2);

    console.log("Created linkLines:", linkLines.size(), "elements");

    // Add arrowheads for directionality
    svg.append("defs").selectAll("marker")
      .data(["end"])
      .enter().append("marker")
      .attr("id", String)
      .attr("viewBox", "0 -5 10 10")
      .attr("refX", 15)
      .attr("refY", -1.5)
      .attr("markerWidth", 6)
      .attr("markerHeight", 6)
      .attr("orient", "auto")
      .append("path")
      .attr("d", "M0,-5L10,0L0,5");

    linkLines.attr("marker-end", "url(#end)");

    // NOW add the drag behavior AFTER linkLines is defined
    // Update your drag implementation:
    nodeGroups.call(
      d3.drag<SVGGElement, ComponentNode>()
        .on("start", function (this: SVGGElement, event: any, d: ComponentNode) {
          console.log("Drag start:", d);
          d3.select(this).raise().attr("stroke", "black");
        })
        .on("drag", function (this: SVGGElement, event: any, d: ComponentNode) {
          d.x = event.x;
          d.y = event.y;
          d3.select(this).attr("transform", `translate(${d.x},${d.y})`);

          // Update connections with proper typing
          linkLines.filter((l: Link) => l.source.id === d.id)
            .attr("x1", d.x || 0)
            .attr("y1", d.y || 0);

          linkLines.filter((l: Link) => l.target.id === d.id)
            .attr("x2", d.x || 0)
            .attr("y2", d.y || 0);
        })
        .on("end", function () {
          d3.select(this).attr("stroke", null);
        })
    );


    // Add zoom behavior
    const zoom = d3.zoom()
      .scaleExtent([0.1, 10])
      .on("zoom", (event) => {
        g.attr("transform", event.transform);
      });

    svg.call(zoom as any);
    // Replace lines 318-324 with this code:
    // Add error handling for centering the view
    const svgNode = svg.node();
    if (svgNode && svgNode instanceof SVGSVGElement) {
      try {
        const box = svgNode.getBBox();
        if (box && box.width && box.height) {
          const centerX = box.width / 2;
          const centerY = box.height / 2;
          svg.call(zoom.transform as any, d3.zoomIdentity.translate(centerX, centerY).scale(0.8));
        }
      } catch (e) {
        console.warn("Could not get SVG bounding box:", e);
        // Fallback to approximate center if getBBox fails
        svg.call(zoom.transform as any, d3.zoomIdentity.translate(width / 2, height / 2).scale(0.8));
      }
    } else {
      // Fallback if node is not an SVGSVGElement
      svg.call(zoom.transform as any, d3.zoomIdentity.translate(width / 2, height / 2).scale(0.8));
    }

    // Add this after creating the SVG:
    setTimeout(() => {
      // Try force-refreshing the SVG if it's empty
      if (svg.selectAll("*").size() === 0) {
        console.log("SVG appears empty, attempting force refresh");
        // Try another layout attempt
        g.attr("transform", "translate(50, 50)");

        if (components.length > 0) {
          console.log("Found components but SVG is empty, redrawing");
          // Force redraw one component to see if it works
          g.append("circle")
            .attr("cx", width / 2)
            .attr("cy", height / 2)
            .attr("r", 50)
            .attr("fill", "red")
            .attr("stroke", "black");

          g.append("text")
            .attr("x", width / 2)
            .attr("y", height / 2)
            .attr("text-anchor", "middle")
            .text(`Found ${components.length} components`);
        }
      }
    }, 500);
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
  // Replace lines 569-587 with this corrected debug panel:
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
          // Force re-render by setting state
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