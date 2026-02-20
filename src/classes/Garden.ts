import * as THREE from 'three';
import { supabase } from '../supabaseClient';
import { CellType, GridCell, GardenConfig, Genotype, PlantRecord } from '../types';
import { GRID_WIDTH, GRID_HEIGHT, GRID_DEPTH, ENERGY_TO_GROW, MAX_AGE_STEM } from '../constants';

// Deep Time Constants (Per Slow-Tick)
const SEED_CHANCE = 0.05;    // 5% chance per slow tick for new species
const REBIRTH_CHANCE = 0.08; // 8% chance per slow tick for Ash to rebirth

interface TipState {
    idx: number;
    dir: { x: number, y: number, z: number };
    level: number;
    length: number;
    maxLength: number;
}

interface NeighborInfo {
    x: number;
    y: number;
    z: number;
    idx: number;
    weight?: number;
}

interface PlantState {
    id: number;
    indices: number[];
    phase: 'GROWING' | 'MATURE' | 'CRYSTALLIZING' | 'DISSOLVING' | 'LEGACY';
    individualMaxHeight: number;
    crystallizationDelay: number;
    vigor: number;
    dna: string;
    genotype: Genotype;
    center: { x: number, y: number, z: number };
    energy: number;
    age: number;
}

export class Garden {
    public grid: Map<number, GridCell>;
    public config: GardenConfig;
    public sunPosition: { x: number, y: number, z: number };
    public playbackTime: number; // TImestamp for visual replay
    public onPlantBorn?: (id: number, dna: string, x: number, z: number) => Promise<void> | void;

    private plantCounter = 0;
    private realPlantCount = 0;
    private activeTips: Map<number, TipState>;
    private plantRegistry: Map<number, PlantState>;
    private uniqueSpeciesSet: Set<string>; // Track unique DNA strings

    // Catch-up state: buffer DB writes during offline simulation
    private isCatchingUp = false;
    private globalLastTickTime: number | null = null;
    private pendingPlants: { id: number, dna: string, x: number, z: number }[] = [];
    private pendingCells: { plant_id: number | null, x: number, y: number, z: number, type: number }[] = [];

    // Stats Tracking
    private cellCounts = {
        stem: 0,
        leaf: 0,
        flower: 0,
        crystal: 0,
        ash: 0
    };

    constructor(config: GardenConfig) {
        this.config = config;
        this.activeTips = new Map();
        this.grid = new Map();
        this.plantRegistry = new Map();
        this.uniqueSpeciesSet = new Set();
        this.sunPosition = { x: 50, y: 110, z: 50 };
        this.playbackTime = Date.now();
    }

    private simulationTime: number | null = null;

    private get timeNow(): number {
        return this.simulationTime || Date.now();
    }

    public getIndex(x: number, y: number, z: number): number {
        if (x < 0 || x >= GRID_WIDTH || y < 0 || y >= GRID_HEIGHT || z < 0 || z >= GRID_DEPTH) return -1;
        return x + (y * GRID_WIDTH) + (z * GRID_WIDTH * GRID_HEIGHT);
    }

    // Simulate sun position from a timestamp (same formula as DigitalGarden.tsx)
    private updateSunFromTime(timeMs: number) {
        const date = new Date(timeMs);
        const secondsSinceMidnight = date.getHours() * 3600 + date.getMinutes() * 60 + date.getSeconds();
        const dayProgress = secondsSinceMidnight / 86400;
        const phase = (dayProgress * Math.PI * 2) + (Math.PI / 2);
        this.sunPosition = {
            x: 50 + 130 * Math.cos(phase),
            y: -130 * Math.sin(phase),
            z: 50
        };
    }

    // Perform simulation ticks without visualization or async delays
    private performTick(updates: number, stepMs: number = 0) {
        for (let i = 0; i < updates; i++) {
            if (this.simulationTime !== null) {
                this.simulationTime += stepMs;
                // Update sun position to match the simulated time
                this.updateSunFromTime(this.simulationTime);
            }

            // 1. Spontaneous Seeding (Only if growthRate > 0)
            if (this.config.growthRate > 0 && Math.random() < SEED_CHANCE) {
                this.spawnNewPlant();
            }

            // 2. Rebirth
            for (const [plantId, state] of this.plantRegistry) {
                if (state.phase === 'LEGACY') {
                    if (state.indices.length > 0 && Math.random() < REBIRTH_CHANCE) {
                        const rootIdx = state.indices[0];
                        const cell = this.grid.get(rootIdx);
                        if (cell && cell.type === CellType.ASH) {
                            const dna = cell.dnaHash;
                            const x = cell.x;
                            const y = cell.y;
                            const z = cell.z;
                            state.indices = [];
                            this.initializePlantAt(rootIdx, x, y, z, dna);
                        }
                    }
                }
            }

            // 3. Update Growth
            const tips = Array.from(this.activeTips.values());
            // Randomize order slightly for organic feel
            if (tips.length > 0) {
                // Optimization: shuffle only if needed or just iterate
                // For catch-up speed, we can skip shuffle or do a simple one
                for (let j = tips.length - 1; j > 0; j--) {
                    const k = Math.floor(Math.random() * (j + 1));
                    [tips[j], tips[k]] = [tips[k], tips[j]];
                }
            }

            const processCount = Math.min(tips.length, 60);
            for (let t = 0; t < processCount; t++) {
                const tip = tips[t];
                if (tip && this.activeTips.has(tip.idx)) {
                    this.processTip(tip.idx);
                }
            }

            // 4. Update Lifecycle
            this.updateLifecycle();
        }
    }

