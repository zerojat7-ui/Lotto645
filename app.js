// ══════════════════════════════
//  app.js  - 메인 앱 로직
// ══════════════════════════════

var lottoData = [];
var analysis  = null;
var LS_KEY    = 'lotto645_v2';

// ── 탭 전환 ──
function switchTab(tab, btn) {
    document.querySelectorAll('.tab').forEach(function(t){ t.classList.remove('active'); });
    btn.classList.add('active');
    ['data','analysis','recommend','semiauto'].forEach(function(id){
        document.getElementById('content-'+id).classList.add('hidden');
    });
    document.getElementById('content-'+tab).classList.remove('hidden');
}

function enableTabs() {
    document.getElementById('tab-analysis').disabled  = false;
    document.getElementById('tab-recommend').disabled = false;
    document.getElementById('tab-semiauto').disabled  = false;
}

// ── 로그 ──
function addLog(msg, type) {
    var board = document.getElementById('statusBoard');
    var log   = document.getElementById('statusLog');
    board.classList.remove('hidden');
    var icon  = type==='success'?'✅':type==='error'?'❌':'ℹ️';
    var color = type==='success'?'#155724':type==='error'?'#721c24':'#0c5460';
    var d = document.createElement('div');
    d.style.color = color;
    d.innerHTML = '['+new Date().toLocaleTimeString('ko-KR')+'] '+icon+' '+msg;
    log.appendChild(d);
    log.scrollTop = log.scrollHeight;
}

// ── 로컬스토리지 ──
function saveToLS() {
    if (!lottoData.length) return;
    try {
        localStorage.setItem(LS_KEY, JSON.stringify({
            savedAt: new Date().toISOString(),
            data: lottoData
        }));
        showLSStatus('💾 자동저장 완료 ('+lottoData.length+'회차)', '#00C49F');
    } catch(e) {
        showLSStatus('⚠️ 저장 실패: '+e.message, '#ff6b6b');
    }
}

function loadFromLS() {
    try {
        var raw = localStorage.getItem(LS_KEY);
        if (!raw) { showLSStatus('저장된 데이터 없음', '#888'); return; }
        var obj = JSON.parse(raw);
        if (!obj.data || !obj.data.length) { showLSStatus('저장 데이터가 비어있음', '#888'); return; }
        lottoData = obj.data;
        var at = new Date(obj.savedAt).toLocaleString('ko-KR');
        showLSStatus('📂 불러옴: '+lottoData.length+'회차 ('+at+')', '#667eea');
        onDataLoaded();
    } catch(e) {
        showLSStatus('불러오기 실패: '+e.message, '#ff6b6b');
    }
}

function clearLS() {
    if (!confirm('저장 데이터를 삭제할까요?')) return;
    localStorage.removeItem(LS_KEY);
    showLSStatus('🗑️ 삭제됨', '#ff6b6b');
}

function showLSStatus(msg, color) {
    var el = document.getElementById('lsStatus');
    el.textContent = msg;
    el.style.color = color || '#888';
}

// ── 데이터 로드 완료 공통 처리 ──
function onDataLoaded() {
    var last = lottoData[lottoData.length-1];
    document.getElementById('importSuccess').innerHTML =
        '✅ <strong>'+lottoData.length+'</strong>개 회차 (1~'+last.round+'회)';
    document.getElementById('importSuccess').classList.remove('hidden');
    updateNextRoundDisplay();
    enableTabs();
    analyzeData();
}

// ── 다음 회차 표시 업데이트 ──
function updateNextRoundDisplay() {
    var next = lottoData.length > 0 ? lottoData[lottoData.length-1].round + 1 : 1;
    document.getElementById('nextRoundDisplay').textContent = next;
}

// ── CSV 업로드 ──
function handleFileUpload(event) {
    var file = event.target.files[0];
    if (!file) return;
    addLog('파일: '+file.name);
    var label = document.getElementById('fileLabel');
    label.textContent = '⏳ 읽는 중...';
    var reader = new FileReader();
    reader.onload = function(e) {
        parseCSV(e.target.result);
        label.textContent = '✅ 로드 완료';
        label.style.background = '#00C49F';
    };
    reader.readAsText(file, 'UTF-8');
}

function parseCSV(text) {
    var lines = text.replace(/\r\n/g,'\n').replace(/\r/g,'\n').trim().split('\n');
    addLog('총 '+lines.length+'줄 파싱');
    lottoData = [];
    var start = lines[0].match(/[가-힣a-zA-Z]/) ? 1 : 0;
    for (var i=start; i<lines.length; i++) {
        var v = lines[i].trim().split(',').map(function(x){return x.trim();});
        if (v.length >= 7) {
            var round = parseInt(v[0]);
            var nums  = v.slice(1,7).map(Number);
            if (!isNaN(round) && nums.every(function(n){return !isNaN(n)&&n>=1&&n<=45;})) {
                var bonus = v.length >= 8 ? parseInt(v[7]) || 0 : 0;
            lottoData.push({ round:round, numbers:nums, bonus:bonus });
            }
        }
    }
    if (lottoData.length) {
        addLog(lottoData.length+'개 회차 로드 성공', 'success');
        onDataLoaded();
    } else {
        addLog('유효한 데이터 없음', 'error');
    }
}

