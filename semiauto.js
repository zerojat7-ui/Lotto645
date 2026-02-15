// ══════════════════════════════════════════
//  semiauto.js  - 반자동 (수동6개, CubeEngine 자동, 저장)
// ══════════════════════════════════════════
var semiTickets = [];

function addSemiTicket() {
    if (semiTickets.length >= 5) { alert('최대 5게임까지 가능합니다.'); return; }
    semiTickets.push({ manualNums:[], autoNums:[], done:false });
    renderSemiTickets();
    updateSemiSaveBtn();
}
function clearAllTickets() {
    semiTickets = [];
    var panel = document.getElementById('semiResultPanel');
    if (panel) panel.style.display = 'none';
    renderSemiTickets();
    updateSemiSaveBtn();
}
function toggleSemiNum(idx, num) {
    var t = semiTickets[idx];
    var pos = t.manualNums.indexOf(num);
    if (pos >= 0) {
        t.manualNums.splice(pos, 1);
    } else {
        if (t.manualNums.length >= 6) { alert('수동 번호는 최대 6개입니다.'); return; }
        t.manualNums.push(num);
    }
    t.autoNums = []; t.done = false;
    renderSemiTickets();
    updateSemiSaveBtn();
}

// ── 반자동 엔진 상태 Firebase 로드 ──
async function loadSemiEngineState() {
    try {
        var db = typeof firebase !== 'undefined' && firebase.apps.length > 0
                 ? firebase.firestore() : null;
        if (!db) return null;
        var snap = await db.collection('lotto_history').doc('semi_engine_state').get();
        if (snap.exists) {
            var data = snap.data();
            console.log('[SemiEngine] Firebase 학습 로드 완료 iteration:', data.iteration || 0);
            return data;
        }
        return null;
    } catch(e) {
        console.warn('[SemiEngine] Firebase 로드 실패:', e.message);
        return null;
    }
}

// ── 반자동 엔진 상태 Firebase 저장 ──
async function saveSemiEngineState(result, iteration) {
    try {
        var db = typeof firebase !== 'undefined' && firebase.apps.length > 0
                 ? firebase.firestore() : null;
        if (!db) return false;
        // probMap 키를 문자열로 변환 (Firestore 요구)
        var probMapStr = {};
        Object.keys(result.probMap).forEach(function(k) {
            probMapStr['n' + k] = result.probMap[k];
        });
        // fullPool 상위 50개만 저장 (반자동은 가볍게)
        var poolToSave = result.fullPool.slice(0, 50).map(function(combo) {
            return { items: combo };
        });
        await db.collection('lotto_history').doc('semi_engine_state').set({
            probMap  : probMapStr,
            pool     : poolToSave,
            iteration: iteration,
            savedAt  : firebase.firestore.FieldValue.serverTimestamp(),
            bestScore: result.scores[0] || 0
        });
        console.log('[SemiEngine] Firebase 학습 저장 완료 iteration:', iteration);
        return true;
    } catch(e) {
        console.warn('[SemiEngine] Firebase 저장 실패:', e.message);
        return false;
    }
}

// ── probMap 키 복원 (n1 → 숫자 1) ──
function restoreSemiProbMap(probMapStr) {
    if (!probMapStr) return null;
    var probMap = {};
    Object.keys(probMapStr).forEach(function(k) {
        var num = parseInt(k.replace('n', ''));
        if (!isNaN(num) && num >= 1 && num <= 45) {
            probMap[num] = parseFloat(probMapStr[k]);
        }
    });
    return Object.keys(probMap).length > 0 ? probMap : null;
}

