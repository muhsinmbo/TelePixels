import { jsPDF } from 'jspdf';

export interface ReportData {
  patient: {
    name: string;
    id: string; // MRN
    age?: number | string;
    gender?: string;
  };
  request: {
    createdAt: { seconds: number } | string | Date | any;
    id: string;
  };
  report: {
    procedureName: string;
    clinicalHistory?: string;
    findings: string;
    impression: string;
    radiologistName: string;
    createdAt?: { seconds: number } | string | Date | any;
  };
  facility?: {
    name?: string;
    letterhead?: string; // Base64 image
  };
}

export const generateProfessionalPDF = (data: ReportData) => {
  const { patient, request, report, facility } = data;
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();

  const drawFormattedText = (html: string, x: number, y: number, maxWidth: number, fontSize: number = 10, defaultBold: boolean = false): number => {
    if (!html) return y;

    const segments: { text: string; bold: boolean; italic: boolean }[] = [];
    let currentBold = defaultBold;
    let currentItalic = false;

    // Decode basic entities and prepare for parsing
    let cleanHtml = html
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&rsquo;/g, "'")
      .replace(/&lsquo;/g, "'")
      .replace(/&rdquo;/g, '"')
      .replace(/&ldquo;/g, '"')
      .replace(/&ndash;/g, '-')
      .replace(/&mdash;/g, '--')
      .replace(/&bull;/g, '•')
      .replace(/&copy;/g, '©')
      .replace(/&reg;/g, '®')
      .replace(/&trade;/g, '™')
      .replace(/<p>/gi, '') // p tags handled by closing tag \n
      .replace(/<\/p>| <\/div>|<\/h\d>|<br\s*\/?>/gi, '\n');

    const tagRegex = /(<[^>]+>|[^<]+)/g;
    const parts = cleanHtml.match(tagRegex) || [];

    for (const part of parts) {
      const lowerPart = part.toLowerCase();
      if (lowerPart.startsWith('<b>') || lowerPart.startsWith('<strong>')) {
        currentBold = true;
      } else if (lowerPart.startsWith('</b>') || lowerPart.startsWith('</strong>')) {
        currentBold = defaultBold;
      } else if (lowerPart.startsWith('<i>') || lowerPart.startsWith('<em>')) {
        currentItalic = true;
      } else if (lowerPart.startsWith('</i>') || lowerPart.startsWith('</em>')) {
        currentItalic = false;
      } else if (lowerPart.startsWith('<li')) {
        segments.push({ text: '\n• ', bold: false, italic: false });
      } else if (part.startsWith('<')) {
        // Skip other tags
      } else {
        segments.push({ text: part, bold: currentBold, italic: currentItalic });
      }
    }

    let cursorX = x;
    let cursorY = y;
    const lineHeight = fontSize * 0.55;

    segments.forEach(seg => {
      const text = seg.text;
      if (text === '\n') {
        cursorX = x;
        cursorY += lineHeight;
        return;
      }

      // Handle segments with internal newlines
      const lines = text.split('\n');
      lines.forEach((line, lineIdx) => {
        if (lineIdx > 0) {
          cursorX = x;
          cursorY += lineHeight;
        }

        const words = line.split(/(\s+)/);
        doc.setFont('helvetica', seg.bold ? (seg.italic ? 'bolditalic' : 'bold') : (seg.italic ? 'italic' : 'normal'));
        doc.setFontSize(fontSize);

        words.forEach(word => {
          if (!word) return;
          const wordWidth = doc.getTextWidth(word);
          if (cursorX + wordWidth > x + maxWidth && word.trim().length > 0) {
            cursorX = x;
            cursorY += lineHeight;
          }
          doc.text(word, cursorX, cursorY);
          cursorX += wordWidth;
        });
      });
    });

    return cursorY;
  };
  
  // --- Header / Letterhead ---
  if (facility?.letterhead) {
    try {
      // Add custom letterhead image
      // Assuming it's a wide landscape image, we'll give it the top 40mm
      doc.addImage(facility.letterhead, 'PNG', 0, 0, pageWidth, 45);
    } catch (err) {
      console.error('Failed to add custom letterhead to PDF:', err);
      // Fallback to default if image fails
      drawDefaultHeader(doc, pageWidth, facility?.name);
    }
  } else {
    drawDefaultHeader(doc, pageWidth, facility?.name);
  }
  
  // --- Patient Details Section ---
  const patientStartY = 55;
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('PATIENT INFORMATION', 20, patientStartY);
  doc.line(20, patientStartY + 2, pageWidth - 20, patientStartY + 2);
  
  doc.setFontSize(9);
  
  // Name
  doc.setFont('helvetica', 'bold');
  doc.text('Name:', 20, patientStartY + 10);
  doc.setFont('helvetica', 'normal');
  doc.text(` ${patient.name}`, 20 + doc.getTextWidth('Name:'), patientStartY + 10);

  // MRN
  doc.setFont('helvetica', 'bold');
  doc.text('MRN:', 20, patientStartY + 17);
  doc.setFont('helvetica', 'normal');
  doc.text(` ${patient.id}`, 20 + doc.getTextWidth('MRN:'), patientStartY + 17);

  // Age/Gender
  doc.setFont('helvetica', 'bold');
  doc.text('Age/Gender:', 20, patientStartY + 24);
  doc.setFont('helvetica', 'normal');
  doc.text(` ${patient.age || 'N/A'} / ${patient.gender || 'N/A'}`, 20 + doc.getTextWidth('Age/Gender:'), patientStartY + 24);
  
  let currentY = patientStartY + 31;

  if (report.clinicalHistory) {
    doc.setFont("helvetica", "bold");
    doc.text("CLINICAL HISTORY: ", 20, currentY);
    const labelWidth = doc.getTextWidth("CLINICAL HISTORY: ");
    
    // Draw the history content next to the label
    // If it wraps, it will currently wrap to the left margin (20) which is actually what we want for a block
    currentY = drawFormattedText(report.clinicalHistory, 20 + labelWidth, currentY, pageWidth - 40 - labelWidth, 9);
    currentY += 5;
  }
  
  let studyDate = 'N/A';
  try {
    if (request?.createdAt) {
      if (typeof request.createdAt === 'object' && 'seconds' in request.createdAt) {
        studyDate = new Date((request.createdAt as any).seconds * 1000).toLocaleDateString();
      } else if (request.createdAt instanceof Date) {
        studyDate = request.createdAt.toLocaleDateString();
      } else {
        studyDate = new Date(request.createdAt as any).toLocaleDateString();
      }
    }
  } catch (e) {
    console.error('Study date parsing failed:', e);
  }
  if (studyDate === 'Invalid Date') {
    studyDate = 'N/A';
  }

  let reportDate = 'N/A';
  try {
    if (report?.createdAt) {
      if (typeof report.createdAt === 'object' && 'seconds' in report.createdAt) {
        reportDate = new Date((report.createdAt as any).seconds * 1000).toLocaleDateString();
      } else if (report.createdAt instanceof Date) {
        reportDate = report.createdAt.toLocaleDateString();
      } else {
        reportDate = new Date(report.createdAt as any).toLocaleDateString();
      }
    } else {
      reportDate = new Date().toLocaleDateString();
    }
  } catch (e) {
    console.error('Report date parsing failed:', e);
    reportDate = new Date().toLocaleDateString();
  }
  if (reportDate === 'Invalid Date') {
    reportDate = new Date().toLocaleDateString();
  }

  // Study Date
  doc.setFont('helvetica', 'bold');
  doc.text('Study Date:', pageWidth - 85, patientStartY + 10);
  doc.setFont('helvetica', 'normal');
  doc.text(` ${studyDate}`, pageWidth - 85 + doc.getTextWidth('Study Date:'), patientStartY + 10);

  // Report Date
  doc.setFont('helvetica', 'bold');
  doc.text('Report Date:', pageWidth - 85, patientStartY + 17);
  doc.setFont('helvetica', 'normal');
  doc.text(` ${reportDate}`, pageWidth - 85 + doc.getTextWidth('Report Date:'), patientStartY + 17);
  // doc.text(`Procedure: ${report.procedureName || 'General'}`, pageWidth - 85, patientStartY + 24);

  // --- Report Content ---
  let contentY = Math.max(patientStartY + 40, currentY + 5);

  // Study Heading
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  const studyTitle = (report.procedureName || 'GENERAL RADIOLOGICAL REPORT').toUpperCase();
  const titleWidth = doc.getTextWidth(studyTitle);
  doc.text(studyTitle, (pageWidth - titleWidth) / 2, contentY);
  // Underline
  doc.setLineWidth(0.5);
  doc.line((pageWidth - titleWidth) / 2, contentY + 1.5, (pageWidth + titleWidth) / 2, contentY + 1.5);
  contentY += 15;

  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('RADIOLOGICAL FINDINGS', 20, contentY);
  contentY = drawFormattedText(report.findings || 'No findings recorded.', 20, contentY + 10, pageWidth - 40, 10) + 15;
  
  let nextY = contentY;

  // New Page if impression won't fit
  if (nextY > 240) {
    doc.addPage();
    nextY = 25;
  }

  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('IMPRESSION', 20, nextY);
  nextY = drawFormattedText(report.impression || 'No impression recorded.', 20, nextY + 10, pageWidth - 40, 11, true) + 20;

  // Sign Off
  if (nextY > 260) {
    doc.addPage();
    nextY = 30;
  }
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text(`Electronically Signed by:`, 20, nextY);
  doc.setFontSize(12);
  doc.text(`Dr. ${report.radiologistName || 'Radiologist'}`, 20, nextY + 7);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'italic');
  doc.text('This document is a certified digital clinical report generated via Teleradiology Network.', 20, nextY + 15);

  // --- Footer ---
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(150, 150, 150);
  doc.text(`${facility?.name || 'Medical Facility'} | Official Clinical Documentation`, pageWidth / 2, 285, { align: 'center' });

  return doc;
};

