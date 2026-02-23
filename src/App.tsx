/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Shield, Target, Rocket, Trophy, AlertTriangle, RefreshCw, Info } from 'lucide-react';

// --- Types & Constants ---

type Point = { x: number; y: number };

interface GameObject {
  id: string;
  x: number;
  y: number;
  active: boolean;
}

interface EnemyRocket extends GameObject {
  startX: number;
  startY: number;
  targetX: number;
  targetY: number;
  progress: number;
  speed: number;
}

interface Interceptor extends GameObject {
  startX: number;
  startY: number;
  targetX: number;
  targetY: number;
  progress: number;
  speed: number;
}

interface Explosion extends GameObject {
  radius: number;
  maxRadius: number;
  expanding: boolean;
}

interface City extends GameObject {
  destroyed: boolean;
}

interface Battery extends GameObject {
  ammo: number;
  maxAmmo: number;
  hp: number;
  maxHp: number;
  destroyed: boolean;
  level: number;
}

const GAME_WIDTH = 800;
const GAME_HEIGHT = 600;
const WIN_SCORE = 1000;
const POINTS_PER_KILL = 20;
const TECH_POINTS_PER_KILL = 3;
const UPGRADE_COST = 6;
const SHIELD_BUILD_COST = 4;
const SHIELD_UPGRADE_COST = 10;
const MAX_LEVEL = 8;

const COLORS = {
  bg: '#0a0a0f',
  grid: '#1a1a2e',
  enemy: '#ff4d4d',
  interceptor: '#4dff88',
  explosion: '#ffffff',
  city: '#4da6ff',
  battery: '#ffd700',
  text: '#e0e0e0',
};

