// ══════════════════════════════
//  app.js  v2.0.1
//  - LocalStorage + Firebase 동시 저장
//  - 앱 로드 시 Firebase → history.json 순서로 데이터 로드
// ══════════════════════════════
var lottoData = [];
var analysis  = null;
var LS_KEY    = 'lotto645_v2';
var IS_MAIN   = (window._FORCE_IS_MAIN === true || location.pathname.indexOf('main.html') >= 0);

// ══════════════════════════════
//  Firebase 헬퍼
//  (firebase-app-compat, firebase-firestore-compat 로드 후 사용)
// ══════════════════════════════
var _fbDb = null;
var FB_HISTORY_DOC = 'lotto645_history';   // Firestore 문서 ID
var FB_COLLECTION  = 'lotto_history';      // Firestore 컬렉션

function getFirestoreDb() {
    // main.html에서 Firebase SDK 먼저 로드 후 window._lottoDB 세팅됨
    if (window._lottoDB) return window._lottoDB;
    if (_fbDb) return _fbDb;
    try {
        if (typeof firebase !== 'undefined' && firebase.apps && firebase.apps.length > 0) {
            _fbDb = firebase.firestore();
            window._lottoDB = _fbDb;
        }
    } catch(e) {}
    return _fbDb;
}

// ── Firebase에서 history 로드 ──
async function loadFromFirebase() {
    var db = getFirestoreDb();
    if (!db) return null;
    try {
        showLSStatus('🔥 Firebase에서 데이터 로딩 중...', '#667eea');
        var snap = await db.collection(FB_COLLECTION).doc(FB_HISTORY_DOC).get();
        if (snap.exists) {
            var data = snap.data();
            if (data && data.draws && data.draws.length > 0) {
                return data.draws;
            }
        }
        return null;
    } catch(e) {
        console.warn('Firebase 로드 실패:', e.message);
        return null;
    }
}

