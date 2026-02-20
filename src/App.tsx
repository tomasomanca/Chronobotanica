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
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const mediaRecorderRef = React.useRef<MediaRecorder | null>(null);
  const chunksRef = React.useRef<Blob[]>([]);


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
        />
      </div>

      {/* Astronomical Control Panel (Top-Left) */}
      <div className="absolute top-5 left-8 z-20 flex flex-col gap-4 pointer-events-none font-teletext">

        {/* Circular Sun Gauge */}
        {/* Adjusted left margin to align circle stroke with text below. Circle center=96, Radius=60. Left point=36. Container left-8=32. Need to shift left by ~36px */}
        <div className="relative w-48 h-48" style={{ marginLeft: '-36px' }}>
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

      {/* DESKTOP ACTIONS (Hidden on Mobile) */}
      <div className="hidden md:flex absolute top-8 right-8 z-50 flex-col gap-3 items-end pointer-events-auto font-teletext">
        <button
          onClick={() => {
            setTimeScale(86400); // 1 Day = 1 Second
            setIsMobileMenuOpen(false);
          }}
          className={`w-48 text-center border border-white px-6 py-2 text-[10px] uppercase tracking-widest transition-colors duration-300 rounded-none ${timeScale === 86400
            ? 'bg-white text-black'
            : 'bg-black text-white hover:bg-white hover:text-black'}`}
        >
          Time Travel
        </button>

        <button
          onClick={() => {
            setTimeScale(1.0);
            window.location.reload();
          }}
          className="w-48 text-center border border-white px-6 py-2 text-[10px] uppercase tracking-widest transition-colors duration-300 rounded-none bg-black text-white hover:bg-white hover:text-black"
        >
          Back to Present
        </button>

        <button
          disabled={true}
          onClick={async () => {
            const { error } = await import('./supabaseClient').then(m => m.supabase.from('plants').delete().neq('id', 0));
            if (error) console.error("Wipe failed", error);
            else window.location.reload();
          }}
          className="w-48 text-center border border-fuchsia-400/30 px-6 py-2 text-[10px] uppercase tracking-widest rounded-none bg-fuchsia-900/20 text-fuchsia-200/30 cursor-not-allowed mt-4"
        >
          End of the World
        </button>
      </div>

      {/* DESKTOP BOTTOM ACTIONS (Hidden on Mobile) */}
      <div className="hidden md:block pointer-events-auto z-50">
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
            setIsMobileMenuOpen(false);
          }}
          className={`absolute bottom-20 right-8 z-50 w-48 pointer-events-auto text-center border border-white px-6 py-2 text-[10px] uppercase tracking-widest transition-colors duration-300 font-teletext rounded-none ${isRecording ? 'bg-white text-black' : 'bg-black text-white hover:bg-white hover:text-black'}`}
        >
          {isRecording ? "Stop Recording" : "Record a few moments"}
        </button>

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
            setIsMobileMenuOpen(false);
          }}
          className="absolute bottom-8 right-8 z-50 w-48 pointer-events-auto text-center bg-black text-white border border-white px-6 py-2 text-[10px] uppercase tracking-widest hover:bg-white hover:text-black transition-colors duration-300 font-teletext rounded-none"
        >
          Capture a moment
        </button>
      </div>

      {/* MOBILE ACTIONS TRIGGER (Visible on Mobile) */}
      <button
        onClick={() => setIsMobileMenuOpen(true)}
        className="md:hidden absolute top-8 right-8 z-30 border-none text-[10px] uppercase tracking-widest text-white transition-colors pointer-events-auto font-teletext bg-transparent p-0"
      >
        Actions
      </button>

      {/* MOBILE MENU OVERLAY */}
      {isMobileMenuOpen && (
        <div className="absolute inset-0 z-50 bg-black/95 backdrop-blur-sm flex flex-col items-start justify-center gap-6 font-teletext pl-12 pointer-events-auto">
          {/* BACK TO GARDEN (Close) */}
          <button
            onClick={() => setIsMobileMenuOpen(false)}
            className="absolute top-8 right-8 border-none text-[10px] uppercase tracking-widest text-white transition-colors pointer-events-auto"
          >
            ← Back to Garden
          </button>

          <div className="flex flex-col gap-4 items-start w-full pointer-events-auto">
            {/* INLINE MOBILE MENU ACTIONS */}
            <button
              onClick={() => {
                setTimeScale(86400);
                setIsMobileMenuOpen(false);
              }}
              className={`w-48 text-center border border-white px-6 py-2 text-[10px] uppercase tracking-widest transition-colors duration-300 rounded-none ${timeScale === 86400
                ? 'bg-white text-black'
                : 'bg-black text-white hover:bg-white hover:text-black'}`}
            >
              Time Travel
            </button>

            <button
              onClick={() => {
                setTimeScale(1.0);
                window.location.reload();
              }}
              className="w-48 text-center border border-white px-6 py-2 text-[10px] uppercase tracking-widest transition-colors duration-300 rounded-none bg-black text-white hover:bg-white hover:text-black"
            >
              Back to Present
            </button>

            <button
              disabled={true}
              onClick={async () => {
                const { error } = await import('./supabaseClient').then(m => m.supabase.from('plants').delete().neq('id', 0));
                if (error) console.error("Wipe failed", error);
                else window.location.reload();
              }}
              className="w-48 text-center border border-fuchsia-400/30 px-6 py-2 text-[10px] uppercase tracking-widest rounded-none bg-fuchsia-900/20 text-fuchsia-200/30 cursor-not-allowed mt-4"
            >
              End of the World
            </button>

            <button
              onClick={() => {
                if (isRecording) {
                  if (mediaRecorderRef.current?.state !== 'inactive') {
                    mediaRecorderRef.current?.stop();
                    setIsRecording(false);
                  }
                } else {
                  // Recording logic...
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
                setIsMobileMenuOpen(false);
              }}
              className={`w-48 relative pointer-events-auto text-center border border-white px-6 py-2 text-[10px] uppercase tracking-widest transition-colors duration-300 font-teletext rounded-none ${isRecording ? 'bg-white text-black' : 'bg-black text-white hover:bg-white hover:text-black'}`}
            >
              {isRecording ? "Stop Recording" : "Record a few moments"}
            </button>

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
                setIsMobileMenuOpen(false);
              }}
              className="w-48 relative pointer-events-auto text-center bg-black text-white border border-white px-6 py-2 text-[10px] uppercase tracking-widest hover:bg-white hover:text-black transition-colors duration-300 font-teletext rounded-none"
            >
              Capture a moment
            </button>
          </div>
        </div>
      )}

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
            BORN <span className="text-white ml-5">
              {hoverInfo.birthTime ? (() => {
                const b = new Date(hoverInfo.birthTime);
                if (isNaN(b.getTime())) return '---';
                const d = `${b.getDate().toString().padStart(2, '0')}.${(b.getMonth() + 1).toString().padStart(2, '0')}.${b.getFullYear().toString().slice(-2)}`;
                const t = `${b.getHours().toString().padStart(2, '0')}:${b.getMinutes().toString().padStart(2, '0')}:${b.getSeconds().toString().padStart(2, '0')}`;
                return `${d} · ${t}`;
              })() : '---'}
            </span>
          </div>
        </div>
      )}

    </div>
  );
};

export default App;