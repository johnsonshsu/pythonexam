// app.js
let questions = [];
let quizQuestions = [];
let current = 0;
let score = 0;
let total = 0;
let timerInterval;
let startTime = 0;
let wrongQuestions = [];
let answerOrder = 'original'; // 新增答案順序全域變數
let answers = {}; // 新增：記錄每題最新作答狀態

let examDuration = 60; // 單位：分鐘
let remainTime = 0;
let remainTimerInterval;

const setupSection = document.getElementById('setup-section');
const quizSection = document.getElementById('quiz-section');
const resultSection = document.getElementById('result-section');
const questionText = document.getElementById('question-text');
const questionImage = document.getElementById('question-image');
const optionsForm = document.getElementById('options-form');
const feedback = document.getElementById('feedback');
const scoreDiv = document.getElementById('score');

let optionListPerQuestion = {}; // 新增：記錄每題選項順序

// 新增：處理反引號(`)包圍的文本，轉換為 <code> 標籤
function formatBacktickText(text) {
    if (!text) return '';

    // 不處理已有 <pre><code> 的內容，先將其替換為臨時標記
    let tempMarkers = [];
    let tempText = text;

    // 先找出並暫存所有的 <pre><code> 區塊
    const preCodeRegex = /(<pre><code.*?>[\s\S]*?<\/code><\/pre>)/g;
    let match;
    let index = 0;

    while ((match = preCodeRegex.exec(text)) !== null) {
        const marker = `__CODE_BLOCK_${index}__`;
        tempMarkers.push({ marker, content: match[0] });
        index++;
    }

    // 將 <pre><code> 區塊替換為臨時標記
    tempMarkers.forEach(item => {
        tempText = tempText.replace(item.content, item.marker);
    });

    // 處理反引號文本
    tempText = tempText.replace(/`([^`]+)`/g, '<code>$1</code>');

    // 恢復臨時標記為原來的 <pre><code> 區塊
    tempMarkers.forEach(item => {
        tempText = tempText.replace(item.marker, item.content);
    });

    return tempText;
}

function playSound(type) {
    const soundCheckbox = document.getElementById('enable-sound');
    const enableSoundNow = soundCheckbox && soundCheckbox.checked;
    console.log('[playSound] called, enableSound:', enableSoundNow, 'type:', type);
    if (!enableSoundNow) return;
    let audio;
    if (type === 'success') {
        audio = new Audio('sounds/success.mp3');
    } else if (type === 'error') {
        audio = new Audio('sounds/error.mp3');
    }
    if (audio) {
        try {
            console.log('[playSound] 準備播放', type, audio.src);
            audio.load();
            audio.currentTime = 0;
            audio.volume = 1;
            const playPromise = audio.play();
            if (playPromise) {
                playPromise.then(() => {
                    console.log('[playSound] 播放成功', type);
                }).catch((err) => {
                    console.warn('[playSound] 播放失敗', type, err);
                });
            }
        } catch (err) {
            console.warn('[playSound] 例外', type, err);
        }
    } else {
        console.warn('[playSound] 未建立 audio 物件', type);
    }
}

// 載入題庫
fetch('data/questions.json')
    .then(res => res.json())
    .then(data => {
        questions = data;
        document.getElementById('start-btn').disabled = false;
        // 自動設定題號範圍最大值
        const rangeEndInput = document.getElementById('question-range-end');
        if (rangeEndInput) rangeEndInput.value = data.length;
        // 僅當 setup-section 顯示時才顯示 weighted-list
        if (!setupSection.classList.contains('hidden')) {
            showWeightedQuestionsList();
        }
    });

document.getElementById('start-btn').addEventListener('click', startQuiz);
// 改用事件委派，確保動態產生的 options-form submit 也能觸發
// document.getElementById('options-form').addEventListener('submit', submitAnswer);
document.addEventListener('submit', function (e) {
    if (e.target && e.target.id === 'options-form') {
        submitAnswer(e);
    }
});
document.getElementById('restart-btn').addEventListener('click', () => {
    resetQuizState();
    resultSection.classList.add('hidden');
    quizSection.classList.add('hidden');
    setupSection.classList.remove('hidden');
    showWeightedQuestionsList();
    // 新增：自動 focus 開始按鈕與滾動到頂部
    const startBtn = document.getElementById('start-btn');
    if (startBtn) startBtn.focus();
    window.scrollTo({ top: 0, behavior: 'smooth' });
});

// 新增：結果頁面的「再考一次」按鈕事件處理
document.getElementById('restart-btn-result').addEventListener('click', () => {
    console.log('[restart-btn-result] clicked');
    resetQuizState();
    resultSection.classList.add('hidden');
    quizSection.classList.add('hidden');
    setupSection.classList.remove('hidden');
    showWeightedQuestionsList();
    // 自動 focus 開始按鈕與滾動到頂部
    const startBtn = document.getElementById('start-btn');
    if (startBtn) startBtn.focus();
    window.scrollTo({ top: 0, behavior: 'smooth' });
});

document.getElementById('download-json-btn').addEventListener('click', function () {
    // 取得目前記憶體中的 questions 陣列
    const dataStr = JSON.stringify(questions, null, 4);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'questions.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
});
document.getElementById('preview-json-btn').addEventListener('click', function () {
    // 取得目前記憶體中的 questions 陣列
    const previewContent = document.getElementById('json-preview-content');
    if (previewContent) {
        // 顯示所有題目
        const previewText = JSON.stringify(questions, null, 4);
        previewContent.textContent = previewText;
    }
    // 顯示 Bootstrap modal
    const modal = new bootstrap.Modal(document.getElementById('json-preview-modal'));
    modal.show();
});

function startTimer() {
    const timerDiv = document.getElementById('timer');
    const timerValue = document.getElementById('timer-value');
    timerDiv.classList.remove('hidden');
    startTime = Date.now();
    timerValue.textContent = '00:00';
    timerDiv.style.color = '#495057';
    timerDiv.setAttribute('data-mode', 'elapsed');
    timerDiv.innerHTML = '已用時間：<span id="timer-value">00:00</span>';
    timerInterval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        const min = String(Math.floor(elapsed / 60)).padStart(2, '0');
        const sec = String(elapsed % 60).padStart(2, '0');
        document.getElementById('timer-value').textContent = `${min}:${sec}`;
    }, 1000);
}

function startRemainTimer() {
    const timerDiv = document.getElementById('timer');
    timerDiv.classList.remove('hidden');
    timerDiv.style.color = '#d35400';
    timerDiv.setAttribute('data-mode', 'remain');
    function updateRemain() {
        if (remainTime <= 0) {
            timerDiv.innerHTML = '<span style="color:#e74c3c;">測驗已結束</span>';
            clearInterval(remainTimerInterval);
            // 自動交卷
            showResult();
            return;
        }
        const min = String(Math.floor(remainTime / 60)).padStart(2, '0');
        const sec = String(remainTime % 60).padStart(2, '0');
        timerDiv.innerHTML = `剩餘時間：<span id="remain-timer-value">${min}:${sec}</span>`;
        remainTime--;
    }
    updateRemain();
    remainTimerInterval = setInterval(updateRemain, 1000);
}

function stopTimer() {
    clearInterval(timerInterval);
    clearInterval(remainTimerInterval);
}

// 新增 buildWeightedPool 與 getRandomQuestions，支援題目權重加權隨機抽題
function buildWeightedPool(questions) {
    const pool = [];
    questions.forEach(q => {
        const w = q.weight || 1;
        for (let i = 0; i < w; i++) {
            pool.push(q);
        }
    });
    return pool;
}

function getRandomQuestions(questions, count) {
    const pool = buildWeightedPool(questions);
    const selected = [];
    const usedIds = new Set();
    while (selected.length < count && pool.length > 0) {
        const idx = Math.floor(Math.random() * pool.length);
        const q = pool[idx];
        if (!usedIds.has(q.id)) {
            selected.push(q);
            usedIds.add(q.id);
        }
        // 移除所有該題的分身，避免重複
        for (let i = pool.length - 1; i >= 0; i--) {
            if (pool[i].id === q.id) pool.splice(i, 1);
        }
    }
    return selected;
}

// 合併 startQuiz，並在最前面強制隱藏 weighted-list
function startQuiz() {
    // 強制隱藏高權重題目列表
    const weightedList = document.getElementById('weighted-list');
    if (weightedList) weightedList.style.display = 'none';
    // 讀取答案順序設定
    //const orderRadio = document.querySelector('input[name="answer-order"]:checked');
    //answerOrder = orderRadio ? orderRadio.value : 'original';
    // 預設答案順序為原始順序
    answerOrder = 'original';
    let countValue = document.getElementById('question-count').value;
    let count;
    if (countValue === 'all') {
        count = questions.length;
    } else {
        count = parseInt(countValue, 10);
    }
    // 取得範圍
    let rangeStart = parseInt(document.getElementById('question-range-start').value, 10);
    let rangeEnd = parseInt(document.getElementById('question-range-end').value, 10);
    if (isNaN(rangeStart) || rangeStart < 1) rangeStart = 1;
    if (isNaN(rangeEnd) || rangeEnd < 1) rangeEnd = questions.length;
    if (rangeStart > rangeEnd) [rangeStart, rangeEnd] = [rangeEnd, rangeStart];
    rangeStart = Math.max(1, rangeStart);
    rangeEnd = Math.min(questions.length, rangeEnd);
    // 篩選範圍內題目
    const rangedQuestions = questions.slice(rangeStart - 1, rangeEnd);
    total = Math.min(count, rangedQuestions.length);
    quizQuestions = getRandomQuestions(rangedQuestions, total);
    if (!quizQuestions || quizQuestions.length === 0) {
        alert('⚠️ 無法產生考題，請檢查題號範圍、題數設定或題庫內容！');
        setupSection.classList.remove('hidden');
        quizSection.classList.add('hidden');
        resultSection.classList.add('hidden');
        showWeightedQuestionsList();
        return;
    }
    current = 0;
    score = 0;
    wrongQuestions = [];
    answers = {}; // 開始測驗時清空作答紀錄
    setupSection.classList.add('hidden');
    resultSection.classList.add('hidden');
    quizSection.classList.remove('hidden');
    // 讀取測驗時間
    const durationInput = document.getElementById('exam-duration');
    examDuration = 60;
    if (durationInput) {
        let val = parseInt(durationInput.value, 10);
        if (!isNaN(val) && val > 0) examDuration = val;
    }
    remainTime = examDuration * 60;
    stopTimer();
    // 記錄開始作答時間
    startTime = Date.now();
    // 僅啟動 startRemainTimer，不要同時啟動 startTimer
    if (remainTime > 0) {
        startRemainTimer();
    } else {
        const timerDiv = document.getElementById('timer');
        timerDiv.innerHTML = '<span style="color:#e74c3c;">測驗已結束</span>';
        timerDiv.classList.remove('hidden');
    }
    showQuestion();
}

function showQuestion() {
    // 防呆：若 quizQuestions 為空或 current 超出範圍，顯示錯誤訊息
    if (!quizQuestions || quizQuestions.length === 0 || current < 0 || current >= quizQuestions.length) {
        questionText.innerHTML = '⚠️ 無法載入題目，請檢查題庫設定或題號範圍/題數選擇。';
        questionImage.innerHTML = '';
        optionsForm.innerHTML = '';
        feedback.textContent = '';
        console.error('quizQuestions 為空或 current 超出範圍', { quizQuestions, current });
        return;
    }

    // 強制隱藏高權重題目列表
    const weightedList = document.getElementById('weighted-list');
    if (weightedList) weightedList.style.display = 'none';

    // 清空之前的內容
    feedback.textContent = '';
    optionsForm.innerHTML = '';
    optionsForm.style.display = '';
    optionsForm.classList.remove('hidden'); // 新增：確保答案區塊顯示

    // 取得當前題目
    const q = quizQuestions[current];
    console.log('showQuestion', q);

    // 顯示進度
    const progressDiv = document.getElementById('progress-info');
    progressDiv.textContent = `第 ${current + 1} / ${total} 題　進度：${Math.round(((current + 1) / total) * 100)}%`;

    // 處理題目內容，包含代碼區塊的高亮處理
    // 首先將字面值的 "\n" 替換為真正的換行符，然後再處理代碼區塊
    let processedQuestion = q.question.replace(/\\n/g, '\n');

    // 檢查是否含有代碼區塊標記 <pre><code class="language-xxx">
    if (processedQuestion.includes('<pre><code class="language-')) {
        // 在代碼區塊之外的文本，將 \n 換行符轉換為 <br> 標籤
        // 但保留代碼區塊中的換行，以便正確高亮顯示

        // 先分割 pre 標籤和非 pre 標籤的內容
        const parts = processedQuestion.split(/(<pre><code.*?>[\s\S]*?<\/code><\/pre>)/g);

        // 處理每個部分
        const processedParts = parts.map(part => {
            if (part.startsWith('<pre><code')) {
                // 保留代碼區塊部分不變
                return part;
            } else {
                // 非代碼區塊部分，將換行符轉為 <br>
                return part.replace(/\n/g, '<br>');
            }
        });

        // 將所有部分合併
        questionText.innerHTML = processedParts.join('');
    } else {
        // 將 \n 換行符轉換為 <br> 標籤
        questionText.innerHTML = processedQuestion.replace(/\n/g, '<br>');
    }

    // 圖片
    if (q.image) {
        questionImage.innerHTML = `<img src="${q.image}" alt="題目圖片">`;
    } else {
        questionImage.innerHTML = '';
    }

    // 觸發 Prism.js 語法高亮
    if (typeof Prism !== 'undefined') {
        Prism.highlightAll();
    }

    // 處理選項順序
    if (!Array.isArray(q.options) || q.options.length === 0) {
        questionText.innerHTML = '⚠️ 此題目缺少選項資料，請檢查題庫格式！';
        questionImage.innerHTML = '';
        optionsForm.innerHTML = '';
        feedback.textContent = '';
        console.error('題目缺少 options 欄位或選項為空', q);
        return;
    }

    let optionList = q.options.map((opt, idx) => ({ opt, idx }));
    console.log('optionList:', optionList, 'q:', q);

    // 一般題型才需要隨機化選項，multioption 不需要
    if (q.type !== 'multioption' && answerOrder === 'shuffle') {
        optionList = shuffle(optionList);
    }

    // 記錄本題的 optionList 供 submitAnswer 用
    optionListPerQuestion[current] = optionList;

    // 根據題目類型顯示不同的答題界面
    if (q.type === 'multioption') {
        // 多選下拉式選單處理
        for (let i = 0; i < q.options.length; i++) {
            const wrapper = document.createElement('div');
            wrapper.style.display = 'flex';
            wrapper.style.alignItems = 'center';
            wrapper.style.marginBottom = '15px';

            // 選項序號標籤
            const numberSpan = document.createElement('span');
            numberSpan.textContent = `選項 ${i + 1} 答案：`;
            numberSpan.style.marginRight = '10px';
            numberSpan.style.fontWeight = 'bold';

            // 建立下拉式選單
            const select = document.createElement('select');
            select.id = `select${i}`;
            select.className = 'form-select';
            select.style.width = 'auto';
            select.style.minWidth = '150px';

            // 分割選項文字成為下拉選單項目（使用 | 符號分割）
            const optionTexts = q.options[i].split('|');
            optionTexts.forEach((optText, optIndex) => {
                const option = document.createElement('option');
                option.value = optIndex + 1;  // 1-based 索引
                option.textContent = optText;
                select.appendChild(option);
            });

            // 如果有之前的答案，設定預設值
            if (answers[current] && Array.isArray(answers[current].userAns) && answers[current].userAns[i]) {
                select.value = answers[current].userAns[i];
            }

            wrapper.appendChild(numberSpan);
            wrapper.appendChild(select);
            optionsForm.appendChild(wrapper);
        }
    } else {
        // 單選或複選題處理
        optionList.forEach((item, i) => {
            const id = `opt${i}`;
            const wrapper = document.createElement('div');
            wrapper.style.display = 'flex';
            wrapper.style.alignItems = 'center';
            wrapper.style.marginBottom = '8px';
            const input = document.createElement('input');
            input.type = q.answer.length > 1 ? 'checkbox' : 'radio';
            input.name = 'option';
            input.value = item.idx; // value 設為原始 index
            input.id = id;
            input.style.marginRight = '8px';
            // 自動勾選已作答答案
            if (answers[current] && Array.isArray(answers[current].userAns)) {
                // userAns 為 1-based，input.value 為 0-based idx
                if (answers[current].userAns.includes(item.idx + 1)) {
                    input.checked = true;
                }
            }
            // 新增：選項前加上數字
            const numberSpan = document.createElement('span');
            numberSpan.textContent = (i + 1) + '. ';
            numberSpan.style.marginRight = '4px';
            const label = document.createElement('label');
            label.htmlFor = id;
            // 將選項中的 \n 換行符轉換為 <br> 標籤
            label.innerHTML = item.opt.replace(/\n/g, '<br>');
            label.style.margin = 0;
            wrapper.appendChild(input);
            wrapper.appendChild(numberSpan);
            wrapper.appendChild(label);
            optionsForm.appendChild(wrapper);
        });
    }

    console.log('optionsForm.innerHTML:', optionsForm.innerHTML);

    // 移除舊的 <hr>，避免重複
    Array.from(optionsForm.querySelectorAll('hr')).forEach(hr => hr.remove());

    // 清理任何之前的按鈕列
    const oldBtnRows = document.querySelectorAll('#btn-row');
    oldBtnRows.forEach(row => row.parentNode && row.parentNode.removeChild(row));

    // 添加分隔線
    const hr = document.createElement('hr');
    optionsForm.appendChild(hr);

    // 創建新的按鈕列
    const btnRow = document.createElement('div');
    btnRow.id = 'btn-row';
    btnRow.className = 'mt-3';
    btnRow.style.display = 'flex';
    btnRow.style.justifyContent = 'space-between';
    btnRow.style.alignItems = 'center';

    // 左側：提交按鈕區域
    const leftBtnBox = document.createElement('div');
    leftBtnBox.style.display = 'flex';
    leftBtnBox.style.gap = '12px';

    // 提交按鈕
    const submitBtn = document.createElement('button');
    submitBtn.id = 'submit-btn';
    submitBtn.type = 'submit';
    submitBtn.className = 'btn btn-primary';
    submitBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> 提交答案';
    leftBtnBox.appendChild(submitBtn);

    // 下一題按鈕（預設隱藏）
    const nextBtn = document.createElement('button');
    nextBtn.id = 'next-btn';
    nextBtn.type = 'button';
    nextBtn.className = 'btn btn-warning';
    nextBtn.innerHTML = '<i class="fa-solid fa-arrow-right"></i> 下一題';
    nextBtn.style.display = 'none';
    nextBtn.addEventListener('click', nextQuestion);
    leftBtnBox.appendChild(nextBtn);
    btnRow.appendChild(leftBtnBox);

    // 右側：立即交卷 + 重新開始
    const rightBtnBox = document.createElement('div');
    rightBtnBox.style.display = 'flex';
    rightBtnBox.style.gap = '12px';

    // 立即交卷按鈕
    const submitAllBtn = document.createElement('button');
    submitAllBtn.id = 'submit-all-btn';
    submitAllBtn.type = 'button';
    submitAllBtn.className = 'btn btn-warning';
    submitAllBtn.innerHTML = '<i class="fa-solid fa-flag"></i> 立即交卷';
    submitAllBtn.onclick = function () {
        // 先清空錯題陣列，重新根據當前答案狀態計算
        wrongQuestions = [];

        // 將未作答的題目標記為未作答，重新計算所有錯題
        for (let i = 0; i < total; i++) {
            if (!answers[i]) {
                const q = quizQuestions[i];
                answers[i] = { userAns: [], isCorrect: false };
                wrongQuestions.push({ ...q, userAns: [] });
            } else if (answers[i] && !answers[i].isCorrect) {
                // 已作答但錯誤的題目，確保加入 wrongQuestions
                const q = quizQuestions[i];
                wrongQuestions.push({ ...q, userAns: answers[i].userAns });
            }
        }
        // 顯示測驗結果
        showResult();
    };
    rightBtnBox.appendChild(submitAllBtn);

    // 重新開始按鈕
    const quitBtn = document.createElement('button');
    quitBtn.id = 'quit-btn';
    quitBtn.type = 'button';
    quitBtn.className = 'btn btn-danger';
    quitBtn.innerHTML = '<i class="fa-solid fa-house"></i> 重新開始';
    quitBtn.addEventListener('click', () => {
        quizSection.classList.add('hidden');
        resultSection.classList.add('hidden');
        setupSection.classList.remove('hidden');
        stopTimer();
        showWeightedQuestionsList();
    });
    rightBtnBox.appendChild(quitBtn);
    btnRow.appendChild(rightBtnBox);

    // 將按鈕列添加到表單後面
    optionsForm.appendChild(btnRow);

    // 顯示詳細說明欄位（僅於有設定時）
    let explanationDiv = document.getElementById('explanation');
    if (!explanationDiv) {
        explanationDiv = document.createElement('div');
        explanationDiv.id = 'explanation';
        explanationDiv.style.whiteSpace = 'pre-line';
        explanationDiv.style.marginTop = '22px';
        explanationDiv.style.background = '#f8f8f8';
        explanationDiv.style.borderLeft = '4px solid #3498db';
        explanationDiv.style.padding = '10px 16px';
        explanationDiv.style.display = 'none';
        quizSection.appendChild(explanationDiv);
    }
    // 一律隱藏說明，避免未作答就顯示
    explanationDiv.style.display = 'none';

    // 隱藏繼續按鈕（每次換題都隱藏）
    if (nextBtn) nextBtn.style.display = 'none';

    // 題目動畫淡入
    questionText.classList.remove('show');
    questionImage.classList.remove('show');
    optionsForm.classList.remove('show');
    setTimeout(() => {
        questionText.classList.add('show');
        questionImage.classList.add('show');
        optionsForm.classList.add('show');
    }, 10);

    // 換題時移除回饋動畫
    feedback.classList.remove('show');
    renderQuestionNumberList();
}

function renderQuestionNumberList() {
    let container = document.getElementById('question-number-list');
    if (!container) {
        container = document.createElement('div');
        container.id = 'question-number-list';
        container.style.display = 'flex';
        container.style.flexWrap = 'wrap';
        container.style.gap = '8px';
        container.style.margin = '24px 0 0 0';
        container.style.justifyContent = 'flex-start';
        container.style.alignItems = 'center';
        container.style.userSelect = 'none';
        // 插入到 quiz-section 最下方
        const quizSection = document.getElementById('quiz-section');
        quizSection.appendChild(container);
    }
    container.innerHTML = '';
    for (let i = 0; i < total; i++) {
        const btn = document.createElement('span');
        btn.textContent = i + 1;
        btn.style.display = 'inline-block';
        btn.style.width = '32px';
        btn.style.height = '32px';
        btn.style.lineHeight = '32px';
        btn.style.textAlign = 'center';
        btn.style.borderRadius = '6px';
        btn.style.margin = '2px 2px';
        btn.style.cursor = 'pointer';
        btn.style.fontWeight = 'bold';
        btn.style.fontSize = '1.1em';
        if (answers[i]) {
            btn.style.background = '#27ae60';
            btn.style.color = '#fff';
            btn.style.border = '1px solid #27ae60';
        } else {
            btn.style.background = '#fff';
            btn.style.color = '#222';
            btn.style.border = '1px solid #bbb';
        }
        btn.onclick = () => {
            current = i;
            showQuestion();
        };
        container.appendChild(btn);
    }
}

document.addEventListener('DOMContentLoaded', function () {
    showWeightedQuestionsList(); // 頁面初始載入時顯示高權重題目
});

function showWeightedQuestionsList() {
    const weightedList = document.getElementById('weighted-list');
    if (!weightedList) return;
    // 僅當 setup-section 顯示時才顯示
    if (setupSection.classList.contains('hidden')) {
        weightedList.style.display = 'none';
        return;
    }
    // 過濾高權重題目
    const highWeightQuestions = (questions || []).filter(q => (q.weight || 1) > 1);
    if (highWeightQuestions.length === 0) {
        weightedList.innerHTML = '<div style="color:#888;padding:8px 0;">目前無高權重題目</div>';
        weightedList.style.display = '';
        return;
    }
    // 依權重降冪排序
    highWeightQuestions.sort((a, b) => (b.weight || 1) - (a.weight || 1));
    let html = '<div style="font-weight:bold;margin-bottom:6px;">高權重題目（抽中機率較高）</div>';
    html += '<ul style="padding-left:18px;margin-bottom:0;">';
    highWeightQuestions.forEach(q => {
        html += `<li style="margin-bottom:2px;">
            <span style="color:#2980b9;font-weight:bold;">${q.id}</span>　
            <span>${q.question.replace(/<[^>]+>/g, '').slice(0, 28)}${q.question.length > 28 ? '…' : ''}</span>
            <span style="color:#e67e22;font-size:0.95em;">（權重${q.weight}）</span>
        </li>`;
    });
    html += '</ul>';
    weightedList.innerHTML = html;
    weightedList.style.display = '';
}

// Fisher-Yates 洗牌演算法
function shuffle(array) {
    let m = array.length, t, i;
    while (m) {
        i = Math.floor(Math.random() * m--);
        t = array[m];
        array[m] = array[i];
        array[i] = t;
    }
    return array;
}

// =====================
// submitAnswer: 處理答題與解析顯示，禁止自動回首頁/自動換題
function submitAnswer(e) {
    console.log('submitAnswer called', e);
    if (e) e.preventDefault();
    const q = quizQuestions[current];
    if (!q) return;

    // 取得本題的 optionList（顯示順序）
    const optionList = optionListPerQuestion[current] || q.options.map((opt, idx) => ({ opt, idx }));    // 根據題目類型處理不同的答題界面
    let selected = [];
    let userAns = [];

    if (q.type === 'multioption') {
        // 處理下拉式選單答案
        for (let i = 0; i < q.options.length; i++) {
            const select = document.getElementById(`select${i}`);
            if (select) {
                const value = parseInt(select.value);
                userAns.push(value);  // 1-based 索引存入 userAns
            }
        }
        selected = userAns.map(a => a - 1);  // 轉為 0-based 以便後續處理
    } else {
        // 處理單選或複選題答案
        const inputs = optionsForm.querySelectorAll('input[name="option"]');
        inputs.forEach(input => {
            if (input.checked) selected.push(Number(input.value)); // value = 原始 idx
        });

        // 單選強制只取一個
        if (q.answer.length === 1 && selected.length > 1) selected = [selected[0]];
        userAns = selected.map(i => i + 1);  // 轉為 1-based 存入 userAns
    }

    // 未作答檢查
    if (selected.length === 0 || (q.type === 'multioption' && selected.some(s => s === undefined))) {
        feedback.innerHTML = '<span style="color:#e74c3c;font-weight:bold;">請先選擇答案！</span>';
        feedback.classList.add('show');
        return;
    }

    // 正確答案（原始 idx 陣列，1-based 轉 0-based）
    const correctIdxArr = q.answer.map(a => a - 1);
    const userIdxArr = selected.slice();    // 判斷正確
    let isCorrect;
    if (q.type === 'multioption') {
        // multioption 需要每個位置都對應正確
        isCorrect = userIdxArr.length === correctIdxArr.length &&
            userIdxArr.every((v, i) => v === correctIdxArr[i]);
    } else if (q.type === 'multiple') {
        // multiple 類型，直接使用 answer 陣列作為正確答案的索引
        // 轉為 0-based 索引 (原答案是 1-based)
        const correctIndices = q.answer.map(a => a - 1);
        // 將用戶選擇的選項進行排序比較
        const sortedUserArr = userIdxArr.slice().sort((a, b) => a - b);
        const sortedCorrectArr = correctIndices.sort((a, b) => a - b);
        isCorrect = sortedUserArr.length === sortedCorrectArr.length &&
            sortedUserArr.every((v, i) => v === sortedCorrectArr[i]);
    } else {
        // 一般題目判斷選項是否正確
        const sortedUserArr = userIdxArr.slice().sort((a, b) => a - b);
        const sortedCorrectArr = correctIdxArr.slice().sort((a, b) => a - b);
        isCorrect = sortedUserArr.length === sortedCorrectArr.length &&
            sortedUserArr.every((v, i) => v === sortedCorrectArr[i]);
    }

    // 檢查之前是否已經有答案，如果已經答對過，不要重複計分
    const previouslyAnswered = answers[current] !== undefined;
    const previouslyCorrect = previouslyAnswered && answers[current].isCorrect;

    // 更新答案狀態
    answers[current] = { userAns: userAns, isCorrect };

    // 只有在這題之前沒有答對過，現在答對了，才增加分數
    if (isCorrect && !previouslyCorrect) {
        score++;
    }
    // 如果之前答對了但現在答錯了，需要扣分
    else if (previouslyCorrect && !isCorrect) {
        score--;
    }

    // 更新錯題列表，先移除本題之前的記錄（如果有）
    wrongQuestions = wrongQuestions.filter(wq => wq.id !== q.id);
    // 如果答錯了，添加到錯題列表
    if (!isCorrect) {
        wrongQuestions.push({ ...q, userAns: userAns });
    }

    // 顯示正確/錯誤（客製化提示）
    let feedbackHtml = '';
    if (isCorrect) {
        console.log('[submitAnswer] call playSound success');
        playSound('success');
        feedbackHtml = '<span style="color:#27ae60;font-weight:bold;"><i class="fa-solid fa-circle-check"></i> 恭喜答對！你很棒！</span>';
    } else {
        console.log('[submitAnswer] call playSound error');
        playSound('error');
        feedbackHtml = '<span style="color:#e74c3c;font-weight:bold;"><i class="fa-solid fa-circle-xmark"></i> 答錯了</span>';
    }

    // 根據題目類型顯示不同的答案回饋
    if (q.type === 'multioption') {
        // 顯示下拉式選單題目的答案情況
        if (!isCorrect) {
            const answerTable = document.createElement('table');
            answerTable.className = 'table table-sm mt-2';
            answerTable.style.width = 'auto';

            // 表頭
            const thead = document.createElement('thead');
            const headerRow = document.createElement('tr');
            ['空格', '你的答案', '正確答案'].forEach(header => {
                const th = document.createElement('th');
                th.textContent = header;
                headerRow.appendChild(th);
            });
            thead.appendChild(headerRow);
            answerTable.appendChild(thead);

            // 表格內容
            const tbody = document.createElement('tbody');
            for (let i = 0; i < q.options.length; i++) {
                const tr = document.createElement('tr');

                // 空格編號
                const tdNum = document.createElement('td');
                tdNum.textContent = i + 1;

                // 使用者答案
                const tdUser = document.createElement('td'); const userOptionTexts = q.options[i].split('|');
                tdUser.textContent = userOptionTexts[userAns[i] - 1] || '未選擇';
                if (userAns[i] !== q.answer[i]) {
                    tdUser.style.color = '#e74c3c';
                }

                // 正確答案
                const tdCorrect = document.createElement('td'); const correctOptionTexts = q.options[i].split('|');
                tdCorrect.textContent = correctOptionTexts[q.answer[i] - 1] || '';
                tdCorrect.style.color = '#2980b9';

                tr.appendChild(tdNum);
                tr.appendChild(tdUser);
                tr.appendChild(tdCorrect);
                tbody.appendChild(tr);
            }
            answerTable.appendChild(tbody);

            feedbackHtml += '<div style="margin-top:10px;"><span class="answer-title">答案比對：</span></div>';
            feedbackHtml += answerTable.outerHTML;
        }
    } else {
        // 一般題型答案顯示
        // 顯示正確答案（以 optionList 找出顯示順序的內容）
        let ansText = correctIdxArr.map(idx => {
            const optObj = optionList.find(o => o.idx === idx);
            return optObj ? optObj.opt : (q.options[idx] || '');
        }).join('、');
        // 只有答錯時才顯示正確答案及你的答案
        if (!isCorrect) {
            let userText = userIdxArr.map(idx => {
                const optObj = optionList.find(o => o.idx === idx);
                return optObj ? optObj.opt : (q.options[idx] || '');
            }).join('、');            // 特別處理 multiple 類型題目，直接顯示選項內容而不是索引
            if (q.type === 'multiple') {
                // 獲取正確答案：直接使用 answer 陣列中的索引（轉為 0-based）
                const correctIndices = q.answer.map(a => a - 1);
                // 使用編號和換行來顯示正確答案
                ansText = correctIndices.map((i, index) => {
                    // 在optionList中找到顯示順序的選項索引
                    const displayIndex = optionList.findIndex(o => o.idx === i);
                    return `${displayIndex + 1}. ${q.options[i]}`;
                }).join('<br>');

                // 獲取用戶選擇的答案，同樣使用編號和換行
                userText = selected.map((idx, index) => {
                    // 在optionList中找到顯示順序的選項索引
                    const displayIndex = optionList.findIndex(o => o.idx === idx);
                    return `${displayIndex + 1}. ${q.options[idx]}`;
                }).join('<br>');
            }

            feedbackHtml += `<div style='margin-top:8px;'><b>正確答案：</b><br><span style='color:#2980b9;'>${ansText}</span></div>`;
            feedbackHtml += `<div style='margin-top:4px;'><b>你的答案：</b><br>${userText || '<span style=\'color:#888\'>未作答</span>'}</div>`;
        }
    }    // 顯示詳細解析
    if (q.explanation) {
        // 首先處理字面值的 "\n" 替換為真正的換行符
        let processedExplanation = q.explanation.replace(/\\n/g, '\n');

        // 檢查解析中是否含有代碼區塊
        if (processedExplanation.includes('<pre><code class="language-')) {
            // 處理含有代碼區塊的解析
            const parts = processedExplanation.split(/(<pre><code.*?>[\s\S]*?<\/code><\/pre>)/g);

            // 處理每個部分
            const processedParts = parts.map(part => {
                if (part.startsWith('<pre><code')) {
                    // 代碼區塊部分保持不變
                    return part;
                } else {
                    // 非代碼區塊部分，先處理反引號，再將換行符轉為 <br>
                    return formatBacktickText(part).replace(/\n/g, '<br>');
                }
            });

            feedbackHtml += `<div style='margin-top:12px;'><span class='answer-title'>答案解析：</span><br>${processedParts.join('')}</div>`;
        } else {
            // 沒有代碼區塊，先處理反引號，再將換行符轉為 <br>
            const formattedExplanation = formatBacktickText(processedExplanation);
            feedbackHtml += `<div style='margin-top:12px;'><span class='answer-title'>答案解析：</span><br>${formattedExplanation.replace(/\n/g, '<br>')}</div>`;
        }
    }

    feedback.innerHTML = feedbackHtml;
    feedback.classList.add('show');

    // 觸發 Prism.js 語法高亮
    if (typeof Prism !== 'undefined') {
        setTimeout(() => Prism.highlightAll(), 0);
    }

    // 禁用所有選項
    if (q.type === 'multioption') {
        // 禁用下拉式選單
        for (let i = 0; i < q.options.length; i++) {
            const select = document.getElementById(`select${i}`);
            if (select) select.disabled = true;
        }
    } else {
        // 禁用單選/複選按鈕
        const inputs = optionsForm.querySelectorAll('input[name="option"]');
        inputs.forEach(input => input.disabled = true);
    }

    // 禁用提交按鈕並顯示下一題按鈕
    const submitButtons = optionsForm.querySelectorAll('button[type="submit"]');
    submitButtons.forEach(button => button.style.display = 'none');

    // 建立下一題按鈕
    const nextButton = document.createElement('button');
    nextButton.id = 'next-btn';
    nextButton.className = 'btn btn-secondary';
    nextButton.innerHTML = '<i class="fa-solid fa-arrow-right"></i> 下一題';
    nextButton.addEventListener('click', nextQuestion);
    optionsForm.appendChild(nextButton);
}

// nextQuestion: 處理進入下一題
function nextQuestion() {
    // 隱藏按鈕，避免重複點擊
    const nextBtn = document.getElementById('next-btn');
    if (nextBtn) nextBtn.style.display = 'none';

    // 清空解析與成果顯示區
    feedback.innerHTML = '';

    // 進入下一題
    current++;
    // 如果已到最後一題，顯示結果
    if (current >= total) {
        showResult();
    } else {
        // 否則顯示下一題
        showQuestion();
    }
}

function showResult() {
    stopTimer();
    quizSection.classList.add('hidden');
    resultSection.classList.remove('hidden');
    setupSection.classList.add('hidden');

    // 重新計算分數，確保不超過總題數
    let correctCount = 0;
    for (let i = 0; i < total; i++) {
        if (answers[i] && answers[i].isCorrect) {
            correctCount++;
        }
    }
    // 確保分數不會超過總題數
    score = Math.min(correctCount, total);

    // 分數與正確率
    const percent = total > 0 ? Math.round((score / total) * 100) : 0;
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    const min = String(Math.floor(elapsed / 60)).padStart(2, '0');
    const sec = String(elapsed % 60).padStart(2, '0');
    let html = `<div style="font-size:1.3em;font-weight:bold;">分數：<span style='color:#27ae60;'>${score} / ${total}</span></div>`;
    html += `<div style="font-size:1.1em;">正確率：<span style='color:#2980b9;'>${percent}%</span></div>`;
    html += `<div style="font-size:1.1em;">總用時：<span style='color:#e67e22;'>${min}:${sec}</span></div>`;
    scoreDiv.innerHTML = html;
    // 畫圓形正確率圖
    const ctx = document.getElementById('accuracyChart').getContext('2d');
    if (window.resultChart) window.resultChart.destroy();
    window.resultChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['正確', '錯誤'],
            datasets: [{
                data: [score, total - score],
                backgroundColor: ['#27ae60', '#e74c3c'],
                borderWidth: 2
            }]
        },
        options: {
            cutout: '70%',
            plugins: {
                legend: { display: false },
                tooltip: { enabled: false },
                title: { display: false }
            }
        }
    });
    // 錯題複習區塊（最下方）
    let wrongHtml = '';
    if (wrongQuestions.length > 0) {
        wrongHtml += `<div style='margin:32px 0 0 0;'><h5 style='color:#e74c3c;font-weight:bold;'>錯題複習</h5>`;
        wrongQuestions.forEach((q, idx) => {            // 顯示題目、你的答案、正確答案、解析
            let userAns = '';
            let correctAns = '';

            // 特別處理 multiple 類型題目，顯示編號和換行
            if (q.type === 'multiple') {
                // 使用者答案
                userAns = (q.userAns || []).map((a, index) => {
                    return `${index + 1}. ${q.options[a - 1]}`;
                }).join('<br>');

                // 正確答案
                correctAns = (q.answer || []).map((a, index) => {
                    return `${index + 1}. ${q.options[a - 1]}`;
                }).join('<br>');
            } else {
                // 其他類型題目，使用原有的、號分隔
                userAns = (q.userAns || []).map(a => q.options[a - 1]).join('、');
                correctAns = (q.answer || []).map(a => q.options[a - 1]).join('、');
            }

            wrongHtml += `<div style='border:1px solid #ffe0e0;background:#fff8f8;border-radius:8px;padding:14px 16px;margin-bottom:18px;'>`;// 處理題目內容，先處理字面值 \n
            let processedQuestion = q.question.replace(/\\n/g, '\n');

            // 檢查是否含有代碼區塊
            let questionContent;
            if (processedQuestion.includes('<pre><code class="language-')) {
                // 處理含有代碼區塊的題目
                const parts = processedQuestion.split(/(<pre><code.*?>[\s\S]*?<\/code><\/pre>)/g);

                // 處理每個部分
                const processedParts = parts.map(part => {
                    if (part.startsWith('<pre><code')) {
                        // 代碼區塊部分保持不變
                        return part;
                    } else {
                        // 非代碼區塊部分，將換行符轉為 <br>
                        return part.replace(/\n/g, '<br>');
                    }
                });

                questionContent = processedParts.join('');
            } else {
                // 沒有代碼區塊，直接將換行符轉為 <br>
                questionContent = processedQuestion.replace(/\n/g, '<br>');
            }

            wrongHtml += `<div style='color:#b71c1c;font-weight:bold;'>${idx + 1}. ${questionContent}</div>`;
            if (q.image) {
                wrongHtml += `<div style='margin:8px 0;'><img src='${q.image}' alt='題目圖片' style='max-width:100%;max-height:120px;'></div>`;
            }
            // 如果是 multiple 類型，使用 div 包裹以便有更好的間距
            if (q.type === 'multiple') {
                wrongHtml += `<div><b>你的答案：</b><div style='color:#e67e22;margin-top:4px;margin-left:10px;'>${userAns || '<span style="color:#888;">未作答</span>'}</div></div>`;
                wrongHtml += `<div style='margin-top:8px;'><b>正確答案：</b><div style='color:#2980b9;margin-top:4px;margin-left:10px;'>${correctAns}</div></div>`;
            } else {
                wrongHtml += `<div><b>你的答案：</b><span style='color:#e67e22;'>${userAns || '未作答'}</span></div>`;
                wrongHtml += `<div><b>正確答案：</b><span style='color:#2980b9;'>${correctAns}</span></div>`;
            } if (q.explanation) {
                // 首先處理字面值的 "\n" 替換為真正的換行符
                let processedExplanation = q.explanation.replace(/\\n/g, '\n');

                // 檢查解析中是否含有代碼區塊
                if (processedExplanation.includes('<pre><code class="language-')) {
                    // 處理含有代碼區塊的解析
                    const parts = processedExplanation.split(/(<pre><code.*?>[\s\S]*?<\/code><\/pre>)/g);

                    // 處理每個部分
                    const processedParts = parts.map(part => {
                        if (part.startsWith('<pre><code')) {
                            // 代碼區塊部分保持不變
                            return part;
                        } else {
                            // 非代碼區塊部分，先處理反引號，再將換行符轉為 <br>
                            return formatBacktickText(part).replace(/\n/g, '<br>');
                        }
                    });

                    wrongHtml += `<div style='margin-top:6px;'><b>解析：</b><span style='color:#555;'>${processedParts.join('')}</span></div>`;
                } else {
                    // 沒有代碼區塊，先處理反引號，再將換行符轉為 <br>
                    const formattedExplanation = formatBacktickText(processedExplanation);
                    wrongHtml += `<div style='margin-top:6px;'><b>解析：</b><span style='color:#555;'>${formattedExplanation.replace(/\n/g, '<br>')}</span></div>`;
                }
            }
            wrongHtml += `</div>`;
        });
        wrongHtml += `</div>`;
    } else {
        wrongHtml += `<div style='margin:32px 0 0 0;color:#27ae60;font-weight:bold;'>恭喜全部答對，沒有錯題！</div>`;
    }
    // 插入到 resultSection 最下方
    let oldReview = document.getElementById('wrong-review');
    if (oldReview) oldReview.remove(); const reviewDiv = document.createElement('div');
    reviewDiv.id = 'wrong-review';
    reviewDiv.innerHTML = wrongHtml;

    // 觸發 Prism.js 語法高亮
    if (typeof Prism !== 'undefined') {
        setTimeout(() => Prism.highlightAll(), 0);
    }
    resultSection.appendChild(reviewDiv);
}

// 新增：重設 quiz 狀態的函式
function resetQuizState() {
    quizQuestions = [];
    current = 0;
    score = 0;
    total = 0;
    wrongQuestions = [];
    answers = {};
    optionListPerQuestion = {};
    stopTimer();
    // 銷毀分數圖表
    if (window.resultChart) {
        window.resultChart.destroy();
        window.resultChart = null;
    }
    // 移除錯題詳解區塊
    let oldReview = document.getElementById('wrong-review');
    if (oldReview) oldReview.remove();
    // 重設 timer 顯示
    const timerDiv = document.getElementById('timer');
    if (timerDiv) {
        timerDiv.innerHTML = '';
        timerDiv.classList.add('hidden');
    }
    // 確保開始測驗按鈕可點擊
    const startBtn = document.getElementById('start-btn');
    if (startBtn) {
        startBtn.disabled = false;
        startBtn.classList.remove('disabled');
        console.log('[resetQuizState] start-btn enabled', startBtn);
    }
    // 強制切換回首頁，避免 UI 被其他流程覆蓋
    setupSection.classList.remove('hidden');
    quizSection.classList.add('hidden');
    resultSection.classList.add('hidden');
}
