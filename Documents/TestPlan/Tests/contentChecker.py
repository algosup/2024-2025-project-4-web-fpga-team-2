import os
import re

# Define regex patterns for common Verilog components
VERILOG_PATTERNS = {
    "LUT": r'\bLUT\b',
    "Flip-Flop": r'\bDFF\b|\bFDRE\b|\balways\s*@\s*\(\s*posedge\b|\bQ\s*<=\s*D\b',
    "AND": r'\band\b',
    "OR": r'\bor\b',
    "XOR": r'\bxor\b',
    "MUX": r'\bmux\b',
    "NAND": r'\bnand\b',
    "NOR": r'\bnor\b',
    "NOT": r'\bnot\b',
    "BUF": r'\bbuf\b',
    "END": r'\bend\b'
}

# Improved regex to capture delay values in SDF
SDF_DELAY_PATTERN = re.compile(r"IOPATH\s+\S+\s+\S+\s+\(\s*([\d\.]+)")

def extract_delays_from_sdf(sdf_path):
    """Extract delay values from an SDF file."""
    delays = []
    try:
        with open(sdf_path, 'r', encoding='utf-8') as f:
            content = f.read()
            matches = SDF_DELAY_PATTERN.findall(content)
            delays = [float(m) for m in matches] if matches else []
    except Exception as e:
        print(f"Error reading {sdf_path}: {e}")
    return delays

def check_keywords_in_file(file_path, patterns):
    """Check if a file contains any keyword pattern."""
    found_components = set()
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
            for component, pattern in patterns.items():
                if re.search(pattern, content, re.IGNORECASE):
                    found_components.add(component)
    except Exception as e:
        print(f"Error reading {file_path}: {e}")
    return found_components

def find_matching_files(directory):
    """Find .v and .sdf files with the same base name in a given directory."""
    verilog_files = set()
    sdf_files = set()

    for file in os.listdir(directory):
        if file.endswith(".v"):
            verilog_files.add(os.path.splitext(file)[0])
        elif file.endswith(".sdf"):
            sdf_files.add(os.path.splitext(file)[0])

    return verilog_files & sdf_files  # Return common base names

def generate_schematic(base_name, delays, components):
    """Generate a schematic-like representation of the circuit with accurate delays."""
    d_delay = f"{delays[0]} ps" if len(delays) > 0 else "Unknown"
    clk_delay = f"{delays[1]} ps" if len(delays) > 1 else "Unknown"
    async_reset_delay = f"{delays[2]} ps" if len(delays) > 2 else "Unknown"
    lut_to_q_delay = f"{delays[3]} ps" if len(delays) > 3 else "Unknown"  # LUT → Q delay

    has_ff = "Flip-Flop" in components
    has_lut = "LUT" in components
    main_component = "FLIP-FLOP" if has_ff else "LUT" if has_lut else "Pass-through"

    # Create schematic lines with LUT → Q delay
    first_line = f"D--({d_delay})-->{main_component}--({lut_to_q_delay})-->Q"
    clk_line = f"Clk--({clk_delay})----|-------->end"
    async_line = f"Async--({async_reset_delay})-|"

    # Find max length for perfect alignment
    max_length = max(len(first_line), len(clk_line), len(async_line))
    
    # Adjust spacing dynamically
    first_line = first_line.ljust(max_length)
    clk_line = clk_line.ljust(max_length)
    async_line = async_line.ljust(max_length)
    arrow_pos = first_line.index(">") + 1  # Position `^` under `>`

    print(f"\nSchematic Representation of {base_name}.v & {base_name}.sdf\n")
    print(first_line)
    print(" " * arrow_pos + "^")
    print(clk_line)
    print(" " * arrow_pos + "^")
    print(async_line)

    # Display detected components
    print("\nDetected Components:")
    for comp in components:
        print(f" {comp}")


def analyze_folder(directory):
    """Analyze .v and .sdf files that share the same name in a folder."""
    matched_files = find_matching_files(directory)

    if not matched_files:
        print("No matching .v and .sdf files found.")
        return

    for base_name in matched_files:
        verilog_path = os.path.join(directory, f"{base_name}.v")
        sdf_path = os.path.join(directory, f"{base_name}.sdf")

        print(f"\nAnalyzing pair: {base_name}.v & {base_name}.sdf")

        # Check for components in both Verilog and SDF files
        v_components = check_keywords_in_file(verilog_path, VERILOG_PATTERNS)
        sdf_components = check_keywords_in_file(sdf_path, VERILOG_PATTERNS)

        all_components = v_components | sdf_components  # Combine results from both files

        # Extract delays from SDF
        delays = extract_delays_from_sdf(sdf_path)

        # Print textual schematic
        generate_schematic(base_name, delays, all_components)

if __name__ == "__main__":
    import sys

    if len(sys.argv) < 2:
        print("Usage: python analyze_lut_ff.py <folder_path>")
    else:
        folder_path = sys.argv[1]
        if os.path.isdir(folder_path):
            analyze_folder(folder_path)
        else:
            print(f"Error: {folder_path} is not a valid directory.")
