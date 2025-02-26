import re
import json

# File Paths
verilog_file = "RisingEdge_DFlipFlop_AsyncResetHigh_post_synthesis.v"
sdf_file = "RisingEdge_DFlipFlop_AsyncResetHigh_post_synthesis.sdf"

# --- Step 1: Parse Verilog ---
def parse_verilog(verilog_file):
    verilog_data = {"module": None, "inputs": [], "outputs": [], "wires": [], "components": []}
    
    module_pattern = re.compile(r"module\s+(?P<name>\w+)")
    input_pattern = re.compile(r"input\s+\\?(?P<name>\w+)")
    output_pattern = re.compile(r"output\s+\\?(?P<name>\w+)")
    wire_pattern = re.compile(r"wire\s+\\?(?P<name>\w+)")
    component_pattern = re.compile(r"(?P<type>\w+)\s+\\?(?P<name>\w+)\s*\(")

    with open(verilog_file, "r") as file:
        for line in file:
            if module_match := module_pattern.search(line):
                verilog_data["module"] = module_match.group("name")
            if input_match := input_pattern.search(line):
                verilog_data["inputs"].append(input_match.group("name"))
            if output_match := output_pattern.search(line):
                verilog_data["outputs"].append(output_match.group("name"))
            if wire_match := wire_pattern.search(line):
                verilog_data["wires"].append(wire_match.group("name"))
            if component_match := component_pattern.search(line):
                verilog_data["components"].append({
                    "type": component_match.group("type"),
                    "name": component_match.group("name")
                })
    
    return verilog_data

# --- Step 2: Parse SDF ---
def parse_sdf(sdf_file):
    sdf_delays = []
    sdf_cell_pattern = re.compile(r"\(CELLTYPE\s+\"(?P<cell_type>\w+)\"\)")
    sdf_instance_pattern = re.compile(r"\(INSTANCE\s+(?P<instance>[\w\d_/]+)\)")
    sdf_delay_pattern = re.compile(r"\(IOPATH\s+(?P<in>\w+)\s+(?P<out>\w+)\s+\((?P<delay>[\d\.]+):")

    current_cell = None
    current_instance = None

    with open(sdf_file, "r") as file:
        for line in file:
            if cell_match := sdf_cell_pattern.search(line):
                current_cell = cell_match.group("cell_type")
            if instance_match := sdf_instance_pattern.search(line):
                current_instance = instance_match.group("instance")
            if delay_match := sdf_delay_pattern.search(line):
                sdf_delays.append({
                    "cell_type": current_cell,
                    "instance": current_instance,
                    "input": delay_match.group("in"),
                    "output": delay_match.group("out"),
                    "delay_ps": float(delay_match.group("delay"))
                })

    return sdf_delays

# --- Step 3: Combine Data ---
parsed_data = {
    **parse_verilog(verilog_file),
    "sdf_delays": parse_sdf(sdf_file)
}

# --- Step 4: Save as JSON ---
json_output_path = "parsed_fpga_data.json"
with open(json_output_path, "w") as json_file:
    json.dump(parsed_data, json_file, indent=4)

print(f"✅ JSON saved to {json_output_path}")
