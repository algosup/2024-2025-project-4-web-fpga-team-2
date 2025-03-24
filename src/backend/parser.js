const fs = require("fs");

// Remove block and line comments, and remove empty lines.
function cleanupVerilog(verilogContent) {
  // Remove block comments and line comments.
  verilogContent = verilogContent.replace(/\/\*[\s\S]*?\*\//g, ' ');
  verilogContent = verilogContent.replace(/\/\/.*$/gm, '');
  // Remove empty lines.
  return verilogContent.split('\n').filter(line => line.trim() !== '').join('\n');
}

// Parse Verilog into a structured object.
function parseVerilog(verilogContent) {
  verilogContent = cleanupVerilog(verilogContent);

  let moduleName = "";
  let ports = {};
  let wires = new Set();
  let components = [];
  let connections = [];
  let interconnects = [];

  // Helper: Extract wire name from a pin (object or string).
  const getWireName = (pin) => (typeof pin === "string" ? pin : pin.wire);

  // Extract module name.
  const moduleRegex = /module\s+([A-Za-z0-9_]+)\s*\(/;
  const moduleMatch = verilogContent.match(moduleRegex);
  if (moduleMatch) {
    moduleName = moduleMatch[1];
  }

  // Extract port declarations.
  const portRegex = /(input|output|inout)\s+(?:wire\s+)?(\\?[A-Za-z0-9_]+)/g;
  let portMatch;
  while ((portMatch = portRegex.exec(verilogContent)) !== null) {
    ports[portMatch[2]] = portMatch[1];
  }

  // Extract wire declarations.
  const wireRegex = /wire\s+(\\?[A-Za-z0-9_]+)/g;
  let wireMatch;
  while ((wireMatch = wireRegex.exec(verilogContent)) !== null) {
    wires.add(wireMatch[1]);
  }

  // Extract components.
  // Split into blocks by ');'
  const componentBlocks = verilogContent.split(');');
  for (const block of componentBlocks) {
    const trimmedBlock = block.trim();
    if (!trimmedBlock) continue;

    // Extract component type (with optional parameter list).
    const typeMatch = trimmedBlock.match(/^\s*([A-Za-z0-9_]+)\s*(?:#\s*\(.*?\))?\s+/s);
    if (!typeMatch) continue;
    const originalType = typeMatch[1];

    // Determine component category.
    let componentType = "Unknown";
    if (/^(DFF|FF|FLIPFLOP|SDFF|SDFFR|NX_DFF|QDFF|TDFF|SYNC_DFF|ASYNC_DFF|DFLIPFLOP|RISINGEDGE_DFLIPFLOP)$/i.test(originalType)) {
      componentType = "DFF";
    } else if (/^(LUT|LUT_K|FULLLUT|LOOKUP|O\d*)$/i.test(originalType)) {
      componentType = "LUT";
    } else if (/^(BRAM|RAM|ROM|MEMORY|MEM)$/i.test(originalType)) {
      componentType = "BRAM";
    } else if (/^(MUX|MULTIPLEXER)$/i.test(originalType)) {
      componentType = "MUX";
    } else if (/^(DSP|MULT|MULTIPLIER|ALU|ARITHMETIC)$/i.test(originalType)) {
      componentType = "DSP";
    } else if (/^(IOB|INBUF|OUTBUF|IOBUF|IO_BUFFER)$/i.test(originalType)) {
      componentType = "IOB";
    }

    // Extract instance name.
    const instanceMatch = trimmedBlock.match(/\)\s*(\\?[A-Za-z0-9_$~^\-\.:]+)\s*\(/);
    if (!instanceMatch) continue;
    const instance = instanceMatch[1];

    const component = {
      name: instance,
      type: componentType,
      originalType: originalType,
      inputs: [],
      outputs: []
    };

    // Extract bundled inputs (.in({...})).
    const inputsRegex = /\.in\(\s*\{([^}]+)\}\s*\)/s;
    const inputsMatch = trimmedBlock.match(inputsRegex);
    if (inputsMatch) {
      const inputsList = inputsMatch[1].split(',').map(i => i.trim());
      component.inputs = inputsList.map((input, idx) => {
        const constantMatch = input.match(/1'b([01])/);
        if (constantMatch) {
          return {
            port: `const_${idx}`,
            wire: `constant_${constantMatch[1]}`,
            constant: true,
            value: constantMatch[1] === '1' ? 1 : 0,
            pinIndex: idx
          };
        }
        return { wire: input, pinIndex: idx };
      });
    } else {
      // Extract individual inputs (.D(...), .clock(...), etc.).
      const individualInputsRegex = /\.(D|clock|reset|CE|addr|clk|sync|async|[A-Za-z0-9_]+)\s*\(\s*(\\?[A-Za-z0-9_$~^\-\.:\[\]]+|1'b[01])\s*\)/g;
      let individualInputMatch;
      while ((individualInputMatch = individualInputsRegex.exec(trimmedBlock)) !== null) {
        const portName = individualInputMatch[1];
        if (portName.toLowerCase() === 'q' || portName.toLowerCase() === 'out') continue;
        const inputValue = individualInputMatch[2];
        const constantMatch = inputValue.match(/1'b([01])/);
        if (componentType === "LUT" && constantMatch && constantMatch[1] === '0') {
          component.inputs.push({
            port: portName,
            wire: `constant_${constantMatch[1]}`,
            constant: true,
            value: 0,
            pinIndex: component.inputs.length
          });
          continue;
        }
        if (constantMatch) {
          component.inputs.push({
            port: portName,
            wire: `constant_${constantMatch[1]}`,
            constant: true,
            value: constantMatch[1] === '1' ? 1 : 0,
            pinIndex: component.inputs.length
          });
        } else {
          component.inputs.push({
            port: portName,
            wire: inputValue,
            pinIndex: component.inputs.length
          });
        }
      }
    }

    // If LUT with no inputs, add five constant inputs.
    if (componentType === "LUT" && component.inputs.length === 0) {
      const isVcc = instance.includes("vcc");
      const constantValue = isVcc ? "1" : "0";
      for (let i = 0; i < 5; i++) {
        component.inputs.push({
          port: `in${i}`,
          wire: `constant_${constantValue}`,
          constant: true,
          value: isVcc ? 1 : 0,
          pinIndex: i
        });
      }
    }

    // Extract outputs (.out(...) or .Q(...))
    const outputRegex = /\.out\(\s*(\\?[A-Za-z0-9_$~^\-\.:\[\]]+)\s*\)/;
    const outputMatch = trimmedBlock.match(outputRegex);
    if (outputMatch) {
      component.outputs.push({ wire: outputMatch[1], pinIndex: 0 });
    } else {
      const qOutputRegex = /\.Q\(\s*(\\?[A-Za-z0-9_$~^\-\.:\[\]]+)\s*\)/;
      const qOutputMatch = trimmedBlock.match(qOutputRegex);
      if (qOutputMatch) {
        component.outputs.push({ wire: qOutputMatch[1], pinIndex: 0 });
      }
    }

    components.push(component);
  }

  // Extract interconnects.
  const interconnectRegex = /fpga_interconnect\s+([\S]+)\s*\(\s*\.datain\(([^)]+)\)\s*,\s*\.dataout\(([^)]+)\)\s*\)/g;
  let interconnectMatch;
  while ((interconnectMatch = interconnectRegex.exec(verilogContent)) !== null) {
    interconnects.push({
      name: interconnectMatch[1],
      type: "interconnect",
      datain: interconnectMatch[2].trim(),
      dataout: interconnectMatch[3].trim()
    });
  }

  // Create connections: first map outputs to source components.
  const outputToSource = {};
  components.forEach(sourceComp => {
    sourceComp.outputs.forEach(output => {
      const wire = getWireName(output);
      if (wire) {
        outputToSource[wire] = {
          component: sourceComp.name,
          type: sourceComp.type,
          port: 'out',
          pinIndex: output.pinIndex
        };
      }
    });
  });

  // Map inputs to their corresponding outputs.
  components.forEach(targetComp => {
    targetComp.inputs.forEach(input => {
      const wire = getWireName(input);
      if (wire && outputToSource[wire]) {
        connections.push({
          from: outputToSource[wire],
          to: {
            component: targetComp.name,
            type: targetComp.type,
            port: typeof input === 'string' ? 'in' : input.port,
            pinIndex: typeof input === 'string' ? 0 : input.pinIndex
          },
          wire: wire
        });
      }
    });
  });

  // Process interconnects as connections.
  // Process each interconnect object
  interconnects.forEach(ic => {
    // Create a connection from the driving output (if it exists)
    if (outputToSource[ic.datain]) {
      connections.push({
        from: outputToSource[ic.datain],
        to: {
          component: ic.name,
          type: "interconnect",
          port: "in",
          pinIndex: 0
        },
        wire: ic.datain
      });
    }
    // Then mark the interconnect as the new source for its dataout
    outputToSource[ic.dataout] = {
      component: ic.name,
      type: "interconnect",
      port: "out",
      pinIndex: 0
    };
    // And create connection from the interconnect to its destination(s)
    components.forEach(targetComp => {
      targetComp.inputs.forEach(input => {
        const wire = getWireName(input);
        if (wire === ic.dataout) {
          connections.push({
            from: outputToSource[ic.dataout],
            to: {
              component: targetComp.name,
              type: targetComp.type,
              port: typeof input === 'string' ? 'in' : input.port,
              pinIndex: typeof input === 'string' ? 0 : input.pinIndex
            },
            wire: ic.dataout
          });
        }
      });
    });
  });

  // Add module-level I/O connections.
  Object.entries(ports).forEach(([portName, portType]) => {
    if (portType === 'input') {
      components.forEach(targetComp => {
        targetComp.inputs.forEach(input => {
          const wire = getWireName(input);
          if (wire === portName) {
            connections.push({
              from: {
                component: portName,
                type: 'INPUT',
                port: 'out',
                pinIndex: 0
              },
              to: {
                component: targetComp.name,
                type: targetComp.type,
                port: typeof input === 'string' ? 'in' : input.port,
                pinIndex: typeof input === 'string' ? 0 : input.pinIndex
              },
              wire: portName
            });
          }
        });
      });
    } else if (portType === 'output') {
      components.forEach(sourceComp => {
        sourceComp.outputs.forEach(output => {
          const wire = getWireName(output);
          if (wire === portName) {
            connections.push({
              from: {
                component: sourceComp.name,
                type: sourceComp.type,
                port: 'out',
                pinIndex: output.pinIndex
              },
              to: {
                component: portName,
                type: 'OUTPUT',
                port: 'in',
                pinIndex: 0
              },
              wire: portName
            });
          }
        });
      });
    }
  });

  // Create explicit pin connections.
  const pinConnections = connections.map(conn => ({
    from: `${conn.from.component}.${conn.from.port}`,
    to: `${conn.to.component}.${conn.to.port}`,
    wire: conn.wire
  }));

  // Create summary.
  const summary = {
    total_components: components.length,
    component_types: components.reduce((acc, comp) => {
      acc[comp.type] = (acc[comp.type] || 0) + 1;
      return acc;
    }, {}),
    total_interconnects: interconnects.length,
    total_ports: Object.keys(ports).length,
    ports_by_type: Object.values(ports).reduce((acc, type) => {
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {}),
    total_connections: connections.length,
    connectivity_matrix: components.map(comp => ({
      component: comp.name,
      type: comp.type,
      inputs: comp.inputs.map(input => getWireName(input)),
      outputs: comp.outputs.map(output => getWireName(output)),
      fanin: connections.filter(c => c.to.component === comp.name).length,
      fanout: connections.filter(c => c.from.component === comp.name).length
    }))
  };

  return {
    module: moduleName,
    ports: ports,
    wires: Array.from(wires),
    components: components,
    interconnects: interconnects,
    connections: connections,
    pinConnections: pinConnections,
    summary: summary
  };
}

// --- SDF Parsing Section ---

// Parse the entire SDF file content into an array of timing objects.
function parseSDF(sdfContent) {
  const delays = [];
  // Match each CELL block.
  const cellRegex = /\(\s*CELL\s*\(\s*CELLTYPE\s*"([^"]+)"\s*\)\s*\(\s*INSTANCE\s+([^\)]+)\s*\)([\s\S]*?)(?=\(\s*CELL|\)$)/g;
  let cellMatch;
  while ((cellMatch = cellRegex.exec(sdfContent)) !== null) {
    const cellType = cellMatch[1];
    const instance = cellMatch[2].trim();
    const cellBody = cellMatch[3];
    extractDelaysFromCell_SDF(cellType, instance, cellBody, delays);
  }
  return delays;
}

// Extract delay information from a single SDF CELL block.
function extractDelaysFromCell_SDF(cellType, instance, cellBody, delaysArray) {
  // IOPATH delays: look for the IOPATH block inside an ABSOLUTE DELAY.
  // Example format:
  // (DELAY
  //   (ABSOLUTE
  //     (IOPATH datain dataout (235.697:235.697:235.697) (235.697:235.697:235.697))
  //   )
  // )
  const iopathRegex = /\(\s*DELAY\s*\(\s*ABSOLUTE\s*\(\s*IOPATH\s+(\S+)\s+(\S+)\s+\(([^)]+)\)\s+\(([^)]+)\)\s*\)\s*\)/g;
  let iopathMatch;
  while ((iopathMatch = iopathRegex.exec(cellBody)) !== null) {
    const inputPort = iopathMatch[1].trim();
    const outputPort = iopathMatch[2].trim();
    const riseStr = iopathMatch[3];
    const fallStr = iopathMatch[4];

    const [minRise, typRise, maxRise] = parseDelayValues(riseStr);
    const [minFall, typFall, maxFall] = parseDelayValues(fallStr);

    const max_delay = Math.max(maxRise, maxFall); // in picoseconds

    delaysArray.push({
      cellType,
      instance,
      type: 'iopath',
      inputPort,
      outputPort,
      rise: { min: minRise, typ: typRise, max: maxRise },
      fall: { min: minFall, typ: typFall, max: maxFall },
      max_delay
    });
  }

  // Timing checks (e.g. SETUP, HOLD, etc.)
  // Example: (TIMINGCHECK (SETUP D (posedge clock) (-46:-46:-46)))
  const timingCheckRegex = /\(\s*TIMINGCHECK\s*\(\s*(SETUP|HOLD|RECOVERY|REMOVAL|WIDTH|PERIOD)\s+(\S+)\s+(\S+)\s+\(([^)]+)\)\s*\)\s*\)/g;
  let timingMatch;
  while ((timingMatch = timingCheckRegex.exec(cellBody)) !== null) {
    const checkType = timingMatch[1].toLowerCase();
    const port1 = timingMatch[2].trim();
    const port2 = timingMatch[3].trim();
    const delayStr = timingMatch[4];
    const [minVal, typVal, maxVal] = parseDelayValues(delayStr);
    delaysArray.push({
      cellType,
      instance,
      type: checkType,
      port1,
      port2,
      value: { min: minVal, typ: typVal, max: maxVal }
    });
  }
}

// Utility: Parse a delay string of the form "235.697:235.697:235.697" into numbers.
function parseDelayValues(delayString) {
  const parts = delayString.trim().split(/[:\s]+/).map(parseFloat);
  if (parts.length === 1) {
    return [parts[0], parts[0], parts[0]];
  } else if (parts.length === 2) {
    return [parts[0], parts[1], parts[1]];
  } else {
    return parts;
  }
}

// Combine parsed Verilog and SDF files into a single object.
function analyzeCircuitFiles(verilogContent, sdfContent) {
  console.log("[Parser] Analyzing circuit files...");

  const verilogData = parseVerilog(verilogContent);
  console.log(`[Parser] Found ${verilogData.components.length} components and ${verilogData.connections.length} connections`);

  let delays = [];
  if (sdfContent && sdfContent.trim()) {
    try {
      delays = parseSDF(sdfContent);
      console.log(`[Parser] Found ${delays.length} timing constraints in SDF`);

      verilogData.timing = {
        delays: delays,
        summary: {
          total_delays: delays.length,
          max_delay: Math.max(...delays
            .filter(d => d.type === 'iopath')
            .map(d => d.max_delay || 0)),
          components_with_timing: [...new Set(delays.map(d => d.instance))].length
        }
      };
    } catch (err) {
      console.error("[Parser] Error parsing SDF file:", err.message);
    }
  }

  return verilogData;
}

function generateJsonFile(data, filePath) {
  return new Promise((resolve, reject) => {
    fs.writeFile(filePath, JSON.stringify(data, null, 2), (err) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

module.exports = {
  cleanupVerilog,
  parseVerilog,
  parseSDF,
  analyzeCircuitFiles,
  generateJsonFile
};