"use client";

import { useState } from "react";
import Lobby from "./components/Lobby";
import BrickBreaker from "./components/BrickBreaker";

export default function Home() {
  const [view, setView] = useState<"lobby" | "game" | "result">("lobby");
  const [userName, setUserName] = useState("");
  const [success, setSuccess] = useState(false);
  const [finalTime, setFinalTime] = useState("");

  const handleStart = (name: string) => {
    setUserName(name);
    setView("game");
  };

  const handleGameOver = (isSuccess: boolean, time?: string) => {
    setSuccess(isSuccess);
    if (time) setFinalTime(time);
    setView("result");
  };

  return (
    <main>
      {view === "lobby" && <Lobby onStart={handleStart} />}
      
      {view === "game" && (
        <BrickBreaker 
          userName={userName} 
          onGameOver={handleGameOver} 
          onRestart={() => setView("lobby")}
          onExit={() => setView("lobby")}
        />
      )}

      {view === "result" && (
        <div className="container">
          <div className="glass" style={{ padding: '60px', textAlign: 'center' }}>
            <h2 className="overlay-title">
              {success ? "MISSION COMPLETE! 🎉" : "게임 미션 실패 ❌"}
            </h2>
            <p style={{ fontSize: '1.2rem', marginBottom: '10px' }}>
              {success 
                ? `${userName}님, 미션을 완료했습니다!` 
                : "미션을 실패했습니다. 다시 도전해보세요!"}
            </p>
            {success && (
              <p style={{ fontSize: '1.5rem', fontWeight: 800, color: '#00d4ff', marginBottom: '30px' }}>
                완료 시간: {finalTime}
              </p>
            )}
            <button className="button" onClick={() => setView("lobby")}>
              메인으로 돌아가기
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
