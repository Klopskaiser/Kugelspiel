document.addEventListener('DOMContentLoaded', () => {

    const ALL_COLORS = ['red', 'blue', 'green', 'yellow', 'orange', 'pink', 'purple', 'cyan', 'brown', 'gray'];
    // Map for creating fast, unique keys for board states.
    const COLOR_MAP_FOR_SOLVER = {
        'red': 'r', 'blue': 'b', 'green': 'g', 'yellow': 'y', 'orange': 'o',
        'pink': 'p', 'purple': 'u', 'cyan': 'c', 'brown': 'n', 'gray': 'a'
    };

    const difficultySettings = {
        easy:   { balls: 4, colors: 7, tubes: 9 },
        medium: { balls: 5, colors: 8, tubes: 10 },
        hard:   { balls: 6, colors: 9, tubes: 11 }
    };
    let currentDifficulty = 'easy', isExtremeMode = false, moveCount = 0;
    let moveHistory = [], confettiInterval = null;

    const gameBoard = document.getElementById('game-board');
    const restartButton = document.getElementById('restart-button');
    const undoButton = document.getElementById('undo-button');
    const autosolveButton = document.getElementById('autosolve-button');
    const difficultyContainer = document.getElementById('difficulty-container');
    const extremeToggle = document.getElementById('extreme-toggle');
    const winOverlay = document.getElementById('win-overlay');
    const playAgainButton = document.getElementById('play-again-button');
    const movesDisplay = document.getElementById('moves-display');
    const deadlockOverlay = document.getElementById('deadlock-overlay');
    const deadlockRestartButton = document.getElementById('deadlock-restart-button');

    let tubes = [], selectedTubeIndex = null, isAnimating = false;

    function setupNewGame() {
        clearInterval(confettiInterval);
        document.querySelector('.floating-ball')?.remove();
        deadlockOverlay.classList.remove('show');
        winOverlay.classList.remove('show');
        moveCount = 0;
        moveHistory = [];
        undoButton.disabled = true;
        autosolveButton.disabled = false;
        gameBoard.style.pointerEvents = 'auto';

        const settings = difficultySettings[currentDifficulty];
        const { balls: MAX_BALLS_PER_TUBE, colors: NUM_COLORS, tubes: NUM_TUBES } = settings;
        const COLORS = ALL_COLORS.slice(0, NUM_COLORS);
        gameBoard.style.setProperty('--tube-height', `${MAX_BALLS_PER_TUBE * 60}px`);

        // 1. Create the solved state
        tubes = [];
        for (const color of COLORS) {
            tubes.push(Array(MAX_BALLS_PER_TUBE).fill(color));
        }
        while (tubes.length < NUM_TUBES) {
            tubes.push([]);
        }

        // 2. Shuffle by making a series of random, valid moves
        const shuffleCount = 40 + (MAX_BALLS_PER_TUBE * 15);
        for (let i = 0; i < shuffleCount; i++) {
            const possibleMoves = [];
            tubes.forEach((fromTube, fromIndex) => {
                if (fromTube.length === 0) return;
                tubes.forEach((toTube, toIndex) => {
                    if (fromIndex !== toIndex && toTube.length < MAX_BALLS_PER_TUBE) {
                         possibleMoves.push([fromIndex, toIndex]);
                    }
                });
            });
            if (possibleMoves.length === 0) break;
            const [from, to] = possibleMoves[Math.floor(Math.random() * possibleMoves.length)];
            const ball = tubes[from].pop();
            tubes[to].push(ball);
        }

        // 3. Ensure the last two tubes are empty
        const tubesToEmptyIndexes = [NUM_TUBES - 1, NUM_TUBES - 2];
        for (const tubeIndex of tubesToEmptyIndexes) {
            while (tubes[tubeIndex].length > 0) {
                const ballToMove = tubes[tubeIndex].pop();
                const possibleHomes = [];
                for (let i = 0; i < NUM_TUBES - 2; i++) {
                    if (tubes[i].length < MAX_BALLS_PER_TUBE) possibleHomes.push(i);
                }
                if (possibleHomes.length > 0) {
                    const newHomeIndex = possibleHomes[Math.floor(Math.random() * possibleHomes.length)];
                    tubes[newHomeIndex].push(ballToMove);
                } else {
                    tubes[tubeIndex].push(ballToMove);
                    break;
                }
            }
        }

        // 4. If extreme mode, enforce the stacking rule
        if (isExtremeMode) enforceExtremeStacking();

        selectedTubeIndex = null;
        isAnimating = false;
        renderBoard();
    }

    function enforceExtremeStacking() {
        const { tubes: NUM_TUBES } = difficultySettings[currentDifficulty];
        for (let i = 0; i < NUM_TUBES - 2; i++) {
            const tube = tubes[i];
            if (tube.length < 3) continue;
            for (let j = 2; j < tube.length; j++) {
                if (tube[j] === tube[j-1] && tube[j-1] === tube[j-2]) {
                    let swapTubeIndex, attempts = 0;
                    do {
                        swapTubeIndex = Math.floor(Math.random() * (NUM_TUBES - 2));
                        attempts++;
                    } while ((swapTubeIndex === i || tubes[swapTubeIndex].length === 0) && attempts < 50);
                    if (attempts >= 50) continue;
                    const swapBallIndex = Math.floor(Math.random() * tubes[swapTubeIndex].length);
                    [tube[j], tubes[swapTubeIndex][swapBallIndex]] = [tubes[swapTubeIndex][swapBallIndex], tube[j]];
                }
            }
        }
    }

    function renderBoard() {
        gameBoard.innerHTML = '';
        const MAX_BALLS_PER_TUBE = difficultySettings[currentDifficulty].balls;
        tubes.forEach((tubeContent, index) => {
            const tubeDiv = document.createElement('div');
            tubeDiv.classList.add('tube');
            const isSolved = tubeContent.length === MAX_BALLS_PER_TUBE && tubeContent.every(ball => ball === tubeContent[0]);
            if (isSolved) tubeDiv.classList.add('solved');
            tubeContent.forEach(color => {
                const ballDiv = document.createElement('div');
                ballDiv.classList.add('ball', `color-${color}`);
                tubeDiv.appendChild(ballDiv);
            });
            tubeDiv.addEventListener('click', () => handleTubeClick(index));
            gameBoard.appendChild(tubeDiv);
        });
    }

    function handleTubeClick(clickedIndex) {
        if (isAnimating) return;
        const clickedTubeElement = gameBoard.children[clickedIndex];
        if (selectedTubeIndex === null) {
            if (tubes[clickedIndex].length > 0) {
                selectedTubeIndex = clickedIndex;
                const topBall = clickedTubeElement.querySelector('.ball:last-child');
                if (topBall) {
                    topBall.classList.add('hidden');
                    const ballRect = topBall.getBoundingClientRect();
                    const floatingBall = topBall.cloneNode(true);
                    floatingBall.classList.remove('hidden');
                    floatingBall.classList.add('floating-ball');
                    document.body.appendChild(floatingBall);
                    floatingBall.style.left = `${ballRect.left}px`;
                    floatingBall.style.top = `${ballRect.top}px`;
                    setTimeout(() => {
                        const tubeRect = clickedTubeElement.getBoundingClientRect();
                        floatingBall.style.left = `${tubeRect.left + (tubeRect.width / 2) - (ballRect.width / 2)}px`;
                        floatingBall.style.top = `${tubeRect.top - ballRect.height - 10}px`;
                    }, 10);
                }
            }
        } else {
            const fromTube = tubes[selectedTubeIndex];
            const toTube = tubes[clickedIndex];
            const ballToMove = fromTube[fromTube.length - 1];
            const MAX_BALLS_PER_TUBE = difficultySettings[currentDifficulty].balls;
            if (selectedTubeIndex === clickedIndex || toTube.length >= MAX_BALLS_PER_TUBE || (toTube.length > 0 && toTube[toTube.length - 1] !== ballToMove)) {
                document.querySelector('.floating-ball')?.remove();
                renderBoard();
            } else {
                animateBallMove(selectedTubeIndex, clickedIndex);
            }
            selectedTubeIndex = null;
        }
    }

    function animateBallMove(fromIndex, toIndex, isSolverMove = false) {
        return new Promise(resolve => {
            isAnimating = true;
            const floatingBall = document.querySelector('.floating-ball');
            if (!floatingBall) { isAnimating = false; resolve(); return; }

            const toTubeElement = gameBoard.children[toIndex];
            const ballsInToTube = tubes[toIndex].length;
            const ballHeight = 60;
            const tubeRect = toTubeElement.getBoundingClientRect();
            const ballRect = floatingBall.getBoundingClientRect();
            const targetLeft = tubeRect.left + (tubeRect.width / 2) - (ballRect.width / 2);
            const targetTop = tubeRect.bottom - ((ballsInToTube + 1) * ballHeight) + 5;

            floatingBall.style.left = `${targetLeft}px`;
            floatingBall.style.top = `${tubeRect.top - ballRect.height - 10}px`;

            setTimeout(() => {
                floatingBall.style.top = `${targetTop}px`;
                floatingBall.addEventListener('transitionend', () => {
                    if (!isSolverMove) {
                        moveHistory.push({ from: fromIndex, to: toIndex });
                        undoButton.disabled = false;
                        moveCount++;
                    }
                    const ball = tubes[fromIndex].pop();
                    tubes[toIndex].push(ball);
                    floatingBall.remove();
                    isAnimating = false;
                    renderBoard();
                    const gameWasWon = checkWinCondition();
                    if (!isSolverMove && !gameWasWon && !areMovesPossible()) {
                        undoButton.disabled = true;
                        deadlockOverlay.classList.add('show');
                    }
                    resolve();
                }, { once: true });
            }, 150);
        });
    }

    function areMovesPossible() {
        const settings = difficultySettings[currentDifficulty];
        for (let i = 0; i < settings.tubes; i++) {
            const fromTube = tubes[i];
            if (fromTube.length === 0 || (fromTube.length === settings.balls && fromTube.every(b => b === fromTube[0]))) continue;
            const ballToMove = fromTube[fromTube.length - 1];
            for (let j = 0; j < settings.tubes; j++) {
                if (i === j) continue;
                const toTube = tubes[j];
                if (toTube.length < settings.balls && (toTube.length === 0 || toTube[toTube.length - 1] === ballToMove)) return true;
            }
        }
        return false;
    }

    function checkWinCondition() {
        const settings = difficultySettings[currentDifficulty];
        const solvedTubes = tubes.filter(tube => tube.length === 0 || (tube.length === settings.balls && tube.every(ball => ball === tube[0])));
        if (solvedTubes.length === settings.tubes) {
            undoButton.disabled = true;
            autosolveButton.disabled = true;
            movesDisplay.textContent = `Benötigte Züge: ${moveCount}`;
            clearInterval(confettiInterval);
            confettiInterval = setInterval(fireRandomConfetti, 400);
            setTimeout(() => winOverlay.classList.add('show'), 500);
            return true;
        }
        return false;
    }

    function fireRandomConfetti() {
        confetti({
            particleCount: Math.floor(Math.random() * 50) + 50,
            angle: Math.random() * 120 + 30,
            spread: Math.random() * 50 + 50,
            origin: { y: Math.random() * 0.2 + 0.7 }
        });
    }

    function handleUndo() {
        if (isAnimating || moveHistory.length === 0) return;
        const lastMove = moveHistory.pop();
        const ball = tubes[lastMove.to].pop();
        tubes[lastMove.from].push(ball);
        moveCount--;
        renderBoard();
        if (moveHistory.length === 0) undoButton.disabled = true;
        autosolveButton.disabled = false;
    }

    // --- EFFICIENT AUTOSOLVER (A* ALGORITHM) ---
    function stateToString(state) {
        return state.map(tube => tube.map(color => COLOR_MAP_FOR_SOLVER[color]).join('')).join('|');
    }

    function isTubeSolved(tube, maxBalls) {
        return tube.length === maxBalls && tube.every(b => b === tube[0]);
    }

    function isStateSolved(state, maxBalls) {
        return state.every(tube => tube.length === 0 || isTubeSolved(tube, maxBalls));
    }

    function calculateHeuristic(state) {
        let totalMisplaced = 0;
        for (const tube of state) {
            if (tube.length === 0) continue;
            const bottomColor = tube[0];
            let correctStackHeight = 1;
            while(correctStackHeight < tube.length && tube[correctStackHeight] === bottomColor) {
                correctStackHeight++;
            }
            totalMisplaced += tube.length - correctStackHeight;
        }
        return totalMisplaced;
    }

    function findSolution() {
        const startState = JSON.parse(JSON.stringify(tubes));
        const MAX_BALLS_PER_TUBE = difficultySettings[currentDifficulty].balls;

        const priorityQueue = [{
            state: startState, path: [], cost_g: 0,
            score_f: calculateHeuristic(startState)
        }];
        const visited = new Set([stateToString(startState)]);

        while (priorityQueue.length > 0) {
            const { state, path, cost_g } = priorityQueue.shift();

            if (isStateSolved(state, MAX_BALLS_PER_TUBE)) return path;

            state.forEach((fromTube, fromIndex) => {
                if (fromTube.length === 0 || isTubeSolved(fromTube, MAX_BALLS_PER_TUBE)) return;

                const ballToMove = fromTube[fromTube.length - 1];

                state.forEach((toTube, toIndex) => {
                    if (fromIndex === toIndex) return;
                    if (toTube.length < MAX_BALLS_PER_TUBE && (toTube.length === 0 || toTube[toTube.length - 1] === ballToMove)) {
                        const nextState = state.map(t => [...t]);
                        nextState[toIndex].push(nextState[fromIndex].pop());
                        const nextStateStr = stateToString(nextState);

                        if (!visited.has(nextStateStr)) {
                            visited.add(nextStateStr);
                            const new_cost_g = cost_g + 1;
                            const heuristic_h = calculateHeuristic(nextState);
                            const newNode = {
                                state: nextState, path: path.concat([{ from: fromIndex, to: toIndex }]),
                                cost_g: new_cost_g, score_f: new_cost_g + heuristic_h
                            };

                            const insertIndex = priorityQueue.findIndex(item => item.score_f >= newNode.score_f);
                            if (insertIndex === -1) priorityQueue.push(newNode);
                            else priorityQueue.splice(insertIndex, 0, newNode);
                        }
                    }
                });
            });
        }
        return null;
    }

    async function executeSolution(path) {
        gameBoard.style.pointerEvents = 'none';
        for (const move of path) {
            await createAndAnimateSolverMove(move.from, move.to);
        }
        gameBoard.style.pointerEvents = 'auto';
        restartButton.disabled = false;
    }

    function createAndAnimateSolverMove(fromIndex, toIndex) {
        return new Promise(resolve => {
            const fromTubeElement = gameBoard.children[fromIndex];
            const topBallElement = fromTubeElement.querySelector('.ball:last-child');
            if (!topBallElement) { resolve(); return; }

            topBallElement.classList.add('hidden');
            const floatingBall = topBallElement.cloneNode(true);
            floatingBall.classList.remove('hidden');
            floatingBall.classList.add('floating-ball');
            document.body.appendChild(floatingBall);
            const ballRect = topBallElement.getBoundingClientRect();
            floatingBall.style.left = `${ballRect.left}px`;
            floatingBall.style.top = `${ballRect.top}px`;

            setTimeout(async () => {
                await animateBallMove(fromIndex, toIndex, true);
                resolve();
            }, 10);
        });
    }

    restartButton.addEventListener('click', setupNewGame);
    undoButton.addEventListener('click', handleUndo);
    autosolveButton.addEventListener('click', () => {
        autosolveButton.disabled = true;
        restartButton.disabled = true;
        undoButton.disabled = true;

        // Use a timeout to allow the UI to update to the disabled button state
        setTimeout(() => {
            const solution = findSolution();
            if (solution) {
                executeSolution(solution);
            } else {
                alert("Keine Lösung gefunden! Das sollte nicht passieren.");
                restartButton.disabled = false;
                undoButton.disabled = moveHistory.length > 0;
                autosolveButton.disabled = false;
            }
        }, 50);
    });

    difficultyContainer.addEventListener('click', (e) => {
        if (e.target.tagName === 'BUTTON' && !isAnimating) {
            currentDifficulty = e.target.dataset.difficulty;
            document.querySelectorAll('#difficulty-container button').forEach(btn => btn.classList.remove('active'));
            e.target.classList.add('active');
            setupNewGame();
        }
    });

    playAgainButton.addEventListener('click', () => {
        clearInterval(confettiInterval);
        setupNewGame();
    });

    deadlockRestartButton.addEventListener('click', () => {
        clearInterval(confettiInterval);
        deadlockOverlay.classList.remove('show');
        setupNewGame();
    });

    extremeToggle.addEventListener('change', () => {
        isExtremeMode = extremeToggle.checked;
        setupNewGame();
    });

    setupNewGame();
});
