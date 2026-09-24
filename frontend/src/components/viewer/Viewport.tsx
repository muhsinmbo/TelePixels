import React, { useEffect, useRef, useState } from 'react';
import * as cornerstone from 'cornerstone-core';
import * as cornerstoneTools from 'cornerstone-tools';
import { useViewerStore } from '../../store/useViewerStore';
import { cn } from '../../lib/utils';
import { HeartPulse, ChevronLeft, ChevronRight } from 'lucide-react';
import ContextMenu from './ContextMenu';

interface ViewportProps {
  index: number;
  imageIds?: string[];
}

export default function Viewport({ index, imageIds = [] }: ViewportProps) {
  const elementRef = useRef<HTMLDivElement>(null);
  const { activeTool, activeViewportIndex, setActiveViewportIndex, invert, series, selectedSeriesId, setViewportImageIndex } = useViewerStore();
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [viewportInfo, setViewportInfo] = useState({ ww: 0, wc: 0, zoom: 1 });
  const [isInitialized, setIsInitialized] = useState(false);
  const [loading, setLoading] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number } | null>(null);
  const [ctrData, setCtrData] = useState<{ heart?: number, thoracic?: number }>({});
  const [isCtrComplete, setIsCtrComplete] = useState(false);

  const handleNextSlice = () => {
    const element = elementRef.current;
    if (!element || imageIds.length === 0) return;
    try {
      const stackData = cornerstoneTools.getToolState(element, 'stack');
      if (stackData && stackData.data.length > 0) {
        const stack = stackData.data[0];
        let nextIndex = stack.currentImageIdIndex + 1;
        if (nextIndex >= stack.imageIds.length) {
          nextIndex = 0;
        }
        
        setLoading(true);
        cornerstone.loadImage(stack.imageIds[nextIndex]).then((image) => {
          if (!elementRef.current) return;
          cornerstone.displayImage(elementRef.current, image);
          stack.currentImageIdIndex = nextIndex;
          setCurrentImageIndex(nextIndex);
          setLoading(false);
        }).catch(err => {
          console.error('Failed to load image in handleNextSlice:', err);
          setLoading(false);
        });
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handlePrevSlice = () => {
    const element = elementRef.current;
    if (!element || imageIds.length === 0) return;
    try {
      const stackData = cornerstoneTools.getToolState(element, 'stack');
      if (stackData && stackData.data.length > 0) {
        const stack = stackData.data[0];
        let prevIndex = stack.currentImageIdIndex - 1;
        if (prevIndex < 0) {
          prevIndex = stack.imageIds.length - 1;
        }
        
        setLoading(true);
        cornerstone.loadImage(stack.imageIds[prevIndex]).then((image) => {
          if (!elementRef.current) return;
          cornerstone.displayImage(elementRef.current, image);
          stack.currentImageIdIndex = prevIndex;
          setCurrentImageIndex(prevIndex);
          setLoading(false);
        }).catch(err => {
          console.error('Failed to load image in handlePrevSlice:', err);
          setLoading(false);
        });
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Sync index to store
  useEffect(() => {
    setViewportImageIndex(index, currentImageIndex);
  }, [index, currentImageIndex, setViewportImageIndex]);

  // Refs to avoid stale closures in event listeners
  const handleNextSliceRef = useRef(handleNextSlice);
  const handlePrevSliceRef = useRef(handlePrevSlice);

  useEffect(() => {
    handleNextSliceRef.current = handleNextSlice;
    handlePrevSliceRef.current = handlePrevSlice;
  });

  useEffect(() => {
    const handleNavigate = (e: Event) => {
      const customEvent = e as CustomEvent<{ viewportIndex: number; direction: 'next' | 'prev' }>;
      if (customEvent.detail.viewportIndex === index) {
        if (customEvent.detail.direction === 'next') {
          handleNextSliceRef.current();
        } else if (customEvent.detail.direction === 'prev') {
          handlePrevSliceRef.current();
        }
      }
    };

    window.addEventListener('dicom-viewport-navigate', handleNavigate);
    return () => {
      window.removeEventListener('dicom-viewport-navigate', handleNavigate);
    };
  }, [index]);

  // 1. Lifecycle: Enable/Disable Cornerstone
  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    cornerstone.enable(element);
    setIsInitialized(true);

    const onImageRendered = (e: any) => {
      try {
        const viewport = cornerstone.getViewport(e.target);
        if (!viewport) return;
        setViewportInfo({
          ww: Math.round(viewport.voi.windowWidth),
          wc: Math.round(viewport.voi.windowCenter),
          zoom: Number(viewport.scale.toFixed(2)),
        });
      } catch (err) {
        // Element might have been disabled
      }
    };

    const onMeasurementModified = () => {
      const element = elementRef.current;
      if (!element) return;
      
      try {
        cornerstone.getEnabledElement(element);
        const toolData = cornerstoneTools.getToolState(element, 'Length');
        if (toolData && toolData.data && toolData.data.length >= 1) {
          const getLength = (data: any) => {
            return data.length || data.cachedStats?.length || 0;
          };
          const heart = getLength(toolData.data[0]);
          const thoracic = toolData.data[1] ? getLength(toolData.data[1]) : undefined;
          setCtrData({ heart, thoracic });
          setIsCtrComplete(!!thoracic);
        } else {
          setCtrData({});
          setIsCtrComplete(false);
        }
      } catch (err) {
        // Element might be disabled
      }
    };

    const onNewImage = (e: any) => {
      try {
        const stackData = cornerstoneTools.getToolState(element, 'stack');
        if (stackData && stackData.data.length > 0) {
          setCurrentImageIndex(stackData.data[0].currentImageIdIndex);
        }
      } catch (e) {}
    };

    element.addEventListener('cornerstoneimagerendered', onImageRendered);
    element.addEventListener('cornerstonenewimage', onNewImage);
    element.addEventListener('cornerstonetoolsmeasurementcompleted', onMeasurementModified);
    element.addEventListener('cornerstonetoolsmeasurementmodified', onMeasurementModified);
    element.addEventListener('cornerstonetoolsmeasurementremoved', onMeasurementModified);

    return () => {
      element.removeEventListener('cornerstoneimagerendered', onImageRendered);
      element.removeEventListener('cornerstonenewimage', onNewImage);
      element.removeEventListener('cornerstonetoolsmeasurementcompleted', onMeasurementModified);
      element.removeEventListener('cornerstonetoolsmeasurementmodified', onMeasurementModified);
      element.removeEventListener('cornerstonetoolsmeasurementremoved', onMeasurementModified);
      cornerstone.disable(element);
      setIsInitialized(false);
    };
  }, []);

  // 2. Load Images
  useEffect(() => {
    const element = elementRef.current;
    if (!element || !isInitialized || imageIds.length === 0) return;

    const stack = {
      currentImageIdIndex: 0,
      imageIds: imageIds,
    };

    setLoading(true);
    console.log('Viewport: Loading image', imageIds[0]);

    cornerstone.loadImage(imageIds[0]).then((image) => {
      // Re-verify everything after async call
      if (!isInitialized || !elementRef.current || imageIds.length === 0) return;
      
      const currentElement = elementRef.current;
      console.log('Viewport: Image loaded successfully', image);
      
      try {
        // Verify element is still enabled in cornerstone
        const enabledElement = cornerstone.getEnabledElement(currentElement);
        if (!enabledElement) {
          console.warn('Viewport: Element is no longer enabled');
          return;
        }

        cornerstone.displayImage(currentElement, image);
        cornerstone.resize(currentElement);
        
        // Fit image inside viewport on initial load ensuring top and bottom are fully visible with elegant spacing
        const viewport = cornerstone.getViewport(currentElement);
        if (viewport) {
          const imgHeight = image.rows || image.height;
          const imgWidth = image.columns || image.width;
          if (imgHeight && imgWidth && currentElement.clientHeight && currentElement.clientWidth) {
            // Apply safety margins (88% of container) to guarantee top and bottom of the image are beautifully visible
            const scaleY = (currentElement.clientHeight * 0.88) / imgHeight;
            const scaleX = (currentElement.clientWidth * 0.88) / imgWidth;
            // Use the smaller scale of the two to ensure it is completely contained in both dimensions
            viewport.scale = Math.min(scaleY, scaleX);
            viewport.translation = { x: 0, y: 0 };
            cornerstone.setViewport(currentElement, viewport);
          } else {
            cornerstone.fitToWindow(currentElement);
          }
        } else {
          cornerstone.fitToWindow(currentElement);
        }
        
        cornerstone.updateImage(currentElement);
        
        cornerstoneTools.clearToolState(currentElement, 'stack');
        cornerstoneTools.addStackStateManager(currentElement, ['stack']);
        cornerstoneTools.addToolState(currentElement, 'stack', stack);
        
        cornerstoneTools.setToolActiveForElement(currentElement, 'StackScrollMouseWheel', {});
        cornerstoneTools.setToolActiveForElement(currentElement, activeTool, { mouseButtonMask: 1 });

        const currentViewport = cornerstone.getViewport(currentElement);
        if (currentViewport) {
          setViewportInfo({
            ww: Math.round(currentViewport.voi.windowWidth),
            wc: Math.round(currentViewport.voi.windowCenter),
            zoom: Number(currentViewport.scale.toFixed(2)),
          });
        }
      } catch (err) {
        console.error('Viewport: Rendering error', err);
      }
      setLoading(false);
    }).catch(err => {
      console.error('Viewport: Failed to load image', imageIds[0], err);
      setLoading(false);
    });
  }, [imageIds, isInitialized]);

  // 3. Handle Resizing
  useEffect(() => {
    const element = elementRef.current;
    if (!element || !isInitialized) return;

    const resizeObserver = new ResizeObserver(() => {
      window.requestAnimationFrame(() => {
        if (element) {
          try {
            cornerstone.getEnabledElement(element);
            cornerstone.resize(element);
          } catch (e) {
            // Element not enabled anymore
          }
        }
      });
    });

    resizeObserver.observe(element);
    return () => resizeObserver.disconnect();
  }, [isInitialized]);

  // 4. Tool Updates
  useEffect(() => {
    const element = elementRef.current;
    if (!element || !isInitialized) return;

    try {
      cornerstone.getEnabledElement(element);
      const cornerstoneToolsList = ['Wwwc', 'Pan', 'Zoom', 'Length', 'Angle', 'EllipticalRoi', 'RectangleRoi', 'FreehandRoi', 'Probe', 'Eraser', 'Magnify', 'ArrowAnnotate', 'Rotate'];
      cornerstoneToolsList.forEach(t => {
        try {
          cornerstoneTools.setToolPassiveForElement(element, t);
        } catch (e) {}
      });
      
      console.log('Activating tool:', activeTool);
      if (activeTool === 'CTR') {
        // Clear previous length measurements when starting CTR
        cornerstoneTools.clearToolState(element, 'Length');
        cornerstoneTools.setToolActiveForElement(element, 'Length', { mouseButtonMask: 1 });
        setCtrData({});
        setIsCtrComplete(false);
        cornerstone.updateImage(element);
      } else {
        cornerstoneTools.setToolActiveForElement(element, activeTool, { mouseButtonMask: 1 });
      }
      
      // Update CTR if measurements exist
      if (activeTool === 'CTR') {
        const toolData = cornerstoneTools.getToolState(element, 'Length');
        if (toolData && toolData.data && toolData.data.length >= 1) {
          const getLength = (data: any) => {
            return data.length || data.cachedStats?.length || 0;
          };
          const heart = getLength(toolData.data[0]);
          const thoracic = toolData.data[1] ? getLength(toolData.data[1]) : undefined;
          setCtrData({ heart, thoracic });
          setIsCtrComplete(!!thoracic);
        } else {
          setCtrData({});
          setIsCtrComplete(false);
        }
      }
    } catch (e) {
      console.error('Error updating tools:', e);
    }
  }, [activeTool, isInitialized]);

  // 4. Invert Updates
  useEffect(() => {
    const element = elementRef.current;
    if (!element || !isInitialized) return;

    try {
      cornerstone.getEnabledElement(element);
      const viewport = cornerstone.getViewport(element);
      if (viewport) {
        viewport.invert = invert;
        cornerstone.setViewport(element, viewport);
        cornerstone.updateImage(element);
      }
    } catch (e) {
      // Element not enabled
    }
  }, [invert, isInitialized]);

  // Capture-phase native contextmenu listener to bypass cornerstoneTools event interception
  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    const handleNativeContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setActiveViewportIndex(index);
      setContextMenu({ x: e.clientX, y: e.clientY });
    };

    // Use capturing phase (true) so we intercept the event before Cornerstone / CornerstoneTools can prevent it
    element.addEventListener('contextmenu', handleNativeContextMenu, true);
    return () => {
      element.removeEventListener('contextmenu', handleNativeContextMenu, true);
    };
  }, [index, setActiveViewportIndex, setContextMenu]);

  const isActive = activeViewportIndex === index;
  const currentSeries = series.find(s => s.id === selectedSeriesId);

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setActiveViewportIndex(index);
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  return (
    <div 
      ref={elementRef}
      onClick={() => setActiveViewportIndex(index)}
      className={cn(
        "relative w-full h-full bg-black border-2 transition-colors overflow-hidden",
        `viewport-element viewport-element-${index}`,
        isActive ? "border-primary shadow-[0_0_15px_rgba(var(--primary-rgb),0.3)]" : "border-white/10"
      )}
      onContextMenu={handleContextMenu}
    >
      {contextMenu && (
        <ContextMenu 
          x={contextMenu.x} 
          y={contextMenu.y} 
          onClose={() => setContextMenu(null)} 
        />
      )}
      {/* Overlays */}
      <div className="absolute top-4 left-4 text-[10px] font-mono text-primary pointer-events-none z-10 space-y-1">
        <p>WW: {viewportInfo.ww}</p>
        <p>WC: {viewportInfo.wc}</p>
        <p>Zoom: {viewportInfo.zoom}x</p>
      </div>

      <div className="absolute bottom-4 right-4 text-[10px] font-mono text-primary pointer-events-none z-10">
        <p>Slice: {currentImageIndex + 1} / {imageIds.length}</p>
      </div>

      <div className="absolute bottom-4 left-4 text-[10px] font-mono text-primary pointer-events-none z-10 space-y-1">
        <p className="font-bold uppercase">{currentSeries?.patientName || 'N/A'}</p>
        <p>
          {currentSeries?.metadata?.patientAge ? `${currentSeries.metadata.patientAge}Y` : 'N/A'} / {currentSeries?.metadata?.patientSex || 'N/A'}
        </p>
        <p className="text-[8px] opacity-70">Study Date: {currentSeries?.date || 'N/A'}</p>
      </div>
      
      {activeTool === 'CTR' && (
        <div className="absolute top-4 right-4 max-w-[240px] text-right z-30">
          <div className="glass-panel p-3 border-primary/30 backdrop-blur-md pointer-events-auto">
            <div className="flex items-center justify-end gap-2 text-[10px] font-bold text-primary uppercase mb-2">
              <HeartPulse className="w-4 h-4" />
              <span>CTR Calculator</span>
            </div>
            
            <div className="space-y-2 font-mono text-[10px]">
              <div className="flex justify-between items-center gap-4">
                <span className="text-muted text-[8px] uppercase">1. Heart Diameter</span>
                <span className={cn(ctrData.heart ? "text-main" : "text-main/20")}>
                  {ctrData.heart ? `${ctrData.heart.toFixed(1)} mm` : "Wait..."}
                </span>
              </div>
              
              <div className="flex justify-between items-center gap-4">
                <span className="text-muted text-[8px] uppercase">2. Thoracic Diam</span>
                <span className={cn(ctrData.thoracic ? "text-main" : "text-main/20")}>
                  {ctrData.thoracic ? `${ctrData.thoracic.toFixed(1)} mm` : "Wait..."}
                </span>
              </div>
              
              {isCtrComplete && ctrData.heart && ctrData.thoracic && (
                <div className="pt-2 border-t border-white/10 mt-2">
                  <div className="flex justify-between items-center gap-4">
                    <span className="text-primary font-bold">CTR RATIO</span>
                    <span className={cn(
                      "text-sm font-bold",
                      (ctrData.heart / ctrData.thoracic) > 0.5 ? "text-danger" : "text-primary"
                    )}>
                      {(ctrData.heart / ctrData.thoracic).toFixed(2)}
                    </span>
                  </div>
                  <p className="text-[8px] text-muted text-right mt-1">
                    {(ctrData.heart / ctrData.thoracic) > 0.5 ? "Enlarged Cardiac Silhouette" : "Normal Cardiac Size"}
                  </p>
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      const element = elementRef.current;
                      if (element) {
                        try {
                          cornerstoneTools.clearToolState(element, 'Length');
                          setCtrData({});
                          setIsCtrComplete(false);
                          cornerstone.updateImage(element);
                        } catch (err) {
                          console.error('Error resetting CTR:', err);
                        }
                      }
                    }}
                    className="w-full mt-3 py-1 bg-white/5 hover:bg-white/10 border border-white/10 rounded text-[8px] uppercase tracking-wider text-muted hover:text-main transition-colors font-bold"
                  >
                    Reset Measurements
                  </button>
                </div>
              )}
              
              {!isCtrComplete && (
                <p className="text-[8px] text-accent italic mt-2">
                  {ctrData.heart ? "Draw maximum internal thoracic diameter" : "Draw maximum transverse heart diameter"}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {loading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 backdrop-blur-sm z-20">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mb-2" />
          <p className="text-xs text-primary font-mono animate-pulse">Loading Image...</p>
        </div>
      )}

      {imageIds.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center text-muted text-sm">
          No Series Loaded
        </div>
      )}
    </div>
  );
}
