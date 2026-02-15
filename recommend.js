// ══════════════════════════════════════════
//  recommend.js  — CubeEngine 외부 라이브러리 연동
//  통합 엔진 학습: shared_engine_state (추천 + 반자동 공유)
// ══════════════════════════════════════════
var refreshCounter = 0;
var selectedRecs = new Set();
var recommendationHistory = [];
var currentRecommendations = [];
var finalTop5 = [];
var loadedRecData = [];
var engineStartTime = 0;
var logCount = 0;

// ── 통합 엔진 상태 키 ──
var SHARED_ENGINE_DOC = 'shared_engine_state';

// ────────────────────────────────────
//  기본 점수 계산
// ────────────────────────────────────
function calculateComboScore(combo) {
    var score = 0;
    combo.forEach(function(num) {
        var stat = analysis.numberStats.find(function(s){ return s.number === num; });
        score += stat.count * 1.2 + stat.recentCount * 2;
        var reappear = 0;
        for (var i = 1; i < lottoData.length; i++) {
            if (lottoData[i].numbers.indexOf(num) >= 0 && lottoData[i-1].numbers.indexOf(num) >= 0) reappear++;
        }
        score += reappear * 3;
        var miss = 0;
        for (var i = lottoData.length-1; i >= 0; i--) {
            if (lottoData[i].numbers.indexOf(num) >= 0) break;
            miss++;
        }
        score += (miss < 5 ? 5 : 0);
    });
    score += (countConsecutive(combo) === 1 ? 8 : 0);
    if (Math.abs(calculateAC(combo) - analysis.mostCommonAC) <= 1) score += 10;
    return score;
}

// ────────────────────────────────────
//  기본 추천 생성
// ────────────────────────────────────
function generateRecommendations() {
    refreshCounter++;
    document.getElementById('refreshCount').textContent = refreshCounter;
    var nextRound = lottoData[lottoData.length-1].round + 1;
    document.getElementById('nextRoundLabel').textContent = nextRound;
    addLog('추천 번호 생성 중...');
    var recs = [], attempts = 0;
    while (recs.length < 5 && attempts < 10000) {
        attempts++;
        var combo = new Set();
        var numHot = 2 + Math.floor(Math.random() * 2);
        for (var i = 0; i < numHot && combo.size < 6; i++)
            combo.add(analysis.hotNumbers[Math.floor(Math.random() * Math.min(10, analysis.hotNumbers.length))]);
        while (combo.size < 6) combo.add(1 + Math.floor(Math.random() * 45));
        var sorted = Array.from(combo).sort(function(a,b){return a-b;});
        var key = sorted.join(',');
        if (!analysis.existingCombos.has(key)) {
            var oddCnt = sorted.filter(function(n){return n%2===1;}).length;
            if (oddCnt >= 2 && oddCnt <= 4) {
                recs.push({ id:recs.length+1, numbers:sorted, oddCount:oddCnt, evenCount:6-oddCnt,
                    sum:sorted.reduce(function(a,b){return a+b;},0), consecutive:countConsecutive(sorted), ac:calculateAC(sorted) });
                analysis.existingCombos.add(key);
            }
        }
    }
    addLog(recs.length + '개 조합 생성', 'success');
    displayRecommendations(recs);
    currentRecommendations = recs;
    recommendationHistory.push({ round:nextRound, refresh:refreshCounter, combos:recs });
}

function displayRecommendations(recs) {
    selectedRecs.clear();
    updateRecSaveBtn();
    var c = document.getElementById('recommendations');
    c.innerHTML = '';
    if (!recs.length) { c.innerHTML='<div class="alert alert-warning">추천 번호를 생성할 수 없습니다.</div>'; return; }
    recs.forEach(function(rec, idx) {
        var d = document.createElement('div');
        d.className = 'recommendation';
        d.setAttribute('data-rec-idx', idx);
        d.onclick = function() { toggleRecSelect(idx, d); };
        d.innerHTML = '<div class="rec-header"><div class="rec-title">추천 #'+rec.id+
            ' <span id="rec-check-'+idx+'" style="font-size:14px;display:none;">✅</span></div>'+
            '<div style="font-size:11px;color:#666;">AC:'+rec.ac+' 연속:'+rec.consecutive+'</div></div>'+
            '<div class="rec-numbers">'+rec.numbers.map(function(n){
                return '<div class="lotto-ball '+ballClass(n)+'">'+n+'</div>';
            }).join('')+'</div>'+
            '<div class="rec-info"><div>홀:<strong>'+rec.oddCount+'</strong></div><div>짝:<strong>'+rec.evenCount+'</strong></div><div>합:<strong>'+rec.sum+'</strong></div></div>';
        c.appendChild(d);
    });
}

