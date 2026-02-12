// ══════════════════════════════
//  recommend.js  - 추천 엔진
// ══════════════════════════════

var refreshCounter = 0;
var recommendationHistory = [];
var currentRecommendations = [];
var advancedPool = [];
var finalTop5 = [];
var loadedRecData = [];

// ── 기본 점수 계산 ──
function calculateComboScore(combo) {
    var score = 0;
    combo.forEach(function(num) {
        var stat = analysis.numberStats.find(function(s){ return s.number === num; });
        score += stat.count * 1.2;
        score += stat.recentCount * 2;
        var reappear = 0;
        for (var i = 1; i < lottoData.length; i++) {
            if (lottoData[i].numbers.indexOf(num) >= 0 && lottoData[i-1].numbers.indexOf(num) >= 0) reappear++;
        }
        score += reappear * 3;
        var miss = 0;
        for (var i = lottoData.length - 1; i >= 0; i--) {
            if (lottoData[i].numbers.indexOf(num) >= 0) break;
            miss++;
        }
        score += (miss < 5 ? 5 : 0);
    });
    score += (countConsecutive(combo) === 1 ? 8 : 0);
    var ac = calculateAC(combo);
    if (Math.abs(ac - analysis.mostCommonAC) <= 1) score += 10;
    return score;
}

// ── 기본 추천 ──
function generateRecommendations() {
    refreshCounter++;
    document.getElementById('refreshCount').textContent = refreshCounter;
    var nextRound = lottoData[lottoData.length - 1].round + 1;
    document.getElementById('nextRoundLabel').textContent = nextRound;
    addLog('추천 번호 생성 중...');

    var recommendations = [];
    var attempts = 0;
    while (recommendations.length < 5 && attempts < 10000) {
        attempts++;
        var combo = new Set();
        var numHot = 2 + Math.floor(Math.random() * 2);
        for (var i = 0; i < numHot && combo.size < 6; i++) {
            combo.add(analysis.hotNumbers[Math.floor(Math.random() * Math.min(10, analysis.hotNumbers.length))]);
        }
        while (combo.size < 6) combo.add(1 + Math.floor(Math.random() * 45));
        var sorted = Array.from(combo).sort(function(a,b){return a-b;});
        var key = sorted.join(',');
        if (!analysis.existingCombos.has(key)) {
            var oddCnt = sorted.filter(function(n){return n%2===1;}).length;
            if (oddCnt >= 2 && oddCnt <= 4) {
                recommendations.push({
                    id: recommendations.length + 1,
                    numbers: sorted,
                    oddCount: oddCnt,
                    evenCount: 6 - oddCnt,
                    sum: sorted.reduce(function(a,b){return a+b;}, 0),
                    consecutive: countConsecutive(sorted),
                    ac: calculateAC(sorted)
                });
                analysis.existingCombos.add(key);
            }
        }
    }
    addLog(recommendations.length + '개 조합 생성 완료', 'success');
    displayRecommendations(recommendations);
    currentRecommendations = recommendations;
    recommendationHistory.push({ round: nextRound, refresh: refreshCounter, combos: recommendations });
}

function displayRecommendations(recs) {
    var container = document.getElementById('recommendations');
    container.innerHTML = '';
    if (recs.length === 0) {
        container.innerHTML = '<div class="alert alert-warning">추천 번호를 생성할 수 없습니다.</div>';
        return;
    }
    recs.forEach(function(rec) {
        var div = document.createElement('div');
        div.className = 'recommendation';
        div.innerHTML = '<div class="rec-header">' +
            '<div class="rec-title">추천 #' + rec.id + '</div>' +
            '<div style="font-size:11px;color:#666;">AC:' + rec.ac + ' 연속:' + rec.consecutive + '</div>' +
            '</div><div class="rec-numbers">' +
            rec.numbers.map(function(n){
                return '<div class="lotto-ball ' + (n%2===0?'even':'odd') + '">' + n + '</div>';
            }).join('') +
            '</div><div class="rec-info">' +
            '<div>홀: <strong>' + rec.oddCount + '</strong></div>' +
            '<div>짝: <strong>' + rec.evenCount + '</strong></div>' +
            '<div>합: <strong>' + rec.sum + '</strong></div>' +
            '</div>';
        container.appendChild(div);
    });
}

function refreshRecommendations() { generateRecommendations(); }