// ── CubeEngine으로 자동 완성 (터보+excludeNumbers+Firebase 학습) ──
async function autoFillTicket(idx) {
    var t = semiTickets[idx];
    var needed = 6 - t.manualNums.length;

    // 6개 모두 수동이면 그냥 확정
    if (needed <= 0) {
        t.autoNums = []; t.done = true;
        renderSemiTickets();
        updateSemiResult();
        var panel = document.getElementById('semiResultPanel');
        if (panel) panel.style.display = 'block';
        updateSemiSaveBtn();
        return;
    }

    var btn = document.querySelector('[data-autobtn="'+idx+'"]');
    if (btn) { btn.textContent = '⏳'; btn.disabled = true; }

    if (typeof CubeEngine !== 'undefined' && lottoData && lottoData.length > 0) {
        try {
            // ① Firebase에서 이전 학습 상태 로드
            var engineState = await loadSemiEngineState();
            var prevProbMap = engineState ? restoreSemiProbMap(engineState.probMap) : null;
            var prevPool    = engineState ? (engineState.pool || []).map(function(p){ return p.items; }) : null;
            var prevIter    = engineState ? (engineState.iteration || 0) : 0;

            var historyNums = lottoData.map(function(d){ return d.numbers; });

            // ② 터보 프리셋 + excludeNumbers(수동선택번호 제외) + Firebase 학습 반영
            var result = await CubeEngine.generate(
                CubeEngine.withPreset('turbo', {
                    items          : 45,
                    pick           : needed,
                    history        : historyNums,
                    excludeNumbers : t.manualNums.slice(),   // 수동 선택 번호 제외
                    externalProbMap: prevProbMap,            // 이전 학습 확률맵
                    initialPool    : prevPool,               // 이전 세대 풀
                    topN           : 3
                })
            );

            // ③ 결과에서 겹치지 않는 번호 선택 (excludeNumbers 이미 적용되었지만 이중 체크)
            var candidates = result.results[0] || [];
            var picked = [];
            candidates.forEach(function(n){
                if (t.manualNums.indexOf(n) < 0 && picked.length < needed) picked.push(n);
            });
            // 부족하면 result 나머지 조합에서 보충
            for (var ri = 1; ri < result.results.length && picked.length < needed; ri++) {
                result.results[ri].forEach(function(n){
                    if (t.manualNums.indexOf(n) < 0 && picked.indexOf(n) < 0 && picked.length < needed) picked.push(n);
                });
            }
            // 그래도 부족하면 숫자 순으로 보충
            for (var n=1; n<=45 && picked.length < needed; n++) {
                if (t.manualNums.indexOf(n) < 0 && picked.indexOf(n) < 0) picked.push(n);
            }
            t.autoNums = picked.slice(0, needed);

            // ④ Firebase에 학습 결과 저장 (비동기 - 완료 대기 안 함)
            saveSemiEngineState(result, prevIter + 1);

        } catch(e) {
            console.warn('[SemiEngine] CubeEngine 오류:', e.message);
            t.autoNums = fallbackAuto(t.manualNums, needed);
        }
    } else {
        t.autoNums = fallbackAuto(t.manualNums, needed);
    }

    t.done = true;
    renderSemiTickets();
    updateSemiResult();
    var panel = document.getElementById('semiResultPanel');
    if (panel) panel.style.display = 'block';
    updateSemiSaveBtn();
}

// 폴백: 핫넘버 기반
function fallbackAuto(manualNums, needed) {
    var pool = [];
    for (var i=1; i<=45; i++) {
        if (manualNums.indexOf(i) < 0) {
            pool.push(i);
            if (analysis && analysis.hotNumbers && analysis.hotNumbers.indexOf(i) >= 0) pool.push(i);
        }
    }
    for (var i=pool.length-1; i>0; i--) {
        var j=Math.floor(Math.random()*(i+1)), tmp=pool[i]; pool[i]=pool[j]; pool[j]=tmp;
    }
    var picked=[], seen={};
    for (var i=0; i<pool.length && picked.length<needed; i++) {
        if (!seen[pool[i]]) { seen[pool[i]]=true; picked.push(pool[i]); }
    }
    return picked;
}

async function regenerateAuto() {
    for (var i=0; i<semiTickets.length; i++) {
        var t = semiTickets[i];
        if (t.manualNums.length > 0 || t.autoNums.length > 0) {
            t.autoNums = []; t.done = false;
            await autoFillTicket(i);
        }
    }
}

function removeSemiTicket(idx) {
    semiTickets.splice(idx, 1);
    renderSemiTickets();
    updateSemiResult();
    if (!semiTickets.length) {
        var panel = document.getElementById('semiResultPanel');
        if (panel) panel.style.display = 'none';
    }
    updateSemiSaveBtn();
}

// ── 저장 버튼 활성화 ──
function updateSemiSaveBtn() {
    var btn = document.getElementById('semiSaveBtn');
    if (!btn) return;
    var hasDone = semiTickets.some(function(t){ return t.done && (t.manualNums.length+t.autoNums.length)===6; });
    btn.disabled = !hasDone;
}

