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
The project consists of creating a webpage that simulates the behavior of an FPGA and generates, from a .v and .sdf file, a blueprint of the FPGA with its components and the connections between them. It is intended to be used to teach people how signals propagate inside an FPGA.

## Objectives

- Simulate an FPGA and generate a blueprint of its components and their connections.

- Provide a user-friendly interface.

- Load a .v and .sdf file.

- Download or share the blueprint as a .png file.

- The teacher will access the webpage, use this functionality, and share it with students to explain how an FPGA works.

- Students will view the webpage while the teacher explains and simulates the FPGA's behavior.



## Project Folder Structure

```bash
2024-2025-project-4-web-fpga-team-2-programs
├── Documents   # folder that stores all the main files
│  ├── Functional
│  │  └──Images
│  │  └──functionalSpecification.md
│  │  
│  ├── Management
│  │  └──Images   
│  │  └──ManagementArtifacts
│  │  └──WeeklyReports
│  │                     
│  ├── QualityAssurance
│  │  └──Images    
│  │  └──TestCaseRules.md  
│  │  └──testPlan.md   
│  │              
│  ├── Technical                                
│  │  └──Images
│  │  └──technicalSpecification.md
│  │  └──convention.md
│
├── src                                          
├──.gitignore   # ignore the file mentioned inside                      
├── README.md
├──LICENSE
```
## Conventions

There are conventions to follow during the project.
You can check them using this link:
[Convention](https://github.com/algosup/2024-2025-project-4-web-fpga-team-2/blob/main/Documents/Technical/convention.md)

## Requirements

To see all Requirements it is recommended to read the [functional specification](https://github.com/algosup/2024-2025-project-4-web-fpga-team-2/blob/main/Documents/Functional/functionalSpecification.md) document.

## System Architecture
### A. Overview

| Input | Processing | Output |
| ----- | ---------- | ------ |
|A .v file or .sdf file.|Read the file.|Display a blueprint of FPGA components and their connections on the web page.|



### B. Components

### C. Technologies

(parseur)

## Glossary

[^FPGA] : FPGA is an acronym for Field Programmable Gate Array. it is an integrated circuit with basic elements and preconfigured electrical signal routes between them.

[^html] : HTML is an acronym for Hypertext Markup Language that is the standard markup language for documents designed to be displayed in a web browser. [Source](https://en.wikipedia.org/wiki/HTML)

[^css] : CSS is an acronym for Cascading Style Sheets that is a style sheet language used for specifying the presentation and styling of a document written in a markup language. [Source](https://en.wikipedia.org/wiki/CSS)

[^javascript] : is a programming language and core technology of the World Wide Web, alongside HTML and CSS.[Source](https://en.wikipedia.org/wiki/JavaScript)

[^node.js] : Node.js an asynchronous event-driven JavaScript runtime that is designed to build scalable network applications. [Source](https://nodejs.org/en/about)

[^react] : React is a library for web and native user interfaces. [Source](https://react.dev/)

[^TypeScript] : TypeScript is a syntactic superset of JavaScript which adds static typing. [Source](https://www.typescriptlang.org/)

