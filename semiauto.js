// ══════════════════════════════════════════
//  semiauto.js  — 반자동 탭 (당첨 비교 포함)
// ══════════════════════════════════════════
var semiTickets = [];

function addSemiTicket() {
    if (semiTickets.length >= 5) { alert('최대 5게임까지 추가 가능합니다.'); return; }
    semiTickets.push({ manualNums:[], autoNums:[] });
    renderSemiTickets();
}
function clearAllTickets() {
    semiTickets = [];
    document.getElementById('semiResultPanel').style.display = 'none';
    renderSemiTickets();
}
function toggleSemiNum(idx, num) {
    var t = semiTickets[idx];
    var pos = t.manualNums.indexOf(num);
    if (pos >= 0) { t.manualNums.splice(pos, 1); }
    else {
        if (t.manualNums.length >= 5) { alert('수동 번호는 최대 5개입니다.'); return; }
        t.manualNums.push(num);
    }
    t.autoNums = [];
    renderSemiTickets();
}
function autoFillTicket(idx) {
    var t = semiTickets[idx];
    var needed = 6 - t.manualNums.length;
    if (needed <= 0) { updateSemiResult(); document.getElementById('semiResultPanel').style.display='block'; return; }
    var pool = [];
    for (var i = 1; i <= 45; i++) {
        if (t.manualNums.indexOf(i) < 0) {
            pool.push(i);
            if (analysis && analysis.hotNumbers && analysis.hotNumbers.indexOf(i) >= 0) pool.push(i);
        }
    }
    for (var i = pool.length-1; i > 0; i--) {
        var j = Math.floor(Math.random()*(i+1));
        var tmp=pool[i]; pool[i]=pool[j]; pool[j]=tmp;
    }
    var picked=[], seen={};
    for (var i=0; i<pool.length && picked.length<needed; i++) {
        if (!seen[pool[i]]) { seen[pool[i]]=true; picked.push(pool[i]); }
    }
    t.autoNums = picked;
    renderSemiTickets();
    updateSemiResult();
    document.getElementById('semiResultPanel').style.display = 'block';
}
function regenerateAuto() {
    semiTickets.forEach(function(t, i) {
        if (t.manualNums.length > 0 || t.autoNums.length > 0) {
            t.autoNums = [];
            autoFillTicket(i);
        }
    });
}
function removeSemiTicket(idx) {
    semiTickets.splice(idx, 1);
    renderSemiTickets();
    updateSemiResult();
    if (!semiTickets.length) document.getElementById('semiResultPanel').style.display='none';
}
function renderSemiTickets() {
    var container = document.getElementById('semiautoTickets');
    container.innerHTML = '';
    if (!semiTickets.length) {
        container.innerHTML = '<div style="text-align:center;color:#aaa;padding:20px;font-size:14px;">+ 게임 추가 버튼을 눌러 시작하세요</div>';
        return;
    }
    var labels = ['A','B','C','D','E'];
    semiTickets.forEach(function(t, ti) {
        var div = document.createElement('div');
        div.className = 'lotto-ticket';
        var selCount = t.manualNums.length;
        var header = '<div class="ticket-header">'+
            '<div class="ticket-label">'+labels[ti]+'</div>'+
            '<div style="font-size:11px;color:#666;">'+
            '<span style="background:#c00;color:white;padding:2px 7px;border-radius:8px;font-size:11px;">수동 '+selCount+'</span> '+
            '<span style="background:#667eea;color:white;padding:2px 7px;border-radius:8px;font-size:11px;">자동 '+(6-selCount)+'</span>'+
            '</div>'+
            '<button onclick="removeSemiTicket('+ti+')" style="background:none;border:none;color:#bbb;font-size:18px;cursor:pointer;padding:0 2px;">✕</button>'+
            '</div>';
        var grid = '<div class="ticket-grid">';
        for (var n=1; n<=45; n++) {
            var isM=t.manualNums.indexOf(n)>=0, isA=t.autoNums.indexOf(n)>=0;
            var cls='ticket-num'+(isM?' sel-manual':isA?' sel-auto':'');
            grid+='<div class="'+cls+'" onclick="toggleSemiNum('+ti+','+n+')">'+n+'</div>';
        }
        grid+='</div>';
        var footerMsg=selCount===0?'번호 선택 또는 바로 자동완성':selCount===6?'6개 선택 완료!':(6-selCount)+'개 자동 대기';
        var footer='<div class="ticket-footer" style="margin-top:8px;">'+
            '<div style="font-size:11px;color:#999;">'+footerMsg+'</div>'+
            '<button onclick="autoFillTicket('+ti+')" style="padding:7px 14px;background:#667eea;color:white;border:none;border-radius:8px;font-size:13px;font-weight:bold;cursor:pointer;">'+(selCount===6?'확정':'자동완성')+'</button></div>';
        div.innerHTML = header + grid + footer;
        container.appendChild(div);
    });
}