// ── 완성된 게임 저장 ──
async function saveSemiTickets() {
    var labels = ['A','B','C','D','E'];
    var nextRound = lottoData.length>0 ? lottoData[lottoData.length-1].round+1 : 1;

    // 저장할 티켓 수집
    var toSave = [];
    semiTickets.forEach(function(t, i) {
        if (!t.done) return;
        var all = t.manualNums.concat(t.autoNums).sort(function(a,b){return a-b;});
        if (all.length !== 6) return;
        toSave.push({ idx: i, label: labels[i], numbers: all });
    });

    if (!toSave.length) { alert('저장할 완성된 게임이 없습니다.'); return; }

    // ① 저장 버튼 즉시 비활성
    var saveBtn = document.getElementById('semiSaveBtn');
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = '⏳ 저장 중...'; }

    // ② 1개씩 저장
    var saved = 0;
    for (var i = 0; i < toSave.length; i++) {
        var item = toSave[i];

        // LocalStorage 저장
        var entry = saveForecastLocal({
            type   : 'semi',
            round  : nextRound,
            numbers: item.numbers
        });

        // Firebase 직접 저장
        var fbOk = false;
        if (typeof window._lottoDB !== 'undefined' && window._lottoDB) {
            try {
                var uid = localStorage.getItem('lotto_uid') || 'user_unknown';
                await window._lottoDB.collection('recommendations').add({
                    userId   : uid,
                    round    : entry.round,
                    type     : 'semi',
                    numbers  : entry.item,
                    cycle    : entry.cycle,
                    rank     : null,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                });
                fbOk = true;
            } catch(e) {
                console.error('Firebase semi 저장 오류:', e);
            }
        }

        // 해당 티켓 헤더에 저장 완료 표시
        var ticketEls = document.querySelectorAll('.lotto-ticket');
        if (ticketEls[item.idx]) {
            var header = ticketEls[item.idx].querySelector('.ticket-header');
            if (header) {
                var badge = document.createElement('span');
                badge.style.cssText = 'font-size:11px;padding:2px 8px;border-radius:8px;font-weight:bold;';
                badge.textContent = fbOk ? '🔥 저장됨' : '💾 로컬저장';
                badge.style.background = fbOk ? '#00C49F' : '#ffd700';
                badge.style.color = fbOk ? 'white' : '#333';
                header.appendChild(badge);
            }
        }
        saved++;
    }

    // ③ 저장 버튼 완료 상태
    if (saveBtn) {
        saveBtn.textContent = '✅ ' + saved + '게임 저장 완료';
        saveBtn.disabled = false;
        saveBtn.style.background = '#00C49F';
        setTimeout(function() {
            saveBtn.textContent = '💾 저장';
            saveBtn.style.background = '';
            updateSemiSaveBtn();
        }, 3000);
    }

    setTimeout(function() { goToRecordsTab(); }, 400);
}

// ── 렌더링 ──
function renderSemiTickets() {
    var container = document.getElementById('semiautoTickets');
    if (!container) return;
    container.innerHTML = '';
    if (!semiTickets.length) {
        container.innerHTML = '<div style="text-align:center;color:#aaa;padding:20px;font-size:14px;">+ 추가 버튼을 눌러 시작하세요</div>';
        return;
    }
    var labels = ['A','B','C','D','E'];
    semiTickets.forEach(function(t, ti) {
        var div = document.createElement('div');
        div.className = 'lotto-ticket';
        var selCount = t.manualNums.length;
        var allFull = selCount >= 6;

        var header = '<div class="ticket-header">'+
            '<div class="ticket-label">'+labels[ti]+'</div>'+
            '<div style="font-size:11px;color:#666;">'+
            '<span style="background:#c00;color:white;padding:2px 7px;border-radius:8px;font-size:11px;">수동 '+selCount+'</span> '+
            (allFull?'':'<span style="background:#667eea;color:white;padding:2px 7px;border-radius:8px;font-size:11px;">자동 '+(6-selCount)+'</span>')+
            '</div>'+
            '<button onclick="removeSemiTicket('+ti+')" style="background:none;border:none;color:#bbb;font-size:18px;cursor:pointer;">✕</button>'+
            '</div>';

        var grid = '<div class="ticket-grid">';
        for (var n=1; n<=45; n++) {
            var isM=t.manualNums.indexOf(n)>=0, isA=t.autoNums.indexOf(n)>=0;
            var cls='ticket-num'+(isM?' sel-manual':isA?' sel-auto':'');
            grid+='<div class="'+cls+'" onclick="toggleSemiNum('+ti+','+n+')">'+n+'</div>';
        }
        grid+='</div>';

        var footerMsg = selCount===0 ? '번호 선택 또는 바로 자동완성' :
                        selCount>=6  ? '6개 선택 완료!' :
                        (6-selCount)+'개 자동 대기';
        var autoDisabled = allFull ? ' disabled style="opacity:0.4;cursor:not-allowed;"' : '';
        var footer='<div class="ticket-footer" style="margin-top:8px;">'+
            '<div style="font-size:11px;color:#999;">'+footerMsg+'</div>'+
            '<button data-autobtn="'+ti+'" onclick="autoFillTicket('+ti+')"'+autoDisabled+
            ' style="padding:7px 14px;background:#667eea;color:white;border:none;border-radius:8px;font-size:13px;font-weight:bold;cursor:pointer;">'+
            (selCount>=6?'확정':'🤖 자동완성')+'</button></div>';

        div.innerHTML = header + grid + footer;
        container.appendChild(div);
    });
}

