import React, { useEffect, useRef, useCallback } from 'react';
import { Garden } from '../classes/Garden';
import { Visualizer } from '../classes/Visualizer';
import { GRID_WIDTH, GRID_HEIGHT, GRID_DEPTH } from '../constants';
import { GridCell, GardenStats, PlantRecord } from '../types';
import { supabase } from '../supabaseClient';

interface DigitalGardenProps {
  timeScale: number;
  onHover: (info: GridCell | null, x: number, y: number) => void;
  onSunUpdate: (percent: number) => void;
  onDebugStats?: (stats: GardenStats) => void;
}

const DigitalGarden: React.FC<DigitalGardenProps> = ({ timeScale, onHover, onSunUpdate, onDebugStats }) => {
  // ... (refs state same)
  const containerRef = useRef<HTMLDivElement>(null);
  const gardenRef = useRef<Garden | null>(null);
  const visualizerRef = useRef<Visualizer | null>(null);
  const reqIdRef = useRef<number>(0);
  const frameRef = useRef<number>(0);
  const sunTimerRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const gardenAccumulatorRef = useRef<number>(0);

  useEffect(() => {
    // ... (initialization same)
    const now = new Date();
    const secondsSinceMidnight = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
    const dayProgress = secondsSinceMidnight / 86400;

    const initialPhase = (dayProgress * Math.PI * 2) + (Math.PI / 2);
    sunTimerRef.current = initialPhase;

    if (!containerRef.current) return;

    const garden = new Garden({
      width: GRID_WIDTH,
      height: GRID_HEIGHT,
      depth: GRID_DEPTH,
      sunPosition: { x: 50, y: 110, z: 50 },
      growthRate: 1.0
    });
    gardenRef.current = garden;

    const visualizer = new Visualizer(containerRef.current);
    visualizerRef.current = visualizer;

    // ... (rest of useEffect same)

    // --- SUPABASE LOAD ---
    const loadPlants = async () => {
      const { data, error } = await supabase
        .from('plants')
        .select('*')
        .order('created_at', { ascending: true }); // Get oldest first!

      if (error) {
        console.error('Error loading plants:', error);
        garden.seed(1);
      } else if (data && data.length > 0) {
        const records = data as unknown as PlantRecord[];
        await garden.fastForward(records);

        // CALCULATE MISSED BIRTHS
        const lastPlant = records[records.length - 1];
        const lastTime = new Date(lastPlant.created_at).getTime();
        const now = Date.now();
        const timeDiff = now - lastTime;

        if (timeDiff > 0) {
          garden.simulateMissedBirths(timeDiff);
        }
      } else {
        garden.seed(1);
      }
    };

    garden.onPlantBorn = (dna, x, z) => {
      supabase.from('plants').insert({
        dna,
        x,
        z
      }).then(({ error }) => {
        if (error) console.error("Failed to save seed:", error);
      });
    };

    loadPlants();
    // ---------------------

    const handleResize = () => {
      if (containerRef.current && visualizerRef.current) {
        visualizerRef.current.resize(containerRef.current.clientWidth, containerRef.current.clientHeight);
      }
    };
    window.addEventListener('resize', handleResize);
    setTimeout(handleResize, 100);

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(reqIdRef.current);
      visualizerRef.current?.renderer.dispose();
      if (containerRef.current) containerRef.current.innerHTML = '';
    };
  }, []);

  useEffect(() => {
    if (gardenRef.current) {
      gardenRef.current.config.growthRate = timeScale;
    }
  }, [timeScale]);

  const loop = useCallback((time: number) => {
    // ... (loop logic same)
    if (lastTimeRef.current === 0) {
      lastTimeRef.current = time;
    }
    const delta = time - lastTimeRef.current;
    lastTimeRef.current = time;

    frameRef.current++;

    const radPerMs = (Math.PI * 2) / 86400000;
    const sunDelta = radPerMs * delta * timeScale;
    sunTimerRef.current += sunDelta;

    const cycle = sunTimerRef.current % (Math.PI * 2);
    onSunUpdate(cycle / (Math.PI * 2));

    const sunY = -130 * Math.sin(sunTimerRef.current);
    const sunX = 50 + 130 * Math.cos(sunTimerRef.current);
    const sunZ = 50;
    const intensity = Math.max(0, (sunY / 130) * 1800.0);

    if (gardenRef.current && visualizerRef.current) {
      gardenRef.current.sunPosition = { x: sunX, y: sunY, z: sunZ };
      visualizerRef.current.updateSunPosition(sunX, sunY, sunZ, intensity);

      gardenAccumulatorRef.current += sunDelta;
      const RADS_PER_UPDATE = 2.0;

      while (gardenAccumulatorRef.current >= RADS_PER_UPDATE) {
        gardenRef.current.update();
        gardenAccumulatorRef.current -= RADS_PER_UPDATE;
      }

      visualizerRef.current.update(gardenRef.current);
    }

    if (onDebugStats && frameRef.current % 10 === 0) {
      const stats = gardenRef.current.getStats();
      const degrees = Math.round((cycle / (Math.PI * 2)) * 360) % 360;
      stats.sunPosition = degrees;
      stats.virtualDays = Math.floor(sunTimerRef.current / (Math.PI * 2));
      onDebugStats(stats);
    }

    reqIdRef.current = requestAnimationFrame(loop);
  }, [timeScale, onSunUpdate]);

  useEffect(() => {
    reqIdRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(reqIdRef.current);
  }, [loop]);

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!visualizerRef.current || !gardenRef.current) return;
    const key = visualizerRef.current.getPlantAt(e.clientX, e.clientY, gardenRef.current);

    if (key !== null) {
      const cell = gardenRef.current.grid.get(key) || null;
      onHover(cell, e.clientX, e.clientY);
    } else {
      onHover(null, e.clientX, e.clientY);
    }
  };

  return (
    <div
      ref={containerRef}
      className="w-full h-full cursor-auto"
      onMouseMove={handleMouseMove}
    />
  );
};

export default DigitalGarden;