// ── 고급 50회 엔진 (비동기) ──
function monitorLog(msg) {
    var el = document.getElementById('monitorLog');
    var d = document.createElement('div');
    d.textContent = '[' + new Date().toLocaleTimeString('ko-KR') + '] ' + msg;
    el.appendChild(d);
    el.scrollTop = el.scrollHeight;
}
function monitorShowCombo(numbers) {
    var el = document.getElementById('monitorCurrentCombo');
    el.innerHTML = numbers.map(function(n){
        return '<div style="width:30px;height:30px;border-radius:50%;background:' +
               (n%2===0?'#00C49F':'#FF8042') +
               ';display:flex;align-items:center;justify-content:center;color:white;font-weight:bold;font-size:12px;">' + n + '</div>';
    }).join('');
}

async function runAdvancedEngine() {
    var btn = document.getElementById('advancedBtn');
    btn.disabled = true;
    btn.innerHTML = '⏳ 분석 중...';
    advancedPool = [];

    var monitor = document.getElementById('advancedMonitor');
    monitor.style.display = 'block';
    document.getElementById('monitorLog').innerHTML = '';
    document.getElementById('monitorRound').textContent = '0';
    document.getElementById('monitorCandidates').textContent = '0';
    document.getElementById('monitorBestScore').textContent = '-';
    document.getElementById('monitorBar').style.width = '0%';
    document.getElementById('monitorPercent').textContent = '0%';
    document.getElementById('advancedResults').innerHTML = '';
    document.getElementById('monitorCurrentCombo').innerHTML = '<span style="color:#555;font-size:12px;">시작...</span>';
    monitorLog('🚀 고급 분석 시작 (50회 x 5000개)');

    for (var round = 0; round < 50; round++) {
        await new Promise(function(r){ setTimeout(r, 0); });
        var pct = Math.round(round / 50 * 100);
        document.getElementById('monitorBar').style.width = pct + '%';
        document.getElementById('monitorPercent').textContent = pct + '%';
        document.getElementById('monitorRound').textContent = round + 1;

        var candidates = [];
        for (var i = 0; i < 5000; i++) {
            var set = new Set();
            while (set.size < 6) set.add(1 + Math.floor(Math.random() * 45));
            var combo = Array.from(set).sort(function(a,b){return a-b;});
            if (!analysis.existingCombos.has(combo.join(','))) {
                candidates.push({ numbers: combo, score: calculateComboScore(combo) });
                if (i % 500 === 0) monitorShowCombo(combo);
            }
        }
        candidates.sort(function(a,b){return b.score-a.score;});
        candidates.slice(0, 5).forEach(function(c){ advancedPool.push(c); });

        document.getElementById('monitorCandidates').textContent = advancedPool.length;
        if (advancedPool.length > 0) {
            var best = Math.max.apply(null, advancedPool.map(function(c){return c.score;}));
            document.getElementById('monitorBestScore').textContent = best.toFixed(1);
        }
        if ((round + 1) % 10 === 0) monitorLog('✅ ' + (round+1) + '회 완료 | 누적: ' + advancedPool.length);
    }

    advancedPool.sort(function(a,b){return b.score-a.score;});
    finalTop5 = advancedPool.slice(0, 5);
    document.getElementById('monitorBar').style.width = '100%';
    document.getElementById('monitorPercent').textContent = '100%';
    document.getElementById('monitorCurrentCombo').innerHTML = '<span style="color:#00ff88;">✅ 완료!</span>';
    monitorLog('🏆 TOP 5 선정 완료!');
    btn.disabled = false;
    btn.innerHTML = '🔁 다시 분석';
    displayFinalTop5();
}

function displayFinalTop5() {
    var container = document.getElementById('advancedResults');
    container.innerHTML = '';
    finalTop5.forEach(function(rec, idx) {
        var div = document.createElement('div');
        div.className = 'recommendation';
        div.innerHTML = '<div class="rec-header">' +
            '<div class="rec-title">' + (idx===0?'👑 대표':'고급 추천') + ' #' + (idx+1) + '</div>' +
            '<div style="font-size:11px;color:#666;">SCORE: ' + rec.score.toFixed(1) + '</div>' +
            '</div><div class="rec-numbers">' +
            rec.numbers.map(function(n){
                return '<div class="lotto-ball ' + (n%2===0?'even':'odd') + '">' + n + '</div>';
            }).join('') + '</div>';
        container.appendChild(div);
    });
}

