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

    const wireRegex = /wire\s+(\\?[A-Za-z0-9_]+)/;
    const moduleRegex = /module\s+([A-Za-z0-9_]+)\s*\(/;
    const portRegex = /(input|output)\s+(\\?[A-Za-z0-9_]+)/;
    for (const block of componentBlocks) {
        const componentMatch = block.match(/\s*([A-Za-z0-9_]+)\s*#\s*\(/s);

        if (componentMatch) {
            // Extract component type
            const type = componentMatch[1].toUpperCase();


            const instanceMatch = block.match(/\)\s*(\\?[A-Za-z0-9_$~^\-\.:]+)\s*\(/s);
            if (!instanceMatch) continue; 

            const instance = instanceMatch[1];
            let componentType = "Unknown";

            if (/^(DFF|FF|FLIPFLOP|SDFF|SDFFR|NX_DFF|QDFF|TDFF|SYNC_DFF|ASYNC_DFF|DFLIPFLOP|RISINGEDGE_DFLIPFLOP)$/i.test(type)) {
                componentType = "DFF";
            } else if (/^(LUT|LUT_K|FULLLUT|LOOKUP|O\d*)$/i.test(type)) {
                componentType = "LUT";
            } else if (/^(BRAM|MEM)$/i.test(type)) {
                componentType = "BRAM";
            } else if (/^(MUX|MUXGATE)$/i.test(type)) {
                componentType = "MUX";
            } else {
                componentType = "Other";
            }

            components.push({
                type: componentType,
                name: instance.replace(/^\\/, '')
            });

            console.log(`🔍 Debug - Found Component: ${type}, Classified as: ${componentType}, Instance: ${instance}`);
        }
    }
    for (let line of lines) {
        line = line.trim();

        let moduleMatch = line.match(moduleRegex);
        if (moduleMatch) {
            moduleName = moduleMatch[1];
            continue;
        }

        let portMatch = line.match(portRegex);
        if (portMatch) {
            ports[portMatch[2]] = portMatch[1];
            continue;
        }

        let wireMatch = line.match(wireRegex);
        if (wireMatch) {
            wires.add(wireMatch[1]);
            continue;
        }
    }

    return {
        module: moduleName,
        ports: ports,
        wires: Array.from(wires),
        components: components,
        summary: {
            total_components: components.length,
            component_types: components.reduce((acc, comp) => {
                acc[comp.type] = (acc[comp.type] || 0) + 1;
                return acc;
            }, {})
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
