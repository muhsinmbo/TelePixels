import { create } from 'zustand';

export type ToolName = 'Wwwc' | 'Pan' | 'Zoom' | 'Length' | 'Angle' | 'EllipticalRoi' | 'RectangleRoi' | 'Probe' | 'Eraser' | 'Magnify' | 'ArrowAnnotate' | 'Rotate' | 'FreehandRoi' | 'CTR';

interface ViewportState {
  activeTool: ToolName;
  layout: '1x1' | '2x2';
  activeViewportIndex: number;
  invert: boolean;
  series: SeriesData[];
  selectedSeriesId: string | null;
  viewportData: { [key: number]: string[] }; // viewport index -> imageIds
  viewportImageIndices: { [key: number]: number }; // viewport index -> current image index
}

export interface SeriesData {
  id: string;
  name: string;
  modality: string;
  date: string;
  patientName: string;
  imageIds: string[];
  metadata: any;
  imageMetadata?: { [imageId: string]: any }; // imageId -> metadata
}

interface ViewerStore extends ViewportState {
  setActiveTool: (tool: ToolName) => void;
  setLayout: (layout: '1x1' | '2x2') => void;
  setActiveViewportIndex: (index: number) => void;
  setViewportImageIndex: (viewportIndex: number, imageIndex: number) => void;
  setInvert: (invert: boolean) => void;
  setSeries: (series: SeriesData[]) => void;
  addSeries: (series: SeriesData) => void;
  setSelectedSeriesId: (id: string | null) => void;
  setViewportData: (index: number, imageIds: string[]) => void;
  reset: () => void;
}

const initialState: ViewportState = {
  activeTool: 'Wwwc',
  layout: '1x1',
  activeViewportIndex: 0,
  invert: false,
  series: [],
  selectedSeriesId: null,
  viewportData: {},
  viewportImageIndices: {},
};

export const useViewerStore = create<ViewerStore>((set) => ({
  ...initialState,
  setActiveTool: (activeTool) => set({ activeTool }),
  setLayout: (layout) => set({ layout }),
  setActiveViewportIndex: (activeViewportIndex) => set({ activeViewportIndex }),
  setViewportImageIndex: (viewportIndex, imageIndex) => set((state) => ({
    viewportImageIndices: { ...state.viewportImageIndices, [viewportIndex]: imageIndex }
  })),
  setInvert: (invert) => set({ invert }),
  setSeries: (series) => set({ series }),
  addSeries: (newSeries) => set((state) => ({ series: [...state.series, newSeries] })),
  setSelectedSeriesId: (selectedSeriesId) => set({ selectedSeriesId }),
  setViewportData: (index, imageIds) => set((state) => ({ 
    viewportData: { ...state.viewportData, [index]: imageIds } 
  })),
  reset: () => set(initialState),
}));