// ── 추천번호 불러오기 분석 ──
function recLog(msg, color) {
    var el = document.getElementById('recProcessLog');
    var d = document.createElement('div');
    d.style.color = color || '#00ff88';
    d.textContent = '[' + new Date().toLocaleTimeString('ko-KR') + '] ' + msg;
    el.appendChild(d);
    el.scrollTop = el.scrollHeight;
}

function loadRecommendations(event) {
    var file = event.target.files[0];
    if (!file) return;
    document.getElementById('recAnalysisPanel').style.display = 'block';
    document.getElementById('recProcessLog').innerHTML = '';
    document.getElementById('recDupResult').innerHTML = '';
    document.getElementById('recDistResult').innerHTML = '';
    document.getElementById('recResult').style.display = 'none';
    document.getElementById('mergeResult').style.display = 'none';
    loadedRecData = [];
    recLog('📂 ' + file.name + ' 로드');
    var reader = new FileReader();
    reader.onload = function(e) {
        var lines = e.target.result.replace(/\r\n/g,'\n').replace(/\r/g,'\n').trim().split('\n');
        recLog('총 ' + lines.length + '줄 파싱');
        var parsed = 0, skipped = 0;
        lines.slice(1).forEach(function(line) {
            var parts = line.split(',').map(function(v){return v.trim();});
            if (parts.length < 8) { skipped++; return; }
            var round = parseInt(parts[0]);
            var refresh = parseInt(parts[1]);
            var nums = parts.slice(2, 8).map(function(n){return parseInt(n);});
            if (isNaN(round) || nums.some(isNaN)) { skipped++; return; }
            loadedRecData.push({ round: round, refresh: refresh, numbers: nums });
            parsed++;
        });
        recLog('완료: 유효 ' + parsed + '개, 건너뜀 ' + skipped + '개');
        var total = 0, totalMatch = 0;
        var matchDetail = {0:0,1:0,2:0,3:0,4:0,5:0,6:0};
        loadedRecData.forEach(function(rec) {
            var actual = lottoData.find(function(d){return d.round===rec.round;});
            if (actual) {
                var match = rec.numbers.filter(function(n){return actual.numbers.indexOf(n)>=0;}).length;
                totalMatch += match;
                matchDetail[match]++;
                total++;
            }
        });
        if (total > 0) {
            var rate = (totalMatch / (total * 6) * 100).toFixed(2);
            recLog('적중 분석: ' + total + '개 비교, 평균 ' + rate + '%');
            var el = document.getElementById('recResult');
            el.style.display = 'block';
            var rows = '';
            for (var k = 6; k >= 0; k--) {
                if (matchDetail[k] > 0) {
                    var lbl = k===6?'1등':k===5?'2/3등':k===4?'4등':k===3?'5등':(k+'개 일치');
                    rows += '<div class="analysis-item"><span class="analysis-label">' + lbl + '</span><span class="analysis-value">' + matchDetail[k] + '회</span></div>';
                }
            }
            el.innerHTML = '<div class="analysis-title">🏆 적중률 상세</div>' +
                '<div class="analysis-item"><span class="analysis-label">총 비교</span><span class="analysis-value">' + total + '개</span></div>' +
                '<div class="analysis-item"><span class="analysis-label">총 일치</span><span class="analysis-value">' + totalMatch + '개</span></div>' +
                '<div class="analysis-item"><span class="analysis-label">평균 적중률</span><span class="analysis-value">' + rate + '%</span></div>' + rows;
        }
        analyzeRecDuplication();
        analyzeRecDistribution();
        recLog('✅ 모든 분석 완료!');
    };
    reader.readAsText(file, 'UTF-8');
}