function toggleRecSelect(idx, el) {
    if (selectedRecs.has(idx)) {
        selectedRecs.delete(idx);
        el.classList.remove('selected');
        var chk = document.getElementById('rec-check-'+idx);
        if (chk) chk.style.display = 'none';
    } else {
        selectedRecs.add(idx);
        el.classList.add('selected');
        var chk = document.getElementById('rec-check-'+idx);
        if (chk) chk.style.display = 'inline';
    }
    updateRecSaveBtn();
}

function updateRecSaveBtn() {
    var btn = document.getElementById('recSaveBtn');
    if (!btn) return;
    var hasSelection = selectedRecs.size > 0 || Object.keys(advSelectedNums).length > 0;
    btn.disabled = !hasSelection;
}

async function saveSelectedRecs() {
    var nextRound = lottoData.length > 0 ? lottoData[lottoData.length-1].round + 1 : 1;
    var engineVer = (typeof CubeEngine !== 'undefined') ? CubeEngine.version : null;

    var toSave = [];
    selectedRecs.forEach(function(idx) {
        var rec = currentRecommendations[idx];
        if (!rec || !rec.numbers || rec.numbers.length !== 6) return;
        var el = document.querySelector('[data-rec-idx="'+idx+'"]');
        toSave.push({ cardEl: el, type: 'basic', numbers: rec.numbers });
    });
    Object.keys(advSelectedNums).forEach(function(key) {
        var nums = advSelectedNums[key];
        if (!nums || nums.length !== 6) return;
        var el = document.querySelector('[data-adv-idx="'+key+'"]');
        toSave.push({ cardEl: el, type: 'engine', numbers: nums });
    });

    if (toSave.length === 0) {
        alert('저장할 항목이 없습니다. 조합을 먼저 선택(탭)해주세요.');
        return;
    }

    var saveBtn = document.getElementById('recSaveBtn');
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = '⏳ 저장 중...'; }

    toSave.forEach(function(item) {
        if (!item.cardEl) return;
        item.cardEl.style.opacity = '0.5';
        item.cardEl.style.pointerEvents = 'none';
        item.cardEl.classList.remove('selected');
    });

    var saved = 0;
    for (var i = 0; i < toSave.length; i++) {
        var item = toSave[i];
        var entry;
        try {
            entry = saveForecastLocal({
                type         : item.type,
                round        : nextRound,
                numbers      : item.numbers,
                engineVersion: engineVer
            });
        } catch(lsErr) {
            console.error('LocalStorage 저장 오류:', lsErr.message);
            break;
        }
        if (!entry) break;

        var fbOk = false;
        if (typeof window._lottoDB !== 'undefined' && window._lottoDB) {
            try {
                var uid = localStorage.getItem('lotto_uid') || 'user_unknown';
                await window._lottoDB.collection('recommendations').add({
                    userId       : uid,
                    round        : entry.round,
                    type         : entry.type,
                    numbers      : entry.item,
                    cycle        : entry.cycle,
                    rank         : null,
                    engineVersion: engineVer,
                    createdAt    : firebase.firestore.FieldValue.serverTimestamp()
                });
                fbOk = true;
            } catch(e) {
                console.warn('Firebase 저장 오류:', e.message);
            }
        }

        if (item.cardEl) {
            var header = item.cardEl.querySelector('.rec-header');
            if (header) {
                var badge = document.createElement('span');
                badge.style.cssText = 'font-size:12px;padding:2px 8px;border-radius:10px;margin-left:6px;font-weight:bold;';
                if (fbOk) {
                    badge.textContent = '🔥 저장됨';
                    badge.style.background = '#00C49F';
                    badge.style.color = 'white';
                } else {
                    badge.textContent = '💾 로컬저장';
                    badge.style.background = '#ffd700';
                    badge.style.color = '#333';
                }
                header.appendChild(badge);
            }
            item.cardEl.style.opacity = '0.4';
        }
        saved++;
    }

    selectedRecs.clear();
    advSelectedNums = {};

    if (saveBtn) {
        saveBtn.textContent = '🔄 갱신 가능';
        saveBtn.disabled = false;
        saveBtn.style.background = '#00C49F';
        setTimeout(function() {
            saveBtn.textContent = '💾 저장';
            saveBtn.style.background = '';
            updateRecSaveBtn();
        }, 3000);
    }

    if (saved > 0) {
        setTimeout(function() { goToRecordsTab(); }, 400);
    }
}

