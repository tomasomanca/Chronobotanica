import { Color } from 'three';

// 3D Grid Dimensions - Sculptural Voxel World
export const GRID_WIDTH = 100;
export const GRID_HEIGHT = 100;
export const GRID_DEPTH = 100;

// Simulation Rules
export const ENERGY_TO_GROW = 40; // Reduced for Bio-acceleration
export const MAX_AGE_STEM = 60000;
export const MAX_INSTANCES = 150000;

// Colors 
export const COLOR_BG = 0x000000;
export const COLOR_GROUND = 0x050505;
export const COLOR_CRYSTAL = new Color('#1A1A1A'); // Dark Glass
export const COLOR_ASH = new Color('#FFFFFF');     // Legacy Seed (White)
export const COLOR_SUN = new Color('#FFFFFF');     // Pure White

// Visuals
export const CELL_SIZE = 0.95;