# Digital Logbook

## Overview

Digital Logbook is a web application designed to help university students keep track of their projects, work completed, and tasks that still need to be done.

The system is intended to replace a physical logbook with a digital version that is accessible wherever the user is. Users will be able to customise the format of their logbook entries for different projects and quickly record their work.

## Project Goals

The main goals of the Digital Logbook are to:

- Allow users to create and manage projects.
- Allow users to customise the fields used in their logbook entries.
- Make capturing new entries quick and easy.
- Record the amount of time spent on projects.
- Provide useful statistics about the user's work.
- Allow users to browse and search their previous entries.

## Basic Features

The initial version of the project will focus on the **Basic** requirements:

- Customisable entry formats for each project.
- Quick creation of logbook entries.
- Project creation, description and archiving.
- Recording time spent on entries.
- Basic statistics about projects and entries.
- Timeline for browsing entries.
- Searching across entries.
- Filtering entries by project.

Intermediate and Advanced features will be considered after the Basic requirements have been implemented.

## Technology Stack

### Frontend
- React
- Vite
- TypeScript

### Backend
- Node.js 22
- Express
- TypeScript

### Database
- To be decided.

The database technology and schema will be determined after analysing the requirements for customisable project-specific entry formats.

## Project Structure

The frontend and backend will be developed as separate applications and will communicate through a hand-written HTTP API.

```text
Frontend
React + Vite + TypeScript
        |
        | HTTP API
        v
Backend
Express + Node.js 22 + TypeScript
        |
        v
Database
(To be decided)