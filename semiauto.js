// ══════════════════════════════════════════
//  semiauto.js  - 반자동 (수동선택, CubeEngine 자동완성, 저장)
//  통합 엔진 학습: shared_engine_state (추천탭과 공유)
// ══════════════════════════════════════════
var semiTickets = [];

function addSemiTicket() {
    if (semiTickets.length >= 5) { alert('최대 5게임까지 가능합니다.'); return; }
    semiTickets.push({ manualNums:[], autoNums:[], done:false, savedUuid:null });
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
    // 번호 변경 시 자동번호·완료·저장 초기화
    t.autoNums = []; t.done = false; t.savedUuid = null;
    renderSemiTickets();
    updateSemiSaveBtn();
}

// ── CubeEngine으로 자동 완성 (통합 엔진 상태 사용) ──
async function autoFillTicket(idx) {
    var t = semiTickets[idx];
    var needed = 6 - t.manualNums.length;

    if (needed <= 0) {
        t.autoNums = []; t.done = true; t.savedUuid = null;
        renderSemiTickets();
        updateSemiResult();
        var panel = document.getElementById('semiResultPanel');
        if (panel) panel.style.display = 'block';
        updateSemiSaveBtn();
        return;
    }

    // 반자동 자동번호 1개당 2p 차감
    if (typeof usePoints === 'function') {
        if (!await usePoints(needed * 2, '반자동 자동번호 ' + needed + '개')) return;
    }

    // 번호 갱신 → 저장 상태 초기화
    t.savedUuid = null;

    var btn = document.querySelector('[data-autobtn="'+idx+'"]');
    if (btn) { btn.textContent = '⏳'; btn.disabled = true; }

    // AI 상태 메시지 초기화
    _setSemiAiMsg(idx, 'thinking');

    if (typeof CubeEngine !== 'undefined' && lottoData && lottoData.length > 0) {
        try {
            var loadFn    = window.loadSharedEngineState  || (async function(){ return null; });
            var saveFn    = window.saveSharedEngineState  || (async function(){ return false; });
            var restoreFn = window.restoreProbMap         || (function(){ return null; });

            var engineState = await loadFn();
            var prevProbMap = engineState ? restoreFn(engineState.probMap) : null;
            var prevPool    = engineState ? (engineState.pool || []).map(function(p){ return p.items; }) : null;
            var prevIter    = engineState ? (engineState.iteration || 0) : 0;

            if (prevProbMap) {
                console.log('[SemiEngine] 통합 엔진 로드 (iteration:', prevIter, ', 출처:', (engineState.source||'-') + ')');
            } else {
                console.log('[SemiEngine] 첫 실행: 신규 학습');
            }

            var historyNums = lottoData.map(function(d){ return d.numbers; });
            // v2.2.0: 보너스 번호 배열 추출
            var bonusNums = lottoData.map(function(d){ return d.bonus; }).filter(function(b){ return b && b >= 1 && b <= 45; });

            // 진행률 콜백으로 AI 메시지 업데이트
            var progressCb = function(stats) {
                var pct = stats && stats.progress ? stats.progress : 0;
                _setSemiAiMsg(idx, pct >= 50 ? 'selecting' : 'thinking');
            };

            var result = await CubeEngine.generate(
                CubeEngine.withPreset('turbo', {
                    items          : 45,
                    pick           : needed,
                    history        : historyNums,
                    bonusHistory   : bonusNums.length > 0 ? bonusNums : null,  // v2.2.0 보너스 학습
                    colorZoneWeight: 0.20,                                      // v2.2.0 색상구역 균형
                    excludeNumbers : t.manualNums.slice(),
                    externalProbMap: prevProbMap,
                    initialPool    : prevPool,
                    topN           : 3,
                    onProgress     : progressCb
                })
            );

            var candidates = result.results[0] || [];
            var picked = [];
            candidates.forEach(function(n){
                if (t.manualNums.indexOf(n) < 0 && picked.length < needed) picked.push(n);
            });
            for (var ri = 1; ri < result.results.length && picked.length < needed; ri++) {
                result.results[ri].forEach(function(n){
                    if (t.manualNums.indexOf(n) < 0 && picked.indexOf(n) < 0 && picked.length < needed) picked.push(n);
                });
            }
            for (var n=1; n<=45 && picked.length < needed; n++) {
                if (t.manualNums.indexOf(n) < 0 && picked.indexOf(n) < 0) picked.push(n);
            }
            t.autoNums = picked.slice(0, needed);

            saveFn(result, null, 'semi').then(function(savedIter){
                if (savedIter) console.log('[SemiEngine] 누적 학습 저장 완료 ✅ (총 iteration:', savedIter, ')');
            });

        } catch(e) {
            console.warn('[SemiEngine] CubeEngine 오류:', e.message);
            t.autoNums = fallbackAuto(t.manualNums, needed);
        }
    } else {
        t.autoNums = fallbackAuto(t.manualNums, needed);
    }

    t.done = true;
    _setSemiAiMsg(idx, 'done');
    renderSemiTickets();
    updateSemiResult();
    var panel = document.getElementById('semiResultPanel');
    if (panel) panel.style.display = 'block';
    updateSemiSaveBtn();
}

