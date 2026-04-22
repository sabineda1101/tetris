'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';

// --- Constants ---
const COLS = 10;
const ROWS = 20;
const BLOCK_SIZE = 30;
const CANVAS_WIDTH = COLS * BLOCK_SIZE; // 300
const CANVAS_HEIGHT = ROWS * BLOCK_SIZE; // 600

const TETROMINOES = {
  I: { shape: [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]], color: '#00F0F0' }, // Cyan
  O: { shape: [[0, 1, 1, 0], [0, 1, 1, 0], [0, 0, 0, 0], [0, 0, 0, 0]], color: '#F0F000' }, // Yellow
  T: { shape: [[0, 1, 0, 0], [1, 1, 1, 0], [0, 0, 0, 0], [0, 0, 0, 0]], color: '#A000F0' }, // Purple
  S: { shape: [[0, 1, 1, 0], [1, 1, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]], color: '#00F000' }, // Green
  Z: { shape: [[1, 1, 0, 0], [0, 1, 1, 0], [0, 0, 0, 0], [0, 0, 0, 0]], color: '#F00000' }, // Red
  J: { shape: [[1, 0, 0, 0], [1, 1, 1, 0], [0, 0, 0, 0], [0, 0, 0, 0]], color: '#0000F0' }, // Blue
  L: { shape: [[0, 0, 1, 0], [1, 1, 1, 0], [0, 0, 0, 0], [0, 0, 0, 0]], color: '#F0A000' }, // Orange
};

type Piece = {
  pos: { x: number; y: number };
  shape: number[][];
  color: string;
};

