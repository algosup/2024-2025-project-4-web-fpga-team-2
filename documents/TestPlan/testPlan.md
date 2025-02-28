# Test Plan
----

|Author|Mattéo LEFIN|
|-|-|
|Created|02/26/2025|
|Finished||

----
<details open>

<summary>Changelog</summary>

## Changelog

|Version|Date|Author|Description|
|-------|----|---|--|
|1.0|02/26/2025|Mattéo LEFIN| - Create documents template based on everything that doesn't includes functional and technical specifications.|
|1.1|02/28/2025|Mattéo LEFIN| - Completing Introduction and Document Reviewing. <br> - Improve Testing Strategy and Testing execution. <br> - Enhance Test Deliverables|
</details>

----

<details open>

<summary>Table of content</summary>

## Table of content
<br>

[**Glossary**](#glossary)

[**1. Introduction**](#1-introduction)
 - [**1.1 Document purpose**](#11-document-purpose)
 - [**1.2 Project purpose**](#12-project-purpose)
 - [**1.3 Customers**](#13-customers)

[**2. Documentation Reviewing**](#2-documentation-reviewing)
 - [**2.1 Document criteria**](#21-document-criteria)
 - [**2.2 Review process**](#22-review-process)

[**3. Testing strategy**](#3-testing-strategy)
 - [**3.1 Tests' main goal**](#31-tests-main-goal)
 - [**3.2 Testing field**](#32-testing-field)
 - [**3.3 Testing environment**](#33-testing-environment)
 - [**3.4 Test scope**](#34-test-scope)
 - [**3.5 Testing types**](#35-testing-types)

[**4. Execution strategy**](#4-execution-strategy)
 - [**4.1 Testing criterias**](#41-testing-criterias)
 - [**4.2 GitHub issues**](#42-github-issues)
 - [**4.3 Test cases**](#43-test-cases)
 - [**4.4 Bug tracking schema**](#44-bug-tracking-schema)

[**5. Testing management**](#5-test-management)
 - [**5.1 Tools**](#51-tools)
 - [**5.2 Test design**](#52-test-design)
 - [**5.3 Test deliverables**](#54-test-deliverables)





</details>

----

<details open>

<summary>Glossary</summary>

## Glossary

|Term|Definition|Source|
|-|-|-|
|**FPGA**|||


</details>

----

<details open>

<summary>1.Introduction</summary>

## 1. Introduction

### 1.1 Document purpose

This document shows the **Quality Assurance activities** to provide **clarity** on the approach taken, The **produced results** and the **conclusions reached** out of this project.


It also demonstrates our **documentation reviewing** and indicates our **testing procedure**, including:

- ***The testing strategy***
  - It outlines **the goals** of the test plan, describes the **testing field**, the **testing environment**, and the **test plan scope** and categorizes the **types of testing** involved. 
- ***The execution strategy***
  - Describe how **tests will be performed**, and the process for any kind of issue or bug encountered during the project period.
- ***The test management***
  - It outlines the procedure for **managing the test logistics** and addressing all events that arise during execution.

### 1.2 Project purpose

This project has for purpose to help [FPGA](#glossary) teacher making students understand the basics of FPGA hardware system by using schemas and animated schemas.

### 1.3 Customers

Our customer is a FPGA teacher at CNES, the equivalent of NASA in France. He wants to be able to teach more easly to his students the basis of FPGA hardware.

</details>

----

<details open>

<summary>2. Documentation reviewing</summary>

## 2. Documentation reviewing

### 2.1 Document criteria

The majority of our documents have **the same criterias**, making harmony between them is required for **standardization and a better organization of the project**.

The common criteria are:
- All documents must have a **table of contents** for better navigation.
- Documents must stay **as simple as possible**, making them **short and not too technical**. If technical terms are necessary to implement, a **glossary must be implemented**.
- All the documents are written in **English**.

Files and folder naming criterias can be found in the [conventions document]().

### 2.2 Review process

To review the documents we use **GitHub issues** to track any problems like typos or criterias that haven't been addressed.

A GitHub issue template will be initiated.

![image]()

*GitHub issues for the Reviewed document*

</details>

----

<details open>

<summary>3.Testing strategy</summary>

## 3. Testing strategy

### 3.1 Tests' main goal

The main goal behind doing tests is to **ensure that all project criterias are checked**, and possibly enhance the quality of the project for a better user experience.

### 3.2 Testing field




### 3.3 Testing environment
For testing we are using 3 MAC's and 1 Windows computer using Firefox, chrome and Opera to ensure the compatibility on all platform an navigators.


### 3.4 Test scope

**In scope**

**Out of Scope**

### 3.5 Testing types

There are different types of testing :

**Functional testing**

Functional testing is a type of software testing that evaluates the functionality of the program based on specified requirements that have been written in the [Functional Specification](). The program needs to perform as expected, focusing on user-facing features and behaviors. this type of testing includes integration testing, system testing, and user acceptance testing.

**Unit testing**

Unit testing is a type of software testing where we test a small and precise part of the program to see if it works properly.

</details>

----

<details open>

<summary>4.Execution strategy</summary>

## 4. Execution strategy

### 4.1 Testing Criterias

To ensure that our test  goes as smoothly as possible, we have some testing criteria that we have to fulfill in every test:

- Are tested features in line with the specifications defined in the documents?
<br>
- Does the feature work as intended by the developer?
<br>
- Is this feature easy to use for the user?

### 4.2 GitHub Issues

GitHub issues are created to track any problems in the program or the documents as mentioned in "[**2. Document reviewing**](#2-documentation-reviewing)".

However, compared to documents GitHub issues, tests GitHub issues will be based on the corresponding **test cases**.

### 4.3 Test cases

Test cases are specifications of the execution condition, testing procedure, and expected results that define a single test to be executed to achieve a particular software testing objective.

We also use a system of **labels** to identify the severity of the test cases:

- High
- Medium
- Low

<br>

![image]()
*Demonstration on how the taste cases are created based on a template*



### 4.4 Bug tracking schema

![image]()


*Bug tracking schema*

### 4.5 Test Automation


</details>

----

<details open>

<summary>5. Test management</summary>

## 5. Test management

### 5.1 Tools

To manage our test we are using specific tools :

- We use GitHub for test management. Test cases and GitHub issues are updated in the [GitHub Issue section](https://github.com/algosup/2024-2025-project-4-web-fpga-team-2/issues).
<br>
- Every failed test case caused by a bug will be reported in a GitHub issue with the associated test cases
<br>
- After the developer does the bug fix, the Quality Assurance will test it again in the same way he did last time.

### 5.2 Test design

We have a conforming plan of how we create and process our tests.

![image]()

*Test design schema*

### 5.3 Test deliverables

- **Test Plan:** it documents our approach and methodology for testing, explaining how tests will be managed and performed.
  
- **Test Cases:** It represent a set of tests created to ensure that our application works as intended.

- **GitHub issue:** This section documents any identified issues encountered during the testing phase.


</details>

