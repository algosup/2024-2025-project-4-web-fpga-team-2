import React, { useEffect, useState } from "react";
import * as d3 from "d3";

interface Component {
  type: string;
  name: string;
}

interface Interconnect {
  name: string;
  type: string;
  delay?: {
    from: string;
    to: string;
    rise: string;
    fall: string;
  };
}

interface CircuitData {
  moduleName: string;
  inputs: string[];
  outputs: string[];
  components: Component[];
  interconnects: Interconnect[];
}

const CircuitVisualizer: React.FC = () => {
  const [circuitData, setCircuitData] = useState<CircuitData | null>(null);

  useEffect(() => {
    fetch("http://localhost:5001/uploads/parsed_circuit.json")
      .then((response) => response.json())
      .then((data) => setCircuitData(data))
      .catch(error => console.error("❌ Error loading JSON:", error));
  }, []);

  useEffect(() => {
    if (!circuitData) return;

    const svg = d3.select("#circuit-svg")
      .attr("width", "100%")
      .attr("height", "100%")
      .style("background", "#222");

    svg.selectAll("*").remove();

    const zoom = d3.zoom().scaleExtent([0.5, 3]).on("zoom", (event) => {
      svg.select("g").attr("transform", event.transform);
    });

    svg.call(zoom as any);
    const g = svg.append("g");

    const spacingX = 250;
    const spacingY = 200;

    // ✅ Normalize names to match correctly
    const normalizeName = (name: string) =>
      name.replace(/\\[$:.~^]/g, "").replace(/^routing_segment_/, "").trim();

    // ✅ Create component nodes
    const nodes = circuitData.components.map((comp, i) => ({
      id: normalizeName(comp.name),
      type: comp.type,
      x: (i % 4) * spacingX + 200,
      y: Math.floor(i / 4) * spacingY + 200,
    }));

    // ✅ Add input nodes
    circuitData.inputs.forEach((input, i) => {
      nodes.push({
        id: normalizeName(input),
        type: "input",
        x: 100,
        y: i * spacingY + 200,
      });
    });

    // ✅ Add output nodes
    circuitData.outputs.forEach((output, i) => {
      nodes.push({
        id: normalizeName(output),
        type: "output",
        x: nodes.length * spacingX + 300,
        y: i * spacingY + 200,
      });
    });

    console.log("🟢 Nodes:", nodes);

    const nodeMap = new Map(nodes.map((node) => [node.id, node]));

    // ✅ Create interconnect links
    const links = circuitData.interconnects
      .map((conn) => {
        const [from, to] = conn.name.split("_to_").map(normalizeName);
        const sourceNode = nodeMap.get(from);
        const targetNode = nodeMap.get(to);

        if (!sourceNode || !targetNode) {
          console.warn(`⚠️ Missing source/target for interconnect: ${conn.name}`);
          return null;
        }

        return { source: sourceNode, target: targetNode, delay: conn.delay };
      })
      .filter((link) => link !== null);

    console.log("🔴 Wires (Links):", links);

    // ✅ Draw interconnects (Wires) in WHITE
    g.selectAll(".link")
      .data(links)
      .enter()
      .append("line")
      .attr("class", "link")
      .attr("x1", (d) => d.source.x)
      .attr("y1", (d) => d.source.y)
      .attr("x2", (d) => d.target.x)
      .attr("y2", (d) => d.target.y)
      .attr("stroke", "white") // 👀 White wires
      .attr("stroke-width", 2)
      .attr("marker-end", "url(#arrow)");

    // ✅ Add arrow markers for direction (still in cyan)
    g.append("defs")
      .append("marker")
      .attr("id", "arrow")
      .attr("viewBox", "0 -5 10 10")
      .attr("refX", 12)
      .attr("refY", 0)
      .attr("markerWidth", 6)
      .attr("markerHeight", 6)
      .attr("orient", "auto")
      .append("path")
      .attr("d", "M0,-5L10,0L0,5")
      .attr("fill", "cyan"); // ✅ Keep arrows cyan for contrast

    // ✅ Draw component nodes
    const nodeGroups = g.selectAll(".node")
      .data(nodes)
      .enter()
      .append("g")
      .attr("class", "node")
      .attr("transform", (d) => `translate(${d.x},${d.y})`);

    nodeGroups.each(function (d) {
      const group = d3.select(this);

      if (d.type === "input") {
        group.append("circle")
          .attr("r", 20)
          .attr("fill", "white")
          .attr("stroke", "black");

        group.append("text")
          .text(d.id)
          .attr("y", 5)
          .attr("text-anchor", "middle")
          .attr("fill", "black")
          .style("font-size", "12px");
      } else if (d.type === "output") {
        group.append("rect")
          .attr("width", 40)
          .attr("height", 40)
          .attr("x", -20)
          .attr("y", -20)
          .attr("fill", "yellow")
          .attr("stroke", "black");

        group.append("text")
          .text(d.id)
          .attr("y", 5)
          .attr("text-anchor", "middle")
          .attr("fill", "black")
          .style("font-size", "12px");
      } else {
        group.append("rect")
          .attr("width", 60)
          .attr("height", 90)
          .attr("x", -30)
          .attr("y", -45)
          .attr("fill", "lightblue")
          .attr("stroke", "black");

        group.append("text")
          .text("DFF")
          .attr("y", 5)
          .attr("text-anchor", "middle")
          .attr("fill", "black")
          .style("font-size", "14px");
      }
    });

    // ✅ Display delay values on wires
    g.selectAll(".delay-text")
      .data(links)
      .enter()
      .append("text")
      .attr("x", (d) => (d.source.x + d.target.x) / 2)
      .attr("y", (d) => (d.source.y + d.target.y) / 2 - 15)
      .attr("text-anchor", "middle")
      .attr("fill", "yellow")
      .style("font-size", "12px")
      .text((d) => (d.delay ? `${d.delay.rise.split(":")[0]} ps` : ""));

  }, [circuitData]);

  return <svg id="circuit-svg" width="100%" height="100%"></svg>;
};

export default CircuitVisualizer;
