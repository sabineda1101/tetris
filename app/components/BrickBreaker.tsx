"use client";

import React, { useEffect, useRef, useState } from "react";
import confetti from "canvas-confetti";

interface Brick {
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  visible: boolean;
}

interface RankingEntry {
  name: string;
  time: string;
  timestamp: number;
}

interface BrickBreakerProps {
  userName: string;
  onGameOver: (success: boolean, time?: string) => void;
  onRestart: () => void;
  onExit: () => void;
}

const COLORS = [
  "#ff9999", // light red (target)
  "#ffcc99", // light orange
  "#ffff99", // light yellow
  "#99ccff", // light blue
  "#99ff99", // light green
  "#cc99ff", // light purple
];

export default function BrickBreaker({ userName, onGameOver, onRestart, onExit }: BrickBreakerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [lives, setLives] = useState(3);
  const [score, setScore] = useState(0);
  const [countdown, setCountdown] = useState<number | null>(3);
  const [gameState, setGameState] = useState<"countdown" | "playing" | "paused" | "gameOver">("countdown");
  const [redBricksHit, setRedBricksHit] = useState(0);
  const [time, setTime] = useState(0); // in seconds
  const [rankings, setRankings] = useState<RankingEntry[]>([]);

  // Game constants
  const CANVAS_WIDTH = 800;
  const CANVAS_HEIGHT = 600;
  const PADDLE_WIDTH = 120;
  const PADDLE_HEIGHT = 15;
  const BALL_RADIUS = 8;
  const BRICK_ROWS = 5;
  const BRICK_COLS = 8;
  const BRICK_PADDING = 10;
  const BRICK_OFFSET_TOP = 80;
  const BRICK_OFFSET_LEFT = 35;

  // Refs for game state (mutable for performance)
  const paddleX = useRef(0);
  const ball = useRef({ x: 0, y: 0, dx: 4, dy: -4 });
  const bricks = useRef<Brick[]>([]);
  const rightPressed = useRef(false);
  const leftPressed = useRef(false);
  const startTime = useRef<number | null>(null);
  const pauseTimeOffset = useRef(0);

  // Sound generator
  const playHitSound = () => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(440, audioCtx.currentTime);
      gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.1);
      oscillator.start();
      oscillator.stop(audioCtx.currentTime + 0.1);
    } catch (e) {
      console.error("Audio error", e);
    }
  };

  // Google Sheets integration
  const fetchRankings = async () => {
    const url = process.env.NEXT_PUBLIC_GAS_URL;
    if (!url) return;
    try {
      const res = await fetch(url);
      const data = await res.json();
      if (Array.isArray(data)) {
        setRankings(data.slice(0, 3).map(r => ({
          name: r.name,
          time: r.finishtime, // Map finishtime to local time state
          timestamp: r.timestamp
        })));
      }
    } catch (e) {
      console.error("Failed to fetch rankings", e);
    }
  };

  const saveScore = async (finalTime: string) => {
    const url = process.env.NEXT_PUBLIC_GAS_URL;
    if (!url) return;
    try {
      await fetch(url, {
        method: "POST",
        mode: "no-cors", // Required for GAS
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: userName, time: finalTime }),
      });
    } catch (e) {
      console.error("Failed to save score", e);
    }
  };

  useEffect(() => {
    fetchRankings();

    // Initialize bricks with 30% light red
    const newBricks: Brick[] = [];
    const brickWidth = 80;
    const brickHeight = 25;

    for (let r = 0; r < BRICK_ROWS; r++) {
      for (let c = 0; c < BRICK_COLS; c++) {
        // 30% chance for red brick
        const isRed = Math.random() < 0.3;
        const color = isRed ? "#ff9999" : COLORS[Math.floor(Math.random() * (COLORS.length - 1)) + 1];

        newBricks.push({
          x: c * (brickWidth + BRICK_PADDING) + BRICK_OFFSET_LEFT,
          y: r * (brickHeight + BRICK_PADDING) + BRICK_OFFSET_TOP,
          width: brickWidth,
          height: brickHeight,
          color: color,
          visible: true,
        });
      }
    }
    bricks.current = newBricks;

    // Ensure at least 3 red bricks for win condition
    const redCount = newBricks.filter(b => b.color === "#ff9999").length;
    if (redCount < 3) {
      for (let i = 0; i < 3 - redCount; i++) {
        const target = newBricks.find(b => b.color !== "#ff9999");
        if (target) target.color = "#ff9999";
      }
    }

    paddleX.current = (CANVAS_WIDTH - PADDLE_WIDTH) / 2;
    ball.current = {
      x: CANVAS_WIDTH / 2,
      y: CANVAS_HEIGHT - 30,
      dx: (Math.random() - 0.5) * 6,
      dy: -4,
    };

    const keyDownHandler = (e: KeyboardEvent) => {
      if (e.key === "Right" || e.key === "ArrowRight") rightPressed.current = true;
      else if (e.key === "Left" || e.key === "ArrowLeft") leftPressed.current = true;
    };
    const keyUpHandler = (e: KeyboardEvent) => {
      if (e.key === "Right" || e.key === "ArrowRight") rightPressed.current = false;
      else if (e.key === "Left" || e.key === "ArrowLeft") leftPressed.current = false;
    };

    window.addEventListener("keydown", keyDownHandler);
    window.addEventListener("keyup", keyUpHandler);

    return () => {
      window.removeEventListener("keydown", keyDownHandler);
      window.removeEventListener("keyup", keyUpHandler);
    };
  }, []);

  // Timer logic
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (gameState === "playing") {
      interval = setInterval(() => setTime((t) => t + 1), 1000);
    }
    return () => clearInterval(interval);
  }, [gameState]);

  // Audio handling
  useEffect(() => {
    if (gameState === "playing") {
      if (!audioRef.current) {
        const audio = new Audio("/Hyper_Speed_Run.mp3");
        audio.loop = true;
        audio.volume = 0.2;
        audio.play().catch(() => { });
        audioRef.current = audio;
      } else {
        audioRef.current.play().catch(() => { });
      }
    } else if (gameState !== "playing" && audioRef.current) {
      audioRef.current.pause();
    }
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, [gameState]);

  // Countdown
  useEffect(() => {
    if (countdown !== null && countdown > 0) {
      setTimeout(() => setCountdown(countdown - 1), 1000);
    } else if (countdown === 0) {
      setGameState("playing");
      setCountdown(null);
    }
  }, [countdown]);

  // Handle Game Over transition
  useEffect(() => {
    if (gameState === "gameOver") {
      const isSuccess = redBricksHit >= 3;
      const finalTime = formatTime(time);
      
      if (isSuccess) {
        confetti({
          particleCount: 150,
          spread: 70,
          origin: { y: 0.6 }
        });
        saveScore(finalTime);
        setTimeout(() => onGameOver(true, finalTime), 0);
      } else {
        setTimeout(() => onGameOver(false), 0);
      }
    }
  }, [gameState]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Main Loop
  useEffect(() => {
    if (gameState !== "playing") return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationFrameId: number;

    const draw = () => {
      ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      // Bricks
      bricks.current.forEach((brick) => {
        if (brick.visible) {
          ctx.beginPath();
          ctx.roundRect(brick.x, brick.y, brick.width, brick.height, 4);
          ctx.fillStyle = brick.color;
          ctx.fill();
          ctx.strokeStyle = "rgba(255,255,255,0.3)";
          ctx.stroke();
          ctx.closePath();
        }
      });

      // Paddle
      ctx.beginPath();
      ctx.roundRect(paddleX.current, CANVAS_HEIGHT - PADDLE_HEIGHT - 10, PADDLE_WIDTH, PADDLE_HEIGHT, 8);
      ctx.fillStyle = "#00d4ff";
      ctx.fill();
      ctx.closePath();

      // Ball
      ctx.beginPath();
      ctx.arc(ball.current.x, ball.current.y, BALL_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = "#fff";
      ctx.fill();
      ctx.closePath();

      // Collision detection
      for (let i = 0; i < bricks.current.length; i++) {
        const brick = bricks.current[i];
        if (brick.visible) {
          if (
            ball.current.x + BALL_RADIUS > brick.x &&
            ball.current.x - BALL_RADIUS < brick.x + brick.width &&
            ball.current.y + BALL_RADIUS > brick.y &&
            ball.current.y - BALL_RADIUS < brick.y + brick.height
          ) {
            // Determine which side was hit
            const prevX = ball.current.x - ball.current.dx;
            const prevY = ball.current.y - ball.current.dy;

            if (prevX + BALL_RADIUS <= brick.x || prevX - BALL_RADIUS >= brick.x + brick.width) {
              ball.current.dx = -ball.current.dx;
            } else {
              ball.current.dy = -ball.current.dy;
            }

            brick.visible = false;
            playHitSound();

            if (brick.color === "#ff9999") {
              setRedBricksHit((prev) => {
                const next = prev + 1;
                if (next >= 3) {
                  setGameState("gameOver");
                }
                return next;
              });
            }
            setScore((s) => s + 10);
            break; // Only hit one brick per frame
          }
        }
      }

      // Walls
      if (ball.current.x + ball.current.dx > CANVAS_WIDTH - BALL_RADIUS || ball.current.x + ball.current.dx < BALL_RADIUS) {
        ball.current.dx = -ball.current.dx;
      }
      if (ball.current.y + ball.current.dy < BALL_RADIUS) {
        ball.current.dy = -ball.current.dy;
      } else if (ball.current.y + ball.current.dy > CANVAS_HEIGHT - BALL_RADIUS - 10) {
        if (ball.current.x > paddleX.current && ball.current.x < paddleX.current + PADDLE_WIDTH) {
          const hitPos = (ball.current.x - (paddleX.current + PADDLE_WIDTH / 2)) / (PADDLE_WIDTH / 2);
          ball.current.dx = hitPos * 5;
          ball.current.dy = -ball.current.dy;
        } else {
          setLives((l) => {
            const next = l - 1;
            if (next === 0) {
              setGameState("gameOver");
            } else {
              ball.current = {
                x: CANVAS_WIDTH / 2,
                y: CANVAS_HEIGHT - 30,
                dx: (Math.random() - 0.5) * 6,
                dy: -4,
              };
              paddleX.current = (CANVAS_WIDTH - PADDLE_WIDTH) / 2;
            }
            return next;
          });
        }
      }

      if (rightPressed.current && paddleX.current < CANVAS_WIDTH - PADDLE_WIDTH) paddleX.current += 8;
      else if (leftPressed.current && paddleX.current > 0) paddleX.current -= 8;

      ball.current.x += ball.current.dx;
      ball.current.y += ball.current.dy;

      animationFrameId = requestAnimationFrame(draw);
    };

    animationFrameId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animationFrameId);
  }, [gameState, time, onGameOver]);

  const togglePause = () => {
    setGameState(prev => prev === "playing" ? "paused" : "playing");
  };

  return (
    <div className="container" style={{ position: "relative" }}>
      <div className="hud">
        <div style={{ display: 'flex', gap: '20px' }}>
          <div>PLAYER: {userName}</div>
          <div>TIME: {formatTime(time)}</div>
          <div>RED BRICKS: {redBricksHit}/3</div>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button className="button-sm" onClick={togglePause}>
            {gameState === "paused" ? "RESUME" : "PAUSE"}
          </button>
          <button className="button-sm" onClick={onRestart}>RESTART</button>
          <button className="button-sm" onClick={onExit}>EXIT</button>
        </div>
      </div>

      {rankings.length > 0 && (
        <div className="ranking-overlay glass">
          <p style={{ fontSize: '0.8rem', fontWeight: 800, marginBottom: '5px' }}>TOP 3 RANKING</p>
          {rankings.map((r, i) => (
            <div key={i} style={{ fontSize: '0.7rem' }}>
              {i + 1}. {r.name} - {r.time}
            </div>
          ))}
        </div>
      )}

      {countdown !== null && <div className="countdown">{countdown}</div>}
      {gameState === "paused" && <div className="countdown">PAUSED</div>}

      <div className="canvas-wrapper">
        <canvas
          ref={canvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          className="game-canvas"
          onMouseMove={(e) => {
            if (gameState === "playing" && canvasRef.current) {
              const rect = canvasRef.current.getBoundingClientRect();
              const scaleX = CANVAS_WIDTH / rect.width;
              const x = (e.clientX - rect.left) * scaleX - PADDLE_WIDTH / 2;
              paddleX.current = Math.max(0, Math.min(CANVAS_WIDTH - PADDLE_WIDTH, x));
            }
          }}
          onTouchMove={(e) => {
            if (gameState === "playing" && canvasRef.current) {
              const rect = canvasRef.current.getBoundingClientRect();
              const scaleX = CANVAS_WIDTH / rect.width;
              const x = (e.touches[0].clientX - rect.left) * scaleX - PADDLE_WIDTH / 2;
              paddleX.current = Math.max(0, Math.min(CANVAS_WIDTH - PADDLE_WIDTH, x));
              e.preventDefault();
            }
          }}
        />
      </div>

      <div className="lives-display">
        {"❤️".repeat(lives)}
      </div>

      <style jsx>{`
        .button-sm {
          padding: 6px 12px;
          font-size: 0.7rem;
          background: rgba(255, 255, 255, 0.1);
          border: 1px solid rgba(255, 255, 255, 0.2);
          color: white;
          border-radius: 6px;
          cursor: pointer;
          font-weight: 600;
        }
        .button-sm:hover { background: rgba(255, 255, 255, 0.2); }
        .ranking-overlay {
          position: absolute;
          left: 20px;
          top: 100px;
          padding: 15px;
          z-index: 5;
        }
        .canvas-wrapper {
          width: 100%;
          max-width: 800px;
          aspect-ratio: 4/3;
        }
        .game-canvas {
          width: 100%;
          height: auto;
          touch-action: none;
        }
        .lives-display {
          margin-top: 10px;
          font-size: 1.5rem;
        }
      `}</style>
    </div>
  );
}
