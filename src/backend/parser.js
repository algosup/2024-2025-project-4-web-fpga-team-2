const fs = require("fs");

/**
 * Cleans Verilog content by removing comments and empty lines.
 * @param {string} verilogContent - Raw Verilog code
 * @return {string} Cleaned Verilog code
 */
function cleanupVerilog(verilogContent) {
  // Remove block comments (/* ... */)
  verilogContent = verilogContent.replace(/\/\*[\s\S]*?\*\//g, ' ');
  // Remove line comments (// ...)
  verilogContent = verilogContent.replace(/\/\/.*$/gm, '');
  // Remove empty lines and return the cleaned content
  return verilogContent.split('\n').filter(line => line.trim() !== '').join('\n');
}

/**
 * Parses Verilog content into a structured object representation of the circuit.
 * @param {string} verilogContent - Verilog code to parse
 * @return {Object} Structured representation of the circuit
 */
function parseVerilog(verilogContent) {
  verilogContent = cleanupVerilog(verilogContent);

  // Initialize data structures to store parsed information
  let moduleName = "";
  let ports = {};        // Stores port name -> direction (input/output/inout)
  let wires = new Set();  // Set of internal wires
  let components = [];    // List of circuit components (LUTs, DFFs, etc.)
  let connections = [];   // List of connections between components
  let interconnects = []; // Special FPGA routing interconnects

  /**
   * Helper function to extract wire name from a pin object or string
   * @param {Object|string} pin - Pin representation
   * @return {string} Wire name
   */
  const getWireName = (pin) => (typeof pin === "string" ? pin : pin.wire);

  // Extract module name using regex
  const moduleRegex = /module\s+([A-Za-z0-9_]+)\s*\(/;
  const moduleMatch = verilogContent.match(moduleRegex);
  if (moduleMatch) {
    moduleName = moduleMatch[1];
  }

  // Extract port declarations (inputs, outputs, inouts)
  // This regex matches: input/output/inout [wire] port_name
  const portRegex = /(input|output|inout)\s+(?:wire\s+)?(\\?[A-Za-z0-9_]+)/g;
  let portMatch;
  while ((portMatch = portRegex.exec(verilogContent)) !== null) {
    ports[portMatch[2]] = portMatch[1]; // Map port name to direction
  }

  // Extract wire declarations
  const wireRegex = /wire\s+(\\?[A-Za-z0-9_]+)/g;
  let wireMatch;
  while ((wireMatch = wireRegex.exec(verilogContent)) !== null) {
    wires.add(wireMatch[1]); // Add wire name to set
  }

  // Extract components by splitting the file into blocks ending with ');'
  const componentBlocks = verilogContent.split(');');
  for (const block of componentBlocks) {
    const trimmedBlock = block.trim();
    if (!trimmedBlock) continue; // Skip empty blocks

    // Extract component type (with optional parameter list)
    const typeMatch = trimmedBlock.match(/^\s*([A-Za-z0-9_]+)\s*(?:#\s*\(.*?\))?\s+/s);
    if (!typeMatch) continue;
    const originalType = typeMatch[1];

    // Map original component type to standard categories for visualization
    let componentType = "Unknown";
    if (/^(DFF|FF|FLIPFLOP|SDFF|SDFFR|NX_DFF|QDFF|TDFF|SYNC_DFF|ASYNC_DFF|DFLIPFLOP|RISINGEDGE_DFLIPFLOP)$/i.test(originalType)) {
      componentType = "DFF"; // Flip-flops
    } else if (/^(LUT|LUT_K|FULLLUT|LOOKUP|O\d*)$/i.test(originalType)) {
      componentType = "LUT"; // Lookup tables
    } else if (/^(BRAM|RAM|ROM|MEMORY|MEM)$/i.test(originalType)) {
      componentType = "BRAM"; // Block RAM
    } else if (/^(MUX|MULTIPLEXER)$/i.test(originalType)) {
      componentType = "MUX"; // Multiplexers
    } else if (/^(DSP|MULT|MULTIPLIER|ALU|ARITHMETIC)$/i.test(originalType)) {
      componentType = "DSP"; // Digital Signal Processing blocks
    } else if (/^(IOB|INBUF|OUTBUF|IOBUF|IO_BUFFER)$/i.test(originalType)) {
      componentType = "IOB"; // I/O buffer components
    }

    // Extract instance name (component identifier)
    const instanceMatch = trimmedBlock.match(/\)\s*(\\?[A-Za-z0-9_$~^\-\.:]+)\s*\(/);
    if (!instanceMatch) continue;
    const instance = instanceMatch[1];

    // Create component object
    const component = {
      name: instance,
      type: componentType,
      originalType: originalType,
      inputs: [],
      outputs: []
    };

    // Handle bundled inputs like .in({a,b,c})
    const inputsRegex = /\.in\(\s*\{([^}]+)\}\s*\)/s;
    const inputsMatch = trimmedBlock.match(inputsRegex);
    if (inputsMatch) {
      const inputsList = inputsMatch[1].split(',').map(i => i.trim());
      component.inputs = inputsList.map((input, idx) => {
        // Handle constant values (1'b0, 1'b1)
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
      // Handle individual port-to-wire mappings (.D(wire1), .clk(clk_signal), etc.)
      const individualInputsRegex = /\.(D|clock|reset|CE|addr|clk|sync|async|[A-Za-z0-9_]+)\s*\(\s*(\\?[A-Za-z0-9_$~^\-\.:\[\]]+|1'b[01])\s*\)/g;
      let individualInputMatch;
      while ((individualInputMatch = individualInputsRegex.exec(trimmedBlock)) !== null) {
        const portName = individualInputMatch[1];
        // Skip output ports that might be captured by this regex
        if (portName.toLowerCase() === 'q' || portName.toLowerCase() === 'out') continue;
        
        const inputValue = individualInputMatch[2];
        const constantMatch = inputValue.match(/1'b([01])/);
        
        // Handle constant inputs with special case for LUT with constant 0
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
        
        // Handle other constant inputs
        if (constantMatch) {
          component.inputs.push({
            port: portName,
            wire: `constant_${constantMatch[1]}`,
            constant: true,
            value: constantMatch[1] === '1' ? 1 : 0,
            pinIndex: component.inputs.length
          });
        } else {
          // Handle regular wire connections
          component.inputs.push({
            port: portName,
            wire: inputValue,
            pinIndex: component.inputs.length
          });
        }
      }
    }

    // Special case: If LUT has no inputs, add default constant inputs
    // This handles primitive LUTs used as constant generators
    if (componentType === "LUT" && component.inputs.length === 0) {
      const isVcc = instance.includes("vcc"); // Check if it's a VCC (1) or GND (0) LUT
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

    // Extract outputs (.out(...) or .Q(...) for flip-flops)
    const outputRegex = /\.out\(\s*(\\?[A-Za-z0-9_$~^\-\.:\[\]]+)\s*\)/;
    const outputMatch = trimmedBlock.match(outputRegex);
    if (outputMatch) {
      component.outputs.push({ wire: outputMatch[1], pinIndex: 0 });
    } else {
      // Try to find flip-flop output format
      const qOutputRegex = /\.Q\(\s*(\\?[A-Za-z0-9_$~^\-\.:\[\]]+)\s*\)/;
      const qOutputMatch = trimmedBlock.match(qOutputRegex);
      if (qOutputMatch) {
        component.outputs.push({ wire: qOutputMatch[1], pinIndex: 0 });
      }
    }

    components.push(component);
  }

  // Extract FPGA interconnect primitives, which are special routing resources
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

  // Build connection graph by mapping source components to destination components
  // First create a lookup table of wire sources (which component drives each wire)
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

  // Create connections by mapping each input to its source component
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

  // Process interconnects as special routing connections
  interconnects.forEach(ic => {
    // Connect source to interconnect input
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
    
    // Register interconnect as new source for its output wire
    outputToSource[ic.dataout] = {
      component: ic.name,
      type: "interconnect",
      port: "out",
      pinIndex: 0
    };
    
    // Connect interconnect output to destinations
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

  // Add connections to/from module I/O ports (top-level inputs/outputs)
  Object.entries(ports).forEach(([portName, portType]) => {
    if (portType === 'input') {
      // Input ports drive components
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
      // Components drive output ports
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

  // Create simplified pin connections list for easier rendering
  const pinConnections = connections.map(conn => ({
    from: `${conn.from.component}.${conn.from.port}`,
    to: `${conn.to.component}.${conn.to.port}`,
    wire: conn.wire
  }));

  // Generate circuit statistics and summary
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

  // Return complete parsed circuit information
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

/**
 * --- SDF (Standard Delay Format) Parsing Section ---
 * SDF files contain timing information for circuit components
 */

/**
 * Parse an SDF file containing timing constraints and delays
 * @param {string} sdfContent - Content of the SDF file
 * @return {Array} Array of timing objects
 */
function parseSDF(sdfContent) {
  const delays = [];
  // Match each CELL block in the SDF file
  // Format: (CELL (CELLTYPE "cell_name") (INSTANCE instance_name) ...)
  const cellRegex = /\(\s*CELL\s*\(\s*CELLTYPE\s*"([^"]+)"\s*\)\s*\(\s*INSTANCE\s+([^\)]+)\s*\)([\s\S]*?)(?=\(\s*CELL|\)$)/g;
  let cellMatch;
  while ((cellMatch = cellRegex.exec(sdfContent)) !== null) {
    const cellType = cellMatch[1];
    const instance = cellMatch[2].trim();
    const cellBody = cellMatch[3]; // Contains all timing info for this cell
    extractDelaysFromCell_SDF(cellType, instance, cellBody, delays);
  }
  return delays;
}

/**
 * Extract timing delays from a single cell block in SDF
 * @param {string} cellType - Type of the cell
 * @param {string} instance - Instance name
 * @param {string} cellBody - Body text of the cell block
 * @param {Array} delaysArray - Array to add extracted delays to
 */
function extractDelaysFromCell_SDF(cellType, instance, cellBody, delaysArray) {
  // Extract IOPATH delays (pin-to-pin propagation delays)
  // Format: (DELAY (ABSOLUTE (IOPATH input output (rise_values) (fall_values))))
  const iopathRegex = /\(\s*DELAY\s*\(\s*ABSOLUTE\s*\(\s*IOPATH\s+(\S+)\s+(\S+)\s+\(([^)]+)\)\s+\(([^)]+)\)\s*\)\s*\)/g;
  let iopathMatch;
  while ((iopathMatch = iopathRegex.exec(cellBody)) !== null) {
    const inputPort = iopathMatch[1].trim();
    const outputPort = iopathMatch[2].trim();
    const riseStr = iopathMatch[3]; // Rising edge delay values
    const fallStr = iopathMatch[4]; // Falling edge delay values

    // Parse min:typical:max delay values
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

  // Extract timing checks (setup, hold, etc.)
  // Format: (TIMINGCHECK (CHECK_TYPE port1 port2 (values)))
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

/**
 * Parse a delay value string into min, typical, and max values
 * @param {string} delayString - Delay string in format "min:typ:max" or variations
 * @return {Array} Array of [min, typ, max] values
 */
function parseDelayValues(delayString) {
  const parts = delayString.trim().split(/[:\s]+/).map(parseFloat);
  if (parts.length === 1) {
    // If only one value, use it for all three
    return [parts[0], parts[0], parts[0]];
  } else if (parts.length === 2) {
    // If two values, use second for both typ and max
    return [parts[0], parts[1], parts[1]];
  } else {
    // All three values specified
    return parts;
  }
}

/**
 * Combines Verilog and SDF parsing results into a single circuit model
 * @param {string} verilogContent - Content of Verilog file
 * @param {string} sdfContent - Content of SDF file (optional)
 * @return {Object} Combined circuit model with netlist and timing information
 */
function analyzeCircuitFiles(verilogContent, sdfContent) {
  console.log("[Parser] Analyzing circuit files...");

  // Parse Verilog first to get netlist information
  const verilogData = parseVerilog(verilogContent);
  console.log(`[Parser] Found ${verilogData.components.length} components and ${verilogData.connections.length} connections`);

  // Parse SDF if provided to get timing information
  let delays = [];
  if (sdfContent && sdfContent.trim()) {
    try {
      delays = parseSDF(sdfContent);
      console.log(`[Parser] Found ${delays.length} timing constraints in SDF`);

      // Add timing information to the Verilog data
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

/**
 * Utility function to write parsed data to a JSON file
 * @param {Object} data - Data to write to file
 * @param {string} filePath - Path to write the file to
 * @return {Promise} Promise resolving when file is written
 */
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

// Export public functions from this module
module.exports = {
  cleanupVerilog,
  parseVerilog,
  parseSDF,
  analyzeCircuitFiles,
  generateJsonFile
};