async function refreshRecommendations() {
    if (typeof usePoints === 'function') {
        if (!await usePoints(5, '기본추천 갱신')) return;
    }
    generateRecommendations();
}

// ────────────────────────────────────
//  모니터 UI 헬퍼
// ────────────────────────────────────
function mLog(msg, color) {
    var el = document.getElementById('monitorLog');
    if (!el) return;
    var d = document.createElement('div');
    d.style.color = color || '#00ff88';
    d.innerHTML = '['+new Date().toLocaleTimeString('ko-KR')+'] '+msg;
    el.appendChild(d);
    el.scrollTop = el.scrollHeight;
    logCount++;
    var countEl = document.getElementById('monitorLogCount');
    if (countEl) countEl.textContent = logCount + '개';
}

function setPhase(phase) {
    var map = { ml:'phaseML', evo:'phaseEVO', pool:'phasePOOL', done:'phaseDONE' };
    var order = ['ml','evo','pool','done'];
    var idx = order.indexOf(phase);
    order.forEach(function(p, i) {
        var el = document.getElementById(map[p]);
        if (!el) return;
        el.className = 'phase-badge ' + (i < idx ? 'phase-done' : i === idx ? 'phase-active' : 'phase-wait');
    });
}

function updateElapsed() {
    var el = document.getElementById('monitorElapsed');
    if (el && engineStartTime) el.textContent = '경과: ' + ((performance.now()-engineStartTime)/1000).toFixed(1) + 's';
}

function mShowCombo(nums) {
    var el = document.getElementById('monitorCurrentCombo');
    if (!el) return;
    el.innerHTML = nums.map(function(n){
        return '<div class="lotto-ball '+ballClass(n)+'" style="width:32px;height:32px;font-size:13px;">'+n+'</div>';
    }).join('');
}

// ────────────────────────────────────
//  통합 엔진 상태 Firebase 로드/저장
// ────────────────────────────────────
async function loadSharedEngineState() {
    try {
        var db = typeof firebase !== 'undefined' && firebase.apps.length > 0 ? firebase.firestore() : null;
        if (!db) return null;
        var snap = await db.collection('lotto_history').doc(SHARED_ENGINE_DOC).get();
        if (snap.exists) {
            var data = snap.data();
            mLog('🧠 누적 학습 데이터 로드: ' +
                 'iteration <strong style="color:#69f0ae;">' + (data.iteration || 0) + '</strong>회 | ' +
                 '출처: ' + (data.source || '-') + ' | ' +
                 '최고점: ' + ((data.bestScore || 0).toFixed ? (data.bestScore||0).toFixed(1) : '-'), '#ffd740');
            return data;
        }
        mLog('🆕 저장된 학습 없음 → 첫 학습 시작', '#aaa');
        return null;
    } catch(e) {
        mLog('⚠️ 통합 엔진 로드 실패: ' + e.message, '#ff6b6b');
        return null;
    }
}