function analyzeRecDuplication() {
    var el = document.getElementById('recDupResult');
    if (!loadedRecData.length) { el.innerHTML = '<div style="color:#999">데이터 없음</div>'; return; }
    var dupMap = {};
    loadedRecData.forEach(function(r, i) {
        var k = r.numbers.join(',');
        if (!dupMap[k]) dupMap[k] = [];
        dupMap[k].push(i+1);
    });
    var dups = Object.entries(dupMap).filter(function(e){return e[1].length>1;});
    var sample = loadedRecData.slice(0, 20);
    var maxOverlap = 0, overlapPairs = [];
    for (var i = 0; i < sample.length; i++) {
        for (var j = i+1; j < sample.length; j++) {
            var shared = sample[i].numbers.filter(function(n){return sample[j].numbers.indexOf(n)>=0;});
            if (shared.length >= 3) overlapPairs.push({i:i+1,j:j+1,shared:shared,count:shared.length});
            if (shared.length > maxOverlap) maxOverlap = shared.length;
        }
    }
    overlapPairs.sort(function(a,b){return b.count-a.count;});
    var html = dups.length > 0
        ? '<div style="background:#ffebee;border-radius:8px;padding:10px;margin-bottom:8px;"><div style="font-weight:bold;color:#c62828;">🚨 완전 중복 ' + dups.length + '건</div>' +
          dups.map(function(d){return '<div style="font-size:12px;color:#c62828;">['+d[0]+'] '+d[1].length+'회</div>';}).join('') + '</div>'
        : '<div style="background:#e8f5e9;border-radius:8px;padding:10px;margin-bottom:8px;font-size:13px;color:#2e7d32;">✅ 완전 중복 없음</div>';
    if (overlapPairs.length > 0) {
        html += '<div style="font-size:13px;font-weight:bold;color:#e65100;margin-bottom:6px;">3개 이상 겹침 (' + overlapPairs.length + '쌍)</div>';
        overlapPairs.slice(0,8).forEach(function(p){
            html += '<div style="display:flex;align-items:center;gap:5px;margin-bottom:5px;flex-wrap:wrap;">' +
                '<span style="font-size:12px;color:#666;">조합'+p.i+' vs 조합'+p.j+' ('+p.count+'개):</span>' +
                p.shared.map(function(n){return '<div style="width:26px;height:26px;border-radius:50%;background:#ff8042;display:flex;align-items:center;justify-content:center;color:white;font-size:11px;font-weight:bold;">'+n+'</div>';}).join('') + '</div>';
        });
    } else html += '<div style="font-size:13px;color:#2e7d32;">✅ 3개 이상 겹침 없음</div>';
    html += '<div style="font-size:12px;color:#999;margin-top:6px;">최대 겹침: ' + maxOverlap + '개</div>';
    el.innerHTML = html;
}