    private updateCellCount(type: CellType, delta: number) {
        switch (type) {
            case CellType.STEM: this.cellCounts.stem += delta; break;
            case CellType.LEAF: this.cellCounts.leaf += delta; break;
            case CellType.FLOWER: this.cellCounts.flower += delta; break;
            case CellType.CRYSTAL: this.cellCounts.crystal += delta; break;
            case CellType.ASH:
                this.cellCounts.ash = Math.max(0, this.cellCounts.ash + delta);
                break;
        }
    }

    private createCell(index: number, x: number, y: number, z: number, type: CellType, plantId: number | null, dna: string, genotype: Genotype, birthTime?: number | string | Date) {
        // If overwriting, decrement old type
        if (this.grid.has(index)) {
            this.updateCellCount(this.grid.get(index)!.type, -1);
        }

        const now = birthTime ? new Date(birthTime) : new Date(this.timeNow);
        const date = `${now.getDate().toString().padStart(2, '0')}.${(now.getMonth() + 1).toString().padStart(2, '0')}.${now.getFullYear().toString().slice(-2)}`;
        const time = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
        const timeStr = `${date} · ${time}`;

        const cell: GridCell = {
            type,
            x, y, z,
            plantId,
            dnaHash: dna,
            genotype,
            age: 0,
            maxAge: MAX_AGE_STEM,
            energy: 0,
            isTip: false,
            birthTime: timeStr
        };
        this.grid.set(index, cell);
        this.updateCellCount(type, 1); // Increment new type

        if (plantId !== null && this.plantRegistry.has(plantId)) {
            this.plantRegistry.get(plantId)!.indices.push(index);

            // Save to Database (skip during time travel, buffer during catch-up)
            if (this.isCatchingUp) {
                this.pendingCells.push({ plant_id: cell.plantId, x: cell.x, y: cell.y, z: cell.z, type: cell.type });
            } else if (this.config.growthRate <= 1.0) {
                this.saveNewCell(cell);
            }
        }
    }

    // --- PERSISTENCE HELPERS ---

    private async saveNewCell(cell: GridCell) {
        const { error } = await supabase.from('plant_cells').insert({
            plant_id: cell.plantId,
            x: cell.x,
            y: cell.y,
            z: cell.z,
            type: cell.type
        });

        if (error) {
            console.error('[Garden] Failed to save cell:', error.message);
        }
    }

    // --- GENETICS ---

    private generateDNA(): string {
        const randomHex = Math.floor(Math.random() * 0xFFFFFF).toString(16).padStart(6, '0').toUpperCase();
        return `0x${randomHex}${Math.floor(Math.random() * 0xFFFFFF).toString(16).padStart(6, '0').toUpperCase()}`;
    }

    private parseDNA(hash: string): Genotype {
        const cleanHash = hash.replace('0x', '');
        const valBranch = parseInt(cleanHash.substring(0, 2), 16) || 0;
        const valSun = parseInt(cleanHash.substring(2, 4), 16) || 0;
        const valLeafD = parseInt(cleanHash.substring(4, 6), 16) || 0;
        const valLeafS = parseInt(cleanHash.substring(6, 8), 16) || 0;

        // Explicit Color Genes
        const valColorHue = parseInt(cleanHash.substring(8, 10), 16) || 0;
        const valColorVar = parseInt(cleanHash.substring(10, 12), 16) || 0;

        const tempColor = new THREE.Color();
        const hsl = { h: 0, s: 0, l: 0 };

        // Stem: Neon Green Base
        tempColor.set('#00FF41');
        tempColor.getHSL(hsl);
        const hueShift = ((valColorVar / 255) * 0.1) - 0.05;
        hsl.h = (hsl.h + hueShift + 1.0) % 1.0;
        tempColor.setHSL(hsl.h, hsl.s, hsl.l);
        const stemColor = tempColor.getHex();

        // Leaf: Deep Emeralds
        let leafH = hsl.h + (hueShift * 2.5);
        let leafL = hsl.l + (valColorVar > 128 ? 0.15 : -0.15);
        tempColor.setHSL((leafH + 1.0) % 1.0, hsl.s, Math.max(0.2, Math.min(0.7, leafL)));
        const leafColor = tempColor.getHex();

        // Flower: TRUE COLOR RANDOMIZATION (Full Spectrum)
        const flowerH = valColorHue / 255.0;
        const flowerS = 0.8 + ((valColorVar % 50) / 250.0);
        const flowerL = 0.5 + ((valColorVar % 25) / 250.0);

        tempColor.setHSL(flowerH, flowerS, flowerL);
        const flowerColor = tempColor.getHex();

        return {
            branchBias: 0.2 + (valBranch / 255) * 0.3,
            // HEIGHT RANGE: 0.4 to 1.8 times grid height
            maxHeight: 0.4 + (valSun / 255) * 1.4,
            sunSensitivity: 0.3 + (valSun / 255) * 0.7,
            leafDensity: 0.15 + (valLeafD / 255) * 0.25,
            leafSize: 2 + Math.floor((valLeafS / 255) * 4),
            stemColor, leafColor, flowerColor
        };
    }