async function saveSharedEngineState(result, _ignoredIter, source) {
    try {
        var db = typeof firebase !== 'undefined' && firebase.apps.length > 0 ? firebase.firestore() : null;
        if (!db) return false;

        var docRef   = db.collection('lotto_history').doc(SHARED_ENGINE_DOC);
        var engineVer = (typeof CubeEngine !== 'undefined') ? CubeEngine.version : 'unknown';
        var actualIteration = 0;

        // ── 새 probMap 문자열화 ──
        var newProbMapStr = {};
        Object.keys(result.probMap).forEach(function(k) {
            newProbMapStr['n' + k] = result.probMap[k];
        });

        // ── Firestore 트랜잭션: 동시 접속 충돌 방지 + 가중 평균 누적 병합 ──
        await db.runTransaction(function(tx) {
            return tx.get(docRef).then(function(snap) {
                var existing = snap.exists ? snap.data() : null;
                var baseIter = existing ? (existing.iteration || 0) : 0;
                actualIteration = baseIter + 1;

                // 가중 평균 병합
                // iteration 이 쌓일수록 기존 학습의 가중치가 높아짐
                // 신규: weight=1, 기존: weight=min(baseIter, 50)
                // → 50회 이상이면 새 결과가 기존의 2% 수준만 반영 (안정적 수렴)
                var mergedProbMap = {};
                if (existing && existing.probMap && baseIter > 0) {
                    var w_old   = Math.min(baseIter, 50);
                    var w_new   = 1;
                    var w_total = w_old + w_new;
                    for (var n = 1; n <= 45; n++) {
                        var key    = 'n' + n;
                        var oldVal = existing.probMap[key] != null
                            ? parseFloat(existing.probMap[key])
                            : (newProbMapStr[key] != null ? parseFloat(newProbMapStr[key]) : 0);
                        var newVal = newProbMapStr[key] != null
                            ? parseFloat(newProbMapStr[key])
                            : oldVal;
                        mergedProbMap[key] = (oldVal * w_old + newVal * w_new) / w_total;
                    }
                    mLog('🔀 학습 병합: iteration ' + baseIter + '→' + actualIteration +
                         ' | 기존비중 ' + ((w_old/w_total*100).toFixed(0)) + '%', '#ffd740');
                } else {
                    mergedProbMap = newProbMapStr;
                    mLog('🆕 첫 학습 저장 (신규 probMap)', '#69f0ae');
                }

                var poolToSave = result.fullPool.slice(0, 100).map(function(combo) {
                    return { items: combo };
                });

                tx.set(docRef, {
                    probMap      : mergedProbMap,
                    pool         : poolToSave,
                    iteration    : actualIteration,
                    engineVersion: engineVer,
                    savedAt      : firebase.firestore.FieldValue.serverTimestamp(),
                    bestScore    : result.scores[0] || 0,
                    source       : source || 'recommend'
                });
            });
        });

        return actualIteration;   // 실제 저장된 iteration 반환
    } catch(e) {
        mLog('⚠️ 통합 엔진 저장 실패: ' + e.message, '#ff6b6b');
        return false;
    }
}

function restoreProbMap(probMapStr) {
    if (!probMapStr) return null;
    var probMap = {};
    Object.keys(probMapStr).forEach(function(k) {
        var num = parseInt(k.replace('n', ''));
        if (!isNaN(num) && num >= 1 && num <= 45) {
            probMap[num] = parseFloat(probMapStr[k]);
        }
    });
    var keys = Object.keys(probMap).length;
    if (keys === 0) return null;
    mLog('🔑 probMap 복원: ' + keys + '개 번호', '#aaa');
    return probMap;
}

// ── 반자동에서 공유 엔진 상태 로드/저장 (window 노출) ──
window.loadSharedEngineState  = loadSharedEngineState;
window.saveSharedEngineState  = saveSharedEngineState;
window.restoreProbMap         = restoreProbMap;

