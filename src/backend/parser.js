const fs = require("fs");

/**
 * Parse SDF file to extract cell information
 * @param {string} sdfContent - Content of the SDF file
 * @returns {Array} - Parsed cell information
 */
function parseSDF(sdfContent) {
    const cells = [];
    const cellRegex = /\(CELL\s+\(CELLTYPE\s+"([^"]+)"\)\s+\(INSTANCE\s+([^)]+)\)/g;
    let match;

    while ((match = cellRegex.exec(sdfContent)) !== null) {
        const cellType = match[1];
        const instanceName = match[2];

        // Extract delays if present
        const delayRegex = /\(DELAY\s+\(ABSOLUTE\s+\(IOPATH\s+([^\s]+)\s+([^\s]+)\s+\(([^)]+)\)\s+\(([^)]+)\)/;
        const delayBlock = sdfContent.substring(match.index).match(/\(DELAY[\s\S]*?\)\s*\)/);

        let delay = null;
        if (delayBlock) {
            const delayMatch = delayBlock[0].match(delayRegex);
            if (delayMatch) {
                delay = {
                    from: delayMatch[1],
                    to: delayMatch[2],
                    rise: delayMatch[3],
                    fall: delayMatch[4]
                };
            }
        }

        cells.push({
            type: cellType,
            name: instanceName,
            delay
        });
    }

    return cells;
}

/**
 * Extract components from cell data
 * @param {Array} cells - Cell data from SDF
 * @returns {Object} - Components categorized by type
 */
function extractComponents(cells) {
    const components = [];
    const interconnects = [];
    const componentMap = new Map();

    cells.forEach(cell => {
        let { type, name, delay } = cell;

        // ✅ Remove escaped characters
        name = name.replace(/\\[$:.]/g, "");

        if (type.includes("fpga_interconnect")) {
            interconnects.push({ name, type: "interconnect", ...cell });
        } else {
            const componentType = inferComponentType(name);
            if (componentType === "dff" || componentType === "lut" || componentType === "bram") {
                // ✅ Ensure DFFs get the correct delay
                if (componentType === "dff") {
                    const dffDelay = delay ? delay : {
                        from: "posedge clock",
                        to: "Q",
                        rise: "N/A",
                        fall: "N/A"
                    };
                    components.push({ name, type: componentType, delay: dffDelay });
                } else {
                    components.push({ name, type: componentType, ...cell });
                }
                componentMap.set(name, { name, type: componentType, ...cell });
            }
        }
    });

    return { components, interconnects };
}

/**
 * Infer component type based on name
 * @param {string} name - Component name
 * @returns {string} - Inferred component type
 */
function inferComponentType(name) {
    name = name.toLowerCase();

    if (name.includes("latch") || name.includes("ff") || name.includes("flip_flop") ||
        (name.includes("q") && name.includes("clock"))) {
        return "dff";
    } else if (name.includes("lut")) {
        return "lut";
    } else if (name.includes("bram") || name.includes("memory")) {
        return "bram";
    } else if (name.includes("output") || name.includes("input")) {
        return "io";
    } else {
        return "unknown";
    }
}

/**
 * Clean port name by removing unwanted characters
 * @param {string} portName - Raw port name
 * @returns {string} - Cleaned port name
 */
function cleanPortName(portName) {
    if (!portName) return "";

    return portName
        .replace(/\\[$:.]/g, "") // Remove escaped special characters
        .replace(/\s+/g, " ") // Condense multiple spaces
        .replace(/^\s+|\s+$/g, ""); // Trim whitespace
}

/**
 * Extract information from SDF file
 * @param {string} sdfPath - Path to SDF file
 * @returns {Object} - Extracted SDF information
 */
function extractSdfInfo(sdfPath) {
    try {
        const sdfContent = fs.readFileSync(sdfPath, "utf8");
        const cells = parseSDF(sdfContent);
        const { components, interconnects } = extractComponents(cells);

        return { cells, components, interconnects };
    } catch (error) {
        console.error("❌ Error extracting SDF info:", error);
        return null;
    }
}

/**
 * Extract information from Verilog file
 * @param {string} verilogPath - Path to Verilog file
 * @returns {Object} - Extracted Verilog information
 */
function extractVerilogInfo(verilogPath) {
    try {
        const verilogContent = fs.readFileSync(verilogPath, "utf8");

        const moduleNameMatch = verilogContent.match(/module\s+([^\s(]+)\s*\(/);
        const moduleName = moduleNameMatch ? moduleNameMatch[1] : null;

        const inputs = [...verilogContent.matchAll(/input\s+\\([\w\d_]+)/g)].map(m => m[1]);
        const outputs = [...verilogContent.matchAll(/output\s+\\([\w\d_]+)/g)].map(m => m[1]);

        // ✅ Detect Flip-Flop (DFF) instances
        const dffRegex = /DFF\s*#?\([\w\d_#(),.\s]*\)\s+\\?([\w\d_$]+)/g;
        const flipFlopMatches = [...verilogContent.matchAll(dffRegex)].map(m => m[1]);

        // ✅ Properly determine if module is a DFF
        const hasClock = inputs.some(i => i.toLowerCase().includes("clk") || i.toLowerCase().includes("clock"));
        const hasData = inputs.some(i => i.toLowerCase() === "d" || i.toLowerCase().includes("data"));
        const hasOutput = outputs.some(o => o.toLowerCase() === "q" || o.toLowerCase().includes("out"));

        const isDFF = hasClock && hasData && hasOutput || flipFlopMatches.length > 0;

        return {
            moduleName,
            inputs,
            outputs,
            isDFF,
            hasClock
        };
    } catch (error) {
        console.error("❌ Error extracting Verilog info:", error);
        return null;
    }
}

/**
 * Generate JSON from Verilog and SDF files
 * @param {string} verilogPath - Path to Verilog file
 * @param {string} sdfPath - Path to SDF file
 * @param {string} outputPath - Path to output JSON file
 * @returns {Promise<void>}
 */
async function generateJson(verilogPath, sdfPath, outputPath) {
    try {
        const verilogInfo = extractVerilogInfo(verilogPath);
        const sdfInfo = extractSdfInfo(sdfPath);

        if (!verilogInfo || !sdfInfo) {
            throw new Error("Failed to extract information from Verilog or SDF files.");
        }

        const jsonData = {
            moduleName: verilogInfo.moduleName,
            inputs: verilogInfo.inputs.map(cleanPortName),
            outputs: verilogInfo.outputs.map(cleanPortName),
            components: sdfInfo.components,
            interconnects: sdfInfo.interconnects
        };

        fs.writeFileSync(outputPath, JSON.stringify(jsonData, null, 4));
        console.log("✅ JSON file successfully generated:", outputPath);
    } catch (error) {
        console.error("❌ Error generating JSON:", error);
        throw error;
    }
}

// ✅ Export functions
module.exports = {
    extractVerilogInfo,
    extractSdfInfo,
    generateJson
};