// --- Main Component ---

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [gameState, setGameState] = useState<'START' | 'PLAYING' | 'WON' | 'LOST'>('START');
  const [score, setScore] = useState(0);
  const [techPoints, setTechPoints] = useState(0);
  const [difficulty, setDifficulty] = useState<'EASY' | 'NORMAL' | 'HARD'>('NORMAL');
  const [round, setRound] = useState(1);
  const [language, setLanguage] = useState<'zh' | 'en'>('zh');
  const [showWaveClear, setShowWaveClear] = useState(false);
  const [shieldState, setShieldState] = useState({ active: false, level: 1, hp: 0, maxHp: 2 });
  
  // Game Refs for the loop
  const enemiesRef = useRef<EnemyRocket[]>([]);
  const interceptorsRef = useRef<Interceptor[]>([]);
  const explosionsRef = useRef<Explosion[]>([]);
  const citiesRef = useRef<City[]>([]);
  const batteriesRef = useRef<Battery[]>([]);
  const shieldRef = useRef({ active: false, level: 1, hp: 0, maxHp: 2 });
  const lastTimeRef = useRef<number>(0);
  const spawnTimerRef = useRef<number>(0);
  const frameIdRef = useRef<number>(0);
  const enemiesToSpawnRef = useRef<number>(0);
  const enemiesSpawnedRef = useRef<number>(0);

  const t = {
    zh: {
      title: 'WRC 新星防御',
      start: '开始游戏',
      restart: '再玩一次',
      win: '防御成功！',
      loss: '防御失败...',
      score: '得分',
      ammo: '弹药',
      goal: '目标: 1000 分',
      instructions: '点击屏幕发射拦截导弹。预判敌方火箭轨迹，利用爆炸波摧毁它们。',
      gameOver: '所有炮台已被摧毁',
      victory: '你成功保卫了新星城市！',
      wave: '第 {{n}} 波',
      waveClear: '波次完成！',
      bonus: '弹药奖励',
      nextWave: '下一波',
      techPoints: '技术点',
      upgrade: '升级',
      level: '等级',
      difficulty: '难度',
      easy: '简单',
      normal: '普通',
      hard: '困难',
      maxLevel: '满级',
      shield: '城市护盾',
      buildShield: '建造护盾',
      upgradeShield: '升级护盾',
      shieldHp: '护盾强度',
    },
    en: {
      title: 'WRC Nova Defense',
      start: 'Start Game',
      restart: 'Play Again',
      win: 'Mission Success!',
      loss: 'Mission Failed...',
      score: 'Score',
      ammo: 'Ammo',
      goal: 'Goal: 1000 pts',
      instructions: 'Click to fire interceptors. Predict enemy paths and use blast waves to destroy them.',
      gameOver: 'All batteries destroyed',
      victory: 'You successfully defended Nova City!',
      wave: 'Wave {{n}}',
      waveClear: 'Wave Clear!',
      bonus: 'Ammo Bonus',
      nextWave: 'Next Wave',
      techPoints: 'Tech Pts',
      upgrade: 'Upgrade',
      level: 'Lv',
      difficulty: 'Difficulty',
      easy: 'Easy',
      normal: 'Normal',
      hard: 'Hard',
      maxLevel: 'MAX',
      shield: 'City Shield',
      buildShield: 'Build Shield',
      upgradeShield: 'Upgrade Shield',
      shieldHp: 'Shield Integrity',
    }
  }[language];

  // --- Initialization ---

  const startRound = useCallback((roundNum: number) => {
    setRound(roundNum);
    
    const baseEnemies = difficulty === 'EASY' ? 8 : difficulty === 'NORMAL' ? 12 : 16;
    enemiesToSpawnRef.current = baseEnemies + roundNum * 2;
    enemiesSpawnedRef.current = 0;
    spawnTimerRef.current = 0;
    
    // Refill ammo
    batteriesRef.current.forEach(b => {
      if (!b.destroyed) b.ammo = b.maxAmmo;
    });

    setShowWaveClear(false);
    setGameState('PLAYING');
  }, [difficulty]);

  const initGame = useCallback(() => {
    setScore(0);
    setTechPoints(0);
    enemiesRef.current = [];
    interceptorsRef.current = [];
    explosionsRef.current = [];
    
    // Reset Shield
    const initialShield = { active: false, level: 1, hp: 0, maxHp: 2 };
    shieldRef.current = initialShield;
    setShieldState(initialShield);

    // Init Cities
    const cities: City[] = [];
    const cityPositions = [150, 220, 290, 510, 580, 650];
    cityPositions.forEach((x, i) => {
      cities.push({ id: `city-${i}`, x, y: GAME_HEIGHT - 30, active: true, destroyed: false });
    });
    citiesRef.current = cities;

    // Init Batteries
    batteriesRef.current = [
      { id: 'bat-0', x: 50, y: GAME_HEIGHT - 40, active: true, ammo: 20, maxAmmo: 20, hp: 3, maxHp: 3, destroyed: false, level: 1 },
      { id: 'bat-1', x: 400, y: GAME_HEIGHT - 40, active: true, ammo: 40, maxAmmo: 40, hp: 5, maxHp: 5, destroyed: false, level: 1 },
      { id: 'bat-2', x: 750, y: GAME_HEIGHT - 40, active: true, ammo: 20, maxAmmo: 20, hp: 3, maxHp: 3, destroyed: false, level: 1 },
    ];

    startRound(1);
  }, [startRound]);

  // --- Game Logic ---

  const spawnEnemy = useCallback(() => {
    if (enemiesSpawnedRef.current >= enemiesToSpawnRef.current) return;

    const startX = Math.random() * GAME_WIDTH;
    const targets = [...citiesRef.current.filter(c => !c.destroyed), ...batteriesRef.current.filter(b => !b.destroyed)];
    
    if (targets.length === 0) return;
    
    const target = targets[Math.floor(Math.random() * targets.length)];
    
    const diffMultiplier = difficulty === 'EASY' ? 0.6 : difficulty === 'NORMAL' ? 1.0 : 1.4;
    const speed = (0.00015 + (round * 0.00003)) * diffMultiplier; 

    enemiesRef.current.push({
      id: `enemy-${Date.now()}-${Math.random()}`,
      x: startX,
      y: 0,
      startX,
      startY: 0,
      targetX: target.x,
      targetY: target.y,
      progress: 0,
      speed,
      active: true,
    });

    enemiesSpawnedRef.current += 1;
  }, [round]);

  const fireInterceptor = (targetX: number, targetY: number) => {
    if (gameState !== 'PLAYING' || showWaveClear) return;

    // Find best battery (closest with ammo)
    let bestBattery: Battery | null = null;
    let minDist = Infinity;

    batteriesRef.current.forEach(b => {
      if (!b.destroyed && b.ammo > 0) {
        const dist = Math.sqrt(Math.pow(b.x - targetX, 2) + Math.pow(b.y - targetY, 2));
        if (dist < minDist) {
          minDist = dist;
          bestBattery = b;
        }
      }
    });

    if (bestBattery) {
      const battery = bestBattery as Battery;
      battery.ammo -= 1;
      
      // Interceptor speed increases with battery level
      const interceptorSpeed = 0.02 + (battery.level - 1) * 0.002;

      interceptorsRef.current.push({
        id: `int-${Date.now()}-${Math.random()}`,
        x: battery.x,
        y: battery.y,
        startX: battery.x,
        startY: battery.y,
        targetX,
        targetY,
        progress: 0,
        speed: interceptorSpeed,
        active: true,
      });
    }
  };

  const update = (deltaTime: number) => {
    if (gameState !== 'PLAYING' || showWaveClear) return;

    // Spawn enemies
    spawnTimerRef.current += deltaTime;
    const spawnRate = Math.max(400, 1500 - (round * 100));
    if (spawnTimerRef.current > spawnRate && enemiesSpawnedRef.current < enemiesToSpawnRef.current) {
      spawnEnemy();
      spawnTimerRef.current = 0;
    }

    // Update Enemies
    enemiesRef.current.forEach(enemy => {
      enemy.progress += enemy.speed * deltaTime;
      enemy.x = enemy.startX + (enemy.targetX - enemy.startX) * enemy.progress;
      enemy.y = enemy.startY + (enemy.targetY - enemy.startY) * enemy.progress;

      if (enemy.progress >= 1) {
        enemy.active = false;

        let hitShield = false;
        if (shieldRef.current.active && shieldRef.current.hp > 0) {
          shieldRef.current.hp -= 1;
          if (shieldRef.current.hp <= 0) {
            shieldRef.current.active = false;
          }
          setShieldState({ ...shieldRef.current });
          hitShield = true;
        }

        explosionsRef.current.push({
          id: `exp-impact-${enemy.id}`,
          x: enemy.targetX,
          y: enemy.targetY,
          radius: 0,
          maxRadius: 30,
          expanding: true,
          active: true,
        });

        if (!hitShield) {
          const city = citiesRef.current.find(c => Math.abs(c.x - enemy.targetX) < 5 && Math.abs(c.y - enemy.targetY) < 5);
          if (city) city.destroyed = true;
          
          const battery = batteriesRef.current.find(b => Math.abs(b.x - enemy.targetX) < 5 && Math.abs(b.y - enemy.targetY) < 5);
          if (battery && !battery.destroyed) {
            battery.hp -= 1;
            if (battery.hp <= 0) {
              battery.hp = 0;
              battery.destroyed = true;
            }
          }
        }
      }
    });

    // Update Interceptors
    interceptorsRef.current.forEach(int => {
      int.progress += int.speed * (deltaTime / 16);
      int.x = int.startX + (int.targetX - int.startX) * int.progress;
      int.y = int.startY + (int.targetY - int.startY) * int.progress;

      if (int.progress >= 1) {
        int.active = false;
        explosionsRef.current.push({
          id: `exp-${int.id}`,
          x: int.targetX,
          y: int.targetY,
          radius: 0,
          maxRadius: 80, // Increased from 50
          expanding: true,
          active: true,
        });
      }
    });

    // Update Explosions
    explosionsRef.current.forEach(exp => {
      if (exp.expanding) {
        exp.radius += 2 * (deltaTime / 16);
        if (exp.radius >= exp.maxRadius) exp.expanding = false;
      } else {
        exp.radius -= 1 * (deltaTime / 16);
        if (exp.radius <= 0) exp.active = false;
      }

      enemiesRef.current.forEach(enemy => {
        if (enemy.active) {
          const dist = Math.sqrt(Math.pow(enemy.x - exp.x, 2) + Math.pow(enemy.y - exp.y, 2));
          if (dist < exp.radius) {
            enemy.active = false;
            setScore(prev => prev + POINTS_PER_KILL);
            setTechPoints(prev => prev + TECH_POINTS_PER_KILL);
            explosionsRef.current.push({
              id: `exp-chain-${enemy.id}`,
              x: enemy.x,
              y: enemy.y,
              radius: 0,
              maxRadius: 40,
              expanding: true,
              active: true,
            });
          }
        }
      });
    });

    // Cleanup
    enemiesRef.current = enemiesRef.current.filter(e => e.active);
    interceptorsRef.current = interceptorsRef.current.filter(i => i.active);
    explosionsRef.current = explosionsRef.current.filter(e => e.active);

    // Check Win/Loss
    if (score >= WIN_SCORE) {
      setGameState('WON');
      setTechPoints(0);
      return;
    }

    const allBatteriesDestroyed = batteriesRef.current.every(b => b.destroyed);
    if (allBatteriesDestroyed) {
      setGameState('LOST');
      setTechPoints(0);
      return;
    }

    // Check Round End
    if (enemiesSpawnedRef.current >= enemiesToSpawnRef.current && enemiesRef.current.length === 0 && explosionsRef.current.length === 0) {
      // Calculate ammo bonus
      const remainingAmmo = batteriesRef.current.reduce((sum, b) => sum + (b.destroyed ? 0 : b.ammo), 0);
      setScore(prev => prev + remainingAmmo * 5);
      setShowWaveClear(true);
    }
  };

  const draw = useCallback((ctx: HTMLCanvasElement) => {
    const context = ctx.getContext('2d');
    if (!context) return;

    // Clear
    context.fillStyle = COLORS.bg;
    context.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    // Grid
    context.strokeStyle = COLORS.grid;
    context.lineWidth = 1;
    for (let x = 0; x < GAME_WIDTH; x += 40) {
      context.beginPath();
      context.moveTo(x, 0);
      context.lineTo(x, GAME_HEIGHT);
      context.stroke();
    }
    for (let y = 0; y < GAME_HEIGHT; y += 40) {
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(GAME_WIDTH, y);
      context.stroke();
    }

    // Draw Cities
    citiesRef.current.forEach(city => {
      if (!city.destroyed) {
        context.fillStyle = COLORS.city;
        // Draw a small building silhouette
        context.fillRect(city.x - 15, city.y - 10, 8, 20);
        context.fillRect(city.x - 5, city.y - 15, 10, 25);
        context.fillRect(city.x + 7, city.y - 8, 8, 18);
        
        // Windows
        context.fillStyle = '#ffffff55';
        context.fillRect(city.x - 13, city.y - 5, 3, 3);
        context.fillRect(city.x - 2, city.y - 10, 3, 3);
        context.fillRect(city.x - 2, city.y - 2, 3, 3);
        context.fillRect(city.x + 10, city.y - 4, 3, 3);
      } else {
        // Ruined city
        context.fillStyle = '#333';
        context.fillRect(city.x - 15, city.y + 5, 30, 5);
        context.fillRect(city.x - 10, city.y + 2, 5, 8);
      }
    });

    // Draw Shield
    if (shieldRef.current.active && shieldRef.current.hp > 0) {
      // Physical Entity: Glowing semi-transparent barrier
      context.fillStyle = '#4da6ff22';
      context.fillRect(0, GAME_HEIGHT - 75, GAME_WIDTH, 15);
      
      context.strokeStyle = '#4da6ff';
      context.lineWidth = 2;
      context.strokeRect(0, GAME_HEIGHT - 75, GAME_WIDTH, 15);
      
      // Energy pattern
      context.beginPath();
      context.strokeStyle = '#4da6ff44';
      context.lineWidth = 1;
      for (let i = 0; i < GAME_WIDTH; i += 20) {
        context.moveTo(i, GAME_HEIGHT - 75);
        context.lineTo(i + 10, GAME_HEIGHT - 60);
      }
      context.stroke();
      
      // Glow effect
      context.shadowBlur = 10;
      context.shadowColor = '#4da6ff';
      context.strokeRect(0, GAME_HEIGHT - 75, GAME_WIDTH, 15);
      context.shadowBlur = 0;
    }

    // Draw Batteries
    batteriesRef.current.forEach(bat => {
      if (!bat.destroyed) {
        // Base
        context.fillStyle = '#444';
        context.beginPath();
        context.arc(bat.x, bat.y + 10, 20, Math.PI, 0);
        context.fill();

        // Turret
        context.fillStyle = COLORS.battery;
        context.beginPath();
        context.arc(bat.x, bat.y, 12, 0, Math.PI * 2);
        context.fill();
        
        // Barrel (pointing upwards slightly towards center)
        context.save();
        context.translate(bat.x, bat.y);
        const angle = bat.x < 400 ? -Math.PI/4 : bat.x > 400 ? Math.PI/4 : 0;
        context.rotate(angle);
        context.fillRect(-4, -25, 8, 20);
        context.restore();
        
        // Ammo bar
        const ammoWidth = (bat.ammo / bat.maxAmmo) * 40;
        context.fillStyle = '#ffffff22';
        context.fillRect(bat.x - 20, bat.y + 15, 40, 4);
        context.fillStyle = COLORS.battery;
        context.fillRect(bat.x - 20, bat.y + 15, ammoWidth, 4);
      }
    });

    // Draw Enemies
    context.lineWidth = 1;
    enemiesRef.current.forEach(enemy => {
      context.strokeStyle = 'rgba(255, 77, 77, 0.3)';
      context.beginPath();
      context.moveTo(enemy.startX, enemy.startY);
      context.lineTo(enemy.x, enemy.y);
      context.stroke();
      
      // Rocket Body
      context.save();
      context.translate(enemy.x, enemy.y);
      const angle = Math.atan2(enemy.targetY - enemy.startY, enemy.targetX - enemy.startX);
      context.rotate(angle + Math.PI/2);
      
      // Flame
      context.fillStyle = '#ffaa00';
      context.beginPath();
      context.moveTo(-3, 5);
      context.lineTo(0, 15 + Math.random() * 5);
      context.lineTo(3, 5);
      context.fill();

      // Body
      context.fillStyle = COLORS.enemy;
      context.beginPath();
      context.moveTo(0, -10);
      context.lineTo(4, 5);
      context.lineTo(-4, 5);
      context.closePath();
      context.fill();
      
      context.restore();
    });

    // Draw Interceptors
    context.lineWidth = 1;
    interceptorsRef.current.forEach(int => {
      context.strokeStyle = 'rgba(77, 255, 136, 0.3)';
      context.beginPath();
      context.moveTo(int.startX, int.startY);
      context.lineTo(int.x, int.y);
      context.stroke();

      // Interceptor Head
      context.fillStyle = COLORS.interceptor;
      context.beginPath();
      context.arc(int.x, int.y, 3, 0, Math.PI * 2);
      context.fill();

      // Target X - Double size
      context.strokeStyle = COLORS.interceptor;
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(int.targetX - 15, int.targetY - 15);
      context.lineTo(int.targetX + 15, int.targetY + 15);
      context.moveTo(int.targetX + 15, int.targetY - 15);
      context.lineTo(int.targetX - 15, int.targetY + 15);
      context.stroke();
    });

    // Draw Explosions
    explosionsRef.current.forEach(exp => {
      const gradient = context.createRadialGradient(exp.x, exp.y, 0, exp.x, exp.y, exp.radius);
      gradient.addColorStop(0, '#ffffff');
      gradient.addColorStop(0.5, '#ffff00');
      gradient.addColorStop(1, 'transparent');
      
      context.fillStyle = gradient;
      context.beginPath();
      context.arc(exp.x, exp.y, exp.radius, 0, Math.PI * 2);
      context.fill();
    });

  }, []);

  const updateRef = useRef<typeof update>(update);
  updateRef.current = update;

  const gameLoop = useCallback((time: number) => {
    if (lastTimeRef.current !== 0) {
      const deltaTime = time - lastTimeRef.current;
      updateRef.current(deltaTime);
      if (canvasRef.current) draw(canvasRef.current);
    }
    lastTimeRef.current = time;
    frameIdRef.current = requestAnimationFrame(gameLoop);
  }, [draw]);

  useEffect(() => {
    frameIdRef.current = requestAnimationFrame(gameLoop);
    return () => cancelAnimationFrame(frameIdRef.current);
  }, [gameLoop]);

  // --- Handlers ---

  const handleCanvasClick = (e: React.MouseEvent | React.TouchEvent) => {
    if (gameState !== 'PLAYING') return;
    
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    let clientX, clientY;

    if ('touches' in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = (e as React.MouseEvent).clientX;
      clientY = (e as React.MouseEvent).clientY;
    }

    const x = (clientX - rect.left) * (GAME_WIDTH / rect.width);
    const y = (clientY - rect.top) * (GAME_HEIGHT / rect.height);

    // Don't fire too low
    if (y < GAME_HEIGHT - 100) {
      fireInterceptor(x, y);
    }
  };

  const upgradeBattery = (index: number) => {
    const battery = batteriesRef.current[index];
    if (battery && !battery.destroyed && battery.level < MAX_LEVEL && techPoints >= UPGRADE_COST) {
      setTechPoints(prev => prev - UPGRADE_COST);
      battery.level += 1;
      battery.maxAmmo += 5;
      battery.ammo = battery.maxAmmo;
      battery.maxHp += 1;
      battery.hp = battery.maxHp; // Refill HP on upgrade
    }
  };

  const handleShieldAction = () => {
    if (!shieldRef.current.active || shieldRef.current.hp <= 0) {
      // Build
      if (techPoints >= SHIELD_BUILD_COST) {
        setTechPoints(prev => prev - SHIELD_BUILD_COST);
        shieldRef.current.active = true;
        shieldRef.current.hp = shieldRef.current.maxHp;
        setShieldState({ ...shieldRef.current });
      }
    } else {
      // Upgrade
      if (techPoints >= SHIELD_UPGRADE_COST && shieldRef.current.level < MAX_LEVEL) {
        setTechPoints(prev => prev - SHIELD_UPGRADE_COST);
        shieldRef.current.level += 1;
        shieldRef.current.maxHp += 1;
        shieldRef.current.hp = shieldRef.current.maxHp;
        setShieldState({ ...shieldRef.current });
      }
    }
  };

  return (
    <div className="min-h-screen bg-[#050505] text-white font-sans selection:bg-emerald-500/30 overflow-hidden flex flex-col">
      {/* Header */}
      <header className="p-4 border-b border-white/10 flex justify-between items-center bg-black/50 backdrop-blur-md z-10">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-emerald-500/10 rounded-lg border border-emerald-500/20">
            <Shield className="w-6 h-6 text-emerald-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight uppercase italic font-serif">{t.title}</h1>
            <p className="text-[10px] text-white/40 uppercase tracking-[0.2em] font-mono">{t.goal}</p>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="flex items-center gap-4 px-4 py-2 bg-white/5 rounded-lg border border-white/10">
            <div className="text-right">
              <p className="text-[9px] text-white/40 uppercase tracking-widest font-mono">{t.shield}</p>
              <div className="flex gap-1 mt-1">
                {Array.from({ length: shieldState.maxHp }).map((_, i) => (
                  <div 
                    key={i} 
                    className={`w-2 h-3 rounded-sm ${i < shieldState.hp ? 'bg-blue-400' : 'bg-white/10'}`}
                  />
                ))}
              </div>
            </div>
            <button
              onClick={handleShieldAction}
              disabled={
                (shieldState.active && shieldState.hp > 0 && (techPoints < SHIELD_UPGRADE_COST || shieldState.level >= MAX_LEVEL)) ||
                (!shieldState.active && techPoints < SHIELD_BUILD_COST)
              }
              className={`px-3 py-1 text-[10px] font-black uppercase tracking-tighter border transition-all ${
                (!shieldState.active && techPoints >= SHIELD_BUILD_COST) || (shieldState.active && shieldState.hp > 0 && techPoints >= SHIELD_UPGRADE_COST && shieldState.level < MAX_LEVEL)
                ? 'bg-blue-500 text-white border-blue-400 hover:bg-blue-400'
                : 'bg-transparent text-white/20 border-white/10 cursor-not-allowed'
              }`}
            >
              {!shieldState.active || shieldState.hp <= 0 
                ? `${t.buildShield} (${SHIELD_BUILD_COST})` 
                : shieldState.level >= MAX_LEVEL ? t.maxLevel : `${t.upgradeShield} (${SHIELD_UPGRADE_COST})`}
            </button>
          </div>

          <div className="text-right">
            <p className="text-[10px] text-white/40 uppercase tracking-widest font-mono">{t.techPoints}</p>
            <p className="text-2xl font-mono font-bold text-yellow-400">{techPoints}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] text-white/40 uppercase tracking-widest font-mono">{t.score}</p>
            <p className="text-2xl font-mono font-bold text-emerald-400">{score.toString().padStart(5, '0')}</p>
          </div>
          <button 
            onClick={() => setLanguage(l => l === 'zh' ? 'en' : 'zh')}
            className="px-3 py-1 text-[10px] border border-white/20 rounded-full hover:bg-white/10 transition-colors uppercase font-bold tracking-tighter"
          >
            {language === 'zh' ? 'EN' : '中文'}
          </button>
        </div>
      </header>

      {/* Main Game Area */}
      <main className="flex-1 relative flex items-center justify-center p-4">
        <div className="relative aspect-[4/3] w-full max-w-4xl border border-white/10 shadow-2xl shadow-emerald-500/5 rounded-sm overflow-hidden bg-black">
          <canvas
            ref={canvasRef}
            width={GAME_WIDTH}
            height={GAME_HEIGHT}
            onClick={handleCanvasClick}
            onTouchStart={handleCanvasClick}
            className="w-full h-full cursor-crosshair touch-none"
          />

          {/* Overlays */}
          {gameState === 'START' && (
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center p-8 text-center">
              <div className="mb-8 animate-pulse">
                <Target className="w-20 h-20 text-emerald-500 mx-auto mb-4" />
                <h2 className="text-4xl font-serif italic font-black uppercase tracking-tighter">{t.title}</h2>
              </div>
              
              <div className="mb-8">
                <p className="text-[10px] text-white/40 uppercase tracking-widest font-mono mb-4">{t.difficulty}</p>
                <div className="flex gap-4">
                  {(['EASY', 'NORMAL', 'HARD'] as const).map((d) => (
                    <button
                      key={d}
                      onClick={() => setDifficulty(d)}
                      className={`px-4 py-2 text-xs font-bold uppercase tracking-widest border transition-all ${
                        difficulty === d 
                        ? 'bg-emerald-500 text-black border-emerald-500' 
                        : 'bg-transparent text-white/60 border-white/20 hover:border-white/40'
                      }`}
                    >
                      {d === 'EASY' ? t.easy : d === 'NORMAL' ? t.normal : t.hard}
                    </button>
                  ))}
                </div>
              </div>

              <p className="max-w-md text-white/60 mb-8 text-sm leading-relaxed">
                {t.instructions}
              </p>
              <button
                onClick={initGame}
                className="group relative px-12 py-4 bg-emerald-500 text-black font-black uppercase tracking-widest hover:bg-emerald-400 transition-all transform hover:scale-105 active:scale-95"
              >
                <span className="relative z-10">{t.start}</span>
                <div className="absolute inset-0 bg-white/20 translate-x-1 translate-y-1 group-hover:translate-x-0 group-hover:translate-y-0 transition-transform" />
              </button>
            </div>
          )}

          {showWaveClear && (
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center p-8 text-center z-20">
              <div className="p-1 bg-emerald-500/20 rounded-full mb-4">
                <Shield className="w-12 h-12 text-emerald-400" />
              </div>
              <h2 className="text-4xl font-black uppercase italic tracking-tighter mb-2 text-emerald-400">{t.waveClear}</h2>
              <div className="flex flex-col gap-2 mb-8">
                <p className="text-white/60 uppercase tracking-widest text-xs">{t.bonus}</p>
                <p className="text-2xl font-mono text-white">+{batteriesRef.current.reduce((sum, b) => sum + (b.destroyed ? 0 : b.ammo), 0) * 5} PTS</p>
              </div>
              <button
                onClick={() => startRound(round + 1)}
                className="px-12 py-4 bg-emerald-500 text-black font-black uppercase tracking-widest hover:bg-emerald-400 transition-all"
              >
                {t.nextWave}
              </button>
            </div>
          )}

          {gameState === 'PLAYING' && !showWaveClear && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 pointer-events-none">
              <p className="text-white/20 font-mono text-xs uppercase tracking-[0.5em]">{t.wave.replace('{{n}}', round.toString())}</p>
            </div>
          )}

          {gameState === 'WON' && (
            <div className="absolute inset-0 bg-emerald-500/20 backdrop-blur-md flex flex-col items-center justify-center p-8 text-center">
              <Trophy className="w-24 h-24 text-yellow-400 mb-6 animate-bounce" />
              <h2 className="text-5xl font-black uppercase italic tracking-tighter mb-2">{t.win}</h2>
              <p className="text-xl mb-8 text-emerald-100">{t.victory}</p>
              <button
                onClick={initGame}
                className="px-10 py-4 bg-white text-black font-black uppercase tracking-widest hover:bg-emerald-100 transition-all flex items-center gap-2"
              >
                <RefreshCw className="w-5 h-5" />
                {t.restart}
              </button>
            </div>
          )}

          {gameState === 'LOST' && (
            <div className="absolute inset-0 bg-red-950/80 backdrop-blur-md flex flex-col items-center justify-center p-8 text-center">
              <AlertTriangle className="w-24 h-24 text-red-500 mb-6 animate-pulse" />
              <h2 className="text-5xl font-black uppercase italic tracking-tighter mb-2">{t.loss}</h2>
              <p className="text-xl mb-8 text-red-200">{t.gameOver}</p>
              <button
                onClick={initGame}
                className="px-10 py-4 bg-red-600 text-white font-black uppercase tracking-widest hover:bg-red-500 transition-all flex items-center gap-2"
              >
                <RefreshCw className="w-5 h-5" />
                {t.restart}
              </button>
            </div>
          )}
        </div>
      </main>

      {/* Footer / HUD */}
      <footer className="p-4 border-t border-white/10 bg-black/50 backdrop-blur-md grid grid-cols-3 gap-4">
        {batteriesRef.current.map((bat, i) => (
          <div key={bat.id} className={`p-3 rounded-lg border transition-all flex flex-col ${bat.destroyed ? 'bg-red-500/5 border-red-500/20 opacity-50' : 'bg-white/5 border-white/10'}`}>
            <div className="flex justify-between items-center mb-2">
              <div className="flex flex-col">
                <span className="text-[10px] uppercase tracking-widest text-white/40 font-mono">
                  {i === 0 ? (language === 'zh' ? '左翼炮台' : 'LEFT BATTERY') : 
                   i === 1 ? (language === 'zh' ? '中央炮台' : 'CENTER BATTERY') : 
                   (language === 'zh' ? '右翼炮台' : 'RIGHT BATTERY')}
                </span>
                <span className="text-[9px] text-emerald-400/60 font-mono uppercase">{t.level} {bat.level}</span>
              </div>
              {bat.destroyed ? (
                <AlertTriangle className="w-3 h-3 text-red-500" />
              ) : (
                <Rocket className="w-3 h-3 text-emerald-400" />
              )}
            </div>
            
            <div className="h-2 bg-black/40 rounded-full overflow-hidden mb-2">
              <div 
                className={`h-full transition-all duration-300 ${bat.destroyed ? 'bg-red-500' : 'bg-emerald-500'}`}
                style={{ width: `${(bat.ammo / bat.maxAmmo) * 100}%` }}
              />
            </div>

            <div className="flex justify-between items-center mb-2">
              <span className="text-[9px] font-mono text-white/20 uppercase">HP</span>
              <div className="flex gap-0.5">
                {Array.from({ length: bat.maxHp }).map((_, i) => (
                  <div 
                    key={i} 
                    className={`w-2 h-2 rounded-sm ${i < bat.hp ? 'bg-red-500' : 'bg-white/10'}`}
                  />
                ))}
              </div>
            </div>
            
            <div className="flex justify-between items-center mt-auto">
              <div className="flex flex-col">
                <span className="text-[9px] font-mono text-white/20 uppercase">{t.ammo}</span>
                <span className={`text-xs font-mono font-bold ${bat.ammo === 0 ? 'text-red-500' : 'text-white'}`}>
                  {bat.ammo} / {bat.maxAmmo}
                </span>
              </div>
              
              {!bat.destroyed && (
                <button
                  onClick={() => upgradeBattery(i)}
                  disabled={techPoints < UPGRADE_COST || bat.level >= MAX_LEVEL}
                  className={`px-2 py-1 text-[9px] font-black uppercase tracking-tighter border transition-all ${
                    techPoints >= UPGRADE_COST && bat.level < MAX_LEVEL
                    ? 'bg-yellow-500 text-black border-yellow-500 hover:bg-yellow-400'
                    : 'bg-transparent text-white/20 border-white/10 cursor-not-allowed'
                  }`}
                >
                  {bat.level >= MAX_LEVEL ? t.maxLevel : `${t.upgrade} (6)`}
                </button>
              )}
            </div>
          </div>
        ))}
      </footer>

      {/* Mobile Hint */}
      <div className="md:hidden p-2 bg-emerald-500/10 text-[10px] text-center text-emerald-400 uppercase tracking-widest border-t border-emerald-500/20">
        <Info className="w-3 h-3 inline mr-1 -mt-0.5" />
        {language === 'zh' ? '建议横屏游戏以获得最佳体验' : 'Landscape mode recommended for best experience'}
      </div>
    </div>
  );
}
