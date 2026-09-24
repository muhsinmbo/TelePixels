import * as cornerstoneWADOImageLoader from 'cornerstone-wado-image-loader';
import dicomParser from 'dicom-parser';
import JSZip from 'jszip';
import { SeriesData } from '../../store/useViewerStore';

export async function parseDicomFiles(files: FileList | File[]): Promise<SeriesData[]> {
  const seriesMap = new Map<string, SeriesData>();

  for (const file of Array.from(files)) {
    if (file.name.endsWith('.zip')) {
      const zip = await JSZip.loadAsync(file);
      const zipFiles: File[] = [];
      
      for (const [path, zipEntry] of Object.entries(zip.files)) {
        if (!zipEntry.dir && (path.toLowerCase().endsWith('.dcm') || path.toLowerCase().endsWith('.dicom'))) {
          const blob = await zipEntry.async('blob');
          zipFiles.push(new File([blob], path));
        }
      }
      
      const zipSeries = await parseDicomFiles(zipFiles);
      zipSeries.forEach(s => {
        if (seriesMap.has(s.id)) {
          seriesMap.get(s.id)!.imageIds.push(...s.imageIds);
        } else {
          seriesMap.set(s.id, s);
        }
      });
      continue;
    }

    if (!file.name.toLowerCase().endsWith('.dcm') && !file.name.toLowerCase().endsWith('.dicom')) {
      continue;
    }

    const imageId = cornerstoneWADOImageLoader.wadouri.fileManager.add(file);
    
    // Extract basic metadata for grouping
    try {
      const arrayBuffer = await file.arrayBuffer();
      const dataSet = dicomParser.parseDicom(new Uint8Array(arrayBuffer));
      
      const seriesInstanceUid = dataSet.string('x0020000e') || 'unknown-series';
      const patientName = dataSet.string('x00100010') || 'Anonymous';
      const modality = dataSet.string('x00080060') || 'DX';
      const studyDate = dataSet.string('x00080020') || 'Unknown';
      const seriesDescription = dataSet.string('x0008103e') || 'No Description';

      if (seriesMap.has(seriesInstanceUid)) {
        seriesMap.get(seriesInstanceUid)!.imageIds.push(imageId);
      } else {
        seriesMap.set(seriesInstanceUid, {
          id: seriesInstanceUid,
          name: seriesDescription,
          modality,
          date: studyDate,
          patientName,
          imageIds: [imageId],
          metadata: {
            patientId: dataSet.string('x00100020'),
            studyInstanceUid: dataSet.string('x0020000d'),
            rows: dataSet.uint16('x00280010'),
            columns: dataSet.uint16('x00280011'),
          }
        });
      }
    } catch (e) {
      console.error('Error parsing DICOM file:', file.name, e);
    }
  }

  return Array.from(seriesMap.values());
}
