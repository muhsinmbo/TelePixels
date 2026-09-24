import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { collection, getDocs, query, where, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import { handleFirestoreError, OperationType } from '../lib/firestoreUtils';

export async function exportFullDataArchive(
  startDate?: Date, 
  endDate?: Date,
  onProgress?: (status: { currentPatient: number; totalPatients: number; phase: string }) => void
) {
  const zip = new JSZip();
  const imagesFolder = zip.folder("images");
  
  try {
    const patientsRef = collection(db, 'patients');
    let q = query(patientsRef, where('facilityId', '==', 'default-facility'), orderBy('createdAt', 'desc'));

    if (startDate && endDate) {
      q = query(patientsRef, 
        where('facilityId', '==', 'default-facility'),
        where('createdAt', '>=', startDate.toISOString()),
        where('createdAt', '<=', endDate.toISOString()),
        orderBy('createdAt', 'desc')
      );
    }

    onProgress?.({ currentPatient: 0, totalPatients: 0, phase: 'Fetching records...' });
    let patientSnapshot;
    try {
      patientSnapshot = await getDocs(q);
    } catch (e) {
      console.error('Failed to fetch patients list:', e);
      throw new Error(`PATIENTS_LIST_FETCH_FAILED: ${e instanceof Error ? e.message : 'Unknown error'}`);
    }
    
    const totalPatients = patientSnapshot.size;
    const rows = [];
    console.log(`Total patients to process: ${totalPatients}`);

    // Header for the CSV inside the ZIP
    rows.push([
      'Patient ID',
      'Name',
      'Age',
      'Gender',
      'Contact',
      'Registration Date',
      'Total Requests',
      'Request ID',
      'Modality',
      'Status',
      'Priority',
      'Facility ID',
      'Study Description',
      'Image Count',
      'Image Local Path', // Reference to the folder in the zip
      'Request Date'
    ].join(','));

    let processedPatients = 0;
    const CONCURRENCY_LIMIT = 10;

    for (const patientDoc of patientSnapshot.docs) {
      processedPatients++;
      const patient = patientDoc.data();
      const patientId = patientDoc.id;
      const patientName = patient.name || 'Unknown Patient';
      
      onProgress?.({ 
        currentPatient: processedPatients, 
        totalPatients, 
        phase: `Processing ${patientName}...` 
      });

      const patientNameSafe = patientName.replace(/[^a-z0-9]/gi, '_');
      const patientFolder = imagesFolder?.folder(`${patientNameSafe}_${patientId.slice(0, 8)}`);
      
      const requestsRef = collection(db, 'patients', patientId, 'requests');
      let requestSnapshot;
      try {
        requestSnapshot = await getDocs(requestsRef);
      } catch (e) {
        console.error(`Failed to fetch requests for patient ${patientId}:`, e);
        requestSnapshot = { empty: true, docs: [], size: 0 };
      }

      const totalRequests = requestSnapshot.docs.length;
      let currentReqIndex = 0;

      if (requestSnapshot.empty) {
        rows.push([
          `"${patientId}"`,
          `"${patient.name || ''}"`,
          `"${patient.age || ''}"`,
          `"${patient.gender || ''}"`,
          `"${patient.contact || ''}"`,
          `"${patient.createdAt || ''}"`,
          '0',
          'N/A', 'N/A', 'N/A', 'N/A', 'N/A', 'N/A', '0', 'N/A', 'N/A'
        ].join(','));
      } else {
        for (const reqDoc of requestSnapshot.docs) {
          currentReqIndex++;
          const req = reqDoc.data();
          const reqIdShort = reqDoc.id.slice(0, 8);
          const modalitySafe = (req.modalities?.[0] || 'Study').replace(/[^a-z0-9]/gi, '_');
          const studyFolder = patientFolder?.folder(`${modalitySafe}_${reqIdShort}`);
          
          // Fetch images
          const imagesRef = collection(db, 'patients', patientId, 'requests', reqDoc.id, 'images');
          let imageDocs = [];
          
          try {
            const imagesSnapshot = await getDocs(imagesRef);
            imageDocs = imagesSnapshot.docs;
          } catch (e) {
            console.error(`Permission denied fetching images for request ${reqDoc.id}:`, e);
          }
          
          const imageCount = imageDocs.length;
          let localPathReference = 'No Images';

          if (imageCount > 0) {
            localPathReference = `images/${patientNameSafe}_${patientId.slice(0, 8)}/${modalitySafe}_${reqIdShort}/`;
            
            // Sequential batching to avoid browser hang
            for (let i = 0; i < imageDocs.length; i += CONCURRENCY_LIMIT) {
              const batch = imageDocs.slice(i, i + CONCURRENCY_LIMIT);
              
              onProgress?.({ 
                currentPatient: processedPatients, 
                totalPatients, 
                phase: `[Patient ${processedPatients}/${totalPatients}] Study ${currentReqIndex}/${totalRequests}: Downloading images ${i + 1}-${Math.min(i + CONCURRENCY_LIMIT, imageCount)} of ${imageCount} for ${patientName}`
              });

              await Promise.all(batch.map(async (imgDoc, index) => {
                const actualIndex = i + index;
                const imgData = imgDoc.data();
                const url = imgData.url || imgData.data;
                const extension = (imgData.name || '').split('.').pop() || 'png';
                const fileName = `image_${String(actualIndex + 1).padStart(3, '0')}.${extension}`;
                
                if (!url) return;

                try {
                  const controller = new AbortController();
                  const timeoutId = setTimeout(() => controller.abort(), 20000);

                  const response = await fetch(url, { 
                    signal: controller.signal,
                    cache: 'no-cache'
                  });
                  clearTimeout(timeoutId);

                  if (!response.ok) throw new Error(`Status: ${response.status}`);
                  const blob = await response.blob();
                  studyFolder?.file(fileName, blob);
                } catch (err) {
                  console.error(`Failed image download:`, err);
                }
              }));
            }
          }

          rows.push([
            `"${patientId}"`,
            `"${patient.name || ''}"`,
            `"${patient.age || ''}"`,
            `"${patient.gender || ''}"`,
            `"${patient.contact || ''}"`,
            `"${patient.createdAt || ''}"`,
            `"${requestSnapshot.size}"`,
            `"${reqDoc.id}"`,
            `"${(req.modalities || []).join(';')}"`,
            `"${req.status || ''}"`,
            `"${req.priority || ''}"`,
            `"${req.facilityId || ''}"`,
            `"${req.studyDescription || ''}"`,
            `"${imageCount}"`,
            `"${localPathReference}"`,
            `"${req.createdAt || ''}"`
          ].join(','));
        }
      }
    }

    // Add main CSV report to the ZIP
    zip.file('study_report.csv', rows.join('\n'));
    
    onProgress?.({ currentPatient: totalPatients, totalPatients, phase: 'Compressing archive...' });

    // Generate and Save
    const content = await zip.generateAsync({ type: 'blob' });
    saveAs(content, `medical_archive_${new Date().toISOString().split('T')[0]}.zip`);

    return true;
  } catch (error) {
    console.error('CRITICAL: Bulk export process failed:', error);
    handleFirestoreError(error, OperationType.LIST, `bulk_export_failure_${error instanceof Error ? error.message : 'unknown'}`);
    return false;
  }
}
