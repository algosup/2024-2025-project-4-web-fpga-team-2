
<div align="center">

# Web FPGA Team 2

</div>

<p align="center">
  <a href="#️overview">Overview</a> •
  <a href="#️-whats-a-fpga-">What's a FPGA</a> •
  <a href="#-requirements-to-access-the-website">Requirements</a> •
  <a href="#-key-features">Key Features</a> •
  <a href="#️-how-to-run">How to Run</a> •
  <a href="#-how-to-use-it-">How to Use It</a> •
  <a href="#-project-documents">Documents</a> •
  <a href="#️-license">License</a>
</p>

<div align="center">
    <img src ="Documents\ReadmeExtensions\3000px_Bleu.jpg" width=auto height="300">
</div>

## 🖥️⚡Overview
We develop a web interface for an FPGA Simulator. This web interface will be used to teach people how the signals propagate inside an FPGA.

<br>
<details>

<summary><b> 👤 Contributors </b></summary>
<br>

| Photo                                                                                                           | Role               | Name              | Contact                                                                                                                                                                                                                                                                                                     |
| --------------------------------------------------------------------------------------------------------------- | ------------------ | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| <img src="https://ca.slack-edge.com/T07N4K3NA3Z-U07NK6MCR0A-g4cac1c20a04-192" width="100px" height="100">       | Project Manager    | Enoal ADAM        | [![GitHub](https://img.shields.io/badge/-GitHub-181717?logo=github&logoColor=white&style=flat-square)](https://github.com/EnoGame29)[![LinkedIn](https://img.shields.io/badge/-LinkedIn-0077B5?logo=linkedin&logoColor=white&style=flat-square)](https://www.linkedin.com/in/enoal-adam-02552932a/)         |
| <img src="https://gravatar.com/avatar/fbb2631ed2b14d85006ea91fcf223680?size=128&d=mp" width="100" height="100"> | Program Manager    | Salaheddine NAMIR | [![GitHub](https://img.shields.io/badge/-GitHub-181717?logo=github&logoColor=white&style=flat-square)](https://github.com/T3rryc)[![LinkedIn](https://img.shields.io/badge/-LinkedIn-0077B5?logo=linkedin&logoColor=white&style=flat-square)](https://www.linkedin.com/in/salaheddine-namir-3402471b8/)     |
| <img src="https://ca.slack-edge.com/T019N8PRR7W-U07DQ644220-32f6fb88c2d8-192" width="100" height="100">         | Tech Lead          | Léna De GERMAIN   | [![GitHub](https://img.shields.io/badge/GitHub-181717?style=flat&logo=github&logoColor=white)](https://github.com/lenadg18)[![LinkedIn](https://img.shields.io/badge/LinkedIn-0077B5?style=flat&logo=linkedin&logoColor=white)](https://www.linkedin.com/in/lena-degermain-5535a032a/)                      |
| <img src="https://avatars.githubusercontent.com/u/146005340?v=4" width=100 height="100">                        | Software Developer | Ian LAURENT       | [![GitHub](https://img.shields.io/badge/-GitHub-181717?logo=github&logoColor=white&style=flat-square)](https://github.com/Ianlaur)[![LinkedIn](https://img.shields.io/badge/-LinkedIn-0077B5?logo=linkedin&logoColor=white&style=flat-square)](https://www.linkedin.com/in/ian-h-laurent/)                  |
| <img src="https://gravatar.com/avatar/dc3a8fc938e413abe9fb0053201896e7?size=128&d=mp" width=100 height="100">   | Software Developer | Lucas AUBARD      | [![GitHub](https://img.shields.io/badge/-GitHub-181717?logo=github&logoColor=white&style=flat-square)](https://github.com/LucasAub)[![LinkedIn](https://img.shields.io/badge/-LinkedIn-0077B5?logo=linkedin&logoColor=white&style=flat-square)](https://www.linkedin.com/in/lucas-aubard-596b37251/)        |
| <img src="https://ca.slack-edge.com/T019N8PRR7W-U05T1QGDPGC-5b740608e738-192" width="100" height="100">         | Quality Assurance  | Mattéo LEFIN      | [![GitHub](https://img.shields.io/badge/-GitHub-181717?logo=github&logoColor=white&style=flat-square)](https://github.com/Mattstar64)[![LinkedIn](https://img.shields.io/badge/-LinkedIn-0077B5?logo=linkedin&logoColor=white&style=flat-square)](https://www.linkedin.com/in/matt%C3%A9o-lefin-380272293/) |

</details>

## 🛠️🧑‍💻 What's a FPGA ?
An FPGA is a reprogrammable electronic chip that allows users to create custom circuits. Unlike traditional processors (CPUs) that execute instructions, an FPGA can be configured to function as a specialized circuit optimized for a specific task. It is widely used in fields like aerospace, automotive, and telecommunications because it offers high flexibility and speed.

## 🔑 Requirements to Access the Website

To access our website, you need a Chromium-based browser (Edge, Chrome, Opera, etc... ) or Firefox.

## 🌟 Key Features
| Feature | Description |
| ------- | ----------- |
|Friendly interface|Intuitive, easy-to-use UI for seamless navigation and interaction.|
|Account system|possibility of logging on as teacher or student|
|Load .v and .sdf files|The teacher can upload the Verilog file for display on the student's side.|
|Connection between Teacher's side and Student's side|If the teacher uploads a file or deletes the current schema, it will modify the interface on the student side.|
|Display an animated schematic with values|A schematic of the various components of the file will be displayed in a simplified way and with animations representing the current flowing between the various circuit components.|

## ▶️ How to Run

This project uses a full-stack architecture with a backend and a frontend.

### 🖥 Requirements

- [Node.js](https://nodejs.org/) (v18 or higher)
- npm
- A terminal (macOS/Linux) or Command Prompt (Windows)

### 🔧 Installation

Clone the repository:

```bash
git clone https://github.com/algosup/2024-2025-project-4-web-fpga-team-2.git
cd 2024-2025-project-4-web-fpga-team-2
```

### 🚀 Run the Project

#### On macOS / Linux

```bash
chmod +x run_project.sh
./run_project.sh
```

This script will:
- Start the backend (`src/Backend`) in the background
- Automatically install missing dependencies
- Start the frontend (`src/Frontend`) in development mode
- Open your browser at `http://localhost:5173`

#### On Windows

Simply double-click `run_project.bat` or run it from the terminal:

```cmd
run_project.bat
```

It will:
- Start both the backend and frontend
- Install any missing dependencies
- Open your browser to `http://localhost:5173`

---

## 📖 How to Use It ?
You can access the website by clicking on this [link](https://algosup.github.io/2024-2025-project-4-web-fpga-team-2/).

> 🧑‍🏫 **Note:** To access the **Teacher page**, you will be prompted for a password. The default password is: **`securepass`**.

## 📂 Project Documents

📄 [**Functional Specifications**](https://github.com/algosup/2024-2025-project-4-web-fpga-team-2/blob/main/Documents/Functional/functionalSpecification.md) <br>
⚙️ [**Technical Specifications** ](https://github.com/algosup/2024-2025-project-4-web-fpga-team-2/blob/main/Documents/Technical/technicalSpecification.md) <br>
🧪 [**Test Plan** ](https://github.com/algosup/2024-2025-project-4-web-fpga-team-2/blob/main/Documents/TestPlan/testPlan.md) <br>
✅ [**Test Cases Rules**](https://github.com/algosup/2024-2025-project-4-web-fpga-team-2/blob/main/Documents/TestPlan/testCaseRules.md) <br>
📑 [ **Management Artifacts**](https://github.com/algosup/2024-2025-project-4-web-fpga-team-2/blob/main/Documents/Management/ManagementArtifacts) <br>
📆 [ **Weekly Reports** ](https://github.com/algosup/2024-2025-project-4-web-fpga-team-2/blob/main/Documents/Management/WeeklyReports) <br>
📌 [ **Post Mortem** ](https://github.com/algosup/2024-2025-project-4-web-fpga-team-2/blob/main/Documents/Management/postMortem.md) <br>

## ⚖️ License

This project is under license MIT - see the [LICENSE](https://github.com/algosup/2024-2025-project-4-web-fpga-team-2/blob/main/LICENSE) file for more information.