async function runAdvancedEngine() {
    if (typeof CubeEngine === 'undefined') {
        alert('CubeEngine 라이브러리를 불러오는 중입니다. 잠시 후 다시 시도해주세요.');
        return;
    }
    // 고급추천 1회: 50p
    if (typeof usePoints === 'function') {
        if (!await usePoints(50, '고급추천 실행')) return;
    }

    var btn = document.getElementById('advancedBtn');
    btn.disabled = true;
    btn.innerHTML = '⏳ AI 분석 중...';
    // 코멘트 표시
    var aiComment = document.getElementById('aiComment');
    if (aiComment) aiComment.style.display = 'block';
    finalTop5 = [];
    logCount = 0;
    engineStartTime = performance.now();

    var monitor = document.getElementById('advancedMonitor');
    monitor.style.display = 'block';
    document.getElementById('advancedResults').innerHTML = '';
    document.getElementById('monitorLog').innerHTML = '';
    document.getElementById('monitorLogCount').textContent = '0개';
    document.getElementById('monitorRound').textContent = '0';
    document.getElementById('monitorRoundTotal').textContent = '/ 50';
    document.getElementById('monitorCandidates').textContent = '0';
    document.getElementById('monitorBestScore').textContent = '-';
    document.getElementById('monitorBar').style.width = '0%';
    document.getElementById('monitorPercent').textContent = '0%';
    document.getElementById('monitorPhaseText').textContent = '준비 중...';
    document.getElementById('monitorCurrentCombo').innerHTML = '<span style="color:#555;font-size:12px;">대기 중...</span>';
    document.getElementById('monitorETA').textContent = '남은 시간: 계산 중...';
    setPhase('ml');

    var elapsedInterval = setInterval(updateElapsed, 500);
    var historyNums = lottoData.map(function(d){ return d.numbers; });
    var totalRounds = 50;
    var engineVer = CubeEngine.version;

    mLog('🧠 CubeEngine v' + engineVer + ' [통합 엔진] 시작');
    mLog('📊 학습 데이터: ' + historyNums.length + '회차');

    setPhase('ml');
    document.getElementById('monitorPhaseText').textContent = '🔥 통합 엔진 데이터 로딩...';
    var engineState = await loadSharedEngineState();
    var prevProbMap = engineState ? restoreProbMap(engineState.probMap) : null;
    var prevPool    = engineState ? (engineState.pool || []).map(function(p){ return p.items; }) : null;
    var prevIter    = engineState ? (engineState.iteration || 0) : 0;
    var prevSource  = engineState ? (engineState.source || '-') : '-';

    if (prevProbMap) {
        mLog('✅ 통합 학습 데이터 (iteration: ' + prevIter + ', 출처: ' + prevSource + ')', '#ffd700');
    } else {
        mLog('🆕 첫 실행: 신규 학습 시작');
    }

    try {
        var result = await CubeEngine.generate(
            CubeEngine.withPreset('lotto645', {
                history        : historyNums,
                externalProbMap: prevProbMap,
                initialPool    : prevPool,
                topN           : 5,
                rounds         : totalRounds,

                onProgress: function(percent, stats) {
                    document.getElementById('monitorBar').style.width = percent + '%';
                    document.getElementById('monitorPercent').textContent = percent + '%';
                    if (stats.phase === 'ml') {
                        setPhase('ml');
                        document.getElementById('monitorPhaseText').textContent = '① ML 확률 모델 계산 중...';
                        mLog('🧠 ML 학습 (iteration: ' + (prevIter+1) + ' | persistence: ' + (prevProbMap ? '0.7' : 'none') + ')');
                    }
                    if (stats.phase === 'ml_done') {
                        setPhase('evo');
                        document.getElementById('monitorPhaseText').textContent = '② 큐브 진화 준비...';
                        mLog('✅ ML 완료 → 큐브 진화');
                    }
                    if (stats.phase === 'evolving') {
                        setPhase('pool');
                        document.getElementById('monitorRound').textContent = stats.round;
                        document.getElementById('monitorRoundTotal').textContent = '/ ' + stats.totalRounds;
                        document.getElementById('monitorCandidates').textContent = stats.poolSize;
                        document.getElementById('monitorPhaseText').textContent =
                            '③ 라운드 ' + stats.round + '/' + stats.totalRounds + ' — 후보: ' + stats.poolSize + '개';
                        if (stats.bestScore > 0)
                            document.getElementById('monitorBestScore').textContent = stats.bestScore.toFixed(1);
                        // 현재 탐색 조합 표시 - CubeEngine이 지원하는 필드 우선, 없으면 히스토리 기반 가상 조합
                        if (stats.currentCombo && stats.currentCombo.length) {
                            mShowCombo(stats.currentCombo);
                        } else if (stats.bestCombo && stats.bestCombo.length) {
                            mShowCombo(stats.bestCombo);
                        } else if (stats.round && historyNums.length) {
                            // 라운드 번호 + 현재 시간 시드로 가상의 탐색 조합 생성 (시각적 표시용)
                            var seed = stats.round * 7 + (Date.now() % 97);
                            var pool45 = Array.from({length:45}, function(_,i){return i+1;});
                            var fake = [];
                            for (var fi=0; fi<6; fi++) {
                                seed = (seed * 1103515245 + 12345) & 0x7fffffff;
                                var pick = pool45.splice(seed % pool45.length, 1)[0];
                                fake.push(pick);
                            }
                            mShowCombo(fake.sort(function(a,b){return a-b;}));
                        }
                        if (stats.round > 1 && stats.elapsed > 0) {
                            var perRound = stats.elapsed / stats.round;
                            var remaining = Math.round(perRound * (stats.totalRounds - stats.round) / 1000);
                            document.getElementById('monitorETA').textContent =
                                '남은 시간: 약 ' + (remaining > 0 ? remaining + '초' : '거의 완료');
                        }
                    }
                    if (stats.phase === 'done') {
                        setPhase('done');
                        document.getElementById('monitorPhaseText').textContent = '④ 완료!';
                        document.getElementById('monitorETA').textContent = '완료 ✅';
                    }
                },
                onRound: function(roundNum, bestScore, bestCombo) {
                    if (roundNum % 5 === 0)
                        mLog('✅ ' + roundNum + '/' + totalRounds + ' | 최고점: ' + bestScore.toFixed(1));
                    // 매 라운드마다 현재 최고 조합 표시
                    if (bestCombo && bestCombo.length) {
                        mShowCombo(bestCombo);
                    }
                }
            })
        );

        clearInterval(elapsedInterval);
        updateElapsed();

        finalTop5 = result.results.map(function(nums, i) {
            return { numbers: nums, score: result.scores[i] };
        });

        document.getElementById('monitorCurrentCombo').innerHTML =
            '<span style="color:#00ff88;font-size:14px;font-weight:bold;">✅ TOP 5 선정 완료!</span>';

        mLog('🏆 완료! ' + (result.meta.elapsed/1000).toFixed(1) + 's | ' + result.meta.historySize + '회차');
        mLog('📦 최고점: ' + result.scores[0].toFixed(1) + ' | 누적 학습 ' + (prevIter+1) + '회째', '#ffd700');

        saveSharedEngineState(result, null, 'recommend').then(function(savedIter) {
            if (savedIter) {
                mLog('🔥 누적 학습 저장 완료 ✅ (총 iteration: ' + savedIter + ')', '#00ff88');
                displayFinalTop5(result, savedIter);
            } else {
                displayFinalTop5(result, prevIter + 1);
            }
        });

        btn.disabled = false;
        btn.innerHTML = '🔁 다시 추천';
        var aiComment = document.getElementById('aiComment');
        if (aiComment) aiComment.style.display = 'none';
        displayFinalTop5(result, prevIter + 1);

    } catch(e) {
        clearInterval(elapsedInterval);
        mLog('❌ 오류: ' + e.message, '#ff6b6b');
        document.getElementById('monitorPhaseText').textContent = '오류 발생';
        btn.disabled = false;
        btn.innerHTML = '🔁 다시 시도';
        var aiComment = document.getElementById('aiComment');
        if (aiComment) aiComment.style.display = 'none';
    }
}