    // --- LIFECYCLE ---

    public async seed(count: number) {
        for (let i = 0; i < count; i++) await this.spawnNewPlant();
    }

    private registerPlant(id: number, genotype: Genotype, dna: string) {
        // VIGOR: 0.5 to 1.5
        const vigorVal = parseInt(dna.slice(-3), 16);
        const vigorMultiplier = 0.5 + (vigorVal / 4095.0);

        this.plantRegistry.set(id, {
            id,
            indices: [],
            phase: 'GROWING',
            individualMaxHeight: Math.max(15, genotype.maxHeight * GRID_HEIGHT * (0.8 + Math.random() * 0.4)),
            crystallizationDelay: 40 + Math.random() * 30,
            vigor: 0.8 + Math.random() * 0.4,
            dna,
            genotype,
            center: { x: 0, y: 0, z: 0 }, // Will be set by first stem
            energy: 100,
            age: 0
        });
    }

    private async initializePlantAt(index: number, x: number, y: number, z: number, dna: string, birthTime: string | null = null, forcedId?: number) {
        let id: number;

        if (forcedId !== undefined) {
            id = forcedId;
            this.plantCounter = Math.max(this.plantCounter, id);
        } else {
            this.plantCounter++;
            id = this.plantCounter;
            this.realPlantCount++;
        }
        this.uniqueSpeciesSet.add(dna); // Track unique species
        const genotype = this.parseDNA(dna);

        this.registerPlant(id, genotype, dna);

        // Save plant record FIRST (skip during time travel, buffer during catch-up)
        if (forcedId === undefined) {
            if (this.isCatchingUp) {
                this.pendingPlants.push({ id, dna, x, z });
            } else if (this.onPlantBorn && this.config.growthRate <= 1.0) {
                await this.onPlantBorn(id, dna, x, z);
            }
        }

        this.createCell(index, x, y, z, CellType.STEM, id, dna, genotype, birthTime);

        const cell = this.grid.get(index)!;
        cell.isTip = true;
        cell.energy = ENERGY_TO_GROW * 2;

        this.activeTips.set(index, {
            idx: index,
            dir: { x: 0, y: 1, z: 0 },
            level: 0,
            length: 0,
            maxLength: 40 + Math.random() * 50
        });
    }

    private async spawnNewPlant() {
        let attempts = 0;
        while (attempts < 10) {
            const rx = Math.floor(Math.random() * GRID_WIDTH);
            const rz = Math.floor(Math.random() * GRID_DEPTH);
            const idx = this.getIndex(rx, 0, rz);

            if (idx !== -1 && !this.grid.has(idx)) {
                const dna = this.generateDNA();
                await this.initializePlantAt(idx, rx, 0, rz, dna);
                break;
            }
            attempts++;
        }
    }

    public async update() {
        const MS_PER_UPDATE = (2.0 / (Math.PI * 2)) * 86400000;
        this.playbackTime += MS_PER_UPDATE;

        // 1. Spontaneous Seeding
        if (this.config.growthRate > 0 && Math.random() < SEED_CHANCE) {
            this.spawnNewPlant();
        }

        // 2. Rebirth from Ash
        for (const [plantId, state] of this.plantRegistry) {
            if (state.phase === 'LEGACY') {
                if (state.indices.length > 0 && Math.random() < REBIRTH_CHANCE) {
                    const rootIdx = state.indices[0];
                    const cell = this.grid.get(rootIdx);
                    if (cell && cell.type === CellType.ASH) {
                        const dna = cell.dnaHash;
                        const x = cell.x;
                        const y = cell.y;
                        const z = cell.z;
                        state.indices = [];
                        this.initializePlantAt(rootIdx, x, y, z, dna);
                    }
                }
            }
        }

        // 3. Update Growth
        const tips = Array.from(this.activeTips.values());
        tips.sort(() => Math.random() - 0.5);
        const processCount = Math.min(tips.length, 60);

        for (let i = 0; i < processCount; i++) {
            const tip = tips[i];
            if (tip && this.activeTips.has(tip.idx)) {
                this.processTip(tip.idx);
            }
        }

        // 4. Update Lifecycle
        this.updateLifecycle();

        // 5. Update Global Time in DB if running live
        if (this.config.growthRate <= 1.0 && this.globalLastTickTime !== null && !this.isCatchingUp) {
            this.globalLastTickTime += MS_PER_UPDATE;
            const newGlobalTime = new Date(this.globalLastTickTime).toISOString();
            supabase.from('garden_state').upsert({ id: 1, last_tick_time: newGlobalTime }).then(({ error }) => {
                if (error) console.error('[Garden] Failed to update live global time:', error.message);
            });
        }
    }