export default function TetrisGame() {
  const [gameState, setGameState] = useState<'START' | 'PLAYING' | 'PAUSED' | 'FINISHED'>('START');
  const [userName, setUserName] = useState('');
  const [userDept, setUserDept] = useState('');
  const [timer, setTimer] = useState(0);
  const [linesCleared, setLinesCleared] = useState(0);
  
  // Ranking State
  const [rankings, setRankings] = useState<{ name: string; time: number }[]>([]);
  const [loadingRank, setLoadingRank] = useState(false);
  const GAS_URL = process.env.NEXT_PUBLIC_GAS_URL || 'https://script.google.com/macros/s/AKfycbwV0K2sb4tltJjqnSeMd2APObMnl6SG-x-RjAgQO_i9pEpHTRleMhmbPzJbRrK9BiK7_A/exec';

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>(null);
  const boardRef = useRef<string[][]>(Array.from({ length: ROWS }, () => Array(COLS).fill('')));
  const pieceRef = useRef<Piece | null>(null);
  const lastTimeRef = useRef<number>(0);
  const dropCounterRef = useRef<number>(0);
  const dropInterval = 1000;

  // --- Google Sheets Logic ---
  const handleGameFinish = useCallback(async (finalTime: number) => {
    setGameState('FINISHED');
    setLoadingRank(true);
    
    try {
      // 1. 점수 저장 (Score Save)
      await fetch(GAS_URL, {
        method: 'POST',
        mode: 'no-cors',
        body: JSON.stringify({ name: userName, time: finalTime })
      });

      // 2. 상위 3명 불러오기 (Fetch Top 3)
      const response = await fetch(`${GAS_URL}?type=getTop3`);
      const data = await response.json();
      setRankings(data);
    } catch (error) {
      console.error('Ranking failed:', error);
      // Fallback: Dummy Ranking if fetch fails
      setRankings([
        { name: '이순신', time: 15 },
        { name: '세종대왕', time: 28 },
        { name: '홍길동', time: finalTime }
      ].sort((a,b) => a.time - b.time).slice(0, 3));
    } finally {
      setLoadingRank(false);
    }
  }, [userName, GAS_URL]);

  // --- Core Logic ---
  const checkCollision = (x: number, y: number, shape: number[][]) => {
    for (let r = 0; r < shape.length; r++) {
      for (let c = 0; c < shape[r].length; c++) {
        if (shape[r][c]) {
          const newX = x + c;
          const newY = y + r;
          if (
            newX < 0 || 
            newX >= COLS || 
            newY >= ROWS || 
            (newY >= 0 && boardRef.current[newY][newX])
          ) {
            return true;
          }
        }
      }
    }
    return false;
  };

  const spawnPiece = useCallback(() => {
    const keys = Object.keys(TETROMINOES) as (keyof typeof TETROMINOES)[];
    const key = keys[Math.floor(Math.random() * keys.length)];
    const shape = TETROMINOES[key].shape;
    const color = TETROMINOES[key].color;
    
    const pos = { x: Math.floor(COLS / 2) - 2, y: -1 };
    
    if (checkCollision(pos.x, pos.y, shape)) {
      setGameState('FINISHED');
      return;
    }

    pieceRef.current = { pos, shape, color };
  }, []);

  const rotate = (matrix: number[][]) => {
    const result = matrix.map((_, i) => matrix.map(row => row[i]).reverse());
    return result;
  };

  const clearLines = useCallback(() => {
    const newBoard = boardRef.current.filter(row => !row.every(cell => cell !== ''));
    const lines = ROWS - newBoard.length;
    while (newBoard.length < ROWS) {
      newBoard.unshift(Array(COLS).fill(''));
    }
    boardRef.current = newBoard;
    
    if (lines > 0) {
      setLinesCleared(prev => {
        const next = prev + lines;
        if (next >= 3) {
          // 목표 라인 달성 시 종료 (Get timer ref value safely)
          // Since we are inside a setter, we use a trick or just use the current timer state indirectly if possible.
          // Better: set finished state and use final time.
          return 3;
        }
        return next;
      });
    }
  }, []);

  // Monitor linesCleared to trigger end game
  useEffect(() => {
    if (linesCleared >= 3 && gameState === 'PLAYING') {
      handleGameFinish(timer);
    }
  }, [linesCleared, gameState, timer, handleGameFinish]);

  const lockPiece = useCallback(() => {
    if (!pieceRef.current) return;
    const { pos, shape, color } = pieceRef.current;
    shape.forEach((row, r) => {
      row.forEach((value, c) => {
        if (value) {
          const x = pos.x + c;
          const y = pos.y + r;
          if (y >= 0 && y < ROWS && x >= 0 && x < COLS) {
            boardRef.current[y][x] = color;
          }
        }
      });
    });
    clearLines();
    spawnPiece();
  }, [clearLines, spawnPiece]);

  // --- Rendering ---
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Grid dots
    ctx.fillStyle = '#1a1a1a';
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        ctx.fillRect(x * BLOCK_SIZE + 14, y * BLOCK_SIZE + 14, 2, 2);
      }
    }

    const drawBlock = (x: number, y: number, color: string) => {
      if (y < 0) return;
      ctx.fillStyle = color;
      ctx.shadowBlur = 20;
      ctx.shadowColor = color;
      
      const x_p = x * BLOCK_SIZE + 2;
      const y_p = y * BLOCK_SIZE + 2;
      const size = BLOCK_SIZE - 4;
      
      if (ctx.roundRect) {
        ctx.beginPath();
        ctx.roundRect(x_p, y_p, size, size, 6);
        ctx.fill();
        ctx.shadowBlur = 0;
      } else {
        ctx.fillRect(x_p, y_p, size, size);
        ctx.shadowBlur = 0;
      }

      ctx.fillStyle = 'rgba(255,255,255,0.2)';
      ctx.fillRect(x_p + 4, y_p + 4, size / 3, size / 3);
    };

    boardRef.current.forEach((row, y) => {
      row.forEach((color, x) => {
        if (color) drawBlock(x, y, color);
      });
    });

    if (pieceRef.current) {
      const { pos, shape, color } = pieceRef.current;
      shape.forEach((row, r) => {
        row.forEach((value, c) => {
          if (value) drawBlock(pos.x + c, pos.y + r, color);
        });
      });
    }
  }, []);

  const move = useCallback((dir: number) => {
    if (!pieceRef.current || gameState !== 'PLAYING') return false;
    const { pos, shape } = pieceRef.current;
    if (!checkCollision(pos.x + dir, pos.y, shape)) {
      pieceRef.current.pos.x += dir;
      draw();
      return true;
    }
    return false;
  }, [gameState, draw]);

  const drop = useCallback(() => {
    if (!pieceRef.current || gameState !== 'PLAYING') return;
    const { pos, shape } = pieceRef.current;
    if (!checkCollision(pos.x, pos.y + 1, shape)) {
      pieceRef.current.pos.y += 1;
    } else {
      lockPiece();
    }
    dropCounterRef.current = 0;
    draw();
  }, [gameState, lockPiece, draw]);

  const hardDrop = useCallback(() => {
    if (!pieceRef.current || gameState !== 'PLAYING') return;
    const { pos, shape } = pieceRef.current;
    let newY = pos.y;
    while (!checkCollision(pos.x, newY + 1, shape)) {
      newY += 1;
    }
    pieceRef.current.pos.y = newY;
    lockPiece();
    draw();
  }, [gameState, lockPiece, draw]);

  const handleRotate = useCallback(() => {
    if (!pieceRef.current || gameState !== 'PLAYING') return;
    const { pos, shape } = pieceRef.current;
    const rotated = rotate(shape);
    
    // Wall kick attempts
    const offsets = [0, -1, 1, -2, 2];
    for (const offset of offsets) {
      if (!checkCollision(pos.x + offset, pos.y, rotated)) {
        pieceRef.current.pos.x += offset;
        pieceRef.current.shape = rotated;
        draw();
        return;
      }
    }
  }, [gameState, draw]);

  const update = useCallback((time = 0) => {
    if (gameState !== 'PLAYING') return;
    const deltaTime = time - lastTimeRef.current;
    lastTimeRef.current = time;

    dropCounterRef.current += deltaTime;
    if (dropCounterRef.current > dropInterval) {
      drop();
    }
    draw();
    requestRef.current = requestAnimationFrame(update);
  }, [gameState, drop, draw]);

  useEffect(() => {
    if (gameState === 'PLAYING') {
      const timerInt = setInterval(() => {
        setTimer(t => t + 1);
      }, 1000);
      requestRef.current = requestAnimationFrame(update);
      lastTimeRef.current = performance.now();
      return () => {
        clearInterval(timerInt);
        if (requestRef.current) cancelAnimationFrame(requestRef.current);
      };
    }
  }, [gameState, update]);

  useEffect(() => {
    if (gameState === 'PLAYING' && !pieceRef.current) {
      spawnPiece();
      draw();
    }
  }, [gameState, spawnPiece, draw]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (gameState !== 'PLAYING') return;
      
      switch (e.key) {
        case 'ArrowLeft':
        case 'Left': 
          e.preventDefault();
          move(-1); 
          break;
        case 'ArrowRight':
        case 'Right':
          e.preventDefault();
          move(1); 
          break;
        case 'ArrowDown':
        case 'Down':
          e.preventDefault();
          drop(); 
          break;
        case 'ArrowUp':
        case 'Up':
          e.preventDefault();
          handleRotate(); 
          break;
        case ' ': 
          e.preventDefault(); 
          hardDrop(); 
          break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [gameState, move, drop, handleRotate, hardDrop]);

  const startGame = () => {
    if (!userName.trim() || !userDept.trim()) {
      alert('학과와 이름을 모두 입력해주세요!');
      return;
    }
    boardRef.current = Array.from({ length: ROWS }, () => Array(COLS).fill(''));
    pieceRef.current = null;
    dropCounterRef.current = 0;
    setLinesCleared(0);
    setTimer(0);
    setGameState('PLAYING');
  };

  const restartGame = () => {
    setGameState('START');
    setUserName('');
    setUserDept('');
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen bg-[#050505] text-white flex flex-col items-center justify-center font-sans p-4">
      
      <div className="fixed top-0 left-0 w-full h-full pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-900/20 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-900/20 rounded-full blur-[120px]" />
      </div>

      <div className="relative z-10 w-full max-w-[950px] aspect-[1.5/1] bg-[#0f0f0f] border border-white/5 rounded-[40px] shadow-2xl overflow-hidden flex flex-col items-center justify-center">
        
        {/* --- START SCREEN --- */}
        {gameState === 'START' && (
          <div className="w-full h-full flex flex-col items-center justify-center p-12 text-center">
            <h1 className="text-7xl font-[900] italic mb-16 tracking-tighter text-[#22d3ee] uppercase skew-x-[-10deg]">
              TETRIS NEO
            </h1>
            
            <div className="w-full max-w-md space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-3 text-left">
                  <label className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-bold ml-1">Department</label>
                  <input 
                    type="text" 
                    value={userDept}
                    onChange={(e) => setUserDept(e.target.value)}
                    placeholder="학과 입력"
                    className="w-full bg-[#080808] border border-white/5 rounded-2xl px-6 py-4 text-lg focus:outline-none focus:border-blue-500/50 transition-all placeholder:text-zinc-700 text-center"
                  />
                </div>
                <div className="space-y-3 text-left">
                  <label className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-bold ml-1">Player Name</label>
                  <input 
                    type="text" 
                    value={userName}
                    onChange={(e) => setUserName(e.target.value)}
                    placeholder="이름 입력"
                    className="w-full bg-[#080808] border border-white/5 rounded-2xl px-6 py-4 text-lg focus:outline-none focus:border-blue-500/50 transition-all placeholder:text-zinc-700 text-center"
                  />
                </div>
              </div>
              <button 
                onClick={startGame}
                className="w-full bg-[#1d4ed8] hover:bg-blue-600 text-white font-black py-5 rounded-2xl text-2xl shadow-[0_0_40px_rgba(29,78,216,0.3)] active:scale-[0.98] transition-all uppercase tracking-tight"
              >
                GAME START
              </button>
            </div>

            <div className="mt-16 pt-8 border-t border-white/5 w-full max-w-sm text-zinc-500">
              <p className="text-[10px] uppercase tracking-[0.3em] font-bold mb-2 opacity-50">Course Information</p>
              <div className="flex flex-col gap-1">
                <p className="text-lg font-bold text-zinc-300">{userDept || '학과 미입력'} | 게임프로그래밍</p>
                <p className="text-xl font-black text-blue-400">{userName || '이름 미입력'}</p>
              </div>
            </div>
          </div>
        )}

        {/* --- GAME SCREEN --- */}
        {(gameState === 'PLAYING' || gameState === 'PAUSED') && (
          <div className="w-full h-full flex p-10 gap-10 items-center justify-center">
            <div className="relative p-2 bg-white/5 rounded-2xl border border-white/10 shadow-[0_0_50px_rgba(0,0,0,0.5)]">
              <canvas 
                ref={canvasRef}
                width={CANVAS_WIDTH}
                height={CANVAS_HEIGHT}
                className="bg-black/95 rounded-lg border-2 border-blue-500/30 shadow-[0_0_20px_rgba(59,130,246,0.2)] block"
              />
              {gameState === 'PAUSED' && (
                <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center rounded-lg">
                  <h2 className="text-4xl font-black tracking-widest animate-pulse italic">PAUSED</h2>
                </div>
              )}
            </div>

            <div className="flex-1 max-w-[400px] flex flex-col gap-6">
              <div className="bg-[#0c0c0c] rounded-[24px] p-8 border border-white/5">
                <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 mb-4 font-bold">Player</p>
                <p className="text-3xl font-black text-blue-500 flex items-center gap-3">
                  <span className="w-2 h-2 bg-blue-500 rounded-sm" /> 
                  {userName}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div className="bg-[#0c0c0c] rounded-[24px] p-8 border border-white/5 relative overflow-hidden">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 mb-2 font-bold">Time</p>
                  <p className="text-5xl font-black font-mono tracking-tighter">{formatTime(timer)}</p>
                </div>
                <div className="bg-[#0c0c0c] rounded-[24px] p-8 border border-white/5">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 mb-2 font-bold">Lines</p>
                  <p className="text-5xl font-black font-mono tracking-tighter">
                    <span className="text-[#fbbf24]">{linesCleared}</span> <span className="opacity-20">/</span> <span className="opacity-40">3</span>
                  </p>
                </div>
              </div>

              <div className="mt-6 space-y-4">
                <button 
                  onClick={() => setGameState(gameState === 'PLAYING' ? 'PAUSED' : 'PLAYING')}
                  className="w-full bg-white/5 hover:bg-white/10 py-5 rounded-2xl font-black transition-all flex items-center justify-center gap-3 border border-white/5"
                >
                  {gameState === 'PLAYING' ? (
                    <><div className="w-4 h-4 bg-white rounded-sm" /> PAUSE</>
                  ) : (
                    <><div className="w-0 h-0 border-t-8 border-t-transparent border-l-[12px] border-l-white border-b-8 border-b-transparent" /> RESUME</>
                  )}
                </button>
                <div className="grid grid-cols-2 gap-4">
                  <button onClick={startGame} className="bg-[#1a1a1a] hover:bg-zinc-800 py-5 rounded-2xl font-black transition-all border border-white/5">RESET</button>
                  <button onClick={() => setGameState('START')} className="bg-red-950/20 hover:bg-red-900/30 text-red-500 py-5 rounded-2xl font-black border border-red-500/10 transition-all uppercase tracking-widest text-sm text-center">QUIT</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* --- FINISHED SCREEN --- */}
        {gameState === 'FINISHED' && (
          <div className="w-full h-full flex flex-col items-center justify-center p-12 text-center">
            <div className="w-full max-w-[800px] flex gap-12 items-start justify-center">
              
              <div className="flex-1 animate-in">
                <div className="w-24 h-24 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-8 shadow-[0_0_50px_rgba(34,197,94,0.3)]">
                  <svg className="w-12 h-12 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={4}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h2 className="text-5xl font-black italic tracking-tighter mb-4 text-[#22d3ee] uppercase skew-x-[-10deg]">MISSION COMPLETE</h2>
                
                <div className="bg-[#0c0c0c] rounded-[32px] p-8 border border-white/5 w-full mb-8">
                  <div className="flex justify-between items-center mb-6 border-b border-white/5 pb-6">
                    <span className="text-zinc-600 uppercase tracking-[0.2em] text-[10px] font-bold">Player</span>
                    <span className="text-2xl font-black text-blue-500">{userName}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-zinc-600 uppercase tracking-[0.2em] text-[10px] font-bold">Clear Time</span>
                    <span className="text-5xl font-black font-mono tracking-tighter">{formatTime(timer)}</span>
                  </div>
                </div>

                <button 
                  onClick={restartGame}
                  className="w-full bg-white text-black hover:bg-zinc-200 font-black py-6 rounded-2xl text-2xl transition-all active:scale-[0.98] uppercase italic"
                >
                  PLAY AGAIN
                </button>
              </div>

              {/* Ranking Panel */}
              <div className="w-[320px] bg-[#0c0c0c] border border-white/5 rounded-[32px] overflow-hidden flex flex-col animate-in">
                <div className="bg-white/5 p-6 border-b border-white/5 text-center">
                  <h3 className="text-[12px] font-black uppercase tracking-[0.3em] text-[#fbbf24]">Top 3 Ranking</h3>
                </div>
                <div className="p-6 space-y-4">
                  {loadingRank ? (
                    <div className="py-20 flex flex-col items-center justify-center gap-4">
                      <div className="w-8 h-8 border-4 border-yellow-500/20 border-t-yellow-500 rounded-full animate-spin" />
                      <p className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest">Loading Rank...</p>
                    </div>
                  ) : (
                    rankings.map((rank, idx) => (
                      <div key={idx} className={`flex items-center justify-between p-4 rounded-2xl border ${idx === 0 ? 'bg-yellow-500/10 border-yellow-500/20' : 'bg-black/40 border-white/5'}`}>
                        <div className="flex items-center gap-4">
                          <span className={`text-xl font-black ${idx === 0 ? 'text-yellow-500' : idx === 1 ? 'text-zinc-400' : 'text-zinc-600'}`}>{idx + 1}</span>
                          <span className="font-bold text-zinc-300">{rank.name}</span>
                        </div>
                        <span className="font-mono font-bold text-zinc-400">{formatTime(rank.time)}</span>
                      </div>
                    ))
                  )}
                  {!loadingRank && rankings.length === 0 && (
                    <p className="text-center py-10 text-zinc-600 text-xs uppercase font-bold tracking-widest">No records found</p>
                  )}
                </div>
              </div>

            </div>
          </div>
        )}
      </div>

      {/* Footer Controls */}
      <div className="mt-12 flex gap-10 items-center justify-center">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-[#1a1a1a] rounded-lg border border-white/10 flex items-center justify-center text-white">↑</div>
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">Rotate</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="px-3 h-10 bg-[#1a1a1a] rounded-lg border border-white/10 flex items-center justify-center gap-2 text-white">← →</div>
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">Move</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-[#1a1a1a] rounded-lg border border-white/10 flex items-center justify-center text-white">↓</div>
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">Soft Drop</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="px-4 h-10 bg-[#1a1a1a] rounded-lg border border-white/10 flex items-center justify-center text-white font-black text-[10px]">SPACE</div>
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">Hard Drop</span>
        </div>
      </div>

      <style jsx global>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        .animate-pulse {
          animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        }
        .animate-in {
          animation: animate-in 0.5s ease-out;
        }
        @keyframes animate-in {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