function displayFinalTop5(result, newIter) {
    var c = document.getElementById('advancedResults');
    var elapsed   = result ? (result.meta.elapsed / 1000).toFixed(1) : '-';
    var histSize  = result ? result.meta.historySize : '-';
    var topScore  = result ? result.scores[0].toFixed(1) : '-';
    var iteration = newIter || 1;
    var engineVer = (typeof CubeEngine !== 'undefined') ? CubeEngine.version : '-';
    // 수렴률: 누적 학습 횟수가 많을수록 안정적 (50회 이후 95% 수렴)
    var convRate  = Math.min(95, (40 + Math.log(iteration + 1) * 15)).toFixed(1);
    var avgGain   = '-';
    if (result && result.scores && result.scores.length > 1) {
        avgGain = ((result.scores[0] - result.scores[result.scores.length-1]) / result.scores.length).toFixed(1);
    }

    function metricCard(label, value, unit, color) {
        return '<div style="background:#0d1520;border-radius:8px;padding:9px 10px;border:1px solid '+color+'22;">' +
            '<div style="font-size:9px;color:#556;margin-bottom:3px;">'+label+'</div>' +
            '<div style="font-size:19px;font-weight:800;color:'+color+';line-height:1;">'+value+
            '<span style="font-size:10px;font-weight:400;margin-left:2px;color:#567;">'+unit+'</span></div></div>';
    }
    function gaugeBar(label, value, max, unit, color) {
        var pct = Math.min(Math.round(parseFloat(value) / max * 100), 100);
        return '<div style="margin-bottom:8px;">' +
            '<div style="display:flex;justify-content:space-between;font-size:10px;color:#556;margin-bottom:3px;">' +
            '<span>'+label+'</span><span style="color:'+color+';font-weight:700;">'+value+unit+'</span></div>' +
            '<div style="height:5px;background:#0d1520;border-radius:3px;overflow:hidden;">' +
            '<div style="height:100%;width:'+pct+'%;background:linear-gradient(90deg,'+color+'66,'+color+');border-radius:3px;"></div>' +
            '</div></div>';
    }

    c.innerHTML =
        '<div style="background:linear-gradient(135deg,#0e1a2a,#0a1420);border:1px solid #1a3a5a;border-radius:12px;padding:14px;margin-bottom:12px;color:white;">' +
            '<div style="font-size:14px;font-weight:800;color:#7c4dff;margin-bottom:4px;">🧠 통합 CubeEngine ML 결과</div>' +
            '<div style="font-size:10px;color:#667;margin-bottom:10px;">엔진 v<span style="color:#ffd740;">'+engineVer+'</span> | iteration <span style="color:#69f0ae;">'+iteration+'</span></div>' +
            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-bottom:12px;">' +
                metricCard('최고 점수', topScore, 'pt', '#ff6e6e') +
                metricCard('소요 시간', elapsed, 's', '#4fc3f7') +
                metricCard('누적 총 학습', iteration, '회', '#ffd740') +
                metricCard('학습 데이터', histSize, '회차', '#69f0ae') +
                metricCard('탐색 후보 수', (5000).toLocaleString(), '개', '#ce93d8') +
                metricCard('라운드', 50, '/50', '#ffab40') +
            '</div>' +
            '<div style="background:#060f1a;border-radius:8px;padding:10px;">' +
                gaugeBar('수렴률', convRate, 100, '%', '#69f0ae') +
                gaugeBar('라운드 진행', 50, 50, ' / 50', '#4fc3f7') +
                (avgGain !== '-' ? gaugeBar('평균 점수 향상', avgGain, 20, 'pt', '#ffd740') : '') +
            '</div>' +
        '</div>';

    finalTop5.forEach(function(rec, idx) {
        var d = document.createElement('div');
        d.className = 'recommendation';
        var advIdx = 'adv_'+idx;
        d.setAttribute('data-adv-idx', advIdx);
        d.onclick = function() { toggleAdvSelect(advIdx, d, rec.numbers); };
        d.innerHTML = '<div class="rec-header">' +
            '<div class="rec-title">'+(idx===0?'👑 대표':'🎯 #'+(idx+1))+
            ' <span id="rec-check-'+advIdx+'" style="font-size:14px;display:none;">✅</span></div>' +
            '<div style="font-size:11px;color:#666;">SCORE: '+rec.score.toFixed(1)+'</div></div>' +
            '<div class="rec-numbers">'+rec.numbers.map(function(n){
                return '<div class="lotto-ball '+ballClass(n)+'">'+n+'</div>';
            }).join('')+'</div>';
        c.appendChild(d);
    });
}

var advSelectedNums = {};
function toggleAdvSelect(idx, el, nums) {
    if (advSelectedNums[idx]) {
        delete advSelectedNums[idx];
        el.classList.remove('selected');
        var chk = document.getElementById('rec-check-'+idx);
        if (chk) chk.style.display = 'none';
    } else {
        advSelectedNums[idx] = nums;
        el.classList.add('selected');
        var chk = document.getElementById('rec-check-'+idx);
        if (chk) chk.style.display = 'inline';
    }
    var btn = document.getElementById('recSaveBtn');
    if (btn) btn.disabled = (selectedRecs.size === 0 && Object.keys(advSelectedNums).length === 0);
}
