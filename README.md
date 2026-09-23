# TelePixels

### Patient-Centered Medical Imaging & Teleradiology Platform

TelePixels is a digital medical imaging platform designed to make the journey from **imaging request to report access** more connected, organized, and accessible for patients and healthcare professionals.

## The Problem

Medical imaging is often critical to diagnosis and treatment, but in many healthcare settings, the process does not end when the image is acquired. The image still needs to reach the appropriate reporting professional, the report needs to return to the healthcare team, and the patient needs reliable access to the outcome.

In facilities where radiologists or other specialists are not physically available, this process can become slow, fragmented, and expensive.

### 1. Delays in radiology reporting

Medical images may remain pending when a qualified radiologist is not available at the imaging facility. Moving images and accompanying information between facilities or professionals can introduce delays, which can slow down clinical decision-making and patient management.

### 2. Geographic barriers to specialist reporting

Patients and healthcare workers may depend on physical movement of radiographs, films, documents, or other information when specialist reporting is not available locally.

This creates a particular challenge for facilities and patients in areas where specialized radiology services are limited.

### 3. Unnecessary patient travel

Patients may need to return to an imaging facility to collect reports, provide information, or follow up on imaging results.

Where reporting or specialist access requires physical presence, patients can incur additional transportation costs, lose time, and face difficulties accessing care.

### 4. Dependence on physical radiographic films

Traditional film-based workflows can create additional costs for imaging facilities through film printing, physical storage, handling, duplication, and transportation.

Physical films can also make it more difficult to share an examination quickly with a radiologist or another authorized healthcare professional.

### 5. Fragmented imaging workflow

Patient information, imaging requests, medical images, reporting, and report access can exist across separate processes.

When these components are not connected, healthcare professionals may spend additional time locating information, communicating between facilities, and transferring imaging studies.

### 6. Limited access to specialists

A healthcare facility may have imaging equipment but not have a radiologist or relevant specialist physically available at the same location.

This creates an access gap: **the patient can obtain the examination, but timely specialist reporting may still be difficult to access.**

### The underlying problem

The problem is not simply the lack of medical imaging equipment.

It is the difficulty of getting the **right imaging information to the right healthcare professional at the right time**, while allowing the patient to access the resulting information without unnecessary travel or administrative barriers.

For healthcare facilities, these challenges can make it harder to manage imaging requests, studies, reporting, and patient access in one place.

TelePixels is being developed to address this gap through a connected digital imaging and teleradiology workflow.

## Our Approach

TelePixels brings key parts of the medical imaging workflow into one digital platform:

**Patient → Imaging Request → Study → Image Review → Reporting → Patient Access**

The platform provides tools for:

* Patient registration and management
* Imaging requests and study workflows
* Medical image viewing
* Radiology and ultrasound reporting
* Patient access to reports and studies
* QR-based access to patient information
* Notifications and communication workflows
* Administrative monitoring and audit records

## Context-Aware AI-Assisted Reporting

TelePixels is also being extended with an AI-assisted reporting workflow.

The goal is **not to claim that AI can currently diagnose the medical images in TelePixels.**

Instead, the AI can use structured information about the current study, such as:

* Patient age
* Patient sex
* Examination type
* Modality
* Body part
* Clinical history
* Relevant study metadata

to understand the context of the examination and prepare an appropriate reporting structure.

For example, if a clinician opens a study for a **32-year-old female undergoing a pelvic ultrasound**, the AI should understand that context and prepare a pelvic ultrasound reporting workflow rather than an unrelated report such as a prostate examination.

The clinician remains responsible for interpreting the medical images and approving the final report.

### AI-Assisted Report Drafting

Where the clinician provides the actual observations/findings, the AI can help turn those observations into a clear, structured professional report.

For example:

```text
Clinician's notes:

Uterus normal size.
Endometrium 7 mm.
Both ovaries normal.
No adnexal mass.
No free fluid.
```

The AI can help structure and refine this into a professional report while keeping the clinician in control of the final content.

### Previous Imaging Context

Patients may also have previous imaging examinations from other modalities.

Where authorized and relevant, previous reports can provide additional clinical context for the current reporting workflow.

For example:

```text
Current study
    ↓
Pelvic Ultrasound

Previous relevant imaging
    ↓
CT / MRI / X-ray / Previous Ultrasound
```

The current examination remains the primary context. Previous reports are supporting historical information and do not replace the clinician's interpretation of the current study.

## Why This Matters

TelePixels is focused on a simple problem:

> **How can we make medical imaging more connected for the patient and more efficient for the professionals responsible for their care?**

Instead of treating image acquisition, reporting, patient access, and clinical communication as separate processes, TelePixels brings them together into a connected workflow.

## Core Workflow

```text
Patient Registration
        ↓
Imaging Request
        ↓
Study / Image Upload
        ↓
Image Review
        ↓
Radiologist / Sonographer Reporting
        ↓
Report Finalization
        ↓
Patient Access
```

## Technology

TelePixels is built as a modern web-based application using technologies including:

* React
* TypeScript
* Vite
* Tailwind CSS
* Firebase Authentication
* Cloud Firestore
* Supabase Storage
* CornerstoneJS / DICOM-related imaging libraries
* QR code technology
* PDF report generation
* Google Gemini for the AI-assisted reporting workflow

The AI/MCP architecture is being developed as a controlled layer between TelePixels' authorized clinical context and the AI model.

## Human-in-the-Loop

AI assistance does not replace the reporting professional.

The intended workflow is:

```text
Study Context
     ↓
AI-Assisted Draft
     ↓
Clinician Review
     ↓
Clinician Editing
     ↓
Final Report
```

The radiologist or sonographer remains responsible for reviewing and approving the final report.

## Project Status

TelePixels is being developed as a hackathon prototype with a focus on demonstrating a practical patient-centered medical imaging workflow and context-aware AI-assisted reporting.

The current AI implementation is focused on **clinical context and reporting assistance**, rather than automated interpretation of X-ray or ultrasound images.

## Hackathon Focus

TelePixels is being developed for the **Access & Inclusion** track of the StacStart Borderless Bytes Hackathon.

The project explores how digital infrastructure and responsible AI can help make medical imaging workflows more accessible and connected across healthcare settings.

## Important Note

TelePixels is a prototype and should not be treated as a substitute for professional medical judgment.

AI-generated content requires review by an appropriately qualified healthcare professional before being used as a final clinical report.
