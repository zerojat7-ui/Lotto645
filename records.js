// ══════════════════════════════════════════
//  records.js  v2.0.2
//  Record = {
//    uuid  : 고유 ID,
//    round : 회차 (number),
//    type  : 'basic' | 'engine' | 'semi' | 'neutral',
//    item  : [1,7,14,16,28,36],
//    rank  : 실제 당첨 등수 (null = 미추첨),
//    time  : 저장 시간 (ISO string),
//    cycle : 추천번호 다시 받은 횟수
//  }
// ══════════════════════════════════════════

var FC_KEY = 'lotto645_forecast';

// ── UUID 생성 ──
function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0;
        var v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

// ── 사용자 ID (기기 고정) ──
function getUserId() {
    var uid = localStorage.getItem('lotto_uid');
    if (!uid) {
        uid = 'user_' + Math.random().toString(36).slice(2, 10);
        localStorage.setItem('lotto_uid', uid);
    }
    return uid;
}

// ── type 숫자 → 문자열 변환 (하위 호환) ──
function normalizeType(type) {
    if (typeof type === 'string') return type;
    var map = { 0: 'basic', 1: 'engine', 2: 'semi', 3: 'neutral' };
    return map[type] || 'basic';
}

// ── 예측 저장 (LocalStorage + Firebase) ──
function saveForecast(opts) {
    var records = loadForecastData();

    // cycle: 같은 회차+타입으로 몇 번째 저장인지
    var sameType = normalizeType(opts.type);
    var cycle = records.filter(function(r) {
        return r.round === opts.round && normalizeType(r.type) === sameType;
    }).length + 1;

    var entry = {
        uuid : generateUUID(),
        round: opts.round,
        type : sameType,
        item : opts.numbers || opts.item || [],
        rank : opts.rank || null,
        time : new Date().toISOString(),
        cycle: cycle
    };

    records.push(entry);
    saveForecastData(records);

    // Firebase 직접 저장 (_lottoDB 사용)
    if (typeof window._lottoDB !== 'undefined' && window._lottoDB) {
        var uid = getUserId();
        window._lottoDB.collection('recommendations').add({
            userId   : uid,
            round    : entry.round,
            type     : entry.type,
            numbers  : entry.item,
            cycle    : entry.cycle,
            rank     : null,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        }).catch(function(e) { console.warn('Firebase 저장 실패:', e.message); });
    }

    // 기록탭 열려있으면 즉시 갱신
    var recContent = document.getElementById('content-records');
    if (recContent && !recContent.classList.contains('hidden')) {
        renderRecords();
    }

    return entry;
}

function loadForecastData() {
    try {
        var raw = localStorage.getItem(FC_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch(e) { return []; }
}

function saveForecastData(records) {
    try {
        localStorage.setItem(FC_KEY, JSON.stringify(records));
    } catch(e) {
        alert('저장 공간 부족: ' + e.message);
    }
}

// ── JSON 다운로드 ──
function downloadForecastJSON() {
    var records = loadForecastData();
    if (!records.length) { alert('저장된 기록이 없습니다.'); return; }
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(records, null, 2)], { type: 'application/json' }));
    a.download = 'forecastNum.json';
    a.click();
}

// ── 기록탭 이동 헬퍼 ──
function goToRecordsTab() {
    var tabs = document.querySelectorAll('.tab');
    tabs.forEach(function(t) { t.classList.remove('active'); });
    ['analysis','recommend','semiauto','records'].forEach(function(id) {
        var el = document.getElementById('content-' + id);
        if (el) el.classList.add('hidden');
    });
    // records 탭 활성화
    tabs.forEach(function(t) {
        if (t.textContent.indexOf('기록') >= 0) t.classList.add('active');
    });
    var rec = document.getElementById('content-records');
    if (rec) rec.classList.remove('hidden');
    renderRecords();
}

// ── Firebase에서 기록 로드 (UID 기준) ──
async function loadRecordsFromFirebase() {
    try {
        var db = typeof firebase !== 'undefined' && firebase.apps.length > 0
                 ? firebase.firestore() : null;
        if (!db) return null;
        var uid = getUserId();
        // where + orderBy 복합쿼리는 Firestore 인덱스 필요
        // 인덱스 없으면 자동으로 where만 사용
        var snap;
        try {
            snap = await db.collection('recommendations')
                           .where('userId', '==', uid)
                           .orderBy('createdAt', 'desc')
                           .limit(200)
                           .get();
        } catch(idxErr) {
            // 인덱스 미생성 시 orderBy 없이 재시도
            snap = await db.collection('recommendations')
                           .where('userId', '==', uid)
                           .limit(200)
                           .get();
        }
        if (snap.empty) return [];
        var rows = [];
        snap.forEach(function(doc) {
            var d = doc.data();
            rows.push({
                uuid : doc.id,
                round: d.round,
                type : d.type || 'basic',
                item : d.numbers || [],
                rank : d.rank || null,
                time : d.createdAt ? d.createdAt.toDate().toISOString() : new Date().toISOString(),
                cycle: d.cycle || 1
            });
        });
        return rows;
    } catch(e) {
        console.warn('Firebase 기록 로드 실패:', e.message);
        return null;
    }
}

