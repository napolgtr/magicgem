export type Color = 'red' | 'blue' | 'green' | 'yellow' | 'purple' | 'cyan' | 'pink' | 'special';

export interface Point {
  x: number;
  y: number;
}

export interface CellState {
  x: number;
  y: number;
  color: Color | null;
  nextColor?: Color | null;
  isClearing?: boolean;
}

export type BoardState = CellState[][];

const BOARD_SIZE = 9;
export const COLORS: Color[] = ['red', 'blue', 'green', 'yellow', 'purple', 'cyan', 'pink'];

export const createEmptyBoard = (): BoardState => {
  const board: BoardState = [];
  for (let y = 0; y < BOARD_SIZE; y++) {
    const row: CellState[] = [];
    for (let x = 0; x < BOARD_SIZE; x++) {
      row.push({ x, y, color: null, nextColor: null, isClearing: false });
    }
    board.push(row);
  }
  return board;
};

export const getRandomEmptyCells = (board: BoardState, count: number): Point[] => {
  const emptyCells: Point[] = [];
  for (let y = 0; y < BOARD_SIZE; y++) {
    for (let x = 0; x < BOARD_SIZE; x++) {
      if (board[y][x].color === null) {
        emptyCells.push({ x, y });
      }
    }
  }

  const result: Point[] = [];
  for (let i = 0; i < count && emptyCells.length > 0; i++) {
    const randomIndex = Math.floor(Math.random() * emptyCells.length);
    result.push(emptyCells[randomIndex]);
    emptyCells.splice(randomIndex, 1);
  }
  return result;
};

export const getRandomColors = (count: number): Color[] => {
  const result: Color[] = [];
  for (let i = 0; i < count; i++) {
    result.push(COLORS[Math.floor(Math.random() * COLORS.length)]);
  }
  return result;
};

// BFS to find the shortest path from start to end (4 directions only, Lines 98 rules)
// Returns an array of points [start, ..., end], or null if no path exists.
export const findPath = (board: BoardState, start: Point, end: Point): Point[] | null => {
  if (start.x === end.x && start.y === end.y) return null;
  if (board[end.y][end.x].color !== null) return null;

  const toKey = (p: Point) => `${p.x},${p.y}`;
  // parent map: key -> parent Point (null means this is the start)
  const parent = new Map<string, Point | null>();
  parent.set(toKey(start), null);

  const queue: Point[] = [start];
  const dirs = [
    { dx: 0, dy: -1 }, { dx: 1, dy: 0 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 }
  ];

  let found = false;
  outer: while (queue.length > 0) {
    const current = queue.shift()!;
    for (const dir of dirs) {
      const nx = current.x + dir.dx;
      const ny = current.y + dir.dy;
      if (nx >= 0 && nx < BOARD_SIZE && ny >= 0 && ny < BOARD_SIZE) {
        const nkey = toKey({ x: nx, y: ny });
        if (!parent.has(nkey) && board[ny][nx].color === null) {
          parent.set(nkey, current);
          if (nx === end.x && ny === end.y) { found = true; break outer; }
          queue.push({ x: nx, y: ny });
        }
      }
    }
  }

  if (!found) return null;

  // Reconstruct path by walking back from end to start
  const path: Point[] = [];
  let curr: Point | null | undefined = end;
  while (curr !== null && curr !== undefined) {
    path.unshift(curr);
    curr = parent.get(toKey(curr)); // undefined when key not in map, null at start
  }
  return path;
};

// Check for lines of 5 or more
export const findLines = (board: BoardState): Point[] => {
  const lines: Point[] = [];
  const minLineLength = 5;

  const checkDirection = (startX: number, startY: number, dx: number, dy: number) => {
    let x = startX;
    let y = startY;
    const currentLine: Point[] = [];
    let currentColor: Color | null = null;

    while (x >= 0 && x < BOARD_SIZE && y >= 0 && y < BOARD_SIZE) {
      const cellColor = board[y][x].color;
      
      if (cellColor !== null) {
        // Special case: if we want a "special" color to count as wild, or just treat it normally.
        // We'll treat all colors normally for line matching, but if score reaches threshold, 
        // they get a special graphic. The special graphic could just be a state flag on the UI.
        
        if (cellColor === currentColor || currentColor === null) {
          if (currentColor === null) {
              currentColor = cellColor;
          }
          currentLine.push({ x, y });
        } else {
          if (currentLine.length >= minLineLength) {
            lines.push(...currentLine);
          }
          currentLine.length = 0;
          currentColor = cellColor;
          currentLine.push({ x, y });
        }
      } else {
        if (currentLine.length >= minLineLength) {
          lines.push(...currentLine);
        }
        currentLine.length = 0;
        currentColor = null;
      }
      
      x += dx;
      y += dy;
    }

    if (currentLine.length >= minLineLength) {
      lines.push(...currentLine);
    }
  };

  // Check horizontal
  for (let y = 0; y < BOARD_SIZE; y++) checkDirection(0, y, 1, 0);
  
  // Check vertical
  for (let x = 0; x < BOARD_SIZE; x++) checkDirection(x, 0, 0, 1);

  // Check diagonal (top-left to bottom-right)
  for (let y = 0; y < BOARD_SIZE; y++) checkDirection(0, y, 1, 1);
  for (let x = 1; x < BOARD_SIZE; x++) checkDirection(x, 0, 1, 1);

  // Check anti-diagonal (top-right to bottom-left)
  for (let y = 0; y < BOARD_SIZE; y++) checkDirection(BOARD_SIZE - 1, y, -1, 1);
  for (let x = 0; x < BOARD_SIZE - 1; x++) checkDirection(x, 0, -1, 1);

  // Remove duplicates
  const uniqueLines = new Set<string>();
  const result: Point[] = [];
  for (const pt of lines) {
    const key = `${pt.x},${pt.y}`;
    if (!uniqueLines.has(key)) {
      uniqueLines.add(key);
      result.push(pt);
    }
  }

  return result;
};
