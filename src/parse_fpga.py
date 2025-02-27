import json
import re

def extract_verilog_info(verilog_file):
    """
    Extracts module name, inputs, outputs, and wires from a Verilog file.
    """
    with open(verilog_file, "r") as file:
        content = file.read()

    # Extract module name
    module_match = re.search(r"module\s+(\w+)", content)
    module_name = module_match.group(1) if module_match else "UnknownModule"

    # Extract input and output signals
    inputs = re.findall(r"input\s+\\([\w\d_]+)", content)
    outputs = re.findall(r"output\s+\\([\w\d_]+)", content)

    # Extract wires
    wires = re.findall(r"wire\s+\\([\w\d_$^]+)", content)

    return {
        "module": module_name,
        "inputs": inputs,
        "outputs": outputs,
        "wires": wires
    }

def extract_sdf_info(sdf_file):
    """
    Extracts delay paths from an SDF file.
    """
    with open(sdf_file, "r") as file:
        content = file.read()

    delay_patterns = re.findall(r"\(IOPATH\s+(\w+)\s+(\w+)\s+\(([\d\.]+):([\d\.]+):([\d\.]+)\)", content)
    delays = [
        {
            "from": d[0],
            "to": d[1],
            "min": float(d[2]),
            "typ": float(d[3]),
            "max": float(d[4]),
        }
        for d in delay_patterns
    ]

    return {"delays": delays}

def generate_json(verilog_file, sdf_file, output_json):
    """
    Generates a JSON file from Verilog and SDF files.
    """
    verilog_info = extract_verilog_info(verilog_file)
    sdf_info = extract_sdf_info(sdf_file)

    design_data = {**verilog_info, **sdf_info}

    with open(output_json, "w") as json_file:
        json.dump(design_data, json_file, indent=4)

    print(f"JSON file created: {output_json}")

# Example usage:
if __name__ == "__main__":
    verilog_file = "RisingEdge_DFlipFlop_AsyncResetHigh_post_synthesis.v"
    sdf_file = "RisingEdge_DFlipFlop_AsyncResetHigh_post_synthesis.sdf"
    output_json = "board_design.json"

    generate_json(verilog_file, sdf_file, output_json)
