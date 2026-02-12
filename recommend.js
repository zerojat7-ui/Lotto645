// ══════════════════════════════════════════
//  recommend.js  — 추천 엔진 (큐브 ML 통합)
// ══════════════════════════════════════════
var refreshCounter = 0;
var recommendationHistory = [];
var currentRecommendations = [];
var advancedPool = [];
var finalTop5 = [];
var loadedRecData = [];

// ────────────────────────────
//  큐브 ML 엔진 설정
// ────────────────────────────
var CUBE_LAMBDA      = 0.18;
var CUBE_LR          = 0.05;
var CUBE_EVOLVE_TIME = 800;    // ms (모바일 배려, 원본 4000)
var CUBE_LOOP_MIN    = 30000;  // 원본 80000

function cubeBase(x) { return Math.sin(x) + Math.cos(x / 2); }
function cubeSigmoid(x) { return 1 / (1 + Math.exp(-x)); }

function buildMLProbabilities(pastDraws) {
    var scores = [];
    for (var i = 0; i < 45; i++) scores.push(cubeBase(i + 1));
    var total = pastDraws.length;
    pastDraws.forEach(function(draw, index) {
        var w = Math.exp(-CUBE_LAMBDA * (total - index - 1));
        draw.forEach(function(n) { scores[n-1] += w; });
    });
    pastDraws.forEach(function(draw) {
        for (var i = 0; i < 45; i++) {
            var predicted = cubeSigmoid(scores[i]);
            var actual = draw.indexOf(i+1) >= 0 ? 1 : 0;
            scores[i] += CUBE_LR * (actual - predicted);
        }
    });
    var probs = scores.map(cubeSigmoid);
    var avg = probs.reduce(function(a,b){return a+b;}, 0) / 45;
    var scale = (7/45) / avg;
    return probs.map(function(p){ return Math.min(p * scale, 1); });
}

async function evolveHybridCube(num, initialProb) {
    var adaptiveProb = initialProb, score = 0, success = 0, total = 0;
    var start = performance.now();
    while (performance.now() - start < CUBE_EVOLVE_TIME || total < CUBE_LOOP_MIN) {
        total++;
        if (Math.random() < adaptiveProb) { success++; score++; }
        if (total % 1000 === 0) {
            var diff = initialProb - success / total;
            adaptiveProb = Math.min(Math.max(adaptiveProb + diff * 0.1, 0.03), 0.4);
        }
    }
    return { num: num, score: score };
}

function isTooSimilar(picked, history, threshold) {
    threshold = threshold || 5;
    for (var i = 0; i < history.length; i++) {
        var match = 0;
        for (var j = 0; j < picked.length; j++) {
            if (history[i].indexOf(picked[j]) >= 0) match++;
        }
        if (match >= threshold) return true;
    }
    return false;
}

// ────────────────────────────
//  기본 점수 계산
// ────────────────────────────
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

// ────────────────────────────
//  기본 추천 생성
// ────────────────────────────
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
    var c = document.getElementById('recommendations');
    c.innerHTML = '';
    if (!recs.length) { c.innerHTML='<div class="alert alert-warning">추천 번호를 생성할 수 없습니다.</div>'; return; }
    recs.forEach(function(rec) {
        var d = document.createElement('div');
        d.className = 'recommendation';
        d.innerHTML = '<div class="rec-header"><div class="rec-title">추천 #'+rec.id+'</div>'+
            '<div style="font-size:11px;color:#666;">AC:'+rec.ac+' 연속:'+rec.consecutive+'</div></div>'+
            '<div class="rec-numbers">'+rec.numbers.map(function(n){
                return '<div class="lotto-ball '+(n%2===0?'even':'odd')+'">'+n+'</div>';
            }).join('')+'</div>'+
            '<div class="rec-info"><div>홀:<strong>'+rec.oddCount+'</strong></div><div>짝:<strong>'+rec.evenCount+'</strong></div><div>합:<strong>'+rec.sum+'</strong></div></div>';
        c.appendChild(d);
    });
}

function refreshRecommendations() { generateRecommendations(); }