// ── Firebase에 history 전체 저장 ──
async function saveHistoryToFirebase() {
    var db = getFirestoreDb();
    if (!db || !lottoData.length) return false;
    try {
        await db.collection(FB_COLLECTION).doc(FB_HISTORY_DOC).set({
            draws    : lottoData,
            count    : lottoData.length,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        return true;
    } catch(e) {
        console.error('Firebase history 저장 오류:', e.message);
        return false;
    }
}

// ── 추천번호 Firebase 저장 (main.html에서 window.saveToFirebase로 세팅됨)
//    app.js에서는 history 전용 saveHistoryToFirebase만 사용
// testSave는 main.html에서 window.testSave로 세팅됨

// ══════════════════════════════
//  페이지 이동
// ══════════════════════════════
function goMain() {
    saveToLS();
    location.href = 'main.html';
}

// ══════════════════════════════
//  탭 전환 (main.html)
// ══════════════════════════════
function switchTab(tab, btn) {
    document.querySelectorAll('.tab').forEach(function(t){ t.classList.remove('active'); });
    btn.classList.add('active');
    ['winning','analysis','recommend','semiauto','records'].forEach(function(id){
        var el = document.getElementById('content-'+id);
        if (el) el.classList.add('hidden');
    });
    var target = document.getElementById('content-'+tab);
    if (target) target.classList.remove('hidden');
    if (tab === 'records') renderRecords();
    if (tab === 'winning') renderWinningTab();
}

// ══════════════════════════════
//  로그
// ══════════════════════════════
function addLog(msg, type) {
    var board = document.getElementById('statusBoard');
    var log   = document.getElementById('statusLog');
    if (!board || !log) return;
    board.classList.remove('hidden');
    var icon  = type==='success'?'✅':type==='error'?'❌':'ℹ️';
    var color = type==='success'?'#155724':type==='error'?'#721c24':'#0c5460';
    var d = document.createElement('div');
    d.style.color = color;
    d.innerHTML = '['+new Date().toLocaleTimeString('ko-KR')+'] '+icon+' '+msg;
    log.appendChild(d);
    log.scrollTop = log.scrollHeight;
}

// ══════════════════════════════
//  LocalStorage
// ══════════════════════════════
function saveToLS() {
    if (!lottoData.length) return;
    try {
        localStorage.setItem(LS_KEY, JSON.stringify({
            savedAt: new Date().toISOString(), data: lottoData
        }));
        showLSStatus('💾 저장 완료 ('+lottoData.length+'회차)', '#00C49F');
    } catch(e) { showLSStatus('⚠️ 저장 실패: '+e.message, '#ff6b6b'); }
}
function loadFromLS() {
    try {
        var raw = localStorage.getItem(LS_KEY);
        if (!raw) { showLSStatus('저장된 데이터 없음', '#888'); return false; }
        var obj = JSON.parse(raw);
        if (!obj.data || !obj.data.length) { showLSStatus('저장 데이터가 비어있음', '#888'); return false; }
        lottoData = obj.data;
        var at = new Date(obj.savedAt).toLocaleString('ko-KR');
        showLSStatus('📂 불러옴: '+lottoData.length+'회차 ('+at+')', '#667eea');
        return true;
    } catch(e) { showLSStatus('불러오기 실패: '+e.message, '#ff6b6b'); return false; }
}
function clearLS() {
    if (!confirm('저장 데이터를 삭제할까요?')) return;
    localStorage.removeItem(LS_KEY);
    showLSStatus('🗑️ 삭제됨', '#ff6b6b');
}
function showLSStatus(msg, color) {
    var el = document.getElementById('lsStatus');
    if (!el) return;
    el.textContent = msg; el.style.color = color || '#888';
}

// ══════════════════════════════
//  데이터 로드 완료 후 처리
// ══════════════════════════════
function onDataLoaded() {
    var last = lottoData[lottoData.length-1];

    var importEl = document.getElementById('importSuccess');
    if (importEl) {
        importEl.innerHTML = '✅ <strong>'+lottoData.length+'</strong>개 회차 (1~'+last.round+'회)';
        importEl.classList.remove('hidden');
    }
    updateNextRoundDisplay();

    var goBtn = document.getElementById('goMainBtn');
    if (goBtn) goBtn.disabled = false;

    if (IS_MAIN) {
        analyzeData();
        updateMainHeader();
        renderWinningTab();
    }
}

// ══════════════════════════════
//  헤더 최신회차 업데이트 (main.html)
// ══════════════════════════════
function updateMainHeader() {
    if (!lottoData.length) return;
    var last = lottoData[lottoData.length-1];
    var roundEl = document.getElementById('latestRoundLabel');
    var ballsEl = document.getElementById('latestBalls');
    if (!roundEl || !ballsEl) return;

    roundEl.textContent = last.round + '회차';
    ballsEl.innerHTML = '';
    last.numbers.forEach(function(n) {
        var d = document.createElement('div');
        d.className = 'mini-ball ' + ballClass(n);
        d.textContent = n;
        ballsEl.appendChild(d);
    });
    if (last.bonus) {
        var sep = document.createElement('span');
        sep.style.cssText = 'color:#999;font-size:14px;line-height:28px;margin:0 2px;';
        sep.textContent = '+';
        ballsEl.appendChild(sep);
        var bd = document.createElement('div');
        bd.className = 'mini-ball ' + ballClass(last.bonus) + ' bonus-ball';
        bd.textContent = last.bonus;
        ballsEl.appendChild(bd);
    }
}

// ══════════════════════════════
//  다음 회차 표시
// ══════════════════════════════
function updateNextRoundDisplay() {
    var next = lottoData.length > 0 ? lottoData[lottoData.length-1].round + 1 : 1;
    var el = document.getElementById('nextRoundDisplay');
    if (el) el.textContent = next;
}

// ══════════════════════════════
//  CSV 업로드
// ══════════════════════════════
function handleFileUpload(event) {
    var file = event.target.files[0];
    if (!file) return;
    addLog('파일: '+file.name);
    var reader = new FileReader();
    reader.onload = function(e) { parseCSV(e.target.result); };
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
        saveToLS();
        // Firebase에도 전체 저장
        saveHistoryToFirebase().then(function(ok) {
            addLog(ok ? '🔥 Firebase 동기화 완료' : '⚠️ Firebase 저장 실패 (로컬엔 저장됨)', ok ? 'success' : 'error');
        });
        onDataLoaded();
    } else {
        addLog('유효한 데이터 없음', 'error');
    }
}

// ══════════════════════════════
//  새 회차 입력 다이얼로그
// ══════════════════════════════
var inputNums     = [null,null,null,null,null,null];
var dialogSlot    = -1;
var dialogTempVal = null;

function openDialog(slot) {
    dialogSlot    = slot;
    dialogTempVal = inputNums[slot];
    var used = inputNums.filter(function(n,i){ return n!==null && i!==slot; });
    document.getElementById('dialogTitle').textContent = (slot+1)+'번째 번호 선택';
    var grid = document.getElementById('dialogGrid');
    grid.innerHTML = '';
    for (var n=1; n<=45; n++) {
        (function(num){
            var d = document.createElement('div');
            d.className = 'd-num'+(dialogTempVal===num?' d-sel':'')+(used.indexOf(num)>=0?' d-used':'');
            d.textContent = num;
            d.onclick = function() {
                if (dialogTempVal === num) { dialogTempVal=null; d.classList.remove('d-sel'); }
                else {
                    var prev = grid.querySelector('.d-sel');
                    if (prev) prev.classList.remove('d-sel');
                    dialogTempVal = num; d.classList.add('d-sel');
                }
            };
            grid.appendChild(d);
        })(n);
    }
    document.getElementById('dialogOverlay').classList.remove('hidden');
}
function confirmDialog() {
    if (dialogTempVal !== null) { inputNums[dialogSlot]=dialogTempVal; refreshNumBtns(); }
    closeDialog();
}
function closeDialog() {
    document.getElementById('dialogOverlay').classList.add('hidden');
    dialogSlot=-1; dialogTempVal=null;
}
function closeDialogOutside(e) {
    if (e.target===document.getElementById('dialogOverlay')) closeDialog();
}
function refreshNumBtns() {
    var btns = document.querySelectorAll('#numInputGrid .num-btn');
    inputNums.forEach(function(val,i){
        if (!btns[i]) return;
        if (val!==null){ btns[i].textContent=val; btns[i].classList.add('filled'); }
        else { btns[i].textContent=(i+1)+'번'; btns[i].classList.remove('filled'); }
    });
}

// ── 새 회차 저장 (LocalStorage + Firebase) ──
function addNewDraw() {
    var round = lottoData.length>0 ? lottoData[lottoData.length-1].round+1 : 1;
    if (inputNums.some(function(n){return n===null;})) { alert('6개 번호를 모두 입력해주세요.'); return; }
    var nums = inputNums.slice();
    if (new Set(nums).size!==6) { alert('중복된 번호가 있습니다.'); return; }
    if (lottoData.some(function(d){return d.round===round;})) { addLog(round+'회는 이미 존재','error'); return; }

    lottoData.push({ round:round, numbers:nums.slice().sort(function(a,b){return a-b;}) });
    lottoData.sort(function(a,b){return a.round-b.round;});

    // [1] LocalStorage 저장
    saveToLS();

    // [2] Firebase에 전체 history 저장
    saveHistoryToFirebase().then(function(ok) {
        if (ok) {
            addLog(round+'회 Firebase 저장 완료 🔥', 'success');
        } else {
            addLog(round+'회 Firebase 저장 실패 (로컬엔 저장됨)', 'error');
        }
    });

    addLog(round+'회 입력 완료', 'success');
    inputNums=[null,null,null,null,null,null];
    refreshNumBtns();
    updateNextRoundDisplay();
    if (IS_MAIN) { analyzeData(); updateMainHeader(); renderWinningTab(); }
}

// ══════════════════════════════
//  CSV 다운로드
// ══════════════════════════════
function downloadWinCSV() {
    if (!lottoData.length) { alert('데이터 없음'); return; }
    var csv='\uFEFF회차,번호1,번호2,번호3,번호4,번호5,번호6\n';
    lottoData.forEach(function(d){csv+=d.round+','+d.numbers.join(',')+'\n';});
    var a=document.createElement('a');
    a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8;'}));
    a.download='당첨번호.csv'; a.click();
}

// ══════════════════════════════
//  페이지 초기화
//  로드 우선순위: LocalStorage → Firebase → history.json
// ══════════════════════════════
window.addEventListener('load', function() {

    // [1] LocalStorage 우선 로드 (빠름)
    var lsOk = loadFromLS();
    if (lsOk) {
        onDataLoaded();
        // 백그라운드에서 Firebase와 동기화 (더 최신 데이터가 있으면 갱신)
        loadFromFirebase().then(function(fbData) {
            if (!fbData) return;
            var lsLast = lottoData[lottoData.length-1] ? lottoData[lottoData.length-1].round : 0;
            var fbLast = fbData[fbData.length-1] ? fbData[fbData.length-1].round : 0;
            if (fbLast > lsLast) {
                // Firebase가 더 최신이면 갱신
                lottoData = fbData;
                saveToLS();
                onDataLoaded();
                showLSStatus('🔥 Firebase 최신 데이터로 갱신 ('+fbData.length+'회차)', '#667eea');
            }
        });
        return;
    }

    // [2] Firebase에서 로드
    loadFromFirebase().then(function(fbData) {
        if (fbData && fbData.length > 0) {
            lottoData = fbData;
            saveToLS();
            addLog('🔥 Firebase: '+fbData.length+'회차 로드', 'success');
            onDataLoaded();
            return;
        }
        // [3] history.json 폴백
        loadHistoryJSON();
    });
});

// ══════════════════════════════
//  당첨 탭 렌더링 (내림차순)
// ══════════════════════════════
function renderWinningTab() {
    var container = document.getElementById('winningList');
    if (!container) return;
    if (!lottoData || !lottoData.length) {
        container.innerHTML = '<div style="text-align:center;color:#aaa;padding:30px;">데이터 없음</div>';
        return;
    }

    // 내림차순 복사
    var sorted = lottoData.slice().sort(function(a, b){ return b.round - a.round; });

    // 색상 범위 이름 (표시용)
    var colorNames = ['황', '청', '적', '흑', '녹'];

    // 카드 높이 약 160px × 3 = 480px → 3개 노출 후 스크롤
    var html = '<div id="winningScrollBox" style="' +
        'height:62vh;' +
        'min-height:480px;' +
        'max-height:640px;' +
        'overflow-y:scroll;' +
        'overscroll-behavior:contain;' +
        '-webkit-overflow-scrolling:touch;' +
        'padding:2px 4px 4px 2px;' +
        '">';

    sorted.forEach(function(draw) {
        var nums  = draw.numbers || [];
        var bonus = draw.bonus || null;

        var sorted6 = nums.slice().sort(function(a,b){ return a - b; });

        // ── 기본 통계 ──
        var sum     = sorted6.reduce(function(a,b){ return a+b; }, 0);
        var odd     = sorted6.filter(function(n){ return n%2===1; }).length;
        var even    = 6 - odd;
        var low     = sorted6.filter(function(n){ return n<=22; }).length;
        var high    = 6 - low;
        var tailSum = sorted6.reduce(function(a,b){ return a+(b%10); }, 0);
        var ac      = typeof calculateAC === 'function' ? calculateAC(sorted6) : '-';

        // ── 색상 통계: 황(1~10) 청(11~20) 적(21~30) 흑(31~40) 녹(41~45) ──
        var colorCounts = [0, 0, 0, 0, 0]; // 황 청 적 흑 녹
        sorted6.forEach(function(n) {
            if      (n <= 10) colorCounts[0]++;
            else if (n <= 20) colorCounts[1]++;
            else if (n <= 30) colorCounts[2]++;
            else if (n <= 40) colorCounts[3]++;
            else              colorCounts[4]++;
        });
        var colorStat = colorCounts.join('+');

        // ── 연속번호 쌍 개수 ──
        var consecPairs = 0;
        for (var ci = 0; ci < sorted6.length - 1; ci++) {
            if (sorted6[ci+1] - sorted6[ci] === 1) consecPairs++;
        }

        // ── 번호볼 (한 줄, 볼 크기 모바일 최적화) ──
        var ballsHtml = sorted6.map(function(n){
            return '<div class="lotto-ball '+ballClass(n)+'" style="width:38px;height:38px;font-size:14px;flex-shrink:0;">'+n+'</div>';
        }).join('');
        if (bonus) {
            ballsHtml += '<span style="color:#bbb;font-size:16px;line-height:38px;margin:0 2px;flex-shrink:0;">+</span>';
            ballsHtml += '<div class="lotto-ball '+ballClass(bonus)+'" style="width:38px;height:38px;font-size:14px;flex-shrink:0;box-shadow:0 0 0 2.5px #555,0 2px 6px rgba(0,0,0,0.25);">'+bonus+'</div>';
        }

        html +=
            '<div style="background:white;border:1px solid #e8e8e8;border-radius:14px;padding:14px 12px;margin-bottom:10px;box-shadow:0 2px 8px rgba(0,0,0,0.06);">' +
                // 회차
                '<div style="font-size:13px;font-weight:700;color:#333;margin-bottom:10px;">' +
                    draw.round + '회차' +
                '</div>' +
                // 번호볼 한 줄
                '<div style="display:flex;align-items:center;gap:4px;justify-content:center;flex-wrap:nowrap;overflow-x:auto;margin-bottom:12px;padding-bottom:2px;">' +
                    ballsHtml +
                '</div>' +
                // 통계 행 1: 홀짝 고저 색상 연속
                '<div style="display:flex;justify-content:space-between;font-size:11px;color:#666;margin-bottom:5px;flex-wrap:wrap;gap:3px;">' +
                    '<span>홀짝 <strong style="color:#333;">'+odd+':'+even+'</strong></span>' +
                    '<span>고저 <strong style="color:#333;">'+high+':'+low+'</strong></span>' +
                    '<span>색상 <strong style="color:#667eea;">'+colorStat+'</strong></span>' +
                    '<span>연속 <strong style="color:'+(consecPairs>0?'#e53935':'#aaa')+';">'+consecPairs+'쌍</strong></span>' +
                '</div>' +
                // 통계 행 2: 끝수합 번호합 AC값
                '<div style="display:flex;justify-content:space-between;font-size:11px;color:#666;border-top:1px solid #f5f5f5;padding-top:6px;flex-wrap:wrap;gap:3px;">' +
                    '<span>끝수합 <strong style="color:#333;">'+tailSum+'</strong></span>' +
                    '<span>번호합 <strong style="color:#333;">'+sum+'</strong></span>' +
                    '<span>AC값 <strong style="color:#333;">'+ac+'</strong></span>' +
                '</div>' +
            '</div>';
    });

    // 스크롤 컨테이너 닫기
    html += '</div>';
    // 맨 위로 버튼
    html += '<div style="text-align:center;margin-top:8px;">' +
        '<button onclick="document.getElementById(\'winningScrollBox\').scrollTo({top:0,behavior:\'smooth\'})" ' +
        'style="background:#667eea;color:white;border:none;border-radius:20px;' +
        'padding:7px 20px;font-size:12px;font-weight:bold;cursor:pointer;' +
        'box-shadow:0 2px 8px rgba(102,126,234,0.4);">' +
        '⬆️ 맨 위로</button>' +
        '</div>';

    container.innerHTML = html;
}

function loadHistoryJSON() {
    showLSStatus('📡 history.json 로딩 중…', '#667eea');
    fetch('history.json')
        .then(function(r){ return r.json(); })
        .then(function(data){
            lottoData = data;
            addLog('history.json: '+data.length+'회차 로드', 'success');
            saveToLS();
            // Firebase에도 업로드 (최초 1회 마이그레이션)
            saveHistoryToFirebase().then(function(ok){
                if (ok) addLog('🔥 Firebase 초기 데이터 업로드 완료', 'success');
            });
            onDataLoaded();
        })
        .catch(function(err){
            addLog('history.json 로드 실패: '+err.message, 'error');
            showLSStatus('💡 CSV를 업로드하거나 저장 데이터를 불러오세요.', '#888');
        });
}