// ── 기록탭 렌더링 (Firebase 우선, LocalStorage 폴백) ──
function renderRecords() {
    var container = document.getElementById('recordsList');
    if (!container) return;

    // 로딩 표시
    container.innerHTML = '<div style="text-align:center;color:#aaa;padding:30px;font-size:14px;">🔄 기록 불러오는 중...</div>';

    // Firebase에서 먼저 시도
    loadRecordsFromFirebase().then(function(fbRecords) {
        var all;
        if (fbRecords && fbRecords.length > 0) {
            // Firebase 데이터를 LocalStorage에도 동기화
            saveForecastData(fbRecords);
            all = fbRecords;
        } else {
            // 폴백: LocalStorage
            all = loadForecastData();
        }
        _renderRecordsList(container, all);
    }).catch(function() {
        var all = loadForecastData();
        _renderRecordsList(container, all);
    });
}

function _renderRecordsList(container, all) {
    if (!all || !all.length) {
        container.innerHTML =
            '<div style="text-align:center;color:#aaa;padding:30px;font-size:14px;">' +
            '📭 저장된 기록이 없습니다.<br>' +
            '<small>추천/반자동 탭에서 조합 선택 후 저장하세요</small></div>';
        return;
    }

    // 최신순 정렬
    all.sort(function(a, b) {
        return (b.round - a.round) || (new Date(b.time) - new Date(a.time));
    });

    var typeLabels = {
        basic  : '🎯 기본추천',
        engine : '🧠 고급추천',
        semi   : '✏️ 반자동',
        neutral: '👆 수동'
    };
    var typeClasses = {
        basic  : 'type-basic',
        engine : 'type-advanced',
        semi   : 'type-semi',
        neutral: 'type-manual'
    };

    var html =
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">' +
        '<div style="font-size:13px;color:#666;">총 <strong>' + all.length + '</strong>개 기록</div>' +
        '<button onclick="downloadForecastJSON()" ' +
        'style="background:#667eea;color:white;border:none;border-radius:8px;padding:6px 12px;font-size:12px;font-weight:bold;cursor:pointer;">' +
        '📥 JSON</button></div>';

    all.forEach(function(r) {
        var typeKey = normalizeType(r.type);
        var numbers = r.item || r.numbers || [];

        // 당첨번호 비교 (rank 없으면 자동 계산)
        var rank = r.rank;
        var gradeHtml = '';
        var actual = lottoData ? lottoData.find(function(d) { return d.round === r.round; }) : null;
        var matchedCount = 0;

        if (actual && numbers.length) {
            matchedCount = numbers.filter(function(n) { return actual.numbers.indexOf(n) >= 0; }).length;
            var hasBonus  = actual.bonus && numbers.indexOf(actual.bonus) >= 0;
            if (!rank) {
                if (matchedCount === 6) rank = 1;
                else if (matchedCount === 5 && hasBonus) rank = 2;
                else if (matchedCount === 5) rank = 3;
                else if (matchedCount === 4) rank = 4;
                else if (matchedCount === 3) rank = 5;
            }
        }

        if (rank) {
            var gLabel = ['', '🏆 1등', '🥈 2등', '🥉 3등', '4등', '5등'][rank] || rank + '등';
            var gClass = ['', 'grade-1', 'grade-2', 'grade-3', 'grade-4', 'grade-5'][rank] || '';
            gradeHtml = '<span class="grade-badge ' + gClass + '">' + gLabel + '</span>';
        } else if (actual) {
            gradeHtml = '<span style="font-size:11px;color:#bbb;">' + matchedCount + '개 일치</span>';
        } else {
            gradeHtml = '<span style="font-size:11px;color:#ccc;">미추첨</span>';
        }

        // 번호 볼
        var balls = numbers.map(function(n) {
            return '<div class="mini-ball ' + ballClass(n) +
                   '" style="width:26px;height:26px;font-size:11px;">' + n + '</div>';
        }).join('');

        // 시간 포맷
        var timeStr = '-';
        if (r.time) {
            try {
                timeStr = new Date(r.time).toLocaleString('ko-KR', {
                    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
                });
            } catch(e) { timeStr = r.time.slice(0, 10); }
        } else if (r.date) {
            timeStr = r.date;
        }

        html +=
            '<div class="record-card">' +
              '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">' +
                '<span class="record-type-badge ' + (typeClasses[typeKey] || 'type-basic') + '">' +
                  (typeLabels[typeKey] || typeKey) +
                '</span>' +
                '<span style="font-size:11px;color:#999;">' +
                  r.round + '회차' +
                  (r.cycle > 1 ? ' | 🔄' + r.cycle + '번째' : '') +
                  ' | ' + timeStr +
                '</span>' +
              '</div>' +
              '<div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:6px;">' + balls + '</div>' +
              '<div style="display:flex;align-items:center;gap:8px;">' + gradeHtml + '</div>' +
            '</div>';
    });

    container.innerHTML = html;
}