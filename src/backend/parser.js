const fs = require("fs");

function cleanupVerilog(verilogContent) {
  // Remove block and line comments
  verilogContent = verilogContent.replace(/\/\*[\s\S]*?\*\//g, ' ');
  verilogContent = verilogContent.replace(/\/\/.*$/gm, '');
  
  // Remove empty lines
  verilogContent = verilogContent.split('\n')
    .filter(line => line.trim() !== '')
    .join('\n');
  
  return verilogContent;
}

function parseVerilog(verilogContent) {
  // Cleanup the content first
  verilogContent = cleanupVerilog(verilogContent);
  
  let moduleName = "";
  let ports = {};
  let wires = new Set();
  let components = [];
  let connections = [];
  let interconnects = [];

  // Helper: Extract wire name from a pin object or string
  const getWireName = (pin) => {
    return typeof pin === "string" ? pin : pin.wire;
  };

  // Extract module name
  const moduleRegex = /module\s+([A-Za-z0-9_]+)\s*\(/;
  const moduleMatch = verilogContent.match(moduleRegex);
  if (moduleMatch) {
    moduleName = moduleMatch[1];
  }

  // Extract port declarations (input, output, inout)
  const portRegex = /(input|output|inout)\s+(?:wire\s+)?(\\?[A-Za-z0-9_]+)/g;
  let portMatch;
  while ((portMatch = portRegex.exec(verilogContent)) !== null) {
    ports[portMatch[2]] = portMatch[1];
  }

  // Extract wire declarations
  const wireRegex = /wire\s+(\\?[A-Za-z0-9_]+)/g;
  let wireMatch;
  while ((wireMatch = wireRegex.exec(verilogContent)) !== null) {
    wires.add(wireMatch[1]);
  }

  // Extract components
  // Split the file into component blocks by detecting instantiations ending with ');'
  const componentBlocks = verilogContent.split(');');
  for (const block of componentBlocks) {
    const trimmedBlock = block.trim();
    if (!trimmedBlock) continue;

    // Extract the component type (with optional parameter list)
    const typeMatch = trimmedBlock.match(/^\s*([A-Za-z0-9_]+)\s*(?:#\s*\(.*?\))?\s+/s);
    if (!typeMatch) continue;
    const originalType = typeMatch[1];
    
    const lines = verilogContent.split('\n');
    const componentBlocks = verilogContent.split(');');
    let moduleName = "";
    let ports = {};
    let wires = new Set();
    let components = [];
    let connections = []; // New array to track connections

    // Extract module name
    const moduleRegex = /module\s+([A-Za-z0-9_]+)\s*\(/;
    const moduleMatch = verilogContent.match(moduleRegex);
    if (moduleMatch) {
        moduleName = moduleMatch[1];
    }

    // Extract port information
    const portRegex = /(input|output)\s+(\\?[A-Za-z0-9_]+)/g;
    let portMatch;
    while ((portMatch = portRegex.exec(verilogContent)) !== null) {
        ports[portMatch[2]] = portMatch[1];
    }

    // Extract wire information
    const wireRegex = /wire\s+(\\?[A-Za-z0-9_]+)/g;
    let wireMatch;
    while ((wireMatch = wireRegex.exec(verilogContent)) !== null) {
        wires.add(wireMatch[1]);
    }
    
    // Process component blocks for components and their connections
    for (const block of componentBlocks) {
        // Extract component type
        const componentMatch = block.match(/\s*([A-Za-z0-9_]+)\s*#\s*\(/s);
        if (!componentMatch) continue;
        
        const type = componentMatch[1].toUpperCase();
        
        // Extract instance name
        const instanceMatch = block.match(/\)\s*(\\?[A-Za-z0-9_$~^\-\.:]+)\s*\(/s);
        if (!instanceMatch) continue;
        
        const instance = instanceMatch[1];
        let componentType = "Unknown";
        
        // Classify component types
        if (/^(DFF|FF|FLIPFLOP|SDFF|SDFFR|NX_DFF|QDFF|TDFF|SYNC_DFF|ASYNC_DFF|DFLIPFLOP|RISINGEDGE_DFLIPFLOP)$/i.test(type)) {
            componentType = "DFF";
        } else if (/^(LUT|LUT_K|FULLLUT|LOOKUP|O\d*)$/i.test(type)) {
            componentType = "LUT";
        } else if (/^(BRAM|RAM|ROM|MEMORY|MEM)$/i.test(type)) {
            componentType = "BRAM";
        } else if (/^(MUX|MULTIPLEXER)$/i.test(type)) {
            componentType = "MUX";
        }
        
        // Create component object
        const component = {
            name: instance,
            type: componentType,
            originalType: type,
            inputs: [], // Add inputs array
            outputs: [] // Add outputs array
        };
        
        // Extract input connections
        // Update the input extraction section around line 92-100 to handle constant inputs
const inputsRegex = /\.in\({([^}]+)}\)/s;
const inputsMatch = block.match(inputsRegex);
if (inputsMatch) {
    const inputsList = inputsMatch[1].split(',').map(i => i.trim());
    
    // Modified: Process each input including constants like 1'b0 and 1'b1
    component.inputs = inputsList.map(input => {
        // Check if this is a constant (1'b0 or 1'b1) pattern
        const constantMatch = input.match(/1'b([01])/);
        if (constantMatch) {
            return {
                port: `const_${component.inputs.length}`,
                wire: `constant_${constantMatch[1]}`,
                constant: true,
                value: constantMatch[1] === '1' ? 1 : 0
            };
        }
        // Return the regular wire name for non-constants
        return input;
    });
} else {
    // Try to match individual inputs (like .D, .clock, etc.)
    const individualInputsRegex = /\.(D|clock|reset|CE|addr|[A-Za-z0-9_]+)\s*\(\s*(\\?[A-Za-z0-9_$~^\-\.:\[\]]+|1'b[01])\s*\)/g;
    let individualInputMatch;
    while ((individualInputMatch = individualInputsRegex.exec(block)) !== null) {
        if (individualInputMatch[1].toLowerCase() !== 'q' && 
            individualInputMatch[1].toLowerCase() !== 'out') {
            
            // Check if this is a constant value
            const inputValue = individualInputMatch[2];
            const constantMatch = inputValue.match(/1'b([01])/);
            
            if (constantMatch) {
                component.inputs.push({
                    port: individualInputMatch[1],
                    wire: `constant_${constantMatch[1]}`,
                    constant: true,
                    value: constantMatch[1] === '1' ? 1 : 0
                });
            } else {
                component.inputs.push({
                    port: individualInputMatch[1],
                    wire: inputValue
                });
            }
        }
    }
}

// Special case for empty LUT inputs (should be after the input processing)
// Add this right after the input extraction code
if (componentType === "LUT" && component.inputs.length === 0) {
    // This is likely a constant generator LUT with missing inputs
    // Check name for clue about the constant type
    const isVcc = instance.includes("vcc");
    const constantValue = isVcc ? "1" : "0";
    
    // Add 5 constant inputs (typical for LUT_K)
    for (let i = 0; i < 5; i++) {
        component.inputs.push({
            port: `in${i}`,
            wire: `constant_${constantValue}`,
            constant: true,
            value: isVcc ? 1 : 0
        });
    }
    console.log(`Added constant inputs to LUT: ${instance}`);
}
        
        // Extract output connections
        const outputRegex = /\.out\(\s*(\\?[A-Za-z0-9_$~^\-\.:\[\]]+)\s*\)/;
        const outputMatch = block.match(outputRegex);
        if (outputMatch) {
            component.outputs.push(outputMatch[1]);
        } else {
            // Try to match Q output for DFFs
            const qOutputRegex = /\.Q\(\s*(\\?[A-Za-z0-9_$~^\-\.:\[\]]+)\s*\)/;
            const qOutputMatch = block.match(qOutputRegex);
            if (qOutputMatch) {
                component.outputs.push(qOutputMatch[1]);
            }
        }
        
        components.push(component);
    }
    
    // Create connection mapping between components
    components.forEach(sourceComp => {
        sourceComp.outputs.forEach(output => {
            components.forEach(targetComp => {
                targetComp.inputs.forEach(input => {
                    // Check if this is a string or object
                    const inputWire = typeof input === 'string' ? input : input.wire;
                    
                    if (inputWire === output) {
                        connections.push({
                            from: {
                                component: sourceComp.name,
                                type: sourceComp.type,
                                port: 'out'
                            },
                            to: {
                                component: targetComp.name,
                                type: targetComp.type,
                                port: typeof input === 'string' ? 'in' : input.port
                            },
                            wire: output
                        });
                    }
                });
            });
        });
    });
    
    // Add module input/output connections to the global inputs/outputs
    Object.entries(ports).forEach(([portName, portType]) => {
        if (portType === 'input') {
            const portOutputWire = `${portName}_output_0_0`;
            components.forEach(targetComp => {
                targetComp.inputs.forEach(input => {
                    const inputWire = typeof input === 'string' ? input : input.wire;
                    if (inputWire === portOutputWire) {
                        connections.push({
                            from: {
                                component: portName,
                                type: 'INPUT',
                                port: 'out'
                            },
                            to: {
                                component: targetComp.name,
                                type: targetComp.type,
                                port: typeof input === 'string' ? 'in' : input.port
                            },
                            wire: portOutputWire
                        });
                    }
                });
            });
        } else if (portType === 'output') {
            const portInputWire = `${portName}_input_0_0`;
            components.forEach(sourceComp => {
                sourceComp.outputs.forEach(output => {
                    if (output === portInputWire) {
                        connections.push({
                            from: {
                                component: sourceComp.name,
                                type: sourceComp.type,
                                port: 'out'
                            },
                            to: {
                                component: portName,
                                type: 'OUTPUT',
                                port: 'in'
                            },
                            wire: portInputWire
                        });
                    }
                });
            });
        }
    });

    return {
        module: moduleName,
        ports: ports,
        wires: Array.from(wires),
        components: components,
        connections: connections, // Add connections to the returned object
        summary: {
            total_components: components.length,
            component_types: components.reduce((acc, comp) => {
                acc[comp.type] = (acc[comp.type] || 0) + 1;
                return acc;
            }, {}),
            routing: {
                total_connections: connections.length,
                connectivity_matrix: components.map(comp => ({
                    component: comp.name,
                    type: comp.type,
                    inputs: comp.inputs.map(input => typeof input === 'string' ? input : input.wire),
                    outputs: comp.outputs,
                    fanin: connections.filter(c => c.to.component === comp.name).length,
                    fanout: connections.filter(c => c.from.component === comp.name).length
                }))
            }
        }
    };

    // Extract bundled inputs (e.g. .in({ ... }))
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
      // Extract individual inputs (e.g. .D(...), .clock(...))
      const individualInputsRegex = /\.(D|clock|reset|CE|addr|clk|sync|async|[A-Za-z0-9_]+)\s*\(\s*(\\?[A-Za-z0-9_$~^\-\.:\[\]]+|1'b[01])\s*\)/g;
      let individualInputMatch;
      while ((individualInputMatch = individualInputsRegex.exec(trimmedBlock)) !== null) {
        const portName = individualInputMatch[1];
        // Exclude outputs (like Q or out) if they are used as inputs
        if (portName.toLowerCase() === 'q' || portName.toLowerCase() === 'out') continue;

        const inputValue = individualInputMatch[2];
        const constantMatch = inputValue.match(/1'b([01])/);

        // For LUTs, handle constant inputs
        if (componentType === "LUT" && constantMatch && constantMatch[1] === '0') {
          // Include constant inputs with special handling
          component.inputs.push({
            port: portName,
            wire: `constant_${constantMatch[1]}`,
            constant: true,
            value: 0,
            pinIndex: component.inputs.length
          });
          continue;
        }

        // Add the input as usual
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

    // Handle special cases for components
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

    // Extract outputs
    const outputRegex = /\.out\(\s*(\\?[A-Za-z0-9_$~^\-\.:\[\]]+)\s*\)/;
    const outputMatch = trimmedBlock.match(outputRegex);
    if (outputMatch) {
      component.outputs.push({ wire: outputMatch[1], pinIndex: 0 });
    } else {
      // Try to extract Q output for DFFs
      const qOutputRegex = /\.Q\(\s*(\\?[A-Za-z0-9_$~^\-\.:\[\]]+)\s*\)/;
      const qOutputMatch = trimmedBlock.match(qOutputRegex);
      if (qOutputMatch) {
        component.outputs.push({ wire: qOutputMatch[1], pinIndex: 0 });
      }
    }

    components.push(component);
  }

  // Extract interconnects
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

  // Create connections mapping
  // First, create a map of all outputs to their source components
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

  // Now map inputs to their sources
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

  // Handle interconnects as connections
  interconnects.forEach(ic => {
    // Find the source of datain
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

    // Add interconnect output as a source
    outputToSource[ic.dataout] = {
      component: ic.name,
      type: "interconnect",
      port: "out",
      pinIndex: 0
    };

    // Connect interconnect outputs to their targets
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

  // Add module-level I/O connections
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

  // Create explicit pin connections
  const pinConnections = connections.map(conn => ({
    from: `${conn.from.component}.${conn.from.port}`,
    to: `${conn.to.component}.${conn.to.port}`,
    wire: conn.wire
  }));

  // Create summary
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

function parseSDF(sdfContent) {
    // Clean up the SDF content
    sdfContent = sdfContent.replace(/\/\*[\s\S]*?\*\//g, '');
    sdfContent = sdfContent.replace(/\/\/.*$/gm, '');
    
    // Remove empty lines
    sdfContent = sdfContent.split('\n')
      .filter(line => line.trim() !== '')
      .join('\n');
    
    const delays = [];
    
    // Extract cell delays
    const cellBlocks = sdfContent.split('CELL');
    for (let i = 1; i < cellBlocks.length; i++) {
      const cellBlock = cellBlocks[i];
      
      // Extract cell type and instance
      const cellTypeMatch = cellBlock.match(/\(\s*CELLTYPE\s*"([^"]+)"\s*\)/);
      const instanceMatch = cellBlock.match(/\(\s*INSTANCE\s*([^\s\)]+)\s*\)/);
      
      if (!cellTypeMatch || !instanceMatch) continue;
      
      const cellType = cellTypeMatch[1];
      const instance = instanceMatch[1];
      
      // Extract timing information
      const timingBlocks = cellBlock.split('DELAY');
      for (let j = 1; j < timingBlocks.length; j++) {
        const timingBlock = timingBlocks[j];
        
        // Extract IOPATH delays
        const ioPaths = timingBlock.match(/\(\s*IOPATH\s+([^\s]+)\s+([^\s]+)\s+\(\s*([^)]+)\s*\)\s*\(\s*([^)]+)\s*\)\s*\)/g);
        
        if (ioPaths) {
          ioPaths.forEach(ioPath => {
            const matches = ioPath.match(/\(\s*IOPATH\s+([^\s]+)\s+([^\s]+)\s+\(\s*([^)]+)\s*\)\s*\(\s*([^)]+)\s*\)\s*\)/);
            if (matches) {
              const [, inputPort, outputPort, riseDelays, fallDelays] = matches;
              
              // Parse rise and fall delays (min:typ:max)
              const riseDelayValues = riseDelays.split(':').map(v => parseFloat(v.trim()));
              const fallDelayValues = fallDelays.split(':').map(v => parseFloat(v.trim()));
              
              delays.push({
                cellType,
                instance,
                from: inputPort,
                to: outputPort,
                rise: {
                  min: riseDelayValues[0] || 0,
                  typ: riseDelayValues[1] || 0,
                  max: riseDelayValues[2] || 0
                },
                fall: {
                  min: fallDelayValues[0] || 0,
                  typ: fallDelayValues[1] || 0,
                  max: fallDelayValues[2] || 0
                }
              });
            }
          });
        }
        
        // Extract SETUPHOLD timing
        const setupHolds = timingBlock.match(/\(\s*SETUPHOLD\s+([^\s]+)\s+([^\s]+)\s+\(\s*([^)]+)\s*\)\s*\(\s*([^)]+)\s*\)\s*\)/g);
        
        if (setupHolds) {
          setupHolds.forEach(setupHold => {
            const matches = setupHold.match(/\(\s*SETUPHOLD\s+([^\s]+)\s+([^\s]+)\s+\(\s*([^)]+)\s*\)\s*\(\s*([^)]+)\s*\)\s*\)/);
            if (matches) {
              const [, dataPort, clockPort, setupDelays, holdDelays] = matches;
              
              // Parse setup and hold delays (min:typ:max)
              const setupDelayValues = setupDelays.split(':').map(v => parseFloat(v.trim()));
              const holdDelayValues = holdDelays.split(':').map(v => parseFloat(v.trim()));
              
              delays.push({
                cellType,
                instance,
                type: 'SETUPHOLD',
                data: dataPort,
                clock: clockPort,
                setup: {
                  min: setupDelayValues[0] || 0,
                  typ: setupDelayValues[1] || 0,
                  max: setupDelayValues[2] || 0
                },
                hold: {
                  min: holdDelayValues[0] || 0,
                  typ: holdDelayValues[1] || 0,
                  max: holdDelayValues[2] || 0
                }
              });
            }
          });
        }
        
        // Extract WIDTH timing
        const widths = timingBlock.match(/\(\s*WIDTH\s+([^\s]+)\s+\(\s*([^)]+)\s*\)\s*\)/g);
        
        if (widths) {
          widths.forEach(width => {
            const matches = width.match(/\(\s*WIDTH\s+([^\s]+)\s+\(\s*([^)]+)\s*\)\s*\)/);
            if (matches) {
              const [, port, widthValues] = matches;
              
              // Parse width values (min:typ:max)
              const widthDelayValues = widthValues.split(':').map(v => parseFloat(v.trim()));
              
              delays.push({
                cellType,
                instance,
                type: 'WIDTH',
                port: port,
                width: {
                  min: widthDelayValues[0] || 0,
                  typ: widthDelayValues[1] || 0,
                  max: widthDelayValues[2] || 0
                }
              });
            }
          });
        }
      }
    }
    
    return delays;
  }
  function analyzeCircuitFiles(verilogContent, sdfContent) {
    
    console.log("[Parser] Analyzing circuit files...");

    // Parse the Verilog file
    const verilogData = parseVerilog(verilogContent);
    console.log(`[Parser] Found ${verilogData.components.length} components and ${verilogData.connections.length} connections`);
    
    // Parse SDF file if provided
    let delays = [];
    if (sdfContent && sdfContent.trim()) {
      try {
        delays = parseSDF(sdfContent);
        console.log(`[Parser] Found ${delays.length} timing constraints in SDF`);
        
        // Add timing data to the circuit data
        verilogData.timing = {
            delays: delays,
            summary: {
              total_delays: delays.length,
              max_delay: Math.max(...delays
                .filter(d => d.rise || d.fall)
                .flatMap(d => [d.rise?.max || 0, d.fall?.max || 0])),
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