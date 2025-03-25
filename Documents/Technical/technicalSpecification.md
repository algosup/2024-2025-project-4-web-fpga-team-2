# Technical Specification

<div align="center">

**Project Name:** Web FPGA
**Team:** Team 2  
**Document Edited by:** Léna<br>
**Last Time Modified:** 03/24/2025

</div>


![-](https://raw.githubusercontent.com/andreasbm/readme/master/assets/lines/rainbow.png)

## Table Of Contents

<details>
<summary>Table Of Contents</summary>

  - [1.Introduction](#1introduction)
  - [2.Objectives](#2objectives)
  - [3.Project Folder Structure](#3project-folder-structure)
  - [4.Conventions](#4conventions)
  - [5.Requirements](#5requirements)
  - [6.Technologies used](#6technologies-used)
    - [HTML, CSS And JavaScript](#html-css-and-javascript)
    - [JSON](#json)
    - [Node.js, D3.js, React And TypeScript](#nodejs-d3js-react-and-typescript)
    - [Parser](#parser)
  - [7.Frontend](#7frontend)
    - [Overview](#overview)
    - [Display The Circuit](#display-the-circuit)
    - [Animation](#animation)
  - [8.Backend](#8backend)
    - [Server](#server)
    - [Parser](#parser-1)
    - [When You Upload A File(POST)](#when-you-upload-a-filepost)
    - [Delete A File(DELETE)](#delete-a-filedelete)
  - [9.Glossary](#9glossary)


</details>

## 1.Introduction
The project consists of creating a web page that simulates the behavior of an FPGA[^FPGA] and generates, from a .v and .sdf file, a blueprint of the FPGA with its components and the connections between them. It is intended to be used to teach people how signals propagate inside an FPGA.

## 2.Objectives

- The teacher will access the web page, use the functionality to load a .v and .sdf file, and simulate an FPGA to generate a blueprint of its components and their connections.

- The web page will provide a user-friendly interface for the teacher to interact with.

- The blueprint can be downloaded or shared as a .png file

- The teacher will access the web page, use this functionality, and share it with students to explain how an FPGA works.

- Students will view the web page while the teacher explains and simulates the FPGA's behavior.



## 3.Project Folder Structure

```bash
📦2024-2025-project-4-web-fpga-team-2-programs
├──📁Documents   # folder that stores all the main files
│  ├──📁ReadmeExtensions
│  │
│  ├──📁Functional
│  │  └──📁Images
│  │  └──📝functionalSpecification.md
│  │  
│  ├──📁Management
│  │  └──📁Images   
│  │  └──📁ManagementArtifacts
│  │  └──📁WeeklyReports
│  │                     
│  ├──📁QualityAssurance
│  │  └──📁Images    
│  │  └──📝testCaseRules.md  
│  │  └──📝testPlan.md   
│  │              
│  ├──📁Technical                                
│  │  └──📁Images
│  │  └──📝technicalSpecification.md
│  │  └──📝convention.md
│
├──📁src                                          
├──📄.gitignore   # ignore the file mentioned inside                      
├──📝README.md
├──📝LICENSE
```
## 4.Conventions

There are conventions to follow during the project.
You can check them using this link :
[Convention](https://github.com/algosup/2024-2025-project-4-web-fpga-team-2/blob/main/Documents/Technical/convention.md)

## 5.Requirements

To see all requirements it is recommended to read the [functional specification](https://github.com/algosup/2024-2025-project-4-web-fpga-team-2/blob/main/Documents/Functional/functionalSpecification.md) document.

## 6.Technologies used

### HTML, CSS And JavaScript

- HTML[^html] will be used to build the website's structure.
- CSS[^css] will be used for the website's design.
- JavaScript[^js] will be used to interactivity between client and website.

### JSON
- JSON[^json] will be used to exchange information between the server and the web application.

### Node.js, D3.js, React And TypeScript

- Node.js[^node.js] will be used to create an http server and manage API requests with Express.
- React[^react] will be used for the circuit visualizer(render).
- TypeScript[^TypeScript] will be used for the circuit visualizer.
- D3.js[^d3js] will be used to zoom in and out on the circuit diagram or manipulate the DOM.



### Parser  

To read the .v and .sdf file, a parser will be used. The parser reads the file and translate it into a .json file, facilitating data exchange and transmission.

## 7.Frontend

### Overview
The frontend of the website will be made using HyperText Markup Language (HTML), Cascading Style Sheets (CSS) , and JavaScript (JS).

HTML is used to build the structure of the website , which can then be interpreted by any browser on any hardware to display the website.<br>
We then use CSS to change the appearance of the website, making it more visually appealing, resulting in a more attractive website and a better user experience.  <br>
Finally, JS is used to handle events and modify the webpage directly from the browser, such as load a file.


### Display The Circuit

The file circuitVisualizer.tsx will be placed in the “Frontend” folder.
This file will be the render of this project.
 
To display a circuit, the program need a JSON file.

- Fetch will be used to retrieve the JSON file containing the circuit information.
- The D3.js library will be used to zoom in and out on the circuit diagram.
- Dagre (in the D3.js library) will be used to automatically arrange circuit components in the form of oriented graphs.
- D3.js will be used to manipulate the DOM (Document Object Model), draw circles for pins and connect components with lines (arcs or segments).
- The D3.js library will be used to generate and display the SVG graphics, making the circuit interactive and manipulable (zoom, move the schema).



### Animation

As stated in the functional, it must have an animation that represents the current flowing between the various circuit components.

To represent the current flowing between the components we will use D3.js to create circles.
These small circles will be generated from the circuit inputs and will disappear at the output.
The speed of these circles will be based on the time constraint of the .json file.


## 8.Backend

### Server

The server.js file will be placed in the “Backend” folder along with the parser.js file.<br>
The server will be a Node.js Server.
This is an HTTP server that also hosts a WebSocket server, both running on the same underlying HTTP server.

<strong>What the server needs to do :</strong>

- <strong>The server enables real-time communication</strong><br>
  We will use WebSocket to allow the server to enable real-time communication by instantly sending updates to all connected clients whenever a circuit is uploaded, processed, or deleted.

- <strong>Database Management</strong><br>
  The server uses an SQLite database to store metadata about uploaded circuits.<br>
    Each circuit entry includes a unique ID, name, creation date, JSON file path, and description.<br>
    The database ensures that circuits can be listed, retrieved by ID, and deleted when needed.<br>
    When a circuit is deleted, the corresponding database entry and JSON file are removed to keep the storage clean.

- <strong>API REST</strong><br>
  POST : Must be able to upload two files (Verilog and SDF), which are then processed to generate a JSON file representing the circuit. <br>
  GET : Retrieves a list of existing circuits or detailed information on a specific circuit via its ID. <br>
  DELETE : The teacher will be able to delete a file that has already been upload.
  

- <strong>Generates an upload folder</strong><br>
 The upload folder will only be generated if it doesn't exist. <br>
 It can be accessed using the HTTP protocol.<br>
 This folder will contain all files downloaded by the teacher in JSON format.

- <strong>Gives a name to the JSON file created in the upload folder</strong><br>
  To do this, we'll use the Multer module. <br>
  The file of each file will be based on the date and the original file's extension.


### Parser

The parser.js file will be placed in the “Backend” folder along with the server.js file.<br>
	
This file will be a set of JavaScript functions for extracting all information from a Verilog file.

-  <strong>clean_up_verilog(VerilogCode)</strong> : should 'clean' the .v file, delete the commentaire and void ligne.
-  <strong>parse_verilog(VerilogCode)</strong> : It seeks to identify the various elements of the circuit, input, output and wire. In order to create a structure representing the Verilog code.
-  <strong>parse_SDF(sdfContent)</strong> : Should analyzes an SDF file to extract timing information, such as propagation delays and timings.
-  <strong>analyze_circuit_files(VerilogCode, sdfContent)</strong> : After identify the components,this function creates connections between the various circuit components.
-  <strong>generate_json_file(data, filePath)</strong> : Generates a JSON file from a data object and saves it in the filePath location. It's will be use to creat JSON file based on .sdf and .v files.






### When You Upload A File(POST)

For the teacher's side, here's how to upload a file. 

![ImageUpload](Images/upload.png)


### Delete A File(DELETE)

the teacher will be able to delete a file that has already been uploaded.

There will be a folder called “upload” containing all the files uploaded by the teacher in json format.

To delete a file, the teacher presses the “delete” button and the file is removed from the folder and from the SQLite database.

- the server extracts the circuit ID from the URL of the HTTP request.
- An SQL query is sent to the database to find the circuit entry.
  - if the circuit wasn't found : send "404 circuit not found"
  - if the circuit was found : delete the JSON file in the folder upload and delete circuit in the database with this SQL query.
    ```SQL
    DELETE FROM circuit WHERE id = CircuitIdDeleted ;
    ```
- All clients connected via WebSocket receive a notification that a circuit has been deleted.







## 9.Glossary


[^FPGA]: FPGA is an acronym for Field Programmable Gate Array. it is an integrated circuit with basic elements and pre-configured electrical signal path between them. [source](http://en.wikipedia.org/wiki/Field-programmable_gate_array)

[^html]: HTML is an acronym for Hypertext Markup Language which  is the standard markup language for documents designed to be displayed in a web browser. [Source](https://en.wikipedia.org/wiki/HTML)

[^css]: CSS is an acronym for Cascading Style Sheets that is a style sheet language used for specifying the presentation and styling of a document written in a markup language. [Source](https://en.wikipedia.org/wiki/CSS)

[^js]: JS is a programming language and core technology of the World Wide Web, alongside HTML and CSS.[Source](https://en.wikipedia.org/wiki/JavaScript)


[^json]: JSON is an acronym for JavaScript Object Notation an open standard file format and data interchange format that uses human-readable text to store and transfer data objects consisting of name-value pairs and arrays (or other serializable values). [Source](https://en.wikipedia.org/wiki/JSON)

[^node.js]: Node.js is an asynchronous event-driven JavaScript runtime that is designed to build scalable network applications. [Source](https://nodejs.org/en/about)

[^react]: React is a library for web and native user interfaces library. [Source](https://react.dev/)

[^TypeScript]: TypeScript is a syntactic superset of JavaScript that adds static typing. [Source](https://www.typescriptlang.org/)

[^d3js]: D3.js is JavaScript library for bespoke data visualization. [Source](https://d3js.org/)