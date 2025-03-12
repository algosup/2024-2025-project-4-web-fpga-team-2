const fs = require("fs");

function parseVerilog(verilogContent) {
    // Remove block and line comments
    verilogContent = verilogContent.replace(/\/\*[\s\S]*?\*\//g, ' ');
    verilogContent = verilogContent.replace(/\/\/.*$/gm, '');

    let moduleName = "";
    let ports = {};
    let wires = new Set();
    let components = [];
    let connections = [];

    // Helper: Extract wire name from a pin object or string.
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

    // Split the file into component blocks by detecting instantiations ending with ');'
    const componentBlocks = verilogContent.split(');');
    for (const block of componentBlocks) {
        const trimmedBlock = block.trim();
        if (!trimmedBlock) continue;

        // Extract the component type (with optional parameter list)
        const typeMatch = trimmedBlock.match(/^\s*([A-Za-z0-9_]+)\s*(?:#\s*\(.*?\))?\s+/s);
        if (!typeMatch) continue;
        const originalType = typeMatch[1];
        let componentType = "Unknown";
        if (/^(DFF|FF|FLIPFLOP|SDFF|SDFFR|NX_DFF|QDFF|TDFF|SYNC_DFF|ASYNC_DFF|DFLIPFLOP|RISINGEDGE_DFLIPFLOP)$/i.test(originalType)) {
            componentType = "DFF";
        } else if (/^(LUT|LUT_K|FULLLUT|LOOKUP|O\d*)$/i.test(originalType)) {
            componentType = "LUT";
        } else if (/^(BRAM|RAM|ROM|MEMORY|MEM)$/i.test(originalType)) {
            componentType = "BRAM";
        } else if (/^(MUX|MULTIPLEXER)$/i.test(originalType)) {
            componentType = "MUX";
        }

        // Extract instance name
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
            // In the section where you extract individual inputs:
            // Extract individual inputs (e.g. .D(...), .clock(...))
            const individualInputsRegex = /\.(D|clock|reset|CE|addr|[A-Za-z0-9_]+)\s*\(\s*(\\?[A-Za-z0-9_$~^\-\.:\[\]]+|1'b[01])\s*\)/g;
            let individualInputMatch;
            while ((individualInputMatch = individualInputsRegex.exec(trimmedBlock)) !== null) {
                const portName = individualInputMatch[1];
                // Exclude outputs (like Q or out)
                if (portName.toLowerCase() === 'q' || portName.toLowerCase() === 'out') continue;

                const inputValue = individualInputMatch[2];
                const constantMatch = inputValue.match(/1'b([01])/);

                // For LUTs, skip constant zero inputs (if that’s what you want)
                if (componentType === "LUT" && constantMatch && constantMatch[1] === '0') {
                    continue; // Skip adding this input
                }
                

                // Otherwise, add the input as usual with its pin index (based on current inputs.length)
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

        // Special case: if this is a LUT with no inputs, add 5 constant inputs.
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
            console.log(`Added constant inputs to LUT: ${instance}`);
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

    // Create connection mapping: For each component's output, if it matches another's input, record a connection.
    components.forEach(sourceComp => {
        sourceComp.outputs.forEach(output => {
            components.forEach(targetComp => {
                targetComp.inputs.forEach(input => {
                    const inputWire = getWireName(input);
                    const outputWire = getWireName(output);
                    if (inputWire === outputWire) {
                        connections.push({
                            from: {
                                component: sourceComp.name,
                                type: sourceComp.type,
                                port: 'out',
                                pinIndex: output.pinIndex
                            },
                            to: {
                                component: targetComp.name,
                                type: targetComp.type,
                                port: typeof input === 'string' ? 'in' : input.port,
                                pinIndex: typeof input === 'string' ? 0 : input.pinIndex
                            },
                            wire: outputWire
                        });
                    }
                });
            });
        });
    });

    // Add module-level I/O connections based on port declarations.
    Object.entries(ports).forEach(([portName, portType]) => {
        if (portType === 'input') {
            const portOutputWire = `${portName}_output_0_0`;
            components.forEach(targetComp => {
                targetComp.inputs.forEach(input => {
                    const inputWire = getWireName(input);
                    if (inputWire === portOutputWire) {
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
                            wire: portOutputWire
                        });
                    }
                });
            });
        } else if (portType === 'output') {
            const portInputWire = `${portName}_input_0_0`;
            components.forEach(sourceComp => {
                sourceComp.outputs.forEach(output => {
                    if (getWireName(output) === portInputWire) {
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
                            wire: portInputWire
                        });
                    }
                });
            });
        }
    });

    // Create a routing section based on interconnects found in the verilog.
    // Look for lines starting with "fpga_interconnect" and extract the datain and dataout.
    const interconnects = [];
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

    return {
        module: moduleName,
        ports: ports,
        wires: Array.from(wires),
        components: components,
        connections: connections,
        interconnects: interconnects,
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
                    inputs: comp.inputs.map(input => getWireName(input)),
                    outputs: comp.outputs.map(output => getWireName(output)),
                    fanin: connections.filter(c => c.to.component === comp.name).length,
                    fanout: connections.filter(c => c.from.component === comp.name).length
                }))
            }
        }
    };
}

function parseSDF(sdfContent) {
    const delays = [];
    const delayRegex = /IOPATH\s+(\S+)\s+(\S+)\s*\((\S+):(\S+):(\S+)\)\s*\((\S+):(\S+):(\S+)\)/g;
    let delayMatch;
    while ((delayMatch = delayRegex.exec(sdfContent)) !== null) {
        delays.push({
            from: delayMatch[1],
            to: delayMatch[2],
            rise: `${delayMatch[3]}:${delayMatch[4]}:${delayMatch[5]}`,
            fall: `${delayMatch[6]}:${delayMatch[7]}:${delayMatch[8]}`
        });
    }
    return delays;
}

function analyzeCircuitFiles(verilogContent, sdfContent) {
    const verilogData = parseVerilog(verilogContent);
    const delays = parseSDF(sdfContent);
    // Merge delays into the final JSON for the visualizer.
    return { ...verilogData, delays };
}

function generateJsonFile(parsedData, outputPath) {
    return new Promise((resolve, reject) => {
        fs.writeFile(outputPath, JSON.stringify(parsedData, null, 2), (err) => {
            if (err) reject(err);
            else resolve();
        });
    });
}

module.exports = { analyzeCircuitFiles, generateJsonFile };