// ── 당첨 비교 ──
function checkWinHistory(numbers) {
    var results = [];
    for (var i=0; i<lottoData.length; i++) {
        var draw = lottoData[i];
        var matched = numbers.filter(function(n){ return draw.numbers.indexOf(n)>=0; }).length;
        var grade = 0;
        // 2등(보너스) 제외 - 보너스 번호를 당첨 기준에 포함하지 않음
        if      (matched===6) grade=1;
        else if (matched===5) grade=3;   // 2등 없음, 바로 3등
        else if (matched===4) grade=4;
        else if (matched===3) grade=5;
        if (grade>0) results.push({ round:draw.round, grade:grade, matched:matched, drawNums:draw.numbers });
    }
    return results;
}
function renderWinBadge(result) {
    var gradeColor = result.grade===1?'#FFD700':result.grade===3?'#CD7F32':result.grade===4?'#667eea':'#00C49F';
    var gradeLabel = result.grade===1?'🏆 1등':result.grade===3?'🥉 3등':result.grade===4?'4등':'5등';
    return '<div style="display:flex;align-items:center;gap:8px;background:'+gradeColor+'18;border:1.5px solid '+gradeColor+';border-radius:8px;padding:7px 10px;margin-top:5px;">'+
        '<div style="font-size:13px;font-weight:bold;color:'+gradeColor+';min-width:48px;">'+gradeLabel+'</div>'+
        '<div style="font-size:12px;color:#555;">'+result.round+'회차 ('+result.matched+'개 일치)</div></div>';
}
function updateSemiResult() {
    var list = document.getElementById('semiResultList');
    if (!list) return;
    var labels = ['A','B','C','D','E'];
    var html = '';
    semiTickets.forEach(function(t,i) {
        var all = t.manualNums.concat(t.autoNums).sort(function(a,b){return a-b;});
        if (!all.length) return;
        html += '<div style="background:#f8f9fa;border-radius:10px;padding:12px;margin-bottom:10px;">';
        html += '<div style="font-size:13px;font-weight:bold;color:#667eea;margin-bottom:8px;">'+labels[i]+'게임</div>';
        html += '<div style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:8px;">';
        all.forEach(function(n){
            var isM=t.manualNums.indexOf(n)>=0;
            var ring=isM?' ball-manual-ring':' ball-auto-ring';
            html+='<div class="result-ball '+ballClass(n)+ring+'">'+n+'</div>';
        });
        for (var k=all.length;k<6;k++) html+='<div class="result-ball" style="background:#ddd;color:#999;">?</div>';
        html+='</div>';
        if (all.length===6) {
            var sum=all.reduce(function(a,b){return a+b;},0);
            var odd=all.filter(function(n){return n%2===1;}).length;
            html+='<div style="font-size:11px;color:#999;margin-bottom:8px;">합:'+sum+' 홀:'+odd+' 짝:'+(6-odd)+
                ' | <span style="color:#c00;">■수동</span> <span style="color:#667eea;">■자동</span></div>';
            if (lottoData&&lottoData.length>0) {
                var wins=checkWinHistory(all);
                if (wins.length>0) {
                    html+='<div style="font-size:12px;font-weight:bold;color:#333;margin-bottom:5px;">🎯 당첨 이력</div>';
                    wins.forEach(function(w){html+=renderWinBadge(w);});
                } else {
                    html+='<div style="font-size:12px;color:#aaa;padding:6px 0;">🔍 당첨 이력 없음</div>';
                }
            }
        }
        html+='</div>';
    });
    list.innerHTML = html || '<div style="color:#aaa;text-align:center;padding:10px;">자동완성 버튼을 눌러주세요</div>';
}
