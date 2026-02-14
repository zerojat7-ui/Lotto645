// ══════════════════════════════════════════
//  records.js  — 예측 기록 저장/조회
// ══════════════════════════════════════════
var FC_KEY = 'lotto645_forecast';

// 사용자 ID (기기 고정)
function getUserId() {
    var uid = localStorage.getItem('lotto_uid');
    if (!uid) {
        uid = 'user_' + Math.random().toString(36).slice(2, 10);
        localStorage.setItem('lotto_uid', uid);
    }
    return uid;
}

// 예측 저장
function saveForecast(opts) {
    var uid = getUserId();
    var records = loadForecastData();
    var seq = records.filter(function(r) {
        return r.round === opts.round && r.type === opts.type;
    }).length + 1;

    var entry = {
        uid    : uid,
        date   : new Date().toISOString().slice(0, 10),
        type   : opts.type,    // 0:기본추천 1:고급추천 2:반자동 3:수동
        round  : opts.round,
        numbers: opts.numbers,
        seq    : seq
    };
    records.push(entry);
    saveForecastData(records);

    // 기록탭 열려있으면 즉시 갱신
    var recContent = document.getElementById('content-records');
    if (recContent && !recContent.classList.contains('hidden')) {
        renderRecords();
    }
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

// forecastNum.json 다운로드
function downloadForecastJSON() {
    var records = loadForecastData();
    if (!records.length) { alert('저장된 기록이 없습니다.'); return; }
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(records, null, 2)], {type:'application/json'}));
    a.download = 'forecastNum.json';
    a.click();
}

// 기록탭 렌더링
function renderRecords() {
    var container = document.getElementById('recordsList');
    if (!container) return;

    var uid = getUserId();
    var all = loadForecastData();

    // 내 기록만 (uid 기준)
    var mine = all.filter(function(r) { return r.uid === uid; });

    if (!mine.length) {
        container.innerHTML =
            '<div style="text-align:center;color:#aaa;padding:30px;font-size:14px;">' +
            '📭 저장된 기록이 없습니다.<br>' +
            '<small>추천/반자동 탭에서 조합 선택 후 저장하세요</small></div>';
        return;
    }

    // 최신순 정렬
    mine.sort(function(a, b) { return b.round - a.round || b.seq - a.seq; });

    var typeLabels  = ['기본추천', '고급추천', '반자동', '수동'];
    var typeIcons   = ['🎯', '🧠', '✏️', '👆'];
    var typeClasses = ['type-basic', 'type-advanced', 'type-semi', 'type-manual'];

    var html =
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">' +
        '<div style="font-size:13px;color:#666;">총 <strong>' + mine.length + '</strong>개 기록</div>' +
        '<button onclick="downloadForecastJSON()" ' +
        'style="background:#667eea;color:white;border:none;border-radius:8px;padding:6px 12px;font-size:12px;font-weight:bold;cursor:pointer;">'+
        '📥 JSON</button></div>';

    mine.forEach(function(r) {
        // 당첨번호 비교
        var actual = lottoData ? lottoData.find(function(d) { return d.round === r.round; }) : null;
        var gradeHtml = '';
        if (actual) {
            var matched = r.numbers.filter(function(n) { return actual.numbers.indexOf(n) >= 0; }).length;
            var hasBonus = actual.bonus && r.numbers.indexOf(actual.bonus) >= 0;
            var grade = 0;
            if (matched === 6) grade = 1;
            else if (matched === 5 && hasBonus) grade = 2;
            else if (matched === 5) grade = 3;
            else if (matched === 4) grade = 4;
            else if (matched === 3) grade = 5;

            if (grade > 0) {
                var gLabel = ['','🏆 1등','🥈 2등','🥉 3등','4등','5등'][grade];
                var gClass = ['','grade-1','grade-2','grade-3','grade-4','grade-5'][grade];
                gradeHtml = '<span class="grade-badge ' + gClass + '">' + gLabel + '</span>';
            } else {
                gradeHtml = '<span style="font-size:11px;color:#bbb;">' + matched + '개 일치</span>';
            }
        } else {
            gradeHtml = '<span style="font-size:11px;color:#ccc;">미추첨</span>';
        }

        // 번호 볼
        var balls = r.numbers.map(function(n) {
            return '<div class="mini-ball ' + ballClass(n) +
                   '" style="width:26px;height:26px;font-size:11px;">' + n + '</div>';
        }).join('');

        // 한줄 요약
        var shortType = ['기','고','반','수'][r.type] || '?';
        var summary = shortType + ' [' + r.numbers.join(',') + '] ' + r.round + '회';

        html +=
            '<div class="record-card">' +
              '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">' +
                '<span class="record-type-badge ' + typeClasses[r.type] + '">' +
                  typeIcons[r.type] + ' ' + typeLabels[r.type] +
                '</span>' +
                '<span style="font-size:11px;color:#999;">' + r.round + '회차 | ' + r.date + ' | #' + r.seq + '</span>' +
              '</div>' +
              '<div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:6px;">' + balls + '</div>' +
              '<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">' + gradeHtml + '</div>' +
              '<div style="font-size:11px;color:#aaa;">' + summary + '</div>' +
            '</div>';
    });

    container.innerHTML = html;
}
