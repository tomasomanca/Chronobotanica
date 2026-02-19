export enum CellType {
  EMPTY = 0,
  STEM = 1,
  LEAF = 2,
  FLOWER = 3,
  CRYSTAL = 4,
  ASH = 5,
  // System Types
  PETAL = 6,
  SUN = 7
}

export interface Genotype {
  branchBias: number;     // 0.0 - 0.1
  sunSensitivity: number; // 0.1 - 1.0
  maxHeight: number;      // 0.3 - 0.9

  // Biodiversity
  leafDensity: number;    // 0.05 - 0.3 chance per stem
  leafSize: number;       // 2 - 6 pixels per leaf cluster

  // Pre-calculated Hex Colors
  stemColor: number;
  leafColor: number;
  flowerColor: number;
}

export interface GridCell {
  type: CellType;
  x: number;
  y: number;
  z: number; // Added Z dimension
  age: number;
  maxAge: number;
  energy: number;
  plantId: number | null;
  dnaHash: string;
  genotype: Genotype;
  isTip: boolean;
  birthTime: string;
}

export interface GardenConfig {
  width: number;
  height: number;
  depth: number; // Added depth
  sunPosition: { x: number; y: number; z: number }; // 3D Sun
  growthRate: number;
}

export interface PlantStats {
  id: number;
  size: number;
  status: 'Growing' | 'Crystallized';
}

export interface GardenStats {
  totalPlantsBorn: number;
  activePlants: number;
  uniqueSpecies: number;
  sunPosition: number; // degrees 0-360
  virtualDays: number;
  cells: {
    stem: number;
    leaf: number;
    flower: number;
    crystal: number;
    ash: number;
  };
}

export interface PlantRecord {
  id: number;
  created_at: string;
  dna: string;
  x: number;
  z: number;
  status: 'alive' | 'ash';
}