// ── AI 상태 메시지 업데이트 ──
function _setSemiAiMsg(idx, state) {
    var el = document.querySelector('[data-aimsg="'+idx+'"]');
    if (!el) return;
    if (state === 'thinking') {
        el.textContent = '🤔 Ai가 생각 중 입니다';
        el.style.color = '#f5a623';
    } else if (state === 'selecting') {
        el.textContent = '🎯 Ai가 번호를 선별 합니다';
        el.style.color = '#667eea';
    } else {
        el.textContent = '';
    }
}

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
            t.autoNums = []; t.done = false; t.savedUuid = null;
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

function updateSemiSaveBtn() {
    var btn = document.getElementById('semiSaveBtn');
    if (!btn) return;
    // 완성됐고 아직 저장 안 된 티켓이 하나라도 있어야 활성화
    var hasUnsaved = semiTickets.some(function(t) {
        return t.done && !t.savedUuid && (t.manualNums.length + t.autoNums.length) === 6;
    });
    btn.disabled = !hasUnsaved;
}

async function saveSemiTickets() {
    var labels = ['A','B','C','D','E'];
    var nextRound = lottoData.length>0 ? lottoData[lottoData.length-1].round+1 : 1;
    var engineVer = (typeof CubeEngine !== 'undefined') ? CubeEngine.version : null;

    var toSave = [];
    semiTickets.forEach(function(t, i) {
        if (!t.done) return;
        var all = t.manualNums.concat(t.autoNums).sort(function(a,b){return a-b;});
        if (all.length !== 6) return;
        // 이미 저장된 티켓은 제외 (번호 갱신 후에만 재저장 가능)
        if (t.savedUuid) return;
        var saveType = (t.manualNums.length >= 6 && t.autoNums.length === 0) ? 'manual' : 'semi';
        toSave.push({ idx: i, label: labels[i], numbers: all, type: saveType });
    });

    if (!toSave.length) {
        alert('저장할 게임이 없습니다.\n이미 저장된 게임은 번호를 갱신해야 다시 저장할 수 있습니다.');
        return;
    }

    // 기록 저장 1개당 1p × toSave.length 선차감 (포인트 부족 시 차단)
    if (typeof usePoints === 'function') {
        var ptNeeded = toSave.length;
        if (!await usePoints(ptNeeded, '기록 저장 ' + ptNeeded + '개')) return;
    }

    var saveBtn = document.getElementById('semiSaveBtn');
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = '⏳ 저장 중...'; }

    var saved = 0;
    for (var i = 0; i < toSave.length; i++) {
        var item = toSave[i];

        var entry = saveForecastLocal({
            type         : item.type,
            round        : nextRound,
            numbers      : item.numbers,
            engineVersion: engineVer
        });

        // 저장 완료 → savedUuid 기록 (중복 저장 방지)
        semiTickets[item.idx].savedUuid = entry.uuid;

        var fbOk = false;
        if (typeof window._lottoDB !== 'undefined' && window._lottoDB) {
            try {
                var uid = localStorage.getItem('lotto_uid') || 'user_unknown';
                await window._lottoDB.collection('recommendations').add({
                    userId       : uid,
                    round        : entry.round,
                    type         : item.type,
                    numbers      : entry.item,
                    cycle        : entry.cycle,
                    rank         : null,
                    engineVersion: engineVer,
                    createdAt    : firebase.firestore.FieldValue.serverTimestamp()
                });
                fbOk = true;
            } catch(e) {
                console.error('Firebase semi 저장 오류:', e);
            }
        }

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

    // 저장 버튼 상태 갱신
    updateSemiSaveBtn();

    if (saveBtn) {
        saveBtn.textContent = '✅ ' + saved + '게임 저장 완료';
        saveBtn.style.background = '#00C49F';
        setTimeout(function() {
            saveBtn.textContent = '💾 저장';
            saveBtn.style.background = '';
            updateSemiSaveBtn();
        }, 3000);
    }

    setTimeout(function() { goToRecordsTab(); }, 400);
}

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

        var header = '<div class="ticket-header">' +
            '<div class="ticket-label">'+labels[ti]+'</div>' +
            '<div style="font-size:11px;color:#666;">' +
            '<span style="background:#c00;color:white;padding:2px 7px;border-radius:8px;font-size:11px;">수동 '+selCount+'</span> ' +
            (allFull?'':'<span style="background:#667eea;color:white;padding:2px 7px;border-radius:8px;font-size:11px;">자동 '+(6-selCount)+'</span>') +
            '</div>' +
            '<button onclick="removeSemiTicket('+ti+')" style="background:none;border:none;color:#bbb;font-size:18px;cursor:pointer;">✕</button>' +
            '</div>';

        var grid = '<div class="ticket-grid">';
        for (var n=1; n<=45; n++) {
            var isM=t.manualNums.indexOf(n)>=0, isA=t.autoNums.indexOf(n)>=0;
            var cls='ticket-num'+(isM?' sel-manual':isA?' sel-auto':'');
            grid+='<div class="'+cls+'" onclick="toggleSemiNum('+ti+','+n+')">'+n+'</div>';
        }
        grid += '</div>';

        var footerMsg = selCount===0 ? '번호 선택 또는 바로 자동완성' :
                        selCount>=6  ? '6개 선택 완료! 확정하세요 👆' :
                        (6-selCount)+'개 자동 대기';
        var btnBg  = selCount >= 6 ? '#27ae60' : '#667eea';
        var btnTxt = selCount >= 6 ? '✅ 확정' : '🤖 자동완성';

        // 저장완료 티켓 표시
        var savedBadge = t.savedUuid
            ? '<span style="font-size:11px;color:#00a876;font-weight:bold;">✅ 저장됨 (번호 갱신 후 재저장 가능)</span>'
            : '<span data-aimsg="'+ti+'" style="font-size:11px;font-weight:bold;"></span>';

        var footer = '<div class="ticket-footer" style="margin-top:8px;flex-direction:column;gap:5px;">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;">' +
                '<div style="font-size:11px;color:#999;">' + footerMsg + '</div>' +
                '<button data-autobtn="' + ti + '" onclick="autoFillTicket(' + ti + ')" style="padding:7px 14px;background:' + btnBg + ';color:white;border:none;border-radius:8px;font-size:13px;font-weight:bold;cursor:pointer;">' +
                btnTxt + '</button>' +
            '</div>' +
            '<div style="min-height:16px;">' + savedBadge + '</div>' +
            '</div>';

        div.innerHTML = header + grid + footer;
        container.appendChild(div);
    });
}

