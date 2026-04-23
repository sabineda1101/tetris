"use client";

import React, { useState } from "react";

interface LobbyProps {
  onStart: (name: string) => void;
}

export default function Lobby({ onStart }: LobbyProps) {
  const [name, setName] = useState("");

  return (
    <div className="container">
      <h1 className="title">INU 벽돌깨기</h1>
      
      <div className="mascot-container">
        <img src="/mascot.jpg" alt="INU Mascot 횃불이" className="mascot-image" />
      </div>

      <div className="glass" style={{ padding: '40px', display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', maxWidth: '450px' }}>
        <input
          type="text"
          className="input"
          placeholder="사용자 이름을 입력하세요"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button 
          className="button" 
          onClick={() => name.trim() && onStart(name)}
          disabled={!name.trim()}
        >
          게임 시작
        </button>

        <div className="creator-info">
          <p>수학과</p>
          <p>202600261</p>
          <p>정사빈</p>
          <p style={{ marginTop: '10px', fontSize: '0.75rem', opacity: 0.5 }}>
            * 배경음악: Hyper_Speed_Run.mp3
          </p>
        </div>
      </div>
    </div>
  );
}
