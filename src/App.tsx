import { useState, useEffect, useCallback, useRef } from 'react';
import './index.css';
import type { BoardState, Color, Point } from './utils/gameLogic';
import { 
  createEmptyBoard, 
  getRandomColors, 
  getRandomEmptyCells, 
  hasPath, 
  findLines 
} from './utils/gameLogic';

const App = () => {
  const [board, setBoard] = useState<BoardState>(createEmptyBoard());
  const [score, setScore] = useState<number>(0);
  const [nextColors, setNextColors] = useState<Color[]>([]);
  const [selectedPoint, setSelectedPoint] = useState<Point | null>(null);
  const [gameOver, setGameOver] = useState<boolean>(false);
  const [highScore, setHighScore] = useState<number>(0);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const boardRef = useRef<BoardState>(createEmptyBoard());

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
  }, []);

  useEffect(() => {
    initGame();
  }, [initGame]);

  const handleCellClick = (x: number, y: number) => {
    if (gameOver || isProcessing) return;

    const clickedColor = board[y][x].color;

    // Select a ball
    if (clickedColor !== null) {
      setSelectedPoint({ x, y });
      return;
    }

    // Move ball if one is selected and path exists
    if (selectedPoint !== null && clickedColor === null) {
      if (hasPath(board, selectedPoint, { x, y })) {
        const newBoard = [...board.map(row => [...row])];
        
        // Move
        newBoard[y][x].color = newBoard[selectedPoint.y][selectedPoint.x].color;
        newBoard[selectedPoint.y][selectedPoint.x].color = null;
        setSelectedPoint(null);

        // Check for lines after move
        let lines = findLines(newBoard);
        if (lines.length > 0) {
          handleLines(newBoard, lines);
        } else {
          // No lines, spawn new balls
          spawnNextBalls(newBoard);
        }
      } else {
        // Invalid path, maybe play a sound or shake effect
        setSelectedPoint(null);
      }
    }
  };

  const handleLines = (currentBoard: BoardState, lines: Point[], onComplete?: (board: BoardState) => void) => {
    setIsProcessing(true);

    // Set isClearing flag for animation
    lines.forEach(pt => {
      currentBoard[pt.y][pt.x].isClearing = true;
    });
    boardRef.current = currentBoard;
    setBoard([...currentBoard]);

    // Scoring logic
    const earnedScore = 50 + (lines.length - 5) * 10;

    setTimeout(() => {
      setScore(prev => {
        const newScore = prev + earnedScore;
        if (newScore > highScore) setHighScore(newScore);
        return newScore;
      });

      // Work directly from boardRef so we don't get stale state
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

    // Spawn balls in their previewed spots
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

    // Spawn displaced ones in new random spots
    if (displacedSpawns.length > 0) {
      const emptyCells = getRandomEmptyCells(currentBoard, displacedSpawns.length);
      emptyCells.forEach((pt, idx) => {
        currentBoard[pt.y][pt.x].color = displacedSpawns[idx];
      });
    }

    // Check lines again after spawning
    const linesAfterSpawn = findLines(currentBoard);
    if (linesAfterSpawn.length > 0) {
      handleLines(currentBoard, linesAfterSpawn, (boardAfterClear) => {
        generatePreviews(boardAfterClear);
      });
      return;
    }

    // Check if board is full
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
      return;
    }

    generatePreviews(currentBoard);
  };

  const generatePreviews = (currentBoard: BoardState) => {
    const newPreviews = getRandomEmptyCells(currentBoard, 3);
    const newColors = getRandomColors(3);
    newPreviews.forEach((pt, idx) => {
      currentBoard[pt.y][pt.x].nextColor = newColors[idx];
    });
    boardRef.current = currentBoard;
    setNextColors(newColors);
    setBoard([...currentBoard]);
  };

  // Special mode: affects center orb UI only. Individual gems get a glow aura class but NO white border.
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

        {/* Gameplay area — grows to fill, grid anchored at bottom */}
        <div className="gameplay-area">
          {/* Board */}
          <div className="grid-container">
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
                )
              })
            ))}
          </div>

          {/* Controls */}
          <div className="controls-panel">
            <div className="btn-stone" onClick={initGame}>
               <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#5c4033" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.59-9.21l5.67-5.67"/></svg>
            </div>
            {gameOver && (
              <div className="stone-panel" style={{ color: '#8b0000' }}>GAME OVER</div>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default App;
