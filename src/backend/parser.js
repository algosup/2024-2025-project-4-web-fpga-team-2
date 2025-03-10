const fs = require("fs");

function parseVerilog(verilogContent) {
    verilogContent = verilogContent.replace(/\/\*[\s\S]*?\*\//g, ' ');
    verilogContent = verilogContent.replace(/\/\/.*$/gm, '');
    
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
