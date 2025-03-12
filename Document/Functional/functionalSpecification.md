# Functional Specification

## 1. Introduction
### 1.1 Purpose

The project consist to the creation of a webpage who simulate the behave of a fpga and output from a .v and .sdf file a blueprint of the fpga with the components and the connections between them. The document will describe the requirements of the project, including the functional and non-functional requirements, the interfaces, and the system features.

### 1.2 Scope
 
#### 1.2.1 In Scope
The project include:
- Webpage with a front end.
- Load the .v and .sdf file and output the blueprint of the fpga.
- The blueprint could be download or share as a .png file.

#### 1.2.2 Out of Scope
The project exclude:
- An actual back end of the webpage.
- The implementation of the .v and .sdf files directly from the webpage.


### 1.3 Definitions, Acronyms, and Abbreviations

| Term | Backronym   | Definition |
| --- | --- | --- |
| FPGA | Field-Programmable Gate Array | A reconfigurable integrated circuit that consists of an array of programmable logic blocks and interconnects. Unlike fixed-function ASICs, FPGAs can be reprogrammed after manufacturing to perform specific logic functions, making them ideal for applications requiring flexibility, parallel processing, and hardware acceleration. |
| v | Verilog|A hardware description language (HDL) used to model, design, and simulate digital circuits. It enables engineers to describe the structure and behavior of electronic systems, making it essential for FPGA and ASIC development. Verilog supports design abstraction levels ranging from register-transfer level (RTL) to gate-level modeling.|
| sdf | Standard Delay Format  |A file format used in electronic design automation (EDA) to specify timing delays for digital circuits. SDF files contain detailed delay information, including path delays, setup and hold times, and clock-to-output delays, enabling accurate timing analysis and simulation of ASIC and FPGA designs.|
| PNG | Portable Network Graphics | A raster graphics file format that supports lossless data compression. PNG files are widely used on the web for images with transparent backgrounds, making them ideal for logos, icons, and other graphics that require crisp edges and smooth gradients.|

## 2. Overall Description
### 2.1 Stackholder

| Stackholder | Description |
| --- | --- |
| Florent | The customer of the project. Give the call of tender. |
| Algosup | The school supervise the project and the different teams. |
| Team 2 | The group dedicated to the project. |



### 2.2 Product Functions
Summarize the major functions the product will perform.
The product will:
- Simulate an FPGA.
- Load a .v and .sdf file.
- Output a blueprint of the fpga.
- Download or share the blueprint as a .png file.



### 2.3 User Characteristics

#### 2.3.1 The teacher
The teacher will access the webpage , use this functinality and share to the student to explain how the FPGA work actually.

#### 2.3.2 The student
The student during the teacher course will see the webpage and the teacher will explain how the FPGA work and simulate it.

### 2.4 Constraints

## 3. Specific Requirements
### 3.1 Functional Requirements

#### 3.1.1 Use Case
| Use Case | Description |
| --- | --- |
| Load .v and .sdf file | The user will load the .v and .sdf file to the webpage. |
|Run| The webpage run the process to the blueprint generation |
| Output blueprint | The webpage will output the blueprint of the fpga. |
| Download| The user will can download the blueprint generated |
| Share | The user will can share the blueprint generated |

### 3.2 Non-Functional Requirements
#### 3.2.1 Quality Attributes
- The webpage should be easy to use.
- The webpage has been used for educational purposes.
- The webpage is mainly design for Chromium-based browser.
- The webpage should be responsive.

### 3.3 Interface Requirements

#### 3.3.1 User Interface

##### Home Page Mockup
![Home Page](./Images/Functional/home-page.png)

##### Blueprint Page Mockup
![blueprint](./Images/Functional/blueprint-page.png)


### 3.4 System Features

#### 3.4.1 Input
- The user has use some button to the following actions:
  - Load the .v and .sdf file.
  - Run the process.
  - Download the blueprint.
  - Share the blueprint.
  - Change the stance of the blueprint (animated, schema).

#### 3.4.2 Process
- The webpage will run the process to the blueprint generation.

#### 3.4.3 Output
- The webpage will output the blueprint of the fpga.

## 4. Appendices

### 4.1 References

- [FPGA](https://en.wikipedia.org/wiki/Field-programmable_gate_array)
- [Verilog](https://en.wikipedia.org/wiki/Verilog)
- [Standard Delay Format](https://en.wikipedia.org/wiki/Standard_Delay_Format)
- [PNG](https://en.wikipedia.org/wiki/Portable_Network_Graphics)
- [Chromium](https://www.chromium.org/Home)
- [Call of tender](https://github.com/LeFl0w/ALGOSUP_POC)