function checkWinHistory(numbers) {
    var results = [];
    for (var i=0; i<lottoData.length; i++) {
        var draw = lottoData[i];
        var matched = numbers.filter(function(n){ return draw.numbers.indexOf(n)>=0; }).length;
        var grade = 0;
        if      (matched===6) grade=1;
        else if (matched===5) grade=3;
        else if (matched===4) grade=4;
        else if (matched===3) grade=5;
        if (grade>0) results.push({ round:draw.round, grade:grade, matched:matched, drawNums:draw.numbers });
    }
    return results;
}

function renderWinBadge(result) {
    var gradeColor = result.grade===1?'#FFD700':result.grade===3?'#CD7F32':result.grade===4?'#667eea':'#00C49F';
    var gradeLabel = result.grade===1?'🏆 1등':result.grade===3?'🥉 3등':result.grade===4?'4등':'5등';
    return '<div style="display:flex;align-items:center;gap:8px;background:'+gradeColor+'18;border:1.5px solid '+gradeColor+';border-radius:8px;padding:7px 10px;margin-top:5px;">' +
        '<div style="font-size:13px;font-weight:bold;color:'+gradeColor+';min-width:48px;">'+gradeLabel+'</div>' +
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
        html += '</div>';
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
        html += '</div>';
    });
    list.innerHTML = html || '<div style="color:#aaa;text-align:center;padding:10px;">자동완성 버튼을 눌러주세요</div>';
}
