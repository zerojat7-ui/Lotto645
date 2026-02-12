// ══════════════════════════════
//  analysis.js  - 통계 분석 엔진
// ══════════════════════════════

function countConsecutive(numbers) {
    var sorted = numbers.slice().sort(function(a,b){return a-b;});
    var count = 0;
    for (var i = 0; i < sorted.length - 1; i++) {
        if (sorted[i+1] - sorted[i] === 1) count++;
    }
    return count;
}

function calculateAC(numbers) {
    var sorted = numbers.slice().sort(function(a,b){return a-b;});
    var ac = 0;
    for (var i = 0; i < sorted.length - 1; i++) {
        for (var j = i + 1; j < sorted.length; j++) {
            if (sorted[j] - sorted[i] === 1) ac++;
        }
    }
    return ac;
}

function analyzeData() {
    addLog('분석 시작...');

    var frequency = {};
    for (var i = 1; i <= 45; i++) frequency[i] = 0;
    var existingCombos = new Set();
    var oddCount = 0, evenCount = 0;

    lottoData.forEach(function(draw) {
        draw.numbers.forEach(function(num) {
            frequency[num]++;
            if (num % 2 === 0) evenCount++; else oddCount++;
        });
        existingCombos.add(draw.numbers.slice().sort(function(a,b){return a-b;}).join(','));
    });

    var recent20 = lottoData.slice(-20);
    var recentFreq = {};
    for (var i = 1; i <= 45; i++) recentFreq[i] = 0;
    recent20.forEach(function(draw) {
        draw.numbers.forEach(function(num) { recentFreq[num]++; });
    });

    var recentSorted = Object.keys(recentFreq).map(function(n) {
        return { number: parseInt(n), count: recentFreq[n] };
    }).sort(function(a,b){ return b.count - a.count; });

    var hotNumbers  = recentSorted.slice(0, 10).map(function(s){ return s.number; });
    var coldNumbers = recentSorted.slice(-10).map(function(s){ return s.number; });

    var consecCountAll = 0, consecPresentAll = 0;
    var consecCountRecent = 0, consecPresentRecent = 0;
    lottoData.forEach(function(draw) {
        var c = countConsecutive(draw.numbers);
        if (c > 0) consecPresentAll++;
        consecCountAll += c;
    });
    recent20.forEach(function(draw) {
        var c = countConsecutive(draw.numbers);
        if (c > 0) consecPresentRecent++;
        consecCountRecent += c;
    });

    var acValues = lottoData.map(function(d){ return calculateAC(d.numbers); });
    var acRecent = recent20.map(function(d){ return calculateAC(d.numbers); });
    var acAvgAll    = (acValues.reduce(function(a,b){return a+b;},0) / acValues.length).toFixed(2);
    var acAvgRecent = (acRecent.reduce(function(a,b){return a+b;},0) / acRecent.length).toFixed(2);
    var acMode = {};
    acValues.forEach(function(v){ acMode[v] = (acMode[v]||0) + 1; });
    var mostCommonAC = parseInt(Object.keys(acMode).reduce(function(a,b){ return acMode[a]>acMode[b]?a:b; }));

    var numberStats = Object.keys(frequency).map(function(num) {
        return { number: parseInt(num), count: frequency[num], recentCount: recentFreq[num]||0 };
    });
    var sortedByFreq = numberStats.slice().sort(function(a,b){ return b.count - a.count; });

    analysis = {
        numberStats: numberStats,
        sortedByFreq: sortedByFreq,
        existingCombos: existingCombos,
        totalDraws: lottoData.length,
        oddPercentage:  (oddCount  / (lottoData.length * 6) * 100).toFixed(1),
        evenPercentage: (evenCount / (lottoData.length * 6) * 100).toFixed(1),
        hotNumbers: hotNumbers,
        coldNumbers: coldNumbers,
        consecPercentAll:    (consecPresentAll    / lottoData.length  * 100).toFixed(1),
        consecAvgAll:        (consecCountAll      / lottoData.length      ).toFixed(2),
        consecPercentRecent: (consecPresentRecent / recent20.length * 100).toFixed(1),
        consecAvgRecent:     (consecCountRecent   / recent20.length      ).toFixed(2),
        acAvgAll: acAvgAll,
        acAvgRecent: acAvgRecent,
        mostCommonAC: mostCommonAC
    };

    addLog('분석 완료', 'success');
    updateAnalysisUI();
    generateRecommendations();
    saveToLS();
}