// ────────────────────────────
//  모니터 유틸
// ────────────────────────────
function monitorLog(msg) {
    var el = document.getElementById('monitorLog');
    var d = document.createElement('div');
    d.textContent = '['+new Date().toLocaleTimeString('ko-KR')+'] '+msg;
    el.appendChild(d); el.scrollTop = el.scrollHeight;
}
function monitorShowCombo(nums) {
    document.getElementById('monitorCurrentCombo').innerHTML = nums.map(function(n){
        return '<div style="width:30px;height:30px;border-radius:50%;background:'+(n%2===0?'#00C49F':'#FF8042')+
               ';display:flex;align-items:center;justify-content:center;color:white;font-weight:bold;font-size:12px;">'+n+'</div>';
    }).join('');
}

// ────────────────────────────
//  고급 엔진: 큐브 ML × 5000개
// ────────────────────────────
async function runAdvancedEngine() {
    var btn = document.getElementById('advancedBtn');
    btn.disabled = true; btn.innerHTML = '⏳ 분석 중...';
    advancedPool = [];
    var monitor = document.getElementById('advancedMonitor');
    monitor.style.display = 'block';
    ['monitorLog','advancedResults'].forEach(function(id){ document.getElementById(id).innerHTML=''; });
    document.getElementById('monitorRound').textContent='0';
    document.getElementById('monitorCandidates').textContent='0';
    document.getElementById('monitorBestScore').textContent='-';
    document.getElementById('monitorBar').style.width='0%';
    document.getElementById('monitorPercent').textContent='0%';
    document.getElementById('monitorCurrentCombo').innerHTML='<span style="color:#555;font-size:12px;">시작...</span>';

    // 과거 당첨번호 배열
    var historyNums = lottoData.map(function(d){ return d.numbers; });

    monitorLog('🧠 ML 확률 모델 계산 중...');
    var mlProbs = buildMLProbabilities(historyNums);
    monitorLog('✅ ML 확률 완료 (lambda='+CUBE_LAMBDA+', lr='+CUBE_LR+')');
    monitorLog('🚀 큐브 진화 × 50라운드 × 5000개 시작');

    for (var round = 0; round < 50; round++) {
        await new Promise(function(r){ setTimeout(r, 0); });
        var pct = Math.round(round / 50 * 100);
        document.getElementById('monitorBar').style.width = pct + '%';
        document.getElementById('monitorPercent').textContent = pct + '%';
        document.getElementById('monitorRound').textContent = round + 1;

        // 큐브 진화: 45개 번호 동시 진화
        var cubeRes = await Promise.all(
            Array.from({length:45}, function(_, i){ return evolveHybridCube(i+1, mlProbs[i]); })
        );
        cubeRes.sort(function(a,b){ return b.score - a.score; });
        var topNums = cubeRes.map(function(r){ return r.num; });

        // 5000개 조합 생성
        var candidates = [];
        for (var i = 0; i < 5000; i++) {
            var combo = new Set();
            // 상위 번호 2~3개 반드시 포함
            var must = 2 + Math.floor(Math.random() * 2);
            for (var m = 0; m < must && combo.size < 6; m++)
                combo.add(topNums[Math.floor(Math.random() * 15)]);
            // ML 확률 기반 나머지 채우기
            var att = 0;
            while (combo.size < 6 && att++ < 200) {
                var idx = Math.floor(Math.random() * 45);
                if (Math.random() < mlProbs[idx] * 3) combo.add(idx + 1);
            }
            while (combo.size < 6) combo.add(1 + Math.floor(Math.random() * 45));
            var arr = Array.from(combo).sort(function(a,b){return a-b;});
            if (!analysis.existingCombos.has(arr.join(',')) && !isTooSimilar(arr, historyNums, 5))
                candidates.push({ numbers:arr, score:calculateComboScore(arr) });
            if (i % 500 === 0) monitorShowCombo(arr);
        }
        candidates.sort(function(a,b){ return b.score - a.score; });
        candidates.slice(0, 5).forEach(function(c){ advancedPool.push(c); });

        document.getElementById('monitorCandidates').textContent = advancedPool.length;
        if (advancedPool.length > 0) {
            var best = advancedPool.reduce(function(mx,c){ return c.score>mx?c.score:mx; }, 0);
            document.getElementById('monitorBestScore').textContent = best.toFixed(1);
        }
        if ((round+1) % 10 === 0)
            monitorLog('✅ '+(round+1)+'회 | 누적:'+advancedPool.length+' | 최고:'+
                (advancedPool.length?advancedPool.reduce(function(mx,c){return c.score>mx?c.score:mx;},0).toFixed(1):'-'));
    }

    advancedPool.sort(function(a,b){ return b.score-a.score; });
    finalTop5 = advancedPool.slice(0, 5);
    document.getElementById('monitorBar').style.width = '100%';
    document.getElementById('monitorPercent').textContent = '100%';
    document.getElementById('monitorCurrentCombo').innerHTML = '<span style="color:#00ff88;font-size:14px;">✅ 완료!</span>';
    monitorLog('🏆 큐브 ML TOP 5 선정 완료!');
    btn.disabled = false; btn.innerHTML = '🔁 다시 분석';
    displayFinalTop5();
}

