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
  const [isJsonAvailable, setIsJsonAvailable] = useState(false);

  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const response = await fetch("http://localhost:5001/uploads/parsed_circuit.json", { method: "HEAD" });
        if (response.ok) {
          setIsJsonAvailable(true);
          clearInterval(interval);
        }
      } catch (error) {
        console.error("❌ Error checking JSON file existence:", error);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!isJsonAvailable) return;

    fetch("http://localhost:5001/uploads/parsed_circuit.json")
      .then((response) => response.json())
      .then((data) => {
        console.log("✅ Loaded JSON Data:", data);
        setCircuitData(data);
      })
      .catch(error => console.error("❌ Error loading JSON:", error));
  }, [isJsonAvailable]);

  useEffect(() => {
    if (!circuitData) return;

    const svg = d3.select("#circuit-svg")
      .attr("width", "100%")
      .attr("height", "100%") // ✅ Fixed height issue
      .style("background", "#222");

    svg.selectAll("*").remove();

    const zoom = d3.zoom().scaleExtent([0.5, 3]).on("zoom", (event) => {
      svg.select("g").attr("transform", event.transform);
    });

    svg.call(zoom as any);
    const g = svg.append("g");

    const spacingX = 250;
    const spacingY = 200;

    // ✅ Normalize component names for matching
    const normalizeName = (name: string) => {
      return name
        .replace(/\\[$:.]/g, "") // Remove escape characters
        .replace(/routing_segment_/g, "") // Remove routing segment prefix
        .trim();
    };

    // ✅ Create component nodes
    const nodes = circuitData.components.map((comp, i) => ({
      id: normalizeName(comp.name),
      type: comp.type,
      x: i * spacingX + 200,
      y: 300,
    }));

    console.log("🟢 Generated Nodes:", nodes);

    const nodeMap = new Map(nodes.map((node) => [node.id, node]));

    // ✅ Create interconnect links
    const links = circuitData.interconnects.map((conn) => {
      const nameParts = conn.name.replace(/\\[$:.]/g, "").split("_to_"); // Normalize names
      const sourceNode = nodeMap.get(normalizeName(nameParts[0]));
      const targetNode = nodeMap.get(normalizeName(nameParts[1]));

      if (!sourceNode || !targetNode) {
        console.warn(`⚠️ Missing source/target for interconnect: ${conn.name}`);
        return null;
      }

      return { source: sourceNode, target: targetNode, delay: conn.delay };
    }).filter((link) => link !== null);

    console.log("🔴 Generated Links:", links);

    // ✅ Draw interconnects
    g.selectAll(".link")
      .data(links)
      .enter()
      .append("line")
      .attr("class", "link")
      .attr("x1", (d) => d.source.x)
      .attr("y1", (d) => d.source.y)
      .attr("x2", (d) => d.target.x)
      .attr("y2", (d) => d.target.y)
      .attr("stroke", "red")
      .attr("stroke-width", 3)
      .attr("marker-end", "url(#arrow)");

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
      .attr("fill", "red");

    // ✅ Draw component nodes
    const nodeGroups = g.selectAll(".node")
      .data(nodes)
      .enter()
      .append("g")
      .attr("class", "node")
      .attr("transform", (d) => `translate(${d.x},${d.y})`);

    nodeGroups.each(function (d) {
      const group = d3.select(this);

      if (d.type === "dff") {
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
      } else if (d.type === "LUT_K") {
        group.append("polygon")
          .attr("points", "-30,-45 30,-45 20,45 -20,45")
          .attr("fill", "lightgreen")
          .attr("stroke", "black");

        group.append("text")
          .text("LUT")
          .attr("y", 5)
          .attr("text-anchor", "middle")
          .attr("fill", "black")
          .style("font-size", "14px");
      } else if (d.type === "BRAM") {
        group.append("rect")
          .attr("width", 100)
          .attr("height", 120)
          .attr("x", -50)
          .attr("y", -60)
          .attr("fill", "orange")
          .attr("stroke", "black");

        group.append("text")
          .text("BRAM")
          .attr("y", 5)
          .attr("text-anchor", "middle")
          .attr("fill", "black")
          .style("font-size", "14px");
      }
    });

    // ✅ Display delay values
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