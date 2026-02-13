// ══════════════════════════════════════════
//  records.js  - 예측 기록 저장/조회
//  forecastNum.json 규격:
//  { ip, date, type, round, numbers:[n1..n6], seq }
// ══════════════════════════════════════════
var FC_KEY = 'lotto645_forecast';
var myIP   = null;

// ── IP 가져오기 (로컬 대체값 사용) ──
function getMyIP(cb) {
    if (myIP) { cb(myIP); return; }
    // 브라우저에서 직접 IP 조회 불가 → localStorage에 고정 ID 사용
    var stored = localStorage.getItem('lotto_client_id');
    if (!stored) {
        stored = 'user_' + Math.random().toString(36).slice(2, 10);
        localStorage.setItem('lotto_client_id', stored);
    }
    myIP = stored;
    cb(myIP);
}

// ── 예측 저장 (공통 호출) ──
// opts: { type:0~3, round, numbers:[6개], seq(optional) }
function saveForecast(opts) {
    getMyIP(function(ip) {
        var records = loadForecastData();
        var seq = opts.seq !== undefined ? opts.seq :
            records.filter(function(r){ return r.round===opts.round && r.type===opts.type; }).length + 1;
        var entry = {
            ip     : ip,
            date   : new Date().toISOString().slice(0,10),
            type   : opts.type,   // 0:기본추천 1:고급추천 2:반자동 3:수동
            round  : opts.round,
            numbers: opts.numbers,
            seq    : seq
        };
        records.push(entry);
        saveForecastData(records);
    });
}

function loadForecastData() {
    try {
        var raw = localStorage.getItem(FC_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch(e) { return []; }
}
function saveForecastData(records) {
    try { localStorage.setItem(FC_KEY, JSON.stringify(records)); } catch(e) {}
}

// ── forecastNum.json 다운로드 ──
function downloadForecastJSON() {
    var records = loadForecastData();
    if (!records.length) { alert('저장된 기록이 없습니다.'); return; }
    var json = JSON.stringify(records, null, 2);
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([json], {type:'application/json'}));
    a.download = 'forecastNum.json';
    a.click();
}

// ── 기록탭 렌더링 ──
function renderRecords() {
    var container = document.getElementById('recordsList');
    if (!container) return;

    getMyIP(function(ip) {
        var all = loadForecastData();
        // 내 기록만
        var mine = all.filter(function(r){ return r.ip === ip; });

        if (!mine.length) {
            container.innerHTML = '<div style="text-align:center;color:#aaa;padding:30px;font-size:14px;">📭 저장된 기록이 없습니다.<br><small style="font-size:12px;">추천/반자동 탭에서 조합을 선택 후 저장하세요</small></div>';
            return;
        }

        // 회차별 내림차순 정렬
        mine.sort(function(a,b){ return b.round - a.round || b.seq - a.seq; });

        var typeLabels = ['기본추천','고급추천','반자동','수동'];
        var typeClasses = ['type-basic','type-advanced','type-semi','type-manual'];
        var typeIcons   = ['🎯','🧠','✏️','👆'];

        var html = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">'+
            '<div style="font-size:13px;color:#666;">총 <strong>'+mine.length+'</strong>개 기록</div>'+
            '<button onclick="downloadForecastJSON()" style="background:#667eea;color:white;border:none;border-radius:8px;padding:6px 12px;font-size:12px;font-weight:bold;cursor:pointer;">📥 JSON 다운로드</button>'+
            '</div>';

        mine.forEach(function(r) {
            // 당첨번호 비교
            var actual = lottoData ? lottoData.find(function(d){ return d.round===r.round; }) : null;
            var gradeHtml = '';

            if (actual) {
                var matched = r.numbers.filter(function(n){ return actual.numbers.indexOf(n)>=0; }).length;
                var hasBonus = actual.bonus && r.numbers.indexOf(actual.bonus)>=0;
                var grade = 0;
                if (matched===6) grade=1;
                else if (matched===5&&hasBonus) grade=2;
                else if (matched===5) grade=3;
                else if (matched===4) grade=4;
                else if (matched===3) grade=5;

                if (grade > 0) {
                    var gradeLabels = ['','🏆 1등','🥈 2등','🥉 3등','4등','5등'];
                    var gradeClass  = ['','grade-1','grade-2','grade-3','grade-4','grade-5'];
                    gradeHtml = '<span class="grade-badge '+gradeClass[grade]+'">'+gradeLabels[grade]+'</span>';
                } else {
                    gradeHtml = '<span style="font-size:11px;color:#bbb;">'+matched+'개 일치</span>';
                }
            }

            // 번호 볼
            var balls = r.numbers.map(function(n){
                return '<div class="mini-ball '+ballClass(n)+'" style="width:26px;height:26px;font-size:11px;">'+n+'</div>';
            }).join('');

            // 예) 고 [1,4,16,24,32,41] 1010회 5등
            var shortType = ['기','고','반','수'][r.type] || '?';

            html += '<div class="record-card">'+
                '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">'+
                '<span class="record-type-badge '+typeClasses[r.type]+'">'+typeIcons[r.type]+' '+typeLabels[r.type]+'</span>'+
                '<span style="font-size:12px;color:#999;">'+r.round+'회차 | '+r.date+' | #'+r.seq+'</span>'+
                '</div>'+
                '<div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:6px;">'+balls+'</div>'+
                '<div style="display:flex;align-items:center;gap:8px;">'+
                (gradeHtml || (actual ? '' : '<span style="font-size:11px;color:#ccc;">미추첨</span>'))+
                '</div>'+
                // 한줄 요약 (요구사항 17번 형식)
                '<div style="font-size:11px;color:#aaa;margin-top:5px;">'+
                shortType+' ['+r.numbers.join(',')+'] '+r.round+'회'+
                (gradeHtml && actual ? ' ' + gradeHtml.replace(/<[^>]+>/g,'').trim() : '')+
                '</div>'+
                '</div>';
        });

        container.innerHTML = html;
    });
}