function updateAnalysisUI() {
    var last = lottoData[lottoData.length - 1];
    document.getElementById('stat-total').textContent = analysis.totalDraws;
    document.getElementById('stat-range').textContent = (last ? last.round + '회' : '-');
    document.getElementById('stat-odd').textContent   = analysis.oddPercentage  + '%';
    document.getElementById('stat-even').textContent  = analysis.evenPercentage + '%';

    // 핫/콜드 그리드
    function renderSmallGrid(containerId, numList, cls) {
        var el = document.getElementById(containerId);
        el.innerHTML = '';
        numList.forEach(function(n) {
            var stat = analysis.numberStats.find(function(s){ return s.number === n; });
            var div = document.createElement('div');
            div.className = 'number-item ' + cls;
            div.innerHTML = '<div class="number-value">' + n + '</div>' +
                            '<div class="number-count">' + (stat ? stat.recentCount : 0) + '회</div>';
            el.appendChild(div);
        });
    }
    renderSmallGrid('hotGrid',  analysis.hotNumbers,  'hot');
    renderSmallGrid('coldGrid', analysis.coldNumbers, 'cold');

    // 전체 1~45
    var allGrid = document.getElementById('allGrid');
    allGrid.innerHTML = '';
    for (var i = 1; i <= 45; i++) {
        (function(n) {
            var stat = analysis.numberStats.find(function(s){ return s.number === n; });
            var cls = analysis.hotNumbers.indexOf(n) >= 0 ? 'hot' :
                      analysis.coldNumbers.indexOf(n) >= 0 ? 'cold' : '';
            var freq = stat ? (stat.count / analysis.totalDraws * 100).toFixed(1) : '0.0';
            var div = document.createElement('div');
            div.className = 'number-item ' + cls;
            div.innerHTML = '<div class="number-value">' + n + '</div>' +
                '<div class="number-count">' + (stat ? stat.count : 0) + '회<br>' +
                '<span style="font-size:9px;">' + freq + '%</span></div>';
            div.onclick = function(){ showNumberDetail(n); };
            allGrid.appendChild(div);
        })(i);
    }

    document.getElementById('consec-all').textContent      = analysis.consecPercentAll + '%';
    document.getElementById('consec-all-avg').textContent  = analysis.consecAvgAll + '개';
    document.getElementById('consec-recent').textContent   = analysis.consecPercentRecent + '%';
    document.getElementById('consec-recent-avg').textContent = analysis.consecAvgRecent + '개';
    document.getElementById('ac-all').textContent    = analysis.acAvgAll;
    document.getElementById('ac-recent').textContent = analysis.acAvgRecent;
    document.getElementById('ac-mode').textContent   = analysis.mostCommonAC;

    // TOP 15 막대차트
    var barsDiv = document.getElementById('topBars');
    barsDiv.innerHTML = '';
    var maxCount = analysis.sortedByFreq[0].count;
    analysis.sortedByFreq.slice(0, 15).forEach(function(s) {
        var pct = (s.count / maxCount * 100).toFixed(0);
        var d = document.createElement('div');
        d.className = 'bar-item';
        d.innerHTML = '<div class="bar-label">' + s.number + '</div>' +
            '<div class="bar-fill-container">' +
              '<div class="bar-fill" style="width:' + pct + '%"></div>' +
              '<div class="bar-count">' + s.count + '회</div>' +
            '</div>';
        barsDiv.appendChild(d);
    });
}

function showNumberDetail(number) {
    var stat = analysis.numberStats.find(function(s){ return s.number === number; });
    var appearances = lottoData.filter(function(d){ return d.numbers.indexOf(number) >= 0; }).length;
    var lastDraw = null;
    for (var i = lottoData.length - 1; i >= 0; i--) {
        if (lottoData[i].numbers.indexOf(number) >= 0) { lastDraw = lottoData[i]; break; }
    }
    var missStreak = 0;
    for (var i = lottoData.length - 1; i >= 0; i--) {
        if (lottoData[i].numbers.indexOf(number) >= 0) break;
        missStreak++;
    }
    var detail = document.getElementById('numberDetail');
    detail.classList.remove('hidden');
    detail.innerHTML = '<div class="analysis-title">' + number + '번 상세</div>' +
        '<div class="analysis-item"><span class="analysis-label">총 출현</span><span class="analysis-value">' + appearances + '회</span></div>' +
        '<div class="analysis-item"><span class="analysis-label">최근 출현 회차</span><span class="analysis-value">' + (lastDraw ? lastDraw.round + '회' : '없음') + '</span></div>' +
        '<div class="analysis-item"><span class="analysis-label">현재 미출현</span><span class="analysis-value">' + missStreak + '회</span></div>' +
        '<div class="analysis-item"><span class="analysis-label">출현 확률</span><span class="analysis-value">' + (appearances / analysis.totalDraws * 100).toFixed(1) + '%</span></div>';
}