function displayFinalTop5() {
    var c = document.getElementById('advancedResults');
    c.innerHTML = '<div style="background:#1a1a2e;border-radius:10px;padding:12px;margin-bottom:12px;color:white;">'+
        '<div style="color:#00ff88;font-size:13px;font-weight:bold;margin-bottom:3px;">🧠 큐브 ML 엔진 결과</div>'+
        '<div style="color:#aaa;font-size:11px;">ML확률모델 × 큐브진화 × 5000개 × 50라운드</div></div>';
    finalTop5.forEach(function(rec, idx) {
        var d = document.createElement('div');
        d.className = 'recommendation';
        d.innerHTML = '<div class="rec-header">'+
            '<div class="rec-title">'+(idx===0?'👑 대표':'🎯 추천 #'+(idx+1))+'</div>'+
            '<div style="font-size:11px;color:#666;">SCORE: '+rec.score.toFixed(1)+'</div></div>'+
            '<div class="rec-numbers">'+rec.numbers.map(function(n){
                return '<div class="lotto-ball '+(n%2===0?'even':'odd')+'">'+n+'</div>';
            }).join('')+'</div>';
        c.appendChild(d);
    });
}

// ────────────────────────────
//  추천번호 불러오기
// ────────────────────────────
function recLog(msg, color) {
    var el=document.getElementById('recProcessLog'), d=document.createElement('div');
    d.style.color=color||'#00ff88';
    d.textContent='['+new Date().toLocaleTimeString('ko-KR')+'] '+msg;
    el.appendChild(d); el.scrollTop=el.scrollHeight;
}
function loadRecommendations(event) {
    var file=event.target.files[0]; if(!file) return;
    document.getElementById('recAnalysisPanel').style.display='block';
    ['recProcessLog','recDupResult','recDistResult'].forEach(function(id){document.getElementById(id).innerHTML='';});
    document.getElementById('recResult').style.display='none';
    document.getElementById('mergeResult').style.display='none';
    loadedRecData=[];
    recLog('📂 '+file.name);
    var reader=new FileReader();
    reader.onload=function(e){
        var lines=e.target.result.replace(/\r\n/g,'\n').replace(/\r/g,'\n').trim().split('\n');
        recLog('총 '+lines.length+'줄');
        var parsed=0, skipped=0;
        lines.slice(1).forEach(function(line){
            var p=line.split(',').map(function(v){return v.trim();});
            if(p.length<8){skipped++;return;}
            var round=parseInt(p[0]),refresh=parseInt(p[1]);
            var nums=p.slice(2,8).map(Number);
            if(isNaN(round)||nums.some(isNaN)){skipped++;return;}
            loadedRecData.push({round:round,refresh:refresh,numbers:nums}); parsed++;
        });
        recLog('완료: 유효 '+parsed+'개');
        var total=0,totalMatch=0,matchDetail={0:0,1:0,2:0,3:0,4:0,5:0,6:0};
        loadedRecData.forEach(function(rec){
            var actual=lottoData.find(function(d){return d.round===rec.round;});
            if(actual){var match=rec.numbers.filter(function(n){return actual.numbers.indexOf(n)>=0;}).length;totalMatch+=match;matchDetail[match]++;total++;}
        });
        if(total>0){
            var rate=(totalMatch/(total*6)*100).toFixed(2);
            recLog('적중: '+total+'개, 평균 '+rate+'%');
            var el=document.getElementById('recResult'); el.style.display='block';
            var rows='';
            for(var k=6;k>=0;k--){if(matchDetail[k]>0){var lbl=k===6?'1등':k===5?'2/3등':k===4?'4등':k===3?'5등':(k+'개 일치');rows+='<div class="analysis-item"><span class="analysis-label">'+lbl+'</span><span class="analysis-value">'+matchDetail[k]+'회</span></div>';}}
            el.innerHTML='<div class="analysis-title">🏆 적중률</div><div class="analysis-item"><span class="analysis-label">총 비교</span><span class="analysis-value">'+total+'개</span></div><div class="analysis-item"><span class="analysis-label">평균 적중률</span><span class="analysis-value">'+rate+'%</span></div>'+rows;
        }
        analyzeRecDuplication(); analyzeRecDistribution();
        recLog('✅ 완료!');
    };
    reader.readAsText(file,'UTF-8');
}
function analyzeRecDuplication() {
    var el=document.getElementById('recDupResult');
    if(!loadedRecData.length){el.innerHTML='<div style="color:#999">없음</div>';return;}
    var dupMap={};
    loadedRecData.forEach(function(r,i){var k=r.numbers.join(',');if(!dupMap[k])dupMap[k]=[];dupMap[k].push(i+1);});
    var dups=Object.entries(dupMap).filter(function(e){return e[1].length>1;});
    var sample=loadedRecData.slice(0,20),maxOv=0,pairs=[];
    for(var i=0;i<sample.length;i++)for(var j=i+1;j<sample.length;j++){
        var sh=sample[i].numbers.filter(function(n){return sample[j].numbers.indexOf(n)>=0;});
        if(sh.length>=3)pairs.push({i:i+1,j:j+1,shared:sh,count:sh.length});
        if(sh.length>maxOv)maxOv=sh.length;
    }
    pairs.sort(function(a,b){return b.count-a.count;});
    var html=dups.length>0?'<div style="background:#ffebee;border-radius:8px;padding:10px;margin-bottom:8px;"><div style="font-weight:bold;color:#c62828;">🚨 완전중복 '+dups.length+'건</div>'+dups.map(function(d){return '<div style="font-size:12px;color:#c62828;">['+d[0]+'] '+d[1].length+'회</div>';}).join('')+'</div>':'<div style="background:#e8f5e9;border-radius:8px;padding:10px;margin-bottom:8px;font-size:13px;color:#2e7d32;">✅ 완전 중복 없음</div>';
    if(pairs.length>0){html+='<div style="font-size:13px;font-weight:bold;color:#e65100;margin-bottom:6px;">3개 이상 겹침 ('+pairs.length+'쌍)</div>';pairs.slice(0,8).forEach(function(p){html+='<div style="display:flex;align-items:center;gap:5px;margin-bottom:5px;flex-wrap:wrap;"><span style="font-size:12px;color:#666;">조합'+p.i+' vs 조합'+p.j+':</span>'+p.shared.map(function(n){return '<div style="width:24px;height:24px;border-radius:50%;background:#ff8042;display:flex;align-items:center;justify-content:center;color:white;font-size:11px;font-weight:bold;">'+n+'</div>';}).join('')+'</div>';});}
    else html+='<div style="font-size:13px;color:#2e7d32;">✅ 겹침 없음</div>';
    html+='<div style="font-size:12px;color:#999;margin-top:5px;">최대 겹침:'+maxOv+'개</div>';
    el.innerHTML=html;
}
function analyzeRecDistribution() {
    var el=document.getElementById('recDistResult');
    if(!loadedRecData.length){el.innerHTML='<div style="color:#999">없음</div>';return;}
    var freq={};for(var i=1;i<=45;i++)freq[i]=0;
    loadedRecData.forEach(function(r){r.numbers.forEach(function(n){freq[n]++;});});
    var ranges={'1-9':0,'10-19':0,'20-29':0,'30-39':0,'40-45':0};
    loadedRecData.forEach(function(r){r.numbers.forEach(function(n){if(n<=9)ranges['1-9']++;else if(n<=19)ranges['10-19']++;else if(n<=29)ranges['20-29']++;else if(n<=39)ranges['30-39']++;else ranges['40-45']++;});});
    var odd=0,even=0;loadedRecData.forEach(function(r){r.numbers.forEach(function(n){n%2===1?odd++:even++;});});
    var total=odd+even,sorted=Object.entries(freq).filter(function(e){return e[1]>0;}).sort(function(a,b){return b[1]-a[1];});
    var maxF=sorted.length>0?sorted[0][1]:1,rColors={'1-9':'#667eea','10-19':'#f093fb','20-29':'#4facfe','30-39':'#43e97b','40-45':'#fa709a'};
    var rTotal=Object.values(ranges).reduce(function(a,b){return a+b;},0);
    var html='<div style="margin-bottom:10px;"><div style="font-size:12px;font-weight:bold;color:#555;margin-bottom:5px;">홀짝</div><div style="display:flex;gap:6px;"><div style="flex:'+odd+';background:#FF8042;border-radius:6px;padding:6px;text-align:center;color:white;font-size:12px;font-weight:bold;">홀 '+odd+'<br><span style="font-size:10px;">'+(odd/total*100).toFixed(1)+'%</span></div><div style="flex:'+even+';background:#00C49F;border-radius:6px;padding:6px;text-align:center;color:white;font-size:12px;font-weight:bold;">짝 '+even+'<br><span style="font-size:10px;">'+(even/total*100).toFixed(1)+'%</span></div></div></div><div style="margin-bottom:10px;"><div style="font-size:12px;font-weight:bold;color:#555;margin-bottom:5px;">구간</div>';
    Object.entries(ranges).forEach(function(e){var lbl=e[0],cnt=e[1],pct=rTotal>0?(cnt/rTotal*100).toFixed(1):0;html+='<div style="display:flex;align-items:center;margin-bottom:4px;"><div style="width:46px;font-size:11px;color:#555;">'+lbl+'</div><div style="flex:1;background:#eee;border-radius:4px;height:17px;overflow:hidden;position:relative;"><div style="width:'+pct+'%;height:100%;background:'+rColors[lbl]+';border-radius:4px;"></div><div style="position:absolute;right:4px;top:50%;transform:translateY(-50%);font-size:10px;font-weight:bold;color:#333;">'+cnt+'('+pct+'%)</div></div></div>';});
    html+='</div><div style="font-size:12px;font-weight:bold;color:#555;margin-bottom:5px;">TOP 10</div>';
    sorted.slice(0,10).forEach(function(e){var num=e[0],cnt=e[1],pct=(cnt/maxF*100).toFixed(0),isHot=analysis&&analysis.hotNumbers&&analysis.hotNumbers.indexOf(parseInt(num))>=0,bg=isHot?'#ff6b6b':'#667eea';html+='<div style="display:flex;align-items:center;margin-bottom:4px;"><div style="width:26px;text-align:right;font-size:12px;font-weight:bold;color:'+bg+';margin-right:5px;">'+num+'</div><div style="flex:1;background:#eee;border-radius:4px;height:17px;overflow:hidden;position:relative;"><div style="width:'+pct+'%;height:100%;background:'+bg+';border-radius:4px;"></div><div style="position:absolute;right:4px;top:50%;transform:translateY(-50%);font-size:10px;font-weight:bold;color:#333;">'+cnt+(isHot?' 🔥':'')+'</div></div></div>';});
    el.innerHTML=html;
    recLog('분포도 완료');
}
function mergeRecToData() {
    if(!loadedRecData.length){alert('추천번호 없음');return;}
    var csv='\uFEFF회차,번호1,번호2,번호3,번호4,번호5,번호6\n';
    lottoData.forEach(function(d){csv+=d.round+','+d.numbers.join(',')+'\n';});
    csv+='\n회차_추천,갱신,번호1,번호2,번호3,번호4,번호5,번호6\n';
    loadedRecData.forEach(function(r){csv+=r.round+','+r.refresh+','+r.numbers.join(',')+'\n';});
    var a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8;'}));a.download='당첨번호_추천포함.csv';a.click();
    var el=document.getElementById('mergeResult');el.style.display='block';
    el.innerHTML='✅ 저장 완료! 당첨 '+lottoData.length+'개 + 추천 '+loadedRecData.length+'개';
    recLog('✅ 완료!');
}
function downloadWinCSV() {
    if(!lottoData.length){alert('데이터 없음');return;}
    var csv='\uFEFF회차,번호1,번호2,번호3,번호4,번호5,번호6\n';
    lottoData.forEach(function(d){csv+=d.round+','+d.numbers.join(',')+'\n';});
    var a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8;'}));a.download='당첨번호.csv';a.click();
}
function downloadRecCSV() {
    if(!recommendationHistory.length){alert('추천번호 없음');return;}
    var csv='\uFEFF회차,갱신,번호1,번호2,번호3,번호4,번호5,번호6\n';
    recommendationHistory.forEach(function(entry){entry.combos.forEach(function(c){csv+=entry.round+','+entry.refresh+','+c.numbers.join(',')+'\n';});});
    var a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8;'}));a.download='추천번호.csv';a.click();
}
