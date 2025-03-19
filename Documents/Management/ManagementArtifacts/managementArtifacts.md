# Tables & KPIs

## 1. RACI Table

### 1.1 Introduction

The RACI matrix is table that used to define the roles and responsibilities of the project team members and to ensure that all team members understand their roles and responsibilities. The acronym RACI stands for Responsible, Accountable, Consulted, and Informed.

### 1.2 Matrix

| Task                     | Project Manager | Program Manager | Technical Leader | Software Engineer | Quality Assurance | Stakeholders |
| ------------------------ | --------------- | --------------- | ---------------- | ----------------- | ----------------- | ------------ |
| Project Management       | R               | C               | C                | I                 | I                 | I            |
| Project Charter          | R               | C               | C                | I                 | I                 | C            |
| Gantt Chart              | R/A             | C               | C                | I                 | I                 | I            |
| Functional Specification | C               | R/A             | C                | I                 | C/I               | I            |
| Technical Specification  | C               | C               | R/A              | I                 | C/I               | C            |
| Code Development         | I               | I               | R                | R/A               | I                 | I            |
| Code Review              | I               | I               | R                | C                 | R/A               | I            |
| Testing                  | I               | I               | C                | C                 | R/A               | I            |

### 1.3 Definitions

- **Responsible (R)**: Responsible for the task. Ensures that the task is completed. 
- **Accountable (A)**: Ultimately accountable for the task. Ensures that the task is completed.
- **Consulted (C)**: May consulted for the task. Provides input and feedback on the task.
- **Informed (I)**: Informed about the task. Kept informed about the task.

<br>

> [!NOTE]
> If someone is Responsible of a task, then this person is also the other roles. Thus, if the Project Manager is Responsible for the Project Management task, then the Project Manager is also Consulted, and Informed for this task (unless otherwise stated). 
> <br>It also applies for the other roles.

> [!NOTE]
> The Accountable role is unique for each task. For instance, if the Project Manager is Responsable, he will not necessary be Accountable.

<br>

## 2. MoSCoW Table

### 2.1 Introduction

A MoSCoW table is used to prioritize requirements based on their importance and impact on the project. They are categorize into four groups: Must have, Should have, Could have, and Won't have. This table is used to ensure that the most important requirements are implemented first.

### 2.2 Matrix

| Must Have                                                                               | Should Have                                       | Could Have       | Won't Have                        |
| --------------------------------------------------------------------------------------- | ------------------------------------------------- | ---------------- | --------------------------------- |
| Front-end interface (Teacher)                                                           | A parser that transforms the files into JSON file | An Export option | A mobile version of the website   |
| Front-end interface (Student)                                                           | A readable JSON file                              | A Share option   | Direct implementation of the code |
| Load .v and .sdf files                                                                  | Some pretty diagrams                              | Account feature  |                                   |
| Creation of a fixed, animated and with values schemas (waiting for the client response) | Online version of the website                     | Back-end         |                                   |
|                                                                                         | Tool bar editing the rendered schema              |                  |                                   |

## 3. Key Performance Indicators (KPIs)

### 3.1 Introduction

Key Performance Indicators (KPIs) are used to measure project performance in percentage terms. They enable to assess the progress of tasks and anticipate the need for assistance or resources.

You can find the KPIs' explanation [here]().

You can also find the KPIs' table [here]().

### 3.2 Calculations

#### 3.2.1 Files

Bellow, the list of files which are included in the project:

- Project Charter
- Gantt Chart
- Functional Specification
- Technical Specification
- Test Plan

##### Formula:

$$
\text{Files percentage} = \left( \frac{\text{Number of sections completed}}{\text{Total section predefined}} \right) \times 100
$$

<br>

Why:

- The "number of sections completed" is the number of sections that have been completed in the files.
- The "total section predefined" is the total number of sections that have been established at the beginning of the document which can be subject to minor changes between the beginning and the end.

<br>

#### 3.2.2 Review

Here are the different types of reviews that can be done:

- Document Review
  - Project Charter
  - Gantt Chart
  - Functional Specification
  - Technical Specification
  - Test Plan
- Code Review
- Test Case Review

##### Formula:

$$
\text{Review percentage} = \left( \frac{\text{Number of lines reviewed}}{\text{All the lines (document or code)}} \right) \times 100
$$

<br>

#### 3.2.3 Web Page

The web page is the final product of the project. It is the result of the work of the team. The web page is divided into 2 parts :

- **POC:**
  - The front-end interface;
  - Load .v and .sdf files;
  - Creation of a fixed, animated and with values schemas;
  - A parser that transforms the files into JSON file;
  - Online version of the website.

- **Features:**
  - A readable JSON file;
  - Some pretty diagrams;
  - Tool bar editing the rendered schema;
  - An Export option;
  - A Share option;
  - Account feature.
  - Back-end.

<br>

> [!NOTE]
> These lists are based on the MoSCoW table. Thus, the lists can be updated at any time during the project.

<br>

##### Formula:

$$
\text{Code} = \left( \frac{\text{Numbers of achieved features}}{\text{All features}} \right) \times 100
$$

<br>

Why:

- The "number of achieved features" indicates the number of features which have been completed and ready to be used without a bug.
- "All features" refers to all the features indicated in the MoSCoW table (or just above).

<br>

##### 

#### 3.2.4 Human Resources

The human resources are the team members' mood. This section explains how the team members feel about the project. The team members are asked to give a note between 1 and 10. The average of all the notes is the KPI.

##### Formula:

$$
\text{Human Resources} = \left( \frac{\sum \text{Individual Grade}}{\text{Number of team members}} \right)
$$

<br>

## 4. Weekly Reports

Each week, a survey is sent to the team members to know the progress of the project as well as their mood regarding this latest. It is important to anticipate any problems that may arise and to ensure that the project is progressing as planned. You can find by following the links below:

- [Weekly Report 1](../WeeklyReports/weeklyReport1.md)
- [Weekly Report 2](../WeeklyReports/weeklyReport2.md)
- [Weekly Report 3](../WeeklyReports/weeklyReport3.md)
- [Weekly Report 4](../WeeklyReports/weeklyReport4.md)
- [Weekly Report 5](../WeeklyReports/weeklyReport5.md)
- [Weekly Report 6](../WeeklyReports/weeklyReport6.md)

## 5. Management Review

The management review is a survey that takes place at the end of the project to assess management (in addition to the weekly forms) as a whole. The members are asked to say how they felt about the management of the project.
<br>
You can find the management review [here](../ManagementArtifacts/post_Mortem.md).