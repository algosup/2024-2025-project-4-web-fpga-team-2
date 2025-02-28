import os
import re

# Common Flip-Flop patterns in Verilog
FF_PATTERNS = [
    r'\bDFF\b',           # Generic D Flip-Flop
    r'\bFDRE\b',          # Xilinx FDRE Flip-Flop
    r'\balways\s*@\s*\(\s*posedge\b',  # Always block with posedge clock
    r'\bQ\s*<=\s*D\b',    # Basic FF behavior (Q <= D;)
]

# Improved regex to capture delay values in SDF
SDF_DELAY_PATTERN = re.compile(r"IOPATH\s+\S+\s+\S+\s+\(\s*([\d\.]+)")

def extract_delays_from_sdf(sdf_path):
    """Extract delay values from an SDF file."""
    delays = []
    try:
        with open(sdf_path, 'r', encoding='utf-8') as f:
            content = f.read()
            matches = SDF_DELAY_PATTERN.findall(content)
            if matches:
                delays = [float(m) for m in matches]
            else:
                print(f"No delay values found in {sdf_path}.")
    except Exception as e:
        print(f"Error reading {sdf_path}: {e}")
    return delays

def check_keywords_in_file(file_path, patterns):
    """Check if a file contains any keyword pattern (LUT or Flip-Flop)."""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
            for pattern in patterns:
                if re.search(pattern, content, re.IGNORECASE):
                    return True
    except Exception as e:
        print(f"Error reading {file_path}: {e}")
    return False

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

def generate_schematic(base_name, delays, has_lut, has_ff):
    """Generate a schematic-like representation of the circuit."""
    d_delay = delays[0] if len(delays) > 0 else "Unknown"
    clk_delay = delays[1] if len(delays) > 1 else "Unknown"
    async_reset_delay = delays[2] if len(delays) > 2 else "Unknown"
    propagation_delay = delays[3] if len(delays) > 3 else "Unknown"

    print(f"\n Schematic Representation of {base_name}.v & {base_name}.sdf\n")
    print(f"D --({d_delay} ps)--> {'LUT' if has_lut else 'Pass-through'} --(internal processing)--> {'Flip-Flop' if has_ff else 'Output'} --({propagation_delay} ps)--> Q (END)")
    print(f"{' ' * 28}|")  # Vertical line
    print(f"{' ' * 28}|")
    print(f"clk --({clk_delay} ps)--> Flip-Flop --(output delay)--> Q (END)")
    print(f"{' ' * 28}|")
    print(f"{' ' * 28}|")
    print(f"async_reset --({async_reset_delay} ps)--> Flip-Flop (Resets Q)")

def analyze_folder(directory):
    """Analyze .v and .sdf files that share the same name in a folder."""
    matched_files = find_matching_files(directory)

    if not matched_files:
        print("No matching .v and .sdf files found.")
        return

    for base_name in matched_files:
        verilog_path = os.path.join(directory, f"{base_name}.v")
        sdf_path = os.path.join(directory, f"{base_name}.sdf")

        print(f"\n Analyzing pair: {base_name}.v & {base_name}.sdf")

        v_contains_lut = check_keywords_in_file(verilog_path, [r'\bLUT\b'])
        sdf_contains_lut = check_keywords_in_file(sdf_path, [r'\bLUT\b'])

        v_contains_ff = check_keywords_in_file(verilog_path, FF_PATTERNS)
        sdf_contains_ff = check_keywords_in_file(sdf_path, FF_PATTERNS)

        # Extract delays from SDF
        delays = extract_delays_from_sdf(sdf_path)

        # Print textual schematic
        generate_schematic(base_name, delays, v_contains_lut or sdf_contains_lut, v_contains_ff or sdf_contains_ff)

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