// ── 새 회차 번호 입력 다이얼로그 ──
var inputNums   = [null,null,null,null,null,null]; // 6개 슬롯
var dialogSlot  = -1;   // 현재 편집 중인 슬롯
var dialogTempVal = null;

function openDialog(slot) {
    dialogSlot    = slot;
    dialogTempVal = inputNums[slot];

    var used = inputNums.filter(function(n,i){ return n!==null && i!==slot; });
    var title = document.getElementById('dialogTitle');
    title.textContent = (slot+1) + '번째 번호 선택';

    var grid = document.getElementById('dialogGrid');
    grid.innerHTML = '';
    for (var n=1; n<=45; n++) {
        (function(num){
            var d = document.createElement('div');
            d.className = 'd-num' +
                (dialogTempVal===num ? ' d-sel' : '') +
                (used.indexOf(num)>=0 ? ' d-used' : '');
            d.textContent = num;
            d.onclick = function() {
                // 토글
                if (dialogTempVal === num) {
                    dialogTempVal = null;
                    d.classList.remove('d-sel');
                } else {
                    // 이전 선택 해제
                    var prev = grid.querySelector('.d-sel');
                    if (prev) prev.classList.remove('d-sel');
                    dialogTempVal = num;
                    d.classList.add('d-sel');
                }
            };
            grid.appendChild(d);
        })(n);
    }
    document.getElementById('dialogOverlay').classList.remove('hidden');
}

function confirmDialog() {
    if (dialogTempVal !== null) {
        inputNums[dialogSlot] = dialogTempVal;
        refreshNumBtns();
    }
    closeDialog();
}

function closeDialog() {
    document.getElementById('dialogOverlay').classList.add('hidden');
    dialogSlot = -1;
    dialogTempVal = null;
}

function closeDialogOutside(e) {
    if (e.target === document.getElementById('dialogOverlay')) closeDialog();
}

function refreshNumBtns() {
    var btns = document.querySelectorAll('#numInputGrid .num-btn');
    inputNums.forEach(function(val, i) {
        if (!btns[i]) return;
        if (val !== null) {
            btns[i].textContent = val;
            btns[i].classList.add('filled');
        } else {
            btns[i].textContent = (i+1) + '번';
            btns[i].classList.remove('filled');
        }
    });
}

function addNewDraw() {
    var round = lottoData.length > 0 ? lottoData[lottoData.length-1].round + 1 : 1;
    if (inputNums.some(function(n){ return n===null; })) {
        alert('6개 번호를 모두 입력해주세요.'); return;
    }
    var nums = inputNums.slice();
    if (new Set(nums).size !== 6) { alert('중복된 번호가 있습니다.'); return; }
    if (nums.some(function(n){ return n<1||n>45; })) { alert('번호는 1~45 사이여야 합니다.'); return; }
    if (lottoData.some(function(d){ return d.round===round; })) { addLog(round+'회는 이미 존재합니다.','error'); return; }

    lottoData.push({ round:round, numbers:nums.slice().sort(function(a,b){return a-b;}) });
    lottoData.sort(function(a,b){return a.round-b.round;});
    addLog(round+'회 저장 완료 ('+nums.join(', ')+')', 'success');

    // 입력창 초기화
    inputNums = [null,null,null,null,null,null];
    refreshNumBtns();
    updateNextRoundDisplay();
    analyzeData();
}

// ── history.json 자동 로드 ──
function loadHistoryJSON() {
    showLSStatus('📡 당첨 데이터 로딩 중...', '#667eea');
    fetch('history.json')
        .then(function(r){ return r.json(); })
        .then(function(data) {
            lottoData = data;
            addLog('history.json: '+data.length+'회차 로드', 'success');
            onDataLoaded();
        })
        .catch(function(err) {
            addLog('history.json 로드 실패: '+err.message, 'error');
            showLSStatus('💡 CSV를 업로드하거나 저장 데이터를 불러오세요.', '#888');
        });
}

// ── 페이지 초기화 ──
window.addEventListener('load', function() {
    // 로컬스토리지 우선, 없으면 history.json
    var raw = null;
    try { raw = localStorage.getItem(LS_KEY); } catch(e) {}
    if (raw) {
        loadFromLS();
    } else {
        loadHistoryJSON();
    }
});