    private triggerMaturity(plantId: number) {
        if (this.plantRegistry.has(plantId)) {
            const state = this.plantRegistry.get(plantId)!;
            if (state.phase === 'GROWING') {
                state.phase = 'MATURE';

                for (const [key, tip] of this.activeTips) {
                    const cell = this.grid.get(tip.idx);
                    if (cell && cell.plantId === plantId) {
                        this.activeTips.delete(key);
                    }
                }
            }
        }
    }

    private updateLifecycle() {
        for (const [plantId, state] of this.plantRegistry) {
            if (state.phase === 'LEGACY') continue;
            if (state.phase === 'GROWING') continue;

            // MATURE: Long period of stability
            if (state.phase === 'MATURE') {
                state.crystallizationDelay--;
                if (state.crystallizationDelay <= 0) {
                    state.phase = 'CRYSTALLIZING';
                }
                continue;
            }

            state.indices = state.indices.filter(idx => this.grid.has(idx));

            if (state.indices.length === 0) {
                state.phase = 'LEGACY';
                continue;
            }

            // CRYSTALLIZING: Fast Transition (35-40% per tick)
            if (state.phase === 'CRYSTALLIZING') {
                const candidates = state.indices.filter(idx => {
                    const c = this.grid.get(idx);
                    return c && c.type !== CellType.CRYSTAL && c.type !== CellType.ASH;
                });

                if (candidates.length === 0) {
                    state.phase = 'DISSOLVING';
                } else {
                    // Transform a large chunk (40%) per update
                    // This ensures the plant turns black in 2-3 updates max.
                    const changeCount = Math.ceil(candidates.length * 0.40);

                    for (let i = 0; i < changeCount; i++) {
                        // Random selection for organic spread
                        const r = Math.floor(Math.random() * candidates.length);
                        const idx = candidates[r];

                        // Remove from list to avoid double picking in this loop (simple swap)
                        candidates[r] = candidates[candidates.length - 1];
                        candidates.pop();

                        const cell = this.grid.get(idx);
                        if (cell) {
                            this.updateCellCount(cell.type, -1); // Remove old type
                            cell.type = CellType.CRYSTAL;
                            this.updateCellCount(CellType.CRYSTAL, 1); // Add Crystal
                        }
                    }
                }
            }
            // DISSOLVING: Rhythmic Collapse (20-25% per tick)
            else if (state.phase === 'DISSOLVING') {
                // Sort Top-Down to simulate crumbling
                state.indices.sort((a, b) => {
                    const ca = this.grid.get(a);
                    const cb = this.grid.get(b);
                    if (!ca || !cb) return 0;
                    return cb.y - ca.y; // Descending Y
                });

                // Remove ~25% of the plant mass per tick
                // This takes about 4-5 ticks to fully vanish
                const removeCount = Math.max(1, Math.ceil(state.indices.length * 0.25));
                const toRemoveIndices: number[] = [];

                for (let i = 0; i < removeCount; i++) {
                    if (i >= state.indices.length) break;

                    const idx = state.indices[i];
                    const cell = this.grid.get(idx);

                    if (cell) {
                        if (cell.y > 0) {
                            this.updateCellCount(cell.type, -1); // Update Stat
                            this.grid.delete(idx);
                            toRemoveIndices.push(idx);
                        } else if (cell.y === 0 && cell.type !== CellType.ASH) {
                            // Preserve Legacy Seed at the very end
                            this.updateCellCount(cell.type, -1); // Remove old
                            cell.type = CellType.ASH;
                            this.updateCellCount(CellType.ASH, 1); // Add Ash
                        }
                    } else {
                        toRemoveIndices.push(idx);
                    }
                }

                state.indices = state.indices.filter(idx => !toRemoveIndices.includes(idx));

                // Check if only base remains
                const remainingAboveGround = state.indices.some(idx => {
                    const c = this.grid.get(idx);
                    return c && c.y > 0;
                });

                if (!remainingAboveGround) {
                    // FINAL SWEEP: Ensure a single Ash (Genoma) seed remains and everything else is gone
                    let seedIdx = -1;

                    for (const idx of state.indices) {
                        const cell = this.grid.get(idx);
                        if (!cell) continue;

                        if (cell.y === 0) {
                            if (seedIdx === -1) {
                                // First base cell becomes the seed
                                seedIdx = idx;
                                if (cell.type !== CellType.ASH) {
                                    this.updateCellCount(cell.type, -1);
                                    cell.type = CellType.ASH;
                                    this.updateCellCount(CellType.ASH, 1);
                                }
                            } else {
                                // Extra base cells are removed
                                this.updateCellCount(cell.type, -1);
                                this.grid.delete(idx);
                            }
                        } else {
                            // Any remaining floating cells are removed
                            this.updateCellCount(cell.type, -1);
                            this.grid.delete(idx);
                        }
                    }

                    state.indices = seedIdx !== -1 ? [seedIdx] : [];
                    state.phase = 'LEGACY';

                }
            }
        }
    }

