import React, { useState, useEffect } from 'react';
import DigitalGarden from './components/DigitalGarden';
import { GridCell, CellType, GardenStats } from './types';

const App: React.FC = () => {
  const [timeScale, setTimeScale] = useState(1.0);
  const [hoverInfo, setHoverInfo] = useState<GridCell | null>(null);
  const [cursorPos, setCursorPos] = useState({ x: 0, y: 0 });
  const [sunProgress, setSunProgress] = useState(0); // 0 to 1
  const [stats, setStats] = useState<GardenStats | null>(null);
  const [currentTime, setCurrentTime] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = React.useRef<MediaRecorder | null>(null);
  const chunksRef = React.useRef<Blob[]>([]);

  // Debug state for Raycast
  const [debugHits, setDebugHits] = useState(0);
  const [debugInstanceId, setDebugInstanceId] = useState<number | undefined>(undefined);

  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      const date = `${now.getDate().toString().padStart(2, '0')}.${(now.getMonth() + 1).toString().padStart(2, '0')}.${now.getFullYear().toString().slice(-2)}`;
      const time = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
      setCurrentTime(`${date} · ${time}`);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const handleHover = (cell: GridCell | null, x: number, y: number) => {
    // console.log("App handleHover:", cell?.type, x, y);
    setHoverInfo(cell);
    setCursorPos({ x, y });
  };

  const getCellClass = (cell: GridCell) => {
    if (cell.type === CellType.ASH) return "GENOMA SEED";
    return CellType[cell.type];
  };

  const getCellColorClass = (cell: GridCell) => {
    switch (cell.type) {
      case CellType.STEM: return 'text-green-400';
      case CellType.LEAF: return 'text-emerald-300';
      case CellType.FLOWER: return 'text-fuchsia-400';
      case CellType.CRYSTAL: return 'text-zinc-500';
      case CellType.SUN: return 'text-yellow-300';
      case CellType.ASH: return 'text-white';
      default: return 'text-white';
    }
  };

  return (
    <div className="absolute inset-0 w-full h-full bg-black text-white font-mono overflow-hidden m-0 p-0 cursor-auto">

      {/* 3D Canvas Layer */}
      <div className="absolute inset-0 z-0">
        <DigitalGarden
          timeScale={timeScale}
          onHover={handleHover}
          onSunUpdate={setSunProgress}
          onDebugStats={setStats}
        // onDebugRay={(hits, instanceId, totalInstances) => {
        //   setDebugHits(hits);
        //   setDebugInstanceId(instanceId);
        //   setStats(prev => prev ? ({ ...prev, activePlants: totalInstances || 0 }) : null); // HACK: Update ActivePlants stat for verifying
        // }}
        />
      </div>

      {/* Astronomical Control Panel (Top-Left) */}
      <div className="absolute top-8 left-8 z-20 flex flex-col gap-4 pointer-events-none font-teletext">

        {/* Circular Sun Gauge */}
        <div className="relative w-48 h-48">
          <svg className="w-full h-full overflow-visible">
            {/* Background Ring */}
            <circle
              cx="96"
              cy="96"
              r="60"
              stroke="#27272a"
              strokeWidth="2"
              fill="none"
            />

            {/* Midnight Marker (Bottom) */}
            <text x="96" y="176" textAnchor="middle" fill="#52525b" fontSize="12" className="tracking-widest">MIDNIGHT</text>
            <line x1="96" y1="158" x2="96" y2="162" stroke="#52525b" strokeWidth="2" />

            {/* Noon Marker (Top) */}
            <text x="96" y="24" textAnchor="middle" fill="#52525b" fontSize="12" className="tracking-widest">NOON</text>
            <line x1="96" y1="30" x2="96" y2="34" stroke="#52525b" strokeWidth="2" />

            {/* Sun Cursor */}
            <g transform={`rotate(${sunProgress * 360}, 96, 96)`}>
              <circle cx="156" cy="96" r="5" fill="white" className="drop-shadow-[0_0_8px_rgba(255,255,255,0.8)]" />
            </g>
          </svg>
        </div>
      </div>

      {/* NEW BUTTONS GROUP (Top-Right) */}
      <div className="absolute top-8 right-8 z-30 flex flex-col gap-3 items-end pointer-events-auto font-teletext">

        {/* Time Travel Button */}
        <button
          onClick={() => setTimeScale(86400)} // 1 Day = 1 Second
          className={`w-48 text-center border border-white px-6 py-2 text-[10px] uppercase tracking-widest transition-colors duration-300 rounded-none ${timeScale === 86400
            ? 'bg-white text-black'
            : 'bg-black text-white hover:bg-white hover:text-black'}`}
        >
          Time Travel
        </button>

        {/* Back to Present Button */}
        <button
          onClick={() => {
            setTimeScale(1.0);
            window.location.reload(); // Reload to sync with DB
          }}
          className="w-48 text-center border border-white px-6 py-2 text-[10px] uppercase tracking-widest transition-colors duration-300 rounded-none bg-black text-white hover:bg-white hover:text-black"
        >
          Back to Present
        </button>

        {/* END OF THE WORLD Button */}
        <button
          onClick={async () => {
            // DIRECT EXECUTION - NO CONFIRMATION
            const { error } = await import('./supabaseClient').then(m => m.supabase.from('plants').delete().neq('id', 0));
            if (error) console.error("Wipe failed", error);
            else window.location.reload();
          }}
          className="w-48 text-center border border-fuchsia-400 px-6 py-2 text-[10px] uppercase tracking-widest transition-colors duration-300 rounded-none bg-fuchsia-900/50 text-fuchsia-200 hover:bg-fuchsia-400 hover:text-black mt-4"
        >
          End of the World
        </button>

      </div>

      {/* Capture Button (Bottom-Right) */}
      <button
        onClick={() => {
          const canvas = document.querySelector('canvas');
          if (canvas) {
            const dataURL = canvas.toDataURL('image/png');
            const link = document.createElement('a');
            link.download = `chronobotanica-${Date.now()}.png`;
            link.href = dataURL;
            link.click();
          }
        }}
        className="absolute bottom-8 right-8 z-30 w-48 text-center bg-black text-white border border-white px-6 py-2 text-[10px] uppercase tracking-widest hover:bg-white hover:text-black transition-colors duration-300 font-teletext rounded-none"
      >
        Capture a moment
      </button>

      {/* Record Button (Bottom-Right, stacked above Capture) */}
      <button
        onClick={() => {
          if (isRecording) {
            if (mediaRecorderRef.current?.state !== 'inactive') {
              mediaRecorderRef.current?.stop();
              setIsRecording(false);
            }
          } else {
            const canvas = document.querySelector('canvas');
            if (canvas) {
              const stream = canvas.captureStream(30);
              const recorder = new MediaRecorder(stream, { mimeType: 'video/webm; codecs=vp9' });
              chunksRef.current = [];
              recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
              recorder.onstop = () => {
                const blob = new Blob(chunksRef.current, { type: 'video/webm' });
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.download = `chronobotanica-clip-${Date.now()}.webm`;
                link.href = url;
                link.click();
                URL.revokeObjectURL(url);
              };
              recorder.start();
              mediaRecorderRef.current = recorder;
              setIsRecording(true);
            }
          }
        }}
        className={`absolute bottom-20 right-8 z-30 w-48 text-center border border-white px-6 py-2 text-[10px] uppercase tracking-widest transition-colors duration-300 font-teletext rounded-none ${isRecording ? 'bg-white text-black' : 'bg-black text-white hover:bg-white hover:text-black'}`}
      >
        {isRecording ? "Stop Recording" : "Record a few moments"}
      </button>

      {/* Stats Panel (Bottom-Left) */}
      <div className="absolute bottom-8 left-8 z-20 flex flex-row gap-12 pointer-events-none font-teletext text-zinc-500 text-[10px] tracking-widest leading-loose">

        {/* Column 1: Time & Global Stats */}
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-0.5 text-zinc-400">
            <div>DATE <span className="text-white ml-4">{currentTime.split('·')[0]?.trim()}</span></div>
            <div>TIME <span className="text-white ml-4">{currentTime.split('·')[1]?.trim()}</span></div>
            <div className="mt-2 text-white">VIRTUAL DAYS <span className="text-zinc-300 ml-4">{stats?.virtualDays || 0}</span></div>
          </div>

          <div className="flex flex-col gap-0.5 text-white">
            <div>PLANTS ACTIVE <span className="text-white ml-4">{stats?.activePlants || 0}</span></div>
            <div>TOTAL BORN <span className="text-white ml-4">{stats?.totalPlantsBorn || 0}</span></div>
            <div>UNIQUE SPECIES <span className="text-white ml-4">{stats?.uniqueSpecies || 0}</span></div>
          </div>
        </div>

        {/* Column 2: Cellular Composition */}
        <div className="flex flex-col gap-0.5">
          <div className="text-green-400">STEM CELLS <span className="text-white ml-4">{stats?.cells.stem || 0}</span></div>
          <div className="text-emerald-300">LEAF CELLS <span className="text-white ml-4">{stats?.cells.leaf || 0}</span></div>
          <div className="text-fuchsia-400">FLOWER CELLS <span className="text-white ml-4">{stats?.cells.flower || 0}</span></div>
          <div className="text-zinc-400">CRYSTAL CELLS <span className="text-white ml-4">{stats?.cells.crystal || 0}</span></div>
          <div className="text-zinc-300">GENOMA <span className="text-white ml-4">{stats?.cells.ash || 0}</span></div>
        </div>
      </div>
      {/* Ethereal Floating Tooltip */}
      {hoverInfo && hoverInfo.type !== CellType.EMPTY && (
        <div
          className="fixed z-50 pointer-events-none flex flex-col gap-0.5 font-teletext"
          style={{
            left: cursorPos.x,
            top: cursorPos.y,
            transform: cursorPos.x > window.innerWidth / 2 ? 'translate(-100%, 15px)' : 'translate(25px, 15px)',
            marginLeft: cursorPos.x > window.innerWidth / 2 ? '-20px' : '0px',
            textShadow: '0px 2px 4px black'
          }}
        >
          <div className="text-[10px] tracking-widest text-white uppercase">
            GENOME <span className="text-white ml-2">{hoverInfo.dnaHash}</span>
          </div>
          <div className="text-[10px] tracking-widest text-white uppercase">
            CLASS <span className={`ml-4 ${getCellColorClass(hoverInfo)}`}>{getCellClass(hoverInfo)}</span>
          </div>
          <div className="text-[10px] tracking-widest text-white uppercase">
            BORN <span className="text-white ml-5">{hoverInfo.birthTime}</span>
          </div>
        </div>
      )}

    </div>
  );
};

export default App;