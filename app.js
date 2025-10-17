document.addEventListener('DOMContentLoaded', () => {
    // --- Global State ---
    let nextTaskId = 0; // Initialize a counter for unique IDs

    // Načteme úkoly. Upravíme je, aby měly ID, pokud staré úkoly ID neměly.
    let tasks = JSON.parse(localStorage.getItem('tasks')) || [];
    // Zajistíme, že každý úkol má unikátní ID a nastavíme nextTaskId
    tasks = tasks.map(task => {
        if (task.id === undefined) { // Check for undefined, not just falsy
            task.id = nextTaskId++;
        } else {
            // Zajistíme, že nextTaskId je vyšší než jakékoli existující ID
            if (task.id >= nextTaskId) {
                nextTaskId = task.id + 1;
            }
        }
        return task;
    });

    let currentFilter = 'all';
    let selectedTaskIndex = null; // This will now store the unique ID of the selected task
    const coachQuestions = [
        { q: "Co můžeš udělat právě teď?", type: "text" },
        { q: "Co potřebuješ k vyhotovení úkolu?", type: "text" },
        { q: "Co ti brání začít?", type: "text" },
        { q: "Je úkol příliš velký a je potřeba ho rozdělit, abys mohl pokračovat?", type: "select", options: ["Ne", "Ano, rozdělit"] },
        { q: "Podrobně rozepiš, jak jej rozdělíš.", type: "text" },
        { q: "Jaký je tvůj první krok?", type: "text" }
    ];
    let currentQuestionIndex = 0;

    // --- Pomodoro State ---
    let pomodoroTimer;
    const WORK_TIME = 25 * 60; // 25 minutes
    const BREAK_TIME = 5 * 60; // 5 minutes
    let timeRemaining = WORK_TIME;
    let isRunning = false;
    let isBreak = false; // true for break, false for work
    let completedCycles = 0; // To track completed Pomodoro cycles (for dots)
    const MAX_CYCLES = 4; // Total cycles to display (dots)

    let breathingInterval;
    const BREATHING_PATTERN = [
        { instruction: "Nádech", duration: 4, animationClass: "breathing-in", alertIcon: "arrow-up" },
        { instruction: "Zadrž", duration: 7, animationClass: "" },
        { instruction: "Výdech", duration: 8, animationClass: "breathing-out", alertIcon: "arrow-down"},
        { instruction: "Zadrž", duration: 0, animationClass: "" }
    ];
    let currentBreathingPhaseIndex = 0;
    let breathingPhaseTimeRemaining = 0;
    let isBreathingRunning = false;

    // --- Music State ---
    let player; // YouTube Player object
    const playlists = {
        work: 'amfWIRasxtI', 
        relax: '9uIk_91GQYI'
    };
    let currentPlaylistId = playlists.work;
    let userSelectedManualPlaylist = null;

    // --- DOM Elements (Declared once) ---
    const taskInput = document.getElementById('new-task-input');
    const addTaskBtn = document.getElementById('add-task-button');
    const taskList = document.getElementById('task-list');
    const filterButtons = document.querySelectorAll('.filters button');
    const pickRandomTaskBtn = document.getElementById('pick-random-task');
    const coachPanel = document.getElementById('coach-panel');
    const selectedTaskDisplay = document.getElementById('selected-task');
    const coachQuestionsDiv = document.getElementById('coach-questions');
    const coachResponseArea = document.getElementById('coach-response-area');
    const nextCoachQuestionBtn = document.getElementById('next-coach-question');

    // Pomodoro DOM elements
    const pomodoroTimerDisplay = document.getElementById('pomodoro-timer-display'); // Now refers to the wrapping div
    const actualTimerText = document.getElementById('actual-timer-text'); // ELEMENT PRO ČAS
    const pomodoroModeText = document.getElementById('pomodoro-mode');
    const pomodoroModeIcon = document.getElementById('pomodoro-icon');

    const pomodoroMainButton = document.getElementById('pomodoro-main-button');
    const resetTimerBtn = document.getElementById('reset-timer');
    const pomodoroProgressRingFg = document.querySelector('.pomodoro-progress-ring-fg');
    const pomodoroCycleIndicators = document.getElementById('pomodoro-cycle-indicators');

    // Změna: Reference na span.icon a span.text uvnitř pomodoroMainButton
    const pomodoroMainIcon = pomodoroMainButton.querySelector('.icon');
    const pomodoroMainText = pomodoroMainButton.querySelector('.text');


    // Music DOM elements
    const playlistSelector = document.getElementById('playlist-selector');
    const playMusicButton = document.getElementById('play-music-button');
    const pauseMusicButton = document.getElementById('pause-music-button');

    // Dýchací Kouč DOM elementy
    const breathingCircle = document.getElementById('breathing-circle');
    const breathingInstructionDisplay = document.getElementById('breathing-instruction');
    const startBreathingBtn = document.getElementById('start-breathing');
    const resetBreathingBtn = document.getElementById('reset-breathing');

    const themeToggleBtn = document.getElementById('theme-toggle');
    const scrollToTasksBtn = document.getElementById('scroll-to-tasks');

    // --- Utility Functions ---
    function saveTasks() {
        localStorage.setItem('tasks', JSON.stringify(tasks));
        localStorage.setItem('nextTaskId', nextTaskId); // Save nextTaskId as well
    }

    function formatTime(seconds) {
        const minutes = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${minutes < 10 ? '0' : ''}${minutes}:${secs < 10 ? '0' : ''}${secs}`;
    }

    // --- Task Management (CRUD) ---
    function renderTasks() {
        taskList.innerHTML = '';

        const filteredTasks = tasks.filter(task => {
            if (currentFilter === 'active') return !task.completed;
            if (currentFilter === 'completed') return task.completed;
            return true;
        });

        if (filteredTasks.length === 0 && currentFilter === 'all') {
            taskList.innerHTML = '<p style="text-align: center; opacity: 0.7; margin-top: 2rem;">Zatím žádné úkoly. Přidej si první!</p>';
        } else if (filteredTasks.length === 0) {
            taskList.innerHTML = `<p style="text-align: center; opacity: 0.7; margin-top: 2rem;">Žádné ${currentFilter === 'active' ? 'aktivní' : 'splněné'} úkoly.</p>`;
        }

        filteredTasks.forEach((task) => {
            const taskElement = document.createElement('li');
            taskElement.className = `task ${task.completed ? 'completed' : ''} fade-in`;
            taskElement.setAttribute('data-id', task.id); // Use unique ID for data-id

            taskElement.innerHTML = `
                <span class="task-text">${task.text}</span>
                <div class="task-actions">
                    <button class="toggle-complete-btn" title="${task.completed ? 'Označit jako nesplněné' : 'Označit jako splněné'}">${task.completed ? '⟳' : '✔️'}</button>
                    <button class="edit-task-btn" title="Upravit úkol">🖋️</button>
                    <button class="delete-task-btn" title="Smazat úkol">🗑️</button>
                </div>
            `;
            taskList.appendChild(taskElement);
        });
    }


    // Event delegation for task actions
    taskList.addEventListener('click', (e) => {
        const target = e.target;
        const taskElement = target.closest('.task');
        if (!taskElement) return;

        const taskId = parseFloat(taskElement.getAttribute('data-id')); // Get unique ID

        if (target.classList.contains('toggle-complete-btn')) {
            toggleComplete(taskId);
        } else if (target.classList.contains('edit-task-btn')) {
            editTask(taskId);
        } else if (target.classList.contains('delete-task-btn')) {
            deleteTask(taskId);
        }
    });

    taskList.addEventListener('dblclick', (e) => {
        const target = e.target;
        if (target.classList.contains('task-text')) {
            const taskElement = target.closest('.task');
            if (taskElement) {
                const taskId = parseFloat(taskElement.getAttribute('data-id'));
                makeTaskEditable(target, taskId);
            }
        }
    });

    function addTask() {
        const text = taskInput.value.trim();
        if (!text) return;

        tasks.push({ id: nextTaskId++, text, completed: false, notes: [] });
        taskInput.value = '';
        saveTasks();
        renderTasks();
    }

    // Helper to find task index by its unique ID
    function findTaskIndexById(taskId) {
        return tasks.findIndex(task => task.id === taskId);
    }

    function toggleComplete(taskId) {
        const index = findTaskIndexById(taskId);
        if (index !== -1) {
            tasks[index].completed = !tasks[index].completed;
            saveTasks();
            renderTasks();
        }
    }

    function makeTaskEditable(spanElement, taskId) {
        const index = findTaskIndexById(taskId);
        if (index === -1) return;

        spanElement.setAttribute('contenteditable', 'true');
        spanElement.focus();
        const range = document.createRange();
        range.selectNodeContents(spanElement);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);

        spanElement.addEventListener('blur', () => {
            spanElement.removeAttribute('contenteditable');
            if (tasks[index]) {
                tasks[index].text = spanElement.innerText.trim();
                saveTasks();
                renderTasks();
            }
        }, { once: true });

        spanElement.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                spanElement.blur();
            }
        }, { once: true });
    }

    function editTask(taskId) {
        const index = findTaskIndexById(taskId);
        if (index === -1) return;

        const taskElement = document.querySelector(`.task[data-id="${taskId}"] .task-text`);
        if (taskElement) {
            makeTaskEditable(taskElement, taskId);
        } else {
            const newText = prompt("Upravit úkol:", tasks[index].text);
            if (newText !== null && newText.trim() !== '') {
                tasks[index].text = newText.trim();
                saveTasks();
                renderTasks();
            }
        }
    }

    // MAZÁNÍ S UNIKÁTNÍMI ID A SweetAlert2
    function deleteTask(taskIdToDelete) {
        Swal.fire({
            title: 'Opravdu chcete smazat tento úkol?',
            text: "Tato akce je nevratná",
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#4caf50',
            cancelButtonColor: '#eaa500',
            confirmButtonText: 'Ano, smazat',
            cancelButtonText: 'Zrušit',
            customClass: {
                popup: 'swal2-dark-mode-popup', 
                confirmButton: 'swal2-confirm-button',
                cancelButton: 'swal2-cancel-button'
            }
        }).then((result) => {
            if (result.isConfirmed) {
                const taskElement = document.querySelector(`.task[data-id="${taskIdToDelete}"]`);

                if (taskElement) {
                    taskElement.classList.add('slide-out-left');

                    taskElement.addEventListener('animationend', () => {
                        const index = findTaskIndexById(taskIdToDelete);
                        if (index !== -1) {
                            tasks.splice(index, 1);
                            saveTasks();
                            renderTasks(); // Re-render to update DOM and data-id attributes
                        }
                    }, { once: true });
                } else {
                    // Fallback if element not found (e.g., due to filtering/invisibility)
                    const index = findTaskIndexById(taskIdToDelete);
                    if (index !== -1) {
                        tasks.splice(index, 1);
                        saveTasks();
                        renderTasks();
                    }
                }
                Swal.fire(
                    'Smazáno!',
                    'Váš úkol byl smazán.',
                    'success',
                    
                    { 
                        customClass: {
                            popup: 'swal2-dark-mode-popup'
                        }
                    } 
                );
            }
        });
    }

    // --- Filtering ---
    filterButtons.forEach(button => {
        button.addEventListener('click', () => {
            filterButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            currentFilter = button.dataset.filter;
            renderTasks();
        });
    });

    // --- Coach Functionality ---
    function pickRandomTask() {
        const activeTasks = tasks.filter(t => !t.completed);
        if (activeTasks.length === 0) {
            Swal.fire({
                icon: 'info',
                title: 'Nemáte zatím žádné aktivní úkoly',
                text: 'Pro výběr náhodného úkolu musíte mít alespoň jeden aktivní úkol.',
                confirmButtonText: 'OK',
                customClass: {
                    popup: 'swal2-dark-mode-popup',
                    confirmButton: 'swal2-confirm-button'
                }
            });
            return;
        }

        const randomIndex = Math.floor(Math.random() * activeTasks.length);
        const selectedTask = activeTasks[randomIndex];

        selectedTaskIndex = selectedTask.id; // Store ID of the selected task

        selectedTaskDisplay.innerText = `🎯 ${selectedTask.text}`;
        coachPanel.classList.add('active');
        currentQuestionIndex = 0;
        displayCoachQuestion();
        nextCoachQuestionBtn.style.display = 'block';
    }

    function displayCoachQuestion() {
        if (currentQuestionIndex < coachQuestions.length) {
            const question = coachQuestions[currentQuestionIndex];
            coachQuestionsDiv.innerHTML = `<p>${question.q}</p>`;
            coachResponseArea.innerHTML = '';

            if (question.type === "text") {
                const textarea = document.createElement('textarea');
                textarea.placeholder = 'Tvoje odpověď...';
                textarea.id = 'coach-input';
                coachResponseArea.appendChild(textarea);
            } else if (question.type === "select") {
                const select = document.createElement('select');
                select.id = 'coach-input';
                question.options.forEach(optionText => {
                    const option = document.createElement('option');
                    option.value = optionText;
                    option.innerText = optionText;
                    select.appendChild(option);
                });
                coachResponseArea.appendChild(select);
            }
        } else {
            coachQuestionsDiv.innerHTML = `<p style="text-align: center; font-style: normal;">Koučink dokončen 🎉</p>`;
            coachResponseArea.innerHTML = '';
            nextCoachQuestionBtn.style.display = 'none';
        }
    }

    function saveCoachResponse() {
        const inputElement = document.getElementById('coach-input');
        const taskIndex = findTaskIndexById(selectedTaskIndex); // Find task by its ID
        if (inputElement && taskIndex !== -1 && tasks[taskIndex]) {
            const response = inputElement.value;
            if (response) {
                if (!tasks[taskIndex].notes) {
                    tasks[taskIndex].notes = [];
                }
                tasks[taskIndex].notes.push({
                    q: coachQuestions[currentQuestionIndex].q,
                    a: response,
                    timestamp: new Date().toISOString()
                });
                saveTasks();
            }
        }
    }

    nextCoachQuestionBtn.addEventListener('click', () => {
        saveCoachResponse();
        currentQuestionIndex++;
        displayCoachQuestion();
    });

    // --- Pomodoro Timer ---

    // SVG circle circumference for progress animation
    const circumference = pomodoroProgressRingFg.r.baseVal.value * 2 * Math.PI;
    pomodoroProgressRingFg.style.strokeDasharray = `${circumference} ${circumference}`;
    pomodoroProgressRingFg.style.strokeDashoffset = 0; // Start fully filled (empty progress)

    function setProgress(percent) {
        const offset = ((100 - percent) / 100) * circumference; 
        pomodoroProgressRingFg.style.strokeDashoffset = offset;
    }

    function updatePomodoroDisplay() {
        // Zde je KLÍČOVÁ ZMĚNA: aktualizujeme přímo actualTimerText
        actualTimerText.textContent = formatTime(timeRemaining);

        const totalTime = isBreak ? BREAK_TIME : WORK_TIME;
        const percent = (timeRemaining / totalTime) * 100;
        setProgress(percent);

        pomodoroModeText.textContent = isBreak ? "Odpočinek" : "Práce"; 
        pomodoroModeIcon.textContent = isBreak ? "🌱" : "🖥️";

        if (isRunning) {
            pomodoroModeIcon.classList.add('animate__pulse'); // Přidá animaci pulse
        } else {
            pomodoroModeIcon.classList.remove('animate__pulse'); // Odebere animaci, když je zastaveno
        }
        // Upravená logika pro změnu ikony a textu hlavního tlačítka
        if (isRunning) {
            pomodoroMainIcon.textContent = '⏸'; 
            pomodoroMainText.textContent = 'Pauza';
            resetTimerBtn.style.display = 'none';
        } else {
            pomodoroMainIcon.textContent = '▶'; 
            if (timeRemaining === totalTime) {
                pomodoroMainText.textContent = 'Start';
            } else {
                pomodoroMainText.textContent = 'Pokračovat';
            }
            resetTimerBtn.style.display = '';
        }
    }

    function startPomodoro() {
        if (isRunning) {
            pausePomodoro();
            return;
        }

        isRunning = true;
        updatePomodoroDisplay(); // Okamžitá aktualizace vzhledu při spuštění
        playMusicForMode();

        pomodoroTimer = setInterval(() => {
            timeRemaining--;

            if (timeRemaining < 0) { // aby nedošlo k zobrazení 00:00 na chvíli
                clearInterval(pomodoroTimer);
                isRunning = false;
                updatePomodoroDisplay();
                changePlaylistBasedOnMode();
                startPomodoro(); 

                // Play a sound for notification (uncomment and provide a path if you have one)
                // new Audio('path/to/notification.mp3').play();

                if (!isBreak) { // Byl to pracovní cyklus
                    completedCycles++;
                    updateCycleIndicators();
                    // Zpráva pro konec pracovního cyklu a start přestávky
                    Swal.fire({
                        icon: 'success',
                        title: 'Pracovní cyklus dokončen!',
                        text: 'Nyní začíná ' + (completedCycles >= MAX_CYCLES ? 'dlouhá přestávka' : 'krátká přestávka') + '.',
                        confirmButtonText: 'Pokračovat',
                        timer: 3000, // Zobrazí se na 3 sekundy
                        timerProgressBar: true,
                        customClass: {
                            popup: 'swal2-dark-mode-popup',
                            confirmButton: 'swal2-confirm-button'
                        },
                        didOpen: () => {
                            Swal.showLoading();
                        }
                    }).then((result) => {
                         // Pokud uživatel zavře dříve nebo timer vyprší
                        if (result.dismiss === Swal.DismissReason.timer || result.isConfirmed) {
                            isBreak = true;
                            timeRemaining = BREAK_TIME; // Nastaví čas pro přestávku
                            if (completedCycles >= MAX_CYCLES) {
                                // Zde byste mohli nastavit delší přestávku, např. timeRemaining = LONG_BREAK_TIME;
                                // pro zjednodušení jen resetujeme cykly a pokracujeme s normalni prestavkou
                                Swal.fire({
                                    icon: 'success',
                                    title: 'Všechny Pomodoro cykly dokončeny!',
                                    text: 'Udělej si delší přestávku.',
                                    confirmButtonText: 'OK',
                                    customClass: {
                                        popup: 'swal2-dark-mode-popup',
                                        confirmButton: 'swal2-confirm-button'
                                    }
                                });
                                completedCycles = 0; // Reset cyklů po dlouhé přestávce
                                updateCycleIndicators();
                            }
                            updatePomodoroDisplay(); // Zobrazí nový režim a čas
                            playMusicForMode(); // Přepne hudbu
                            startPomodoro(); // Automaticky spustí další cyklus
                        }
                    });

                } else { // Byla to přestávka
                    // Zpráva pro konec přestávky a start pracovního cyklu
                    Swal.fire({
                        icon: 'info',
                        title: 'Přestávka skončila!',
                        text: 'Zpět k práci.',
                        confirmButtonText: 'Pokračovat',
                        timer: 3000, // Zobrazí se na 3 sekundy
                        timerProgressBar: true,
                        customClass: {
                            popup: 'swal2-dark-mode-popup',
                            confirmButton: 'swal2-confirm-button'
                        },
                        didOpen: () => {
                            Swal.showLoading();
                        }
                    }).then((result) => {
                        if (result.dismiss === Swal.DismissReason.timer || result.isConfirmed) {
                            isBreak = false;
                            timeRemaining = WORK_TIME; // Nastaví čas pro práci
                            updatePomodoroDisplay(); // Zobrazí nový režim a čas
                            playMusicForMode(); // Přepne hudbu
                            startPomodoro(); // Automaticky spustí další cyklus
                        }
                    });
                }
            } else { // Časovač stále běží, jen aktualizujeme display
                updatePomodoroDisplay();
            }
        }, 1000);
    }

    function pausePomodoro() {
        clearInterval(pomodoroTimer);
        isRunning = false;
        updatePomodoroDisplay();
        if (player && player.pauseVideo) {
            player.pauseVideo();
        }
    }

    function resetPomodoro() {
        clearInterval(pomodoroTimer);
        isRunning = false;
        isBreak = false; // Reset to work mode
        timeRemaining = WORK_TIME;
        completedCycles = 0; // Reset cycles
        updatePomodoroDisplay();
        updateCycleIndicators(); // Reset dots
        if (player && player.stopVideo) {
            player.stopVideo();
        }
        playlistSelector.value = 'work'; // Reset playlist selector
        currentPlaylistId = playlists.work; // Reset current playlist ID
        userSelectedManualPlaylist = null; // Clear manual selection
    }

    function updateCycleIndicators() {
        pomodoroCycleIndicators.innerHTML = '';
        for (let i = 0; i < MAX_CYCLES; i++) {
            const dot = document.createElement('span');
            dot.classList.add('cycle-dot');
            if (i < completedCycles) {
                dot.classList.add('active');
            }
            pomodoroCycleIndicators.appendChild(dot);
        }
    }

    function updateBreathingDisplay() {
        const currentPhase = BREATHING_PATTERN[currentBreathingPhaseIndex];
        breathingInstructionDisplay.textContent = `${currentPhase.instruction}`;
        breathingCircle.classList.remove("breathing-in", "breathing-out");
        if (currentPhase.animationClass) {
            breathingCircle.style.animationDuration = `${currentPhase.duration}s`;
            breathingCircle.classList.add(currentPhase.animationClass);
        } else {
            breathingCircle.style.animationDuration = `0s`;
            breathingCircle.style.transform = (currentBreathingPhaseIndex === 1) ? 'scale(1)' : 'scale(0.8)';
        }
    }
    
    function startBreathingCoach() {
        if (isBreathingRunning) {
            stopBreathingCoach();
            return;
        }
    
        isBreathingRunning = true;
        startBreathingBtn.textContent = "Stop dýchání";
        resetBreathingBtn.style.display = 'none';
    
        currentBreathingPhaseIndex = 0;
        breathingPhaseTimeRemaining = BREATHING_PATTERN[currentBreathingPhaseIndex].duration;
        updateBreathingDisplay();
    
        breathingInterval = setInterval(() => {
            breathingPhaseTimeRemaining--;
    
            if (breathingPhaseTimeRemaining < 0) {
                currentBreathingPhaseIndex++;
                if (currentBreathingPhaseIndex >= BREATHING_PATTERN.length) {
                    currentBreathingPhaseIndex = 0;
                }
                breathingPhaseTimeRemaining = BREATHING_PATTERN[currentBreathingPhaseIndex].duration;
                updateBreathingDisplay();
            }
        }, 1000);
    }
    
    function updateBreathingDisplay() {
        const currentPhase = BREATHING_PATTERN[currentBreathingPhaseIndex];
        breathingInstructionDisplay.textContent = `${currentPhase.instruction}`;
        breathingCircle.classList.remove("breathing-in", "breathing-out");
        if (currentPhase.animationClass) {
            breathingCircle.style.animationDuration = `${currentPhase.duration}s`;
            breathingCircle.classList.add(currentPhase.animationClass);
        } else {
            breathingCircle.style.animationDuration = `0s`;
            breathingCircle.style.transform = (currentBreathingPhaseIndex === 1) ? 'scale(1)' : 'scale(0.8)';
        }
    }
    
    function startBreathingCoach() {
        if (isBreathingRunning) {
            stopBreathingCoach();
            return;
        }
    
        isBreathingRunning = true;
        startBreathingBtn.textContent = "Stop dýchání";
        resetBreathingBtn.style.display = 'none';
    
        currentBreathingPhaseIndex = 0;
        breathingPhaseTimeRemaining = BREATHING_PATTERN[currentBreathingPhaseIndex].duration;
        updateBreathingDisplay();
    
        breathingInterval = setInterval(() => {
            breathingPhaseTimeRemaining--;
    
            if (breathingPhaseTimeRemaining < 0) {
                currentBreathingPhaseIndex++;
                if (currentBreathingPhaseIndex >= BREATHING_PATTERN.length) {
                    currentBreathingPhaseIndex = 0;
                }
                breathingPhaseTimeRemaining = BREATHING_PATTERN[currentBreathingPhaseIndex].duration;
                updateBreathingDisplay();
            }
        }, 1000);
    }
    
    function stopBreathingCoach() {
        clearInterval(breathingInterval);
        isBreathingRunning = false;
        startBreathingBtn.textContent = "Start dýchání";
        resetBreathingBtn.style.display = 'inline-block';
        breathingCircle.classList.remove("breathing-in", "breathing-out");
        breathingCircle.style.animationDuration = `0s`;
        breathingCircle.style.transform = 'scale(0.8)';
        breathingInstructionDisplay.textContent = "Dýchání pozastaveno.";
    }
    
    function resetBreathingCoach() {
        stopBreathingCoach();
        currentBreathingPhaseIndex = 0;
        breathingPhaseTimeRemaining = BREATHING_PATTERN[0].duration;
        breathingInstructionDisplay.textContent = "Připravit se...";
        startBreathingBtn.textContent = "Start dýchání";
        resetBreathingBtn.style.display = 'none';
        breathingCircle.style.transform = 'scale(0.8)';
    }    

    // --- Music Player Functionality ---

    // This function is called by the YouTube IFrame API when it's ready
    window.onYouTubeIframeAPIReady = function() {
        player = new YT.Player('youtube-player', {
            height: '225',
            width: '100%',
            videoId: 'amfWIRasxtI',
            playerVars: {
                'playsinline': 1,
                'autoplay': 0, // Control autoplay manually
                'loop': 1,
            },
            events: {
                'onReady': onPlayerReady,
                'onStateChange': onPlayerStateChange
            }
        });
    };

    function onPlayerReady(event) {
        console.log("YouTube Player je připraven.");
        player.loadPlaylist({
            list: currentPlaylistId,
            listType: 'playlist',
            index: 0,
            startSeconds: 0
        });
        player.setLoop(true);
    }

    function onPlayerStateChange(event) {
        // You can add logic here based on player state (e.g., buffering, ended)
    }

    function loadAndPlayPlaylist(playlistId) {
        if (player && player.loadPlaylist) {
            if (player.getPlaylistId() !== playlistId) {
                player.loadPlaylist({
                    list: playlistId,
                    listType: 'playlist',
                    index: 0,
                    startSeconds: 0
                });
            }
            player.playVideo();
        }
    }

    function playMusic() {
        if (player && player.playVideo) {
            player.playVideo();
        }
    }

    function pauseMusic() {
        if (player && player.pauseVideo) {
            player.pauseVideo();
        }
    }

    function playMusicForMode() {
        let targetPlaylistKey;
        if (userSelectedManualPlaylist && userSelectedManualPlaylist !== 'work' && userSelectedManualPlaylist !== 'relax') {
            targetPlaylistKey = userSelectedManualPlaylist;
        } else {
            targetPlaylistKey = isBreak ? 'relax' : 'work';
        }

        playlistSelector.value = targetPlaylistKey;
        const newPlaylistId = playlists[targetPlaylistKey];

        if (newPlaylistId) {
            if (newPlaylistId && newPlaylistId !== currentPlaylistId) {
                currentPlaylistId = newPlaylistId;
                loadAndPlayPlaylist(currentPlaylistId);
            } else if (player && player.getPlayerState() !== 1) {
                player.playVideo();
            }
        } else {
            console.warn(`Playlist for key '${targetPlaylistKey}' not found.`);
            if (player && player.pauseVideo) {
                player.pauseVideo();
            }
        }
    }

    function changePlaylistBasedOnMode() {
        if (isBreak) {
            currentPlaylistId = playlists.relax;
        } else {
            currentPlaylistId = playlists.work;
        }
        player.loadPlaylist({ list: currentPlaylistId, listType: 'playlist', index: 0 });
    }

    // function loadAndPlayPlaylist(playlistId) {
    //     if (player && player.loadPlaylist) {
    //         player.loadPlaylist({ list: playlistId, listType: 'playlist', index: 0 });
    //         // Video se spustí, když playlist načte
    //     }
    // }

    // playlistSelector.addEventListener('change', (e) => {
    //     const selectedKey = e.target.value; // například 'work' nebo 'relax'
    //     userSelectedManualPlaylist = selectedKey;
    //     const newPlaylistId = playlists[selectedKey];
    //     loadAndPlayPlaylist(newPlaylistId);
    // });

    // --- Theme Toggle ---
    themeToggleBtn.addEventListener('click', () => {
        document.body.classList.toggle('light-theme');
        if (document.body.classList.contains('light-theme')) {
            localStorage.setItem('theme', 'light');
        } else {
            localStorage.setItem('theme', 'dark');
        }
    });

    // Apply saved theme on load
    if (localStorage.getItem('theme') === 'light') {
        document.body.classList.add('light-theme');
    }

    // --- Scroll to Tasks ---
    scrollToTasksBtn.addEventListener('click', () => {
        document.querySelector('.todo-section').scrollIntoView({
            behavior: 'smooth'
        });
    });

    // --- Initial Render & Event Listeners ---
    const savedNextTaskId = localStorage.getItem('nextTaskId');
    if (savedNextTaskId) {
        nextTaskId = parseInt(savedNextTaskId);
    }

    addTaskBtn.addEventListener('click', addTask);
    taskInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') addTask();
    });
    pickRandomTaskBtn.addEventListener('click', pickRandomTask);

    // Pomodoro Event Listeners
    pomodoroMainButton.addEventListener('click', startPomodoro);
    resetTimerBtn.addEventListener('click', resetPomodoro);

    // Music Event Listeners
    playlistSelector.addEventListener('change', (e) => {
        userSelectedManualPlaylist = e.target.value;
        currentPlaylistId = playlists[userSelectedManualPlaylist];
        loadAndPlayPlaylist(currentPlaylistId);
    });
    playMusicButton.addEventListener('click', playMusic);
    pauseMusicButton.addEventListener('click', pauseMusic);

    renderTasks();
    updatePomodoroDisplay();
    updateCycleIndicators();
});