// ────────────────────────────
//  당첨번호 비교 함수
// ────────────────────────────
function checkWinHistory(numbers) {
    // 정확히 맞는 번호 기준으로 등수 판정
    // 보너스볼 포함 여부: lottoData[i].bonus 필드 활용
    var results = [];
    for (var i = 0; i < lottoData.length; i++) {
        var draw = lottoData[i];
        var matched = numbers.filter(function(n){ return draw.numbers.indexOf(n) >= 0; }).length;
        var hasBonus = draw.bonus && numbers.indexOf(draw.bonus) >= 0;

        var grade = 0;
        if (matched === 6)                         grade = 1; // 1등
        else if (matched === 5 && hasBonus)        grade = 2; // 2등
        else if (matched === 5)                    grade = 3; // 3등
        else if (matched === 4)                    grade = 4; // 4등
        else if (matched === 3)                    grade = 5; // 5등

        if (grade > 0) {
            results.push({ round: draw.round, grade: grade, matched: matched, hasBonus: hasBonus, drawNums: draw.numbers, bonus: draw.bonus });
        }
    }
    return results;
}

function renderWinBadge(result) {
    var gradeColor = result.grade===1?'#FFD700':result.grade===2?'#C0C0C0':result.grade===3?'#CD7F32':result.grade===4?'#667eea':'#00C49F';
    var gradeLabel = result.grade===1?'🏆 1등':result.grade===2?'🥈 2등':result.grade===3?'🥉 3등':result.grade===4?'4등':'5등';
    var matchedNums = result.drawNums.filter(function(n){ return arguments[0]; });

    // 일치 번호 표시
    var bonusStr = result.hasBonus ? ' +보너스('+result.bonus+')' : '';
    return '<div style="display:flex;align-items:center;gap:8px;background:'+gradeColor+'18;border:1.5px solid '+gradeColor+';border-radius:8px;padding:7px 10px;margin-top:5px;">'+
        '<div style="font-size:13px;font-weight:bold;color:'+gradeColor+';min-width:48px;">'+gradeLabel+'</div>'+
        '<div style="font-size:12px;color:#555;">'+result.round+'회차'+bonusStr+' ('+result.matched+'개 일치)</div>'+
        '</div>';
}

// ────────────────────────────
//  결과 패널 업데이트
// ────────────────────────────
function updateSemiResult() {
    var list = document.getElementById('semiResultList');
    var labels = ['A','B','C','D','E'];
    var html = '';
    semiTickets.forEach(function(t, i) {
        var all = t.manualNums.concat(t.autoNums).sort(function(a,b){return a-b;});
        if (!all.length) return;

        html += '<div style="background:#f8f9fa;border-radius:10px;padding:12px;margin-bottom:10px;">';
        html += '<div style="font-size:13px;font-weight:bold;color:#667eea;margin-bottom:8px;">'+labels[i]+'게임</div>';

        // 번호 볼
        html += '<div style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:8px;">';
        all.forEach(function(n) {
            var isM = t.manualNums.indexOf(n) >= 0;
            html += '<div class="result-ball '+(isM?'ball-m':'ball-a')+'">'+n+'</div>';
        });
        for (var k=all.length; k<6; k++) html += '<div class="result-ball" style="background:#ddd;color:#999;">?</div>';
        html += '</div>';

        if (all.length === 6) {
            // 조합 정보
            var sum = all.reduce(function(a,b){return a+b;}, 0);
            var odd = all.filter(function(n){return n%2===1;}).length;
            html += '<div style="font-size:11px;color:#999;margin-bottom:8px;">합:'+sum+' 홀:'+odd+' 짝:'+(6-odd)+
                ' | <span style="color:#c00;">■수동</span> <span style="color:#667eea;">■자동</span></div>';

            // 당첨 비교
            if (lottoData && lottoData.length > 0) {
                var wins = checkWinHistory(all);
                if (wins.length > 0) {
                    html += '<div style="font-size:12px;font-weight:bold;color:#333;margin-bottom:5px;">🎯 당첨 이력</div>';
                    wins.forEach(function(w) { html += renderWinBadge(w); });
                } else {
                    html += '<div style="font-size:12px;color:#aaa;padding:6px 0;">🔍 당첨 이력 없음</div>';
                }
            }
        }
        html += '</div>';
    });
    list.innerHTML = html || '<div style="color:#aaa;text-align:center;padding:10px;">자동완성 버튼을 눌러주세요</div>';
}