function analyzeRecDistribution() {
    var el = document.getElementById('recDistResult');
    if (!loadedRecData.length) { el.innerHTML = '<div style="color:#999">데이터 없음</div>'; return; }
    var freq = {};
    for (var i = 1; i <= 45; i++) freq[i] = 0;
    loadedRecData.forEach(function(r){r.numbers.forEach(function(n){freq[n]++;});});
    var ranges = {'1-9':0,'10-19':0,'20-29':0,'30-39':0,'40-45':0};
    loadedRecData.forEach(function(r){r.numbers.forEach(function(n){
        if(n<=9)ranges['1-9']++;else if(n<=19)ranges['10-19']++;else if(n<=29)ranges['20-29']++;else if(n<=39)ranges['30-39']++;else ranges['40-45']++;
    });});
    var odd=0,even=0;
    loadedRecData.forEach(function(r){r.numbers.forEach(function(n){n%2===1?odd++:even++;});});
    var total=odd+even;
    var sorted=Object.entries(freq).filter(function(e){return e[1]>0;}).sort(function(a,b){return b[1]-a[1];});
    var maxF=sorted.length>0?sorted[0][1]:1;
    var rColors={'1-9':'#667eea','10-19':'#f093fb','20-29':'#4facfe','30-39':'#43e97b','40-45':'#fa709a'};
    var rTotal=Object.values(ranges).reduce(function(a,b){return a+b;},0);
    var html='<div style="margin-bottom:10px;"><div style="font-size:12px;color:#555;margin-bottom:5px;font-weight:bold;">홀짝 분포</div>' +
        '<div style="display:flex;gap:6px;">' +
        '<div style="flex:'+odd+';background:#FF8042;border-radius:6px;padding:7px;text-align:center;color:white;font-size:12px;font-weight:bold;">홀 '+odd+'<br><span style="font-size:10px;">'+(odd/total*100).toFixed(1)+'%</span></div>' +
        '<div style="flex:'+even+';background:#00C49F;border-radius:6px;padding:7px;text-align:center;color:white;font-size:12px;font-weight:bold;">짝 '+even+'<br><span style="font-size:10px;">'+(even/total*100).toFixed(1)+'%</span></div>' +
        '</div></div><div style="margin-bottom:10px;"><div style="font-size:12px;color:#555;margin-bottom:5px;font-weight:bold;">구간별 분포</div>';
    Object.entries(ranges).forEach(function(e){
        var lbl=e[0],cnt=e[1],pct=rTotal>0?(cnt/rTotal*100).toFixed(1):0;
        html+='<div style="display:flex;align-items:center;margin-bottom:4px;"><div style="width:46px;font-size:11px;color:#555;">'+lbl+'</div>' +
            '<div style="flex:1;background:#eee;border-radius:4px;height:17px;overflow:hidden;position:relative;">' +
            '<div style="width:'+pct+'%;height:100%;background:'+rColors[lbl]+';border-radius:4px;"></div>' +
            '<div style="position:absolute;right:4px;top:50%;transform:translateY(-50%);font-size:10px;font-weight:bold;color:#333;">'+cnt+'개 ('+pct+'%)</div>' +
            '</div></div>';
    });
    html+='</div><div style="font-size:12px;color:#555;margin-bottom:5px;font-weight:bold;">TOP 10 추천번호</div>';
    sorted.slice(0,10).forEach(function(e){
        var num=e[0],cnt=e[1],pct=(cnt/maxF*100).toFixed(0);
        var isHot=analysis&&analysis.hotNumbers&&analysis.hotNumbers.indexOf(parseInt(num))>=0;
        var bg=isHot?'#ff6b6b':'#667eea';
        html+='<div style="display:flex;align-items:center;margin-bottom:4px;">' +
            '<div style="width:26px;text-align:right;font-size:12px;font-weight:bold;color:'+bg+';margin-right:6px;">'+num+'</div>' +
            '<div style="flex:1;background:#eee;border-radius:4px;height:17px;overflow:hidden;position:relative;">' +
            '<div style="width:'+pct+'%;height:100%;background:'+bg+';border-radius:4px;"></div>' +
            '<div style="position:absolute;right:4px;top:50%;transform:translateY(-50%);font-size:10px;font-weight:bold;color:#333;">'+cnt+'회'+(isHot?' 🔥':'')+'</div>' +
            '</div></div>';
    });
    el.innerHTML=html;
    recLog('분포도 완료 (홀'+odd+'/짝'+even+')');
}

function mergeRecToData() {
    if (!loadedRecData.length) { alert('불러온 추천번호 없음'); return; }
    recLog('CSV 병합 저장...');
    var csv = '\uFEFF회차,번호1,번호2,번호3,번호4,번호5,번호6\n';
    lottoData.forEach(function(d){ csv += d.round+','+d.numbers.join(',')+'\n'; });
    csv += '\n회차_추천,갱신,번호1,번호2,번호3,번호4,번호5,번호6\n';
    loadedRecData.forEach(function(r){ csv += r.round+','+r.refresh+','+r.numbers.join(',')+'\n'; });
    var blob = new Blob([csv],{type:'text/csv;charset=utf-8;'});
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = '당첨번호_추천포함.csv';
    a.click();
    var el = document.getElementById('mergeResult');
    el.style.display = 'block';
    el.innerHTML = '✅ 저장 완료! 당첨 ' + lottoData.length + '개 + 추천 ' + loadedRecData.length + '개';
    recLog('✅ 완료!');
}

// ── CSV 다운로드 ──
function downloadWinCSV() {
    if (!lottoData.length) { alert('데이터가 없습니다.'); return; }
    var csv = '\uFEFF회차,번호1,번호2,번호3,번호4,번호5,번호6\n';
    lottoData.forEach(function(d){ csv += d.round+','+d.numbers.join(',')+'\n'; });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8;'}));
    a.download = '당첨번호.csv';
    a.click();
}

function downloadRecCSV() {
    if (!recommendationHistory.length) { alert('저장된 추천번호가 없습니다.'); return; }
    var csv = '\uFEFF회차,갱신,번호1,번호2,번호3,번호4,번호5,번호6\n';
    recommendationHistory.forEach(function(entry) {
        entry.combos.forEach(function(c) {
            csv += entry.round+','+entry.refresh+','+c.numbers.join(',')+'\n';
        });
    });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8;'}));
    a.download = '추천번호.csv';
    a.click();
}