export interface SonographerWorksheetData {
  patient: {
    name: string;
    id: string; // MRN
    age?: number | string;
    gender?: string;
  };
  request: {
    createdAt: any;
    id: string;
  };
  worksheet: {
    procedureName: string;
    type?: string;
    clinicalHistory?: string;
    findings?: string;
    impression?: string;
    comments?: string;
    measurements?: Record<string, any>;
    sonographerName?: string;
    createdAt?: any;
  };
  facility?: {
    name?: string;
    letterhead?: string; // Base64 image
  };
}

export const generateSonographerPDF = (data: SonographerWorksheetData) => {
  const { patient, request, worksheet, facility } = data;
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();

  const drawFormattedText = (html: string, x: number, y: number, maxWidth: number, fontSize: number = 10, defaultBold: boolean = false): number => {
    if (!html) return y;

    const segments: { text: string; bold: boolean; italic: boolean }[] = [];
    let currentBold = defaultBold;
    let currentItalic = false;

    let cleanHtml = html
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&rsquo;/g, "'")
      .replace(/&lsquo;/g, "'")
      .replace(/&rdquo;/g, '"')
      .replace(/&ldquo;/g, '"')
      .replace(/&ndash;/g, '-')
      .replace(/&mdash;/g, '--')
      .replace(/&bull;/g, '•')
      .replace(/&copy;/g, '©')
      .replace(/&reg;/g, '®')
      .replace(/&trade;/g, '™')
      .replace(/<p>/gi, '')
      .replace(/<\/p>| <\/div>|<\/h\d>|<br\s*\/?>/gi, '\n');

    const tagRegex = /(<[^>]+>|[^<]+)/g;
    const parts = cleanHtml.match(tagRegex) || [];

    for (const part of parts) {
      const lowerPart = part.toLowerCase();
      if (lowerPart.startsWith('<b>') || lowerPart.startsWith('<strong>')) {
        currentBold = true;
      } else if (lowerPart.startsWith('</b>') || lowerPart.startsWith('</strong>')) {
        currentBold = defaultBold;
      } else if (lowerPart.startsWith('<i>') || lowerPart.startsWith('<em>')) {
        currentItalic = true;
      } else if (lowerPart.startsWith('</i>') || lowerPart.startsWith('<em>')) {
        currentItalic = false;
      } else if (lowerPart.startsWith('<li')) {
        segments.push({ text: '\n• ', bold: false, italic: false });
      } else if (part.startsWith('<')) {
        // Skip other tags
      } else {
        segments.push({ text: part, bold: currentBold, italic: currentItalic });
      }
    }

    let cursorX = x;
    let cursorY = y;
    const lineHeight = fontSize * 0.55;

    segments.forEach(seg => {
      const text = seg.text;
      if (text === '\n') {
        cursorX = x;
        cursorY += lineHeight;
        return;
      }

      const lines = text.split('\n');
      lines.forEach((line, lineIdx) => {
        if (lineIdx > 0) {
          cursorX = x;
          cursorY += lineHeight;
        }

        const words = line.split(/(\s+)/);
        doc.setFont('helvetica', seg.bold ? (seg.italic ? 'bolditalic' : 'bold') : (seg.italic ? 'italic' : 'normal'));
        doc.setFontSize(fontSize);

        words.forEach(word => {
          if (!word) return;
          const wordWidth = doc.getTextWidth(word);
          if (cursorX + wordWidth > x + maxWidth && word.trim().length > 0) {
            cursorX = x;
            cursorY += lineHeight;
          }
          doc.text(word, cursorX, cursorY);
          cursorX += wordWidth;
        });
      });
    });

    return cursorY;
  };

  // Headers
  if (facility?.letterhead) {
    try {
      doc.addImage(facility.letterhead, 'PNG', 0, 0, pageWidth, 45);
    } catch (err) {
      drawDefaultHeader(doc, pageWidth, facility?.name);
    }
  } else {
    drawDefaultHeader(doc, pageWidth, facility?.name);
  }

  // Patient Details Section
  const patientStartY = 55;
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('PATIENT INFORMATION', 20, patientStartY);
  doc.line(20, patientStartY + 2, pageWidth - 20, patientStartY + 2);

  doc.setFontSize(9);
  
  // Name
  doc.setFont('helvetica', 'bold');
  doc.text('Name:', 20, patientStartY + 10);
  doc.setFont('helvetica', 'normal');
  doc.text(` ${patient.name}`, 20 + doc.getTextWidth('Name:'), patientStartY + 10);

  // MRN
  doc.setFont('helvetica', 'bold');
  doc.text('MRN:', 20, patientStartY + 17);
  doc.setFont('helvetica', 'normal');
  doc.text(` ${patient.id}`, 20 + doc.getTextWidth('MRN:'), patientStartY + 17);

  // Age/Gender
  doc.setFont('helvetica', 'bold');
  doc.text('Age/Gender:', 20, patientStartY + 24);
  doc.setFont('helvetica', 'normal');
  doc.text(` ${patient.age || 'N/A'} / ${patient.gender || 'N/A'}`, 20 + doc.getTextWidth('Age/Gender:'), patientStartY + 24);

  // Times the study was registered
  let studyDate = 'N/A';
  try {
    if (request?.createdAt) {
      if (typeof request.createdAt === 'object' && 'seconds' in request.createdAt) {
        studyDate = new Date((request.createdAt as any).seconds * 1000).toLocaleDateString();
      } else if (request.createdAt instanceof Date) {
        studyDate = request.createdAt.toLocaleDateString();
      } else {
        studyDate = new Date(request.createdAt as any).toLocaleDateString();
      }
    }
  } catch (e) {}

  let reportDate = new Date().toLocaleDateString();
  try {
    if (worksheet?.createdAt) {
      if (typeof worksheet.createdAt === 'object' && 'seconds' in worksheet.createdAt) {
        reportDate = new Date((worksheet.createdAt as any).seconds * 1000).toLocaleDateString();
      } else if (worksheet.createdAt instanceof Date) {
        reportDate = worksheet.createdAt.toLocaleDateString();
      } else {
        reportDate = new Date(worksheet.createdAt as any).toLocaleDateString();
      }
    }
  } catch (e) {}

  // Study Date
  doc.setFont('helvetica', 'bold');
  doc.text('Study Date:', pageWidth - 85, patientStartY + 10);
  doc.setFont('helvetica', 'normal');
  doc.text(` ${studyDate}`, pageWidth - 85 + doc.getTextWidth('Study Date:'), patientStartY + 10);

  // Report Date
  doc.setFont('helvetica', 'bold');
  doc.text('Worksheet Date:', pageWidth - 85, patientStartY + 17);
  doc.setFont('helvetica', 'normal');
  doc.text(` ${reportDate}`, pageWidth - 85 + doc.getTextWidth('Worksheet Date:'), patientStartY + 17);

  let currentY = patientStartY + 31;

  if (worksheet.clinicalHistory) {
    doc.setFont("helvetica", "bold");
    doc.text("CLINICAL HISTORY: ", 20, currentY);
    const labelWidth = doc.getTextWidth("CLINICAL HISTORY: ");
    currentY = drawFormattedText(worksheet.clinicalHistory, 20 + labelWidth, currentY, pageWidth - 40 - labelWidth, 9);
    currentY += 5;
  }

  let contentY = Math.max(patientStartY + 40, currentY + 5);

  // Study Heading
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  const targetType = (worksheet.type || 'Ultrasound').replace('_', ' ').toUpperCase();
  const studyTitle = (worksheet.procedureName || `SONOGRAPHER ULTRASOUND WORKSHEET (${targetType})`).toUpperCase();
  const titleWidth = doc.getTextWidth(studyTitle);
  doc.text(studyTitle, (pageWidth - titleWidth) / 2, contentY);
  
  doc.setLineWidth(0.5);
  doc.line((pageWidth - titleWidth) / 2, contentY + 1.5, (pageWidth + titleWidth) / 2, contentY + 1.5);
  contentY += 15;

  // Render measurements if any
  if (worksheet.measurements && Object.keys(worksheet.measurements).length > 0) {
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('ULTRASOUND MEASUREMENTS & OBSERVATIONS', 20, contentY);
    contentY += 6;

    const beautifiedKeys: Record<string, string> = {
      fhr: 'Fetal Heart Rate',
      bpd: 'Biparietal Diam (BPD)',
      fl: 'Femur Length (FL)',
      ac: 'Abdom Circ (AC)',
      hc: 'Head Circ (HC)',
      afi: 'Amniotic Fluid (AFI)',
      placenta: 'Placenta Location',
      gestAge: 'Gestational Age',
      edd: 'Est Delivery Date',
      liverSize: 'Liver Size',
      liverEchogenicity: 'Liver Echo',
      gallbladder: 'Gallbladder',
      cbd: 'CBD Diameter',
      rKidney: 'Right Kidney',
      lKidney: 'Left Kidney',
      spleenSize: 'Spleen Size',
      pancreas: 'Pancreas',
      uterusL: 'Uterus Length',
      uterusW: 'Uterus Width',
      uterusH: 'Uterus Height',
      endoThickness: 'Endometrium Thickness',
      rOvary: 'Right Ovary',
      lOvary: 'Left Ovary',
      freeFluid: 'Free Fluid'
    };

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    
    // Draw two columns of measurements
    const entries = Object.entries(worksheet.measurements).filter(([_, val]) => val !== undefined && val !== null && val !== '');
    let col1Y = contentY;
    let col2Y = contentY;
    const colWidth = (pageWidth - 40) / 2;

    entries.forEach((entry, idx) => {
      const isCol1 = idx % 2 === 0;
      const key = entry[0];
      const val = entry[1];
      const label = beautifiedKeys[key] || key;
      let suffix = '';
      if (['bpd', 'fl', 'ac', 'hc', 'cbd', 'endoThickness'].includes(key)) suffix = ' mm';
      if (['afi', 'liverSize', 'rKidney', 'lKidney', 'spleenSize', 'uterusL', 'uterusW', 'uterusH'].includes(key)) suffix = ' cm';
      if (key === 'fhr') suffix = ' bpm';

      const textY = isCol1 ? col1Y : col2Y;
      const startX = isCol1 ? 25 : 25 + colWidth;

      doc.setFont('helvetica', 'bold');
      doc.text(`${label}:`, startX, textY);
      doc.setFont('helvetica', 'normal');
      doc.text(` ${String(val)}${suffix}`, startX + doc.getTextWidth(`${label}:`), textY);

      if (isCol1) {
        col1Y += 6;
      } else {
        col2Y += 6;
      }
    });

    contentY = Math.max(col1Y, col2Y) + 10;
  }

  // Findings / comments
  const mainFindings = worksheet.findings || worksheet.comments;
  if (mainFindings) {
    if (contentY > 240) {
      doc.addPage();
      contentY = 25;
    }
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('SONOGRAPHER OBSERVATIONS & FINDINGS', 20, contentY);
    contentY = drawFormattedText(mainFindings, 20, contentY + 8, pageWidth - 40, 10) + 15;
  }

  // Impression if any
  if (worksheet.impression) {
    if (contentY > 240) {
      doc.addPage();
      contentY = 25;
    }
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('IMPRESSION', 20, contentY);
    contentY = drawFormattedText(worksheet.impression, 20, contentY + 8, pageWidth - 40, 10, true) + 15;
  }

  // Signature
  if (contentY > 250) {
    doc.addPage();
    contentY = 30;
  }
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text(`Recorded and Released by:`, 20, contentY);
  doc.setFontSize(11);
  doc.text(`${worksheet.sonographerName || 'Clinical Sonographer'}`, 20, contentY + 6);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'italic');
  doc.text('This document contains the sonogram observations released for the case record.', 20, contentY + 12);

  // Footer
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(150, 150, 150);
  doc.text(`${facility?.name || 'Medical Facility'} | Sonographer Worksheet Report`, pageWidth / 2, 285, { align: 'center' });

  return doc;
};

// Helper for default header
function drawDefaultHeader(doc: jsPDF, pageWidth: number, facilityName?: string) {
  doc.setFillColor(0, 150, 136); // Teal/Primary color
  doc.rect(0, 0, pageWidth, 40, 'F');
  
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(22);
  doc.setFont('helvetica', 'bold');
  doc.text(facilityName?.toUpperCase() || 'MEDICAL FACILITY', 20, 25);
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('PREMIUM IMAGING & TELE-RADIOLOGY SERVICES', 20, 32);
}

