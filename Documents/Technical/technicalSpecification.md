# Technical Specification

<div align="center">

**Project Name:** Web FPGA
**Team:** Team 2  
**Document Edited by:** Léna<br>
**Last Time Modified:** 03/13/2025

</div>


![-](https://raw.githubusercontent.com/andreasbm/readme/master/assets/lines/rainbow.png)

## Table Of Contents

<details close>
<summary>Table Of Contents</summary>
</details>

## Introduction
The project consists of creating a webpage that simulates the behavior of an FPGA[^FPGA] and generates, from a .v and .sdf file, a blueprint of the FPGA with its components and the connections between them. It is intended to be used to teach people how signals propagate inside an FPGA.

## Objectives

- Simulate an FPGA and generate a blueprint of its components and their connections.

- Provide a user-friendly interface.

- Load a .v and .sdf file.

- Download or share the blueprint as a .png file.

- The teacher will access the webpage, use this functionality, and share it with students to explain how an FPGA works.

- Students will view the webpage while the teacher explains and simulates the FPGA's behavior.



## Project Folder Structure

```bash
📦2024-2025-project-4-web-fpga-team-2-programs
├──📁Documents   # folder that stores all the main files
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
## Conventions

There are conventions to follow during the project.
You can check them using this link :
[Convention](https://github.com/algosup/2024-2025-project-4-web-fpga-team-2/blob/main/Documents/Technical/convention.md)

## Requirements

To see all Requirements it is recommended to read the [functional specification](https://github.com/algosup/2024-2025-project-4-web-fpga-team-2/blob/main/Documents/Functional/functionalSpecification.md) document.

## Technologies used

### HTML, CSS And JavaScript

- HTML[^html] will be used to build the website's structure.
- CSS[^css] : will be used for the website's design.
- JavaScript[^js] will be used to interactivity between client and website.

### JSON
- JSON[^json] will be used to exchange information between the server and the web application.

### Node.js, React And TypeScript

- Node.js[^node.js] will be used to create a server http and Managing API requests with Express.
- React[^react] will be used for the circuit visualizer(render).
- TypeScript[^TypeScript] will be used to 

### Parser  

In order to read the .v and .sdf file we will used a parser.
Parser reads the file and translate it into .json file, facilitates data exchange and transmission.

## Frontend

The front end of the website will be made using HyperText Markup Language (HTML), Cascading Style Sheets (CSS) , and JavaScript (JS) .

HTML is used to build the structure of the website , which can then be interpreted by any browser on any hardware to display the website.<br>
We then use CSS to modify the appearance of the website, making it more visually appealing, which results in a more attractive website and a better user experience. <br>
Finally, JS is used to handle events and modify the webpage directly from the browser, such as load a file.

## Backend

### Server

The server.js file will be placed in the “Backend” folder along with the parser.js file.<br>
The server will be a Node.js Server.
This is an HTTP server that also hosts a WebSocket server, both running on the same underlying HTTP server.

<strong>what the server has to do :</strong>

- <strong>The server enables real-time communication</strong><br>
  We will use WebSocket to allow the server to enable real-time communication by instantly broadcasting updates to all connected clients whenever a circuit is uploaded, processed, or deleted.

- <strong>API REST</strong>
  

- <strong>generates an upload folder</strong><br>
 The folder upload will be generated only when it doesn't exist. <br>
 It can be accessed using the HTTP protocol.<br>
 This folder will contain all files downloaded by the teacher in JSON format.

- <strong>gives a name to the JSON file created in the upload folder</strong><br>
  To do this, we'll use the Multer module. <br>
  The file of each file will be based on the date and the original file's extension.

- <strong>Manage Database</strong><br>
  The server uses an SQLite database to store metadata about uploaded circuits.<br>
    Each circuit entry includes a unique ID, name, creation date, JSON file path, and description.<br>
    The database ensures that circuits can be listed, retrieved by ID, and deleted when needed.<br>
    When a circuit is deleted, the corresponding database entry and JSON file are removed to keep the storage clean.






### When You Upload A File(POST)

For the teacher, here's how to upload a file. 

![ImageUpload](Images/upload.png)


### Delete a file(DELETE)

the teacher will be able to delete a file that has already been upload.

There will be a folder called “upload” containing all the files uploaded by the teacher in json format.
To delete a file, the teacher presses the “delete” button and the file is removed from the folder.


### display schema on student side





## Glossary


[^FPGA] : FPGA is an acronym for Field Programmable Gate Array. it is an integrated circuit with basic elements and preconfigured electrical signal routes between them. [source](http://en.wikipedia.org/wiki/Field-programmable_gate_array)

[^html] : HTML is an acronym for Hypertext Markup Language that is the standard markup language for documents designed to be displayed in a web browser. [Source](https://en.wikipedia.org/wiki/HTML)

[^css] : CSS is an acronym for Cascading Style Sheets that is a style sheet language used for specifying the presentation and styling of a document written in a markup language. [Source](https://en.wikipedia.org/wiki/CSS)

[^js] : is a programming language and core technology of the World Wide Web, alongside HTML and CSS.[Source](https://en.wikipedia.org/wiki/JavaScript)


[^json] : JSON is an acronym for JavaScript Object Notation an open standard file format and data interchange format that uses human-readable text to store and transmit data objects consisting of name-value pairs and arrays (or other serializable values). [Source](https://en.wikipedia.org/wiki/JSON)

[^node.js] : Node.js an asynchronous event-driven JavaScript runtime that is designed to build scalable network applications. [Source](https://nodejs.org/en/about)

[^react] : React is a library for web and native user interfaces. [Source](https://react.dev/)

[^TypeScript] : TypeScript is a syntactic superset of JavaScript which adds static typing. [Source](https://www.typescriptlang.org/)

