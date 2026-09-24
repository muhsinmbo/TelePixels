# TelePixels - DICOM Viewer

A production-ready, web-based DICOM viewer built with React, TypeScript, and CornerstoneJS.

## 🚀 Features

### 1. File Handling
- **Local Upload**: Support for `.dcm` and `.dicom` files.
- **Zipped Folders**: Upload `.zip` files containing DICOM series.
- **Series Grouping**: Automatically groups slices into series based on Series Instance UID.

### 2. Image Rendering
- **High Fidelity**: Medical-grade rendering using CornerstoneJS.
- **W/L Adjustment**: Window Width and Window Center control.
- **Zoom & Pan**: Smooth navigation through large images.
- **Inversion**: Toggle grayscale inversion.
- **Reset**: Quickly return to default view settings.

### 3. Navigation & Playback
- **Stack Scrolling**: Use mouse wheel to scroll through slices.
- **Cine Playback**: Automated playback of series with adjustable frame rate.
- **Slice Info**: Real-time display of current slice index and total count.

### 4. Measurement & Analysis
- **Length**: Accurate distance measurements.
- **Angle**: Measure anatomical angles.
- **ROI (Circle/Rect)**: Analyze regions of interest with area and statistics.
- **Probe**: Inspect individual pixel values.

### 5. Metadata Viewer
- **Tag Extraction**: View Patient Name, ID, Modality, Study Date, and Series Description.
- **Technical Details**: View image dimensions and Series UID.

### 6. Advanced Layout
- **Multi-Viewport**: Toggle between 1x1 and 2x2 grid layouts.
- **Active Viewport**: Highlighted active viewport for tool focus.

## 🛠 Tech Stack
- **Frontend**: React 19, TypeScript
- **Imaging**: CornerstoneJS, cornerstone-tools, cornerstone-wado-image-loader
- **State**: Zustand
- **Parsing**: dcmjs, dicom-parser
- **Styling**: TailwindCSS 4
- **Utilities**: JSZip (for zip support), Lucide React (icons)

## 📖 Run Instructions
1. The viewer is integrated into the **TelePixels** application.
2. Navigate to the **DICOM Viewer** tab in the sidebar.
3. Click **Load DICOM** to select files or a zip folder.
4. Use the toolbar to select tools and interact with the images.

## ⚠️ Disclaimer
**FOR EDUCATIONAL USE ONLY.** This software is not intended for clinical diagnosis or medical decision-making. No patient data is persisted on the server; all processing happens client-side.

## 🧪 Sample Data
You can find sample DICOM data at:
- [DICOM Library](https://www.dicomlibrary.com/)
- [TCIA (The Cancer Imaging Archive)](https://www.cancerimagingarchive.net/)