    private processTip(idx: number) {
        const cell = this.grid.get(idx);
        if (!cell || !cell.plantId) { this.activeTips.delete(idx); return; }

        const tipState = this.activeTips.get(idx);
        if (!tipState) return;

        const plantState = this.plantRegistry.get(cell.plantId);
        if (!plantState) return;

        if (cell.y >= plantState.individualMaxHeight) {
            this.triggerMaturity(cell.plantId);
            return;
        }

        const metabolism = 25 * plantState.vigor;
        cell.age += 1;
        cell.energy += metabolism;

        if (tipState.length >= tipState.maxLength || cell.y >= GRID_HEIGHT - 5) {
            this.spawnOrganicFlower(cell, idx);
            this.triggerMaturity(cell.plantId);
            return;
        }

        if (cell.energy >= ENERGY_TO_GROW) {
            this.grow3D(cell, tipState, plantState.individualMaxHeight);
            cell.energy = 0;
        }
    }

    private grow3D(parent: GridCell, state: TipState, limit: number) {
        const neighbors = this.getNeighbors3D(parent.x, parent.y, parent.z);

        const candidates = neighbors.filter(n => {
            return !this.grid.has(n.idx) && n.y >= parent.y;
        });

        if (candidates.length === 0) {
            this.activeTips.delete(state.idx);
            return;
        }

        let tx = state.dir.x * 0.85;
        let tz = state.dir.z * 0.85;
        let ty = state.dir.y;
        if (ty < 0.3) ty += 0.15;

        const sx = this.sunPosition.x - parent.x;
        const sy = this.sunPosition.y - parent.y;
        const sz = this.sunPosition.z - parent.z;
        const dist = Math.sqrt(sx * sx + sy * sy + sz * sz);
        if (dist > 1) {
            const force = parent.genotype.sunSensitivity * 0.3;
            tx += (sx / dist) * force;
            ty += (sy / dist) * force;
            tz += (sz / dist) * force;
        }

        const len = Math.sqrt(tx * tx + ty * ty + tz * tz);
        if (len > 0) { tx /= len; ty /= len; tz /= len; }

        const weighted = candidates.map(cand => {
            const dx = cand.x - parent.x;
            const dy = cand.y - parent.y;
            const dz = cand.z - parent.z;
            const dLen = Math.sqrt(dx * dx + dy * dy + dz * dz);
            let w = ((dx / dLen) * tx) + ((dy / dLen) * ty) + ((dz / dLen) * tz);
            w += Math.random() * 0.3;
            return { ...cand, weight: w };
        });

        weighted.sort((a, b) => b.weight! - a.weight!);
        const winner = weighted[0];

        if (Math.random() < parent.genotype.leafDensity) {
            this.spawnLeaf3D(parent);
        }

        const branchInterval = state.level === 0 ? 12 : 8;
        const shouldBranch = state.level < 2 && (state.length % branchInterval === 0) && state.length > 5;

        parent.isTip = false;
        this.activeTips.delete(state.idx);

        this.spawnStem(winner.idx, winner.x, winner.y, winner.z, parent, {
            ...state,
            dir: { x: tx, y: ty, z: tz },
            length: state.length + 1
        });

        if (shouldBranch) {
            const bx = (Math.random() - 0.5) * 2;
            const by = 0.5;
            const bz = (Math.random() - 0.5) * 2;

            const branchCands = candidates.filter(c => c.idx !== winner.idx);
            if (branchCands.length > 0) {
                const bStart = branchCands[Math.floor(Math.random() * branchCands.length)];
                this.spawnStem(bStart.idx, bStart.x, bStart.y, bStart.z, parent, {
                    dir: { x: bx, y: by, z: bz },
                    level: state.level + 1,
                    length: 0,
                    maxLength: 15 + Math.random() * 15
                });
            }
        }
    }

