/**
 * Seed reporting templates. Sections become the AI draft skeleton —
 * placeholders and normal-range hints only, NEVER pre-filled findings.
 */
export interface TemplateSection { key: string; title: string; placeholder: string }
export interface ReportTemplate {
  id: string; modality: string; examination: string; sex: string;
  title: string; sections: TemplateSection[]; impressionGuidance: string;
}

export const TEMPLATES: ReportTemplate[] = [
  {
    id: 'tpl_us_pelvic_female',
    modality: 'Ultrasound', examination: 'Pelvic Ultrasound', sex: 'Female',
    title: 'Pelvic Ultrasound Report',
    sections: [
      { key: 'uterus', title: 'Uterus', placeholder: 'Size, morphology, myometrium, endometrial thickness (mm) and phase...' },
      { key: 'adnexa', title: 'Adnexa', placeholder: 'Right and left ovaries (size, follicles), adnexal masses, free fluid...' },
      { key: 'culdesac', title: 'Pouch of Douglas', placeholder: 'Free fluid / collection...' },
      { key: 'urinary_bladder', title: 'Urinary Bladder', placeholder: 'Wall, volume, residual...' },
    ],
    impressionGuidance: 'Summarize the single most relevant conclusion first (e.g. normal study vs fibroid vs cyst), then secondary findings.',
  },
  {
    id: 'tpl_us_obstetric_female',
    modality: 'Ultrasound', examination: 'Obstetric Ultrasound', sex: 'Female',
    title: 'Obstetric Ultrasound Report',
    sections: [
      { key: 'fetus', title: 'Fetus', placeholder: 'Number, presentation, cardiac activity, biometry (BPD/HC/AC/FL), EFW...' },
      { key: 'anatomy', title: 'Anatomy Survey', placeholder: 'Head, spine, heart, abdomen, limbs...' },
      { key: 'placenta_fluid', title: 'Placenta & Fluid', placeholder: 'Location, grade, AFI / deepest pocket, cord...' },
      { key: 'maternal', title: 'Maternal Structures', placeholder: 'Cervix length, uterus, adnexa...' },
    ],
    impressionGuidance: 'State gestational age assessment, growth impression, and any anatomy concerns with recommended follow-up.',
  },
  {
    id: 'tpl_us_abdominal_any',
    modality: 'Ultrasound', examination: 'Abdominal Ultrasound', sex: 'Any',
    title: 'Abdominal Ultrasound Report',
    sections: [
      { key: 'liver', title: 'Liver', placeholder: 'Size, echogenicity, focal lesions, vasculature...' },
      { key: 'gallbladder', title: 'Gallbladder & Biliary', placeholder: 'Wall, stones, sludge, CBD diameter...' },
      { key: 'pancreas_spleen', title: 'Pancreas & Spleen', placeholder: 'Size, echotexture, duct, focal lesions...' },
      { key: 'kidneys', title: 'Kidneys', placeholder: 'Size, cortical thickness, hydronephrosis, stones, masses...' },
      { key: 'bladder_other', title: 'Bladder & Other', placeholder: 'Volume, wall, prostate/uterus if visualized, free fluid...' },
    ],
    impressionGuidance: 'Lead with the clinically dominant finding; list incidental findings separately.',
  },
  {
    id: 'tpl_xr_chest_any',
    modality: 'X-Ray', examination: 'Chest (Thorax)', sex: 'Any',
    title: 'Chest X-Ray Report',
    sections: [
      { key: 'technique', title: 'Technique', placeholder: 'Projection (PA/AP/lateral), inspiration, rotation, penetration...' },
      { key: 'lungs', title: 'Lungs & Pleura', placeholder: 'Infiltrates, consolidation, effusion, pneumothorax, nodules...' },
      { key: 'cardiac', title: 'Cardiac & Mediastinum', placeholder: 'Cardiothoracic ratio, contours, hila...' },
      { key: 'bones_soft', title: 'Bones & Soft Tissues', placeholder: 'Ribs, clavicles, spine visualized, soft tissues...' },
    ],
    impressionGuidance: 'One-line headline impression first (e.g. normal / pneumonia / effusion), then details.',
  },
  {
    id: 'tpl_xr_kub_any',
    modality: 'X-Ray', examination: 'Abdomen (KUB)', sex: 'Any',
    title: 'Abdominal X-Ray (KUB) Report',
    sections: [
      { key: 'bowel', title: 'Bowel Gas Pattern', placeholder: 'Dilatation, air-fluid levels, obstruction signs...' },
      { key: 'calcifications', title: 'Calcifications', placeholder: 'Renal/ureteric stones, phleboliths...' },
      { key: 'bones_soft', title: 'Bones & Soft Tissues', placeholder: 'Spine, pelvis, psoas shadows...' },
    ],
    impressionGuidance: 'Answer the clinical question first (obstruction? stone?), then secondary findings.',
  },
  {
    id: 'tpl_generic_any',
    modality: 'Any', examination: 'Any', sex: 'Any',
    title: 'General Imaging Report',
    sections: [
      { key: 'technique', title: 'Technique', placeholder: 'How the study was performed...' },
      { key: 'findings', title: 'Findings', placeholder: 'Systematic description of relevant anatomy...' },
    ],
    impressionGuidance: 'Conclude with the most relevant impression first, then secondary points.',
  },
];
