import { useState, useEffect, useCallback, useRef } from 'react';
import type { CSSProperties } from 'react';
import './index.css';
import type { BoardState, Color, Point } from './utils/gameLogic';
import { 
  createEmptyBoard, 
  getRandomColors, 
  getRandomEmptyCells, 
  findPath, 
  findLines 
} from './utils/gameLogic';

interface MovingBall {
  color: Color;
  to: Point;
}

interface GameSnapshot {
  board: BoardState;
  score: number;
  nextColors: Color[];
}

interface SaveData {
  board: BoardState;
  score: number;
  nextColors: Color[];
}

const SAVE_KEY = 'magicGemSave';
const HIGHSCORE_KEY = 'magicGemHighScore';

const STEP_MS = 120; // ms per grid cell during travel animation

const App = () => {
  const [gameState, setGameState] = useState<'menu' | 'playing' | 'paused'>('menu');
  const [hasSave, setHasSave] = useState<boolean>(false);
  const [board, setBoard] = useState<BoardState>(createEmptyBoard());
  const [score, setScore] = useState<number>(0);
  const [nextColors, setNextColors] = useState<Color[]>([]);
  const [selectedPoint, setSelectedPoint] = useState<Point | null>(null);
  const [gameOver, setGameOver] = useState<boolean>(false);
  const [highScore, setHighScore] = useState<number>(0);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [movingBall, setMovingBall] = useState<MovingBall | null>(null);
  const [movingStyle, setMovingStyle] = useState<CSSProperties>({});
  const [undoSnapshot, setUndoSnapshot] = useState<GameSnapshot | null>(null);

  const boardRef = useRef<BoardState>(createEmptyBoard());
  const gridRef = useRef<HTMLDivElement>(null);

  // Compute pixel center of a grid cell (relative to grid container)
  const getCellCenter = useCallback((x: number, y: number): { left: number; top: number; size: number } => {
    const grid = gridRef.current;
    if (!grid) return { left: 0, top: 0, size: 40 };
    const { width, height } = grid.getBoundingClientRect();
    const padding = 4;
    const gap = 1;
    const cellW = (width - padding * 2 - gap * 8) / 9;
    const cellH = (height - padding * 2 - gap * 8) / 9;
    return {
      left: padding + x * (cellW + gap) + cellW / 2,
      top: padding + y * (cellH + gap) + cellH / 2,
      size: Math.min(cellW, cellH) * 0.8,
    };
  }, []);

  // Animate a ball step-by-step through the BFS path
  const animatePath = useCallback((
    path: Point[],
    color: Color,
    onDone: (to: Point) => void
  ) => {
    if (path.length === 0) return;
    const to = path[path.length - 1];

    let step = 0;
    const startPos = getCellCenter(path[0].x, path[0].y);

    // Mount at start position (no transition)
    setMovingBall({ color, to });
    setMovingStyle({
      left: startPos.left,
      top: startPos.top,
      width: startPos.size,
      height: startPos.size,
      transition: 'none',
    });

    const moveStep = () => {
      step++;
      if (step >= path.length) {
        onDone(to);
        return;
      }
      const pos = getCellCenter(path[step].x, path[step].y);
      setMovingStyle({
        left: pos.left,
        top: pos.top,
        width: pos.size,
        height: pos.size,
        transition: `left ${STEP_MS}ms linear, top ${STEP_MS}ms linear`,
      });
      setTimeout(moveStep, STEP_MS);
    };

    // Start moving after 2 frames so the initial position renders first
    requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(moveStep, 0)));
  }, [getCellCenter]);

  // Initialize game
  const initGame = useCallback(() => {
    const newBoard = createEmptyBoard();
    const initialBalls = getRandomEmptyCells(newBoard, 5);
    const initialColors = getRandomColors(5);
    initialBalls.forEach((pt, idx) => {
      newBoard[pt.y][pt.x].color = initialColors[idx];
    });
    const nextSpawns = getRandomEmptyCells(newBoard, 3);
    const nextSpawnColors = getRandomColors(3);
    nextSpawns.forEach((pt, idx) => {
      newBoard[pt.y][pt.x].nextColor = nextSpawnColors[idx];
    });
    boardRef.current = newBoard;
    setBoard(newBoard);
    setScore(0);
    setNextColors(nextSpawnColors);
    setSelectedPoint(null);
    setGameOver(false);
    setIsProcessing(false);
    setMovingBall(null);
    setUndoSnapshot(null);
    setGameState('playing');
  }, []);

  const loadGame = useCallback(() => {
    const savedGame = localStorage.getItem(SAVE_KEY);
    if (savedGame) {
      try {
        const parsed: SaveData = JSON.parse(savedGame);
        boardRef.current = parsed.board;
        setBoard(parsed.board);
        setScore(parsed.score);
        setNextColors(parsed.nextColors);
        setGameOver(false);
        setIsProcessing(false);
        setSelectedPoint(null);
        setMovingBall(null);
        setUndoSnapshot(null);
        setGameState('playing');
      } catch (e) {
        console.error("Failed to load game", e);
        initGame();
      }
    }
  }, [initGame]);

  useEffect(() => {
    const savedHighScore = localStorage.getItem(HIGHSCORE_KEY);
    if (savedHighScore) {
      setHighScore(parseInt(savedHighScore, 10));
    }
    const savedGame = localStorage.getItem(SAVE_KEY);
    if (savedGame) {
      setHasSave(true);
    }
  }, []);

  const saveGame = useCallback(() => {
    if (gameOver) return;
    const save: SaveData = {
      board: boardRef.current,
      score,
      nextColors
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
    localStorage.setItem(HIGHSCORE_KEY, highScore.toString());
    setHasSave(true);
  }, [score, nextColors, highScore, gameOver]);

  // Auto save when score/nextColors/board changes and we are playing
  useEffect(() => {
    if (gameState === 'playing' && !isProcessing) {
      saveGame();
    }
  }, [board, score, nextColors, isProcessing, gameState, saveGame]);

  const handleCellClick = (x: number, y: number) => {
    if (gameState !== 'playing' || gameOver || isProcessing) return;

    const clickedColor = board[y][x].color;

    // Select a ball
    if (clickedColor !== null) {
      setSelectedPoint({ x, y });
      return;
    }

    // Move ball if one is selected and path exists
    if (selectedPoint !== null && clickedColor === null) {
      const path = findPath(board, selectedPoint, { x, y });
      if (path !== null) {
        const from = selectedPoint;
        const moveColor = board[from.y][from.x].color!;

        // ── Save undo snapshot BEFORE any change ──
        setUndoSnapshot({
          board: board.map(row => row.map(cell => ({ ...cell }))),
          score,
          nextColors: [...nextColors],
        });

        // Remove ball from source cell immediately, lock input
        const newBoard = board.map(row => [...row]);
        newBoard[from.y][from.x].color = null;
        boardRef.current = newBoard;
        setBoard([...newBoard]);
        setSelectedPoint(null);
        setIsProcessing(true);

        // Animate ball along the BFS path
        animatePath(path, moveColor, (dest) => {
          setMovingBall(null);
          const finalBoard = boardRef.current.map(row => [...row]);
          finalBoard[dest.y][dest.x].color = moveColor;
          boardRef.current = finalBoard;
          setBoard([...finalBoard]);

          const lines = findLines(finalBoard);
          if (lines.length > 0) {
            handleLines(finalBoard, lines);
          } else {
            spawnNextBalls(finalBoard);
          }
        });

      } else {
        // No path — deselect
        setSelectedPoint(null);
      }
    }
  };

  const handleLines = (currentBoard: BoardState, lines: Point[], onComplete?: (board: BoardState) => void) => {
    setIsProcessing(true);
    lines.forEach(pt => { currentBoard[pt.y][pt.x].isClearing = true; });
    boardRef.current = currentBoard;
    setBoard([...currentBoard]);

    const earnedScore = 50 + (lines.length - 5) * 10;

    setTimeout(() => {
      setScore(prev => {
        const newScore = prev + earnedScore;
        if (newScore > highScore) setHighScore(newScore);
        return newScore;
      });

      const updatedBoard = boardRef.current.map(row => [...row]);
      lines.forEach(pt => {
        updatedBoard[pt.y][pt.x].color = null;
        updatedBoard[pt.y][pt.x].isClearing = false;
      });
      boardRef.current = updatedBoard;
      setBoard([...updatedBoard]);
      setIsProcessing(false);

      if (onComplete) onComplete(updatedBoard);
    }, 500);
  };

  const spawnNextBalls = (currentBoard: BoardState) => {
    const displacedSpawns: Color[] = [];
    for (let y = 0; y < 9; y++) {
      for (let x = 0; x < 9; x++) {
        const cell = currentBoard[y][x];
        if (cell.nextColor) {
          if (cell.color === null) {
            cell.color = cell.nextColor;
          } else {
            displacedSpawns.push(cell.nextColor);
          }
          cell.nextColor = null;
        }
      }
    }
    if (displacedSpawns.length > 0) {
      const emptyCells = getRandomEmptyCells(currentBoard, displacedSpawns.length);
      emptyCells.forEach((pt, idx) => { currentBoard[pt.y][pt.x].color = displacedSpawns[idx]; });
    }

    const linesAfterSpawn = findLines(currentBoard);
    if (linesAfterSpawn.length > 0) {
      handleLines(currentBoard, linesAfterSpawn, (boardAfterClear) => {
        generatePreviews(boardAfterClear);
      });
      return;
    }

    let isFull = true;
    for (let y = 0; y < 9; y++) {
      for (let x = 0; x < 9; x++) {
        if (currentBoard[y][x].color === null) { isFull = false; break; }
      }
    }
    if (isFull) {
      boardRef.current = currentBoard;
      setBoard([...currentBoard]);
      setGameOver(true);
      localStorage.removeItem(SAVE_KEY);
      setHasSave(false);
      return;
    }

    generatePreviews(currentBoard);
  };

  const generatePreviews = (currentBoard: BoardState) => {
    const newPreviews = getRandomEmptyCells(currentBoard, 3);
    const newColors = getRandomColors(3);
    newPreviews.forEach((pt, idx) => { currentBoard[pt.y][pt.x].nextColor = newColors[idx]; });
    boardRef.current = currentBoard;
    setNextColors(newColors);
    setBoard([...currentBoard]);
    setIsProcessing(false);
  };

  // ── Undo: restore state from snapshot ──
  const handleUndo = () => {
    if (!undoSnapshot || isProcessing) return;
    boardRef.current = undoSnapshot.board;
    setBoard(undoSnapshot.board.map(row => [...row]));
    setScore(undoSnapshot.score);
    setNextColors([...undoSnapshot.nextColors]);
    setSelectedPoint(null);
    setUndoSnapshot(null);
    setIsProcessing(false);
    setMovingBall(null);
  };

  const isSpecialMode = score >= 50;

  return (
    <>
      <div className="landscape-overlay">
        <span>Please rotate to portrait</span>
        <span>to play Magic Gem!</span>
      </div>

      <div className="game-container">
        {/* Score at top */}
        <div className="header-panel">
          <div className="stone-panel" style={{ flex: 1 }}>
            <span style={{ fontSize: '13px', opacity: 0.7 }}>BEST</span>&nbsp;{highScore}
          </div>
          
          <div className={`magic-center ${isSpecialMode ? 'magic-center-special' : ''}`}>
             <div className="next-box">
              {nextColors.map((color, idx) => (
                <div key={idx} className={`gem next-gem ${color}`} />
              ))}
            </div>
          </div>

          <div className="stone-panel" style={{ flex: 1 }}>
            <span style={{ fontSize: '13px', opacity: 0.7 }}>SCORE</span>&nbsp;{score}
          </div>
        </div>

        {/* Gameplay area */}
        <div className="gameplay-area">
          {/* Board */}
          <div className="grid-container" ref={gridRef}>
            {board.map((row, y) => (
              row.map((cell, x) => {
                const isDark = (x + y) % 2 === 1;
                const isSelected = selectedPoint?.x === x && selectedPoint?.y === y;
                return (
                  <div 
                    key={`${x}-${y}`} 
                    className={`grid-cell ${isDark ? 'dark' : 'light'}`}
                    onClick={() => handleCellClick(x, y)}
                  >
                    {cell.color ? (
                      <div
                        className={`gem ${cell.color} ${isSelected ? 'selected' : ''} ${cell.isClearing ? 'clearing' : ''}`}
                      />
                    ) : cell.nextColor ? (
                      <div className={`gem small-gem ${cell.nextColor}`} />
                    ) : null}
                  </div>
                );
              })
            ))}

            {/* Traveling ball overlay */}
            {movingBall && (
              <div
                className={`gem traveling-gem ${movingBall.color}`}
                style={movingStyle}
              />
            )}
          </div>

          {/* Controls */}
          <div className="controls-panel">
            <div className="btn-pause" onClick={() => setGameState('paused')} title="Pause">
              <div className="pause-icon">
                <div className="pause-bar"></div>
                <div className="pause-bar"></div>
              </div>
            </div>
            {gameOver && (
              <div className="stone-panel" style={{ color: '#8b0000', fontSize: '18px', padding: '10px' }}>GAME OVER</div>
            )}
            <div
              className={`btn-undo ${!undoSnapshot || isProcessing ? 'disabled' : ''}`}
              onClick={handleUndo}
              title="Undo last move"
            >
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 14L4 9l5-5"/>
                <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>
              </svg>
            </div>
          </div>
        </div>
      </div>

      {gameState === 'menu' && (
        <div className="menu-overlay">
          <div className="menu-title-board">
            <div className="menu-title-text">Magic Gem</div>
          </div>
          <div className="menu-button" onClick={initGame}>PLAY</div>
          <div className={`menu-button ${!hasSave ? 'disabled' : ''}`} onClick={hasSave ? loadGame : undefined}>CONTINUE GAME</div>
          <div className="menu-button" onClick={() => alert(`High Score: ${highScore}`)}>High Score</div>
          <div className="menu-button" onClick={() => alert("Options not implemented")}>OPTIONS</div>
          <div className="menu-button" onClick={() => alert("About Magic Gem")}>ABOUT</div>
        </div>
      )}

      {gameState === 'paused' && (
        <div className="menu-overlay pause-overlay">
          <div className="pause-board">
            <div className="pause-title">PAUSE</div>
            <div className="menu-button" onClick={() => setGameState('playing')}>RESUME</div>
            <div className="menu-button" onClick={() => setGameState('menu')}>QUIT</div>
          </div>
        </div>
      )}
    </>
  );
};

export default App;
