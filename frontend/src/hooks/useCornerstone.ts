import { useEffect } from 'react';
import * as cornerstone from 'cornerstone-core';
import * as cornerstoneMath from 'cornerstone-math';
import * as cornerstoneTools from 'cornerstone-tools';
import * as cornerstoneWADOImageLoader from 'cornerstone-wado-image-loader';
import * as cornerstoneWebImageLoader from 'cornerstone-web-image-loader';
import dicomParser from 'dicom-parser';
import Hammer from 'hammerjs';

if (typeof window !== 'undefined') {
  // @ts-ignore
  window.cornerstone = cornerstone;
  // @ts-ignore
  window.cornerstoneTools = cornerstoneTools;
  console.log('Cornerstone: Globals attached to window.');
}

export function initCornerstone() {
  console.log('Cornerstone: Starting initialization...');
  try {
    // 1. Setup External Dependencies
    // @ts-ignore
    cornerstoneTools.external.cornerstone = cornerstone;
    // @ts-ignore
    cornerstoneTools.external.Hammer = Hammer;
    // @ts-ignore
    cornerstoneTools.external.cornerstoneMath = cornerstoneMath;

    // 2. Initialize Tools
    cornerstoneTools.init({
      showSVGCursors: true,
      globalToolSyncEnabled: true,
    });

    // Set global tool styles
    cornerstoneTools.toolStyle.setToolWidth(2);
    cornerstoneTools.toolColors.setToolColor('rgb(0, 242, 254)');
    cornerstoneTools.toolColors.setActiveColor('rgb(255, 255, 0)');
    cornerstoneTools.toolColors.setFillColor('rgba(0, 242, 254, 0.2)');

    // 3. Configure Loaders
    // @ts-ignore
    cornerstoneWADOImageLoader.external.cornerstone = cornerstone;
    // @ts-ignore
    cornerstoneWADOImageLoader.external.dicomParser = dicomParser;
    // @ts-ignore
    cornerstoneWebImageLoader.external.cornerstone = cornerstone;

    // Explicitly register the web image loader for all common web schemes
    const webLoader = cornerstoneWebImageLoader.loadImage || (cornerstoneWebImageLoader as any).default?.loadImage || (cornerstoneWebImageLoader as any).loadImage;
    
    if (webLoader) {
      console.log('Cornerstone: Registering web image loader for schemes: web, http, https, data');
      // @ts-ignore
      cornerstone.registerImageLoader('web', webLoader);
      // @ts-ignore
      cornerstone.registerImageLoader('http', webLoader);
      // @ts-ignore
      cornerstone.registerImageLoader('https', webLoader);
      // @ts-ignore
      cornerstone.registerImageLoader('data', webLoader);
    } else {
      console.warn('Cornerstone: Web image loader NOT found. Checked .loadImage, .default.loadImage');
    }

    const config = {
      maxWebWorkers: navigator.hardwareConcurrency || 1,
      startWebWorkersOnDemand: true,
      webWorkerPath: 'https://unpkg.com/cornerstone-wado-image-loader@4.1.5/dist/cornerstoneWADOImageLoaderWebWorker.min.js',
      taskConfiguration: {
        decodeTask: {
          initializeCodecsOnStartup: false,
          codecsPath: 'https://unpkg.com/cornerstone-wado-image-loader@4.1.5/dist/cornerstoneWADOImageLoaderCodecs.min.js',
        },
      },
    };
    
    try {
      console.log('Cornerstone: Initializing WADO web worker manager');
      cornerstoneWADOImageLoader.webWorkerManager.initialize(config);
    } catch (workerErr) {
      console.error('Cornerstone: Failed to initialize web worker manager', workerErr);
    }

    // 4. Add Tools
    console.log('Cornerstone: Adding tools...');
    const {
      WwwcTool,
      PanTool,
      ZoomTool,
      LengthTool,
      AngleTool,
      EllipticalRoiTool,
      RectangleRoiTool,
      ProbeTool,
      EraserTool,
      StackScrollMouseWheelTool,
      MagnifyTool,
      ArrowAnnotateTool,
      RotateTool,
      FreehandRoiTool,
      DragProbeTool
    } = cornerstoneTools;

    if (WwwcTool) cornerstoneTools.addTool(WwwcTool);
    if (PanTool) cornerstoneTools.addTool(PanTool);
    if (ZoomTool) cornerstoneTools.addTool(ZoomTool);
    if (LengthTool) cornerstoneTools.addTool(LengthTool);
    if (AngleTool) cornerstoneTools.addTool(AngleTool);
    if (EllipticalRoiTool) cornerstoneTools.addTool(EllipticalRoiTool);
    if (RectangleRoiTool) cornerstoneTools.addTool(RectangleRoiTool);
    if (ProbeTool) cornerstoneTools.addTool(ProbeTool);
    if (StackScrollMouseWheelTool) cornerstoneTools.addTool(StackScrollMouseWheelTool);
    if (MagnifyTool) cornerstoneTools.addTool(MagnifyTool);
    if (ArrowAnnotateTool) cornerstoneTools.addTool(ArrowAnnotateTool);
    if (RotateTool) cornerstoneTools.addTool(RotateTool);
    if (FreehandRoiTool) {
      cornerstoneTools.addTool(FreehandRoiTool, {
        configuration: {
          alwaysRenderSelectedCursor: true,
          allowCloseCurve: true,
          closeCurveByDragging: true,
        }
      });
    }
    if (EraserTool) {
      cornerstoneTools.addTool(EraserTool);
    }
    if (DragProbeTool) cornerstoneTools.addTool(DragProbeTool);
    
    console.log('Cornerstone: Initialization complete.');
  } catch (err) {
    console.error('Cornerstone: Critical initialization error', err);
  }
}

export function useCornerstone() {
  useEffect(() => {
    initCornerstone();
  }, []);
}