    private spawnStem(idx: number, x: number, y: number, z: number, parent: GridCell, newState: Omit<TipState, 'idx'>) {
        if (this.grid.has(idx)) return;
        this.createCell(idx, x, y, z, CellType.STEM, parent.plantId, parent.dnaHash, parent.genotype);
        const cell = this.grid.get(idx)!;
        cell.isTip = true;
        this.activeTips.set(idx, { ...newState, idx });
    }

    private spawnLeaf3D(parent: GridCell) {
        const size = parent.genotype.leafSize;
        const range = 2;
        for (let i = 0; i < size * 3; i++) {
            const dx = Math.floor((Math.random() - 0.5) * range * 2);
            const dy = Math.floor((Math.random() - 0.5) * range);
            const dz = Math.floor((Math.random() - 0.5) * range * 2);
            if (dx === 0 && dy === 0 && dz === 0) continue;

            const nx = parent.x + dx;
            const ny = parent.y + dy;
            const nz = parent.z + dz;
            const idx = this.getIndex(nx, ny, nz);
            if (idx !== -1 && !this.grid.has(idx)) {
                this.createCell(idx, nx, ny, nz, CellType.LEAF, parent.plantId, parent.dnaHash, parent.genotype);
            }
        }
    }

    private spawnOrganicFlower(cell: GridCell, idx: number) {
        if (cell.plantId && this.plantRegistry.get(cell.plantId)?.phase !== 'GROWING') return;

        this.updateCellCount(cell.type, -1); // Remove old type
        cell.type = CellType.FLOWER;
        this.updateCellCount(CellType.FLOWER, 1); // Add Flower

        cell.isTip = false;
        this.activeTips.delete(idx);

        const rangeX = Math.floor(2 + Math.random() * 4);
        const rangeY = Math.floor(2 + Math.random() * 4);
        const rangeZ = Math.floor(2 + Math.random() * 4);
        const targetVolume = Math.floor((rangeX * rangeY * rangeZ) * 0.4);

        const openSet: { x: number, y: number, z: number }[] = [{ x: cell.x, y: cell.y, z: cell.z }];
        const placedSet = new Set<string>();
        placedSet.add(`${cell.x},${cell.y},${cell.z}`);

        let count = 0;
        let safety = 0;
        while (count < targetVolume && openSet.length > 0 && safety < 500) {
            safety++;
            const originIdx = Math.floor(Math.random() * openSet.length);
            const origin = openSet[originIdx];
            const dirs = [{ x: 1, y: 0, z: 0 }, { x: -1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, { x: 0, y: -1, z: 0 }, { x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: -1 }];
            const d = dirs[Math.floor(Math.random() * dirs.length)];
            const nx = origin.x + d.x;
            const ny = origin.y + d.y;
            const nz = origin.z + d.z;

            if (Math.abs(nx - cell.x) > rangeX) continue;
            if (Math.abs(ny - cell.y) > rangeY) continue;
            if (Math.abs(nz - cell.z) > rangeZ) continue;

            const key = `${nx},${ny},${nz}`;
            if (placedSet.has(key)) continue;

            const nIdx = this.getIndex(nx, ny, nz);
            if (nIdx !== -1 && !this.grid.has(nIdx)) {
                this.createCell(nIdx, nx, ny, nz, CellType.FLOWER, cell.plantId, cell.dnaHash, cell.genotype);
                placedSet.add(key);
                openSet.push({ x: nx, y: ny, z: nz });
                count++;
            }
        }
    }

    private getNeighbors3D(cx: number, cy: number, cz: number): NeighborInfo[] {
        const res: NeighborInfo[] = [];
        for (let z = -1; z <= 1; z++) {
            for (let y = -1; y <= 1; y++) {
                for (let x = -1; x <= 1; x++) {
                    if (x === 0 && y === 0 && z === 0) continue;
                    const nx = cx + x;
                    const ny = cy + y;
                    const nz = cz + z;
                    const idx = this.getIndex(nx, ny, nz);
                    if (idx !== -1) {
                        res.push({ x: nx, y: ny, z: nz, idx });
                    }
                }
            }
        }
        return res;
    }
    // --- PERSISTENCE & FAST FORWARD ---

    public async loadFromDatabase(records: PlantRecord[], cells: any[], globalLastTickTime?: number | null) {
        if (records.length === 0) return;

        console.log(`[Garden] Loading ${records.length} plants and ${cells.length} cells...`);

        const originalGrowthRate = this.config.growthRate;
        this.config.growthRate = 0; // Pause simulation during load

        // 1. Initialize Plants (Registry)
        let maxId = 0;
        let minTime = Date.now();
        let inferredLastSavedTime: number | null = null;

        for (const record of records) {
            // Use forcedId to keep sync with DB
            const idx = this.getIndex(record.x, 0, record.z);
            if (idx !== -1) {
                const isAsh = record.status === 'ash';
                if (!isAsh) {
                    const genotype = this.parseDNA(record.dna);
                    this.registerPlant(record.id, genotype, record.dna);
                    this.uniqueSpeciesSet.add(record.dna);
                    maxId = Math.max(maxId, record.id);
                } else {
                    // If it's ash, we still need to place it on the grid
                    this.spawnAshOnly(record, record.created_at);
                }
            }
            // Track the latest creation time among loaded plants
            const recordTime = new Date(record.created_at).getTime();
            if (inferredLastSavedTime === null || recordTime > inferredLastSavedTime) {
                inferredLastSavedTime = recordTime;
            }
            if (recordTime < minTime) minTime = recordTime;
        }

        const lastSavedTime = globalLastTickTime !== undefined && globalLastTickTime !== null
            ? globalLastTickTime
            : inferredLastSavedTime;

        this.globalLastTickTime = lastSavedTime;

        this.plantCounter = maxId;
        this.realPlantCount = records.length;

        this.playbackTime = Date.now() + 5000;

        // 2. Hydrate Grid from Cells
        for (const cellData of cells) {
            const idx = this.getIndex(cellData.x, cellData.y, cellData.z);
            if (idx !== -1) {
                // FIXED: Map legacy type 0 (Empty) to 1 (Stem) if present
                let type = cellData.type;
                if (type === 0) type = 1; // 1 = CellType.STEM

                const plantState = this.plantRegistry.get(cellData.plant_id);
                if (plantState) {
                    // Create cell directly without trigger logic
                    // Use 'created_at' from DB as birthTime
                    this.createCellDirect(idx, cellData.x, cellData.y, cellData.z, type, cellData.plant_id, plantState.dna, plantState.genotype, cellData.created_at);
                } else {
                    // Handle ash cells or cells for plants not in registry (e.g., legacy ash)
                    const dna = records.find(r => r.id === cellData.plant_id)?.dna || '0x000000000000'; // Fallback DNA
                    const genotype = this.parseDNA(dna);
                    this.createCellDirect(idx, cellData.x, cellData.y, cellData.z, type, cellData.plant_id, dna, genotype, cellData.created_at);
                }
            }
        }

        // 3. Reconstruct active tips for growing plants
        for (const [plantId, state] of this.plantRegistry) {
            if (state.phase === 'GROWING') {
                this.reconstructTipsForGrowth(plantId);
            }
        }

        // 4. Catch Up Time (with sun simulation and batch DB save)
        const now = Date.now();
        if (lastSavedTime !== null && now > lastSavedTime) {
            const msPassed = now - lastSavedTime;
            console.log(`[Garden] Simulating ${msPassed}ms of missed time...`);

            // Save and restore sun position after catch-up
            const savedSun = { ...this.sunPosition };
            this.simulationTime = lastSavedTime;
            this.isCatchingUp = true;
            this.config.growthRate = 1.0; // Enable seeding during catch-up

            const exactMsAdvanced = this.catchUpTime(msPassed);

            this.isCatchingUp = false;
            this.simulationTime = null;
            this.sunPosition = savedSun;

            // Flush buffered plants and cells to DB
            await this.flushPendingToDatabase();

            // Save exactly advanced global time back to DB (preserving fractional unused time)
            if (exactMsAdvanced > 0) {
                this.globalLastTickTime = lastSavedTime + exactMsAdvanced;
                const newGlobalTime = new Date(this.globalLastTickTime).toISOString();
                const { error } = await supabase.from('garden_state').upsert({ id: 1, last_tick_time: newGlobalTime });
                if (error) console.error('[Garden] Failed to update global time:', error.message);
            }
        }

        this.config.growthRate = originalGrowthRate;
        console.log(`[Garden] Database load complete.`);
    }

    private createCellDirect(index: number, x: number, y: number, z: number, type: CellType, plantId: number | null, dna: string, genotype: Genotype, birthTime?: string) {
        // If overwriting, decrement old type
        if (this.grid.has(index)) {
            this.updateCellCount(this.grid.get(index)!.type, -1);
        }

        const cell: GridCell = {
            type,
            x, y, z,
            plantId,
            dnaHash: dna,
            genotype,
            age: 0, // Age will be calculated during simulation
            maxAge: MAX_AGE_STEM,
            energy: 0, // Energy will be calculated during simulation
            isTip: false,
            birthTime: birthTime || new Date(this.timeNow).toISOString() // Use provided birthTime or current sim time
        };

        this.grid.set(index, cell);
        this.updateCellCount(type, 1);

        // Update Registry
        if (plantId !== null && this.plantRegistry.has(plantId)) {
            this.plantRegistry.get(plantId)!.indices.push(index);
        }
    }

    private reconstructTipsForGrowth(plantId: number) {
        const plantState = this.plantRegistry.get(plantId);
        if (!plantState || plantState.phase !== 'GROWING') return;

        // Clear any existing tips for this plant (e.g., from initial root creation)
        for (const [key, tip] of this.activeTips) {
            const cell = this.grid.get(tip.idx);
            if (cell && cell.plantId === plantId) {
                this.activeTips.delete(key);
            }
        }

        // Find potential tips: STEM cells that have no STEM/FLOWER/LEAF neighbor directly above them
        const plantCells = plantState.indices
            .map(idx => this.grid.get(idx))
            .filter((cell): cell is GridCell => cell !== undefined && cell.type === CellType.STEM);

        const potentialTips: GridCell[] = [];
        for (const cell of plantCells) {
            const neighborAboveIdx = this.getIndex(cell.x, cell.y + 1, cell.z);
            const neighborAbove = this.grid.get(neighborAboveIdx);

            if (!neighborAbove || (neighborAbove.plantId !== plantId || (neighborAbove.type !== CellType.STEM && neighborAbove.type !== CellType.FLOWER && neighborAbove.type !== CellType.LEAF))) {
                potentialTips.push(cell);
            }
        }

        // For simplicity, let's just reactivate the highest stem cells as tips
        // Or, if there are no stems, the root (if it's a stem)
        if (potentialTips.length > 0) {
            // Sort by Y-coordinate to prioritize higher tips
            potentialTips.sort((a, b) => b.y - a.y);

            // Reactivate a few highest tips, or all if the plant is small
            const numTipsToReactivate = Math.min(potentialTips.length, 5); // Reactivate up to 5 tips

            for (let i = 0; i < numTipsToReactivate; i++) {
                const tipCell = potentialTips[i];
                const tipIdx = this.getIndex(tipCell.x, tipCell.y, tipCell.z);

                // Ensure it's not already an active tip
                if (!this.activeTips.has(tipIdx)) {
                    tipCell.isTip = true;
                    tipCell.energy = ENERGY_TO_GROW * 2; // Give it some energy to start growing

                    // Estimate direction based on its position relative to the root or just default upwards
                    const rootCell = this.grid.get(plantState.indices[0]);
                    let dir = { x: 0, y: 1, z: 0 };
                    if (rootCell && tipCell.y > rootCell.y) {
                        dir = {
                            x: (tipCell.x - rootCell.x) / (tipCell.y - rootCell.y + 1),
                            y: 1,
                            z: (tipCell.z - rootCell.z) / (tipCell.y - rootCell.y + 1)
                        };
                        const len = Math.sqrt(dir.x * dir.x + dir.y * dir.y + dir.z * dir.z);
                        if (len > 0) { dir.x /= len; dir.y /= len; dir.z /= len; }
                    }

                    this.activeTips.set(tipIdx, {
                        idx: tipIdx,
                        dir: dir,
                        level: 0, // This might need more sophisticated logic for actual branch levels
                        length: 0, // This will be recalculated as it grows
                        maxLength: 40 + Math.random() * 50 // New max length
                    });
                }
            }
        } else if (plantState.indices.length > 0) {
            // If no stems found (e.g., only ash or flower), ensure it's not growing
            plantState.phase = 'MATURE'; // Or 'CRYSTALLIZING' if it's old
        }
    }

    private catchUpTime(ms: number): number {
        const radsPerMs = (Math.PI * 2) / 86400000;
        const msPerUpdate = 2.0 / radsPerMs;
        const updates = Math.floor(ms / msPerUpdate);

        if (updates > 0) {
            this.performTick(updates, msPerUpdate);
            return updates * msPerUpdate;
        }
        return 0;
    }

    // Batch-save all plants and cells buffered during catch-up
    private async flushPendingToDatabase() {
        // Save plants first (FK dependency)
        if (this.pendingPlants.length > 0 && this.onPlantBorn) {
            for (const p of this.pendingPlants) {
                await this.onPlantBorn(p.id, p.dna, p.x, p.z);
            }
            console.log(`[Garden] Flushed ${this.pendingPlants.length} plants to DB.`);
            this.pendingPlants = [];
        }

        // Batch-insert cells
        if (this.pendingCells.length > 0) {
            const { error } = await supabase.from('plant_cells').insert(this.pendingCells);
            if (error) {
                console.error('[Garden] Batch cell insert failed:', error.message);
            } else {
                console.log(`[Garden] Flushed ${this.pendingCells.length} cells to DB.`);
            }
            this.pendingCells = [];
        }
    }

    private spawnAshOnly(record: { dna: string, x: number, z: number }, birthTime?: string) {
        const idx = this.getIndex(record.x, 0, record.z);
        if (idx !== -1 && !this.grid.has(idx)) {
            const genotype = this.parseDNA(record.dna);
            this.createCell(idx, record.x, 0, record.z, CellType.ASH, null, record.dna, genotype, birthTime);
        }
    }


    public getStats() {
        return {
            totalPlantsBorn: this.realPlantCount,
            activePlants: this.plantRegistry.size,
            uniqueSpecies: this.uniqueSpeciesSet.size,
            sunPosition: 0,
            virtualDays: 0,
            cells: { ...this.cellCounts }
        };
    }
}