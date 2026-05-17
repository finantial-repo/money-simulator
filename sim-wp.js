// sim-wp.js — WordPress内シミュレーター 完全版 v3
// Monte Carlo（600シミュ・Jump-Diffusion）+ 取り崩し暴落比較グラフ搭載
// <script src> で読み込み、addEventListener で自動バインド（WordPress CSP対策）
'use strict';

var WP_SIM_BLOG = 'https://moneykyoshitsu.com';

// ── シナリオ定義（過去100年データ準拠）─────────────────────────────────
var WPS_SCENARIOS = {
  world:  { label:'オルカン（全世界株）', mu:0.065, sigma:0.160, color:'#1565c0', crashProb:0.030, crashMean:-0.35, crashSigma:0.15 },
  sp500:  { label:'S&P500',             mu:0.075, sigma:0.197, color:'#2e7d32', crashProb:0.035, crashMean:-0.38, crashSigma:0.18 },
  nasdaq: { label:'Nasdaq-100',         mu:0.090, sigma:0.230, color:'#880e4f', crashProb:0.045, crashMean:-0.45, crashSigma:0.20 },
  nikkei: { label:'日経225',            mu:0.055, sigma:0.210, color:'#e65100', crashProb:0.040, crashMean:-0.40, crashSigma:0.20 },
  bond:   { label:'株60:債券40',        mu:0.050, sigma:0.100, color:'#795548', crashProb:0.020, crashMean:-0.20, crashSigma:0.10 },
};
var _wpsScenario = 'world';
var _wpsProjData = null;

// ── おすすめ本 ────────────────────────────────────────────────────────
var WPS_BOOKS = [
  { title:'ウォール街のランダム・ウォーカー', url:'https://www.amazon.co.jp/dp/4296115871', sub:'インデックス投資の聖書。なぜ市場平均に勝てないかを徹底解説。', tag:'index' },
  { title:'インデックス投資は勝者のゲーム',   url:'https://www.amazon.co.jp/dp/4775972324', sub:'手数料の重要性とインデックス投資の優位性を証明。',           tag:'index' },
  { title:'お金は寝かせて増やしなさい',       url:'https://www.amazon.co.jp/dp/486680260X', sub:'NISAを最大活用するための日本版インデックス投資入門。',       tag:'nisa'  },
  { title:'サイコロジー・オブ・マネー',       url:'https://www.amazon.co.jp/dp/4478115826', sub:'お金と人間心理の関係。投資判断を誤らないための必読書。',     tag:'defense'},
  { title:'ほったらかし投資術',               url:'https://www.amazon.co.jp/dp/4023320617', sub:'月1回チェックするだけでOK。インデックス投資の実践マニュアル。', tag:'nisa' },
];

// ── Box-Muller 正規乱数 ───────────────────────────────────────────────
function wpsBoxMuller() {
  var u1, u2;
  do { u1 = Math.random(); } while (u1 === 0);
  u2 = Math.random();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

function wpsPercentile(sorted, p) {
  var i = Math.max(0, Math.min(sorted.length - 1, Math.floor(sorted.length * p)));
  return sorted[i];
}

// ── Jump-Diffusion 月次リターン生成 ──────────────────────────────────
function wpsMonthlyReturn(mMu, mSigma, crashProb, crashMean, crashSigma) {
  var r = mMu + mSigma * wpsBoxMuller();
  var monthCrashProb = 1 - Math.pow(1 - crashProb, 1/12);
  if (Math.random() < monthCrashProb) {
    var annCrash = crashMean + crashSigma * wpsBoxMuller();
    r += Math.pow(1 + Math.max(-0.99, annCrash), 1/12) - 1;
  }
  return r;
}

// ── モンテカルロ本体（600シミュ）────────────────────────────────────
function wpsMonteCarlo(monthlyYen, years, scKey, initialYen) {
  var sc    = WPS_SCENARIOS[scKey];
  var mMu   = Math.pow(1 + sc.mu,    1/12) - 1;
  var mSig  = sc.sigma / Math.sqrt(12);
  var NUM   = 600;
  var snaps = [];
  for (var yr = 0; yr <= years; yr++) snaps.push([]);

  for (var s = 0; s < NUM; s++) {
    var val = Math.max(0, initialYen);
    snaps[0].push(val);
    for (var yr2 = 1; yr2 <= years; yr2++) {
      for (var m = 0; m < 12; m++) {
        val = (val + monthlyYen) * (1 + wpsMonthlyReturn(mMu, mSig, sc.crashProb, sc.crashMean, sc.crashSigma));
      }
      snaps[yr2].push(val);
    }
  }

  return snaps.map(function(data, yr) {
    var sorted = data.slice().sort(function(a, b){ return a - b; });
    var simple = initialYen + monthlyYen * 12 * yr;
    return {
      yr: yr,
      p10: wpsPercentile(sorted, 0.10),
      p25: wpsPercentile(sorted, 0.25),
      p50: wpsPercentile(sorted, 0.50),
      p75: wpsPercentile(sorted, 0.75),
      p90: wpsPercentile(sorted, 0.90),
      simple: simple,
    };
  });
}

// ── SVGチャート描画（積立シミュレーション）───────────────────────────
function wpsDrawChart(svgEl, data, color) {
  var W=640, H=280, PL=65, PR=20, PT=16, PB=36;
  var cW = W-PL-PR, cH = H-PT-PB;
  var years = data.length - 1;
  var maxVal = data[years].p90;
  if (maxVal <= 0 || !svgEl) return;

  function xS(yr) { return PL + (yr/years)*cW; }
  function yS(v)  { return PT + cH - (v/maxVal)*cH; }
  function pts(key) {
    return data.map(function(d){ return xS(d.yr).toFixed(1)+','+yS(d[key]).toFixed(1); }).join(' ');
  }
  function area(k1, k2) {
    var top = data.map(function(d){ return xS(d.yr).toFixed(1)+','+yS(d[k2]).toFixed(1); });
    var bot = data.slice().reverse().map(function(d){ return xS(d.yr).toFixed(1)+','+yS(d[k1]).toFixed(1); });
    return top.join(' ')+' '+bot.join(' ');
  }
  function fmtYen(v) {
    if (v >= 1e8) return (v/1e8).toFixed(1)+'億円';
    if (v >= 1e4) return Math.round(v/1e4)+'万円';
    return Math.round(v)+'円';
  }

  var yTicks = '', xTicks = '';
  for (var i = 0; i <= 5; i++) {
    var v = maxVal/5*i, y = yS(v);
    yTicks += '<line x1="'+PL+'" y1="'+y.toFixed(1)+'" x2="'+(W-PR)+'" y2="'+y.toFixed(1)+'" stroke="#eee" stroke-width="1"/>';
    yTicks += '<text x="'+(PL-5)+'" y="'+(y+4).toFixed(1)+'" text-anchor="end" font-size="10" fill="#888">'+fmtYen(v)+'</text>';
  }
  for (var yr3 = 0; yr3 <= years; yr3 += 5) {
    xTicks += '<text x="'+xS(yr3).toFixed(1)+'" y="'+(H-4)+'" text-anchor="middle" font-size="10" fill="#888">'+(yr3===0?'今':yr3+'年後')+'</text>';
  }

  svgEl.setAttribute('viewBox','0 0 '+W+' '+H);
  svgEl.innerHTML =
    '<g>'+yTicks+
    '<line x1="'+PL+'" y1="'+PT+'" x2="'+PL+'" y2="'+(PT+cH)+'" stroke="#ccc" stroke-width="1.5"/>'+
    '<line x1="'+PL+'" y1="'+(PT+cH)+'" x2="'+(W-PR)+'" y2="'+(PT+cH)+'" stroke="#ccc" stroke-width="1.5"/>'+
    xTicks+
    '<polygon points="'+area('p10','p90')+'" fill="'+color+'" opacity="0.12"/>'+
    '<polygon points="'+area('p25','p75')+'" fill="'+color+'" opacity="0.28"/>'+
    '<polyline points="'+pts('simple')+'" fill="none" stroke="#bbb" stroke-width="1.5" stroke-dasharray="4,3"/>'+
    '<polyline points="'+pts('p50')+'" fill="none" stroke="'+color+'" stroke-width="2.5"/>'+
    '</g>';

  // サマリーボックス更新
  var summEl = svgEl.parentNode.querySelector('[data-wps-summary]');
  if (summEl) {
    var last = data[years];
    summEl.innerHTML = [
      ['楽観的シナリオ（上位25%）', last.p75, '#e8f5e9'],
      ['中央値（50th percentile）', last.p50, '#e3f2fd'],
      ['悲観的シナリオ（下位25%）', last.p25, '#fff3e0'],
      ['元本（積立合計）',           last.simple, '#f5f5f5'],
      ['最悪シナリオ（下位10%）',   last.p10, '#ffebee'],
    ].map(function(b){
      return '<div style="text-align:center;padding:10px 8px;border-radius:8px;border:1px solid #e0d8c8;background:'+b[2]+';">'
        +'<div style="font-size:10px;color:#888;margin-bottom:3px;font-weight:700;">'+b[0]+'</div>'
        +'<div style="font-size:17px;font-weight:700;color:#1a1a2e;">'+fmtYen(b[1])+'</div>'
        +'</div>';
    }).join('');
  }
}

// ── シナリオ切替 ──────────────────────────────────────────────────────
function wpsSwitchScenario(key, container) {
  _wpsScenario = key;
  if (!_wpsProjData || !_wpsProjData[key]) return;
  var sc  = WPS_SCENARIOS[key];
  // pill スタイル更新
  var pills = container.querySelectorAll('[data-wps-pill]');
  for (var i = 0; i < pills.length; i++) {
    var pill = pills[i];
    var pKey = pill.getAttribute('data-wps-pill');
    var pSc  = WPS_SCENARIOS[pKey];
    if (pKey === key) {
      pill.style.background = pSc.color;
      pill.style.color = '#fff';
      pill.style.borderColor = pSc.color;
    } else {
      pill.style.background = 'transparent';
      pill.style.color = pSc.color;
      pill.style.borderColor = pSc.color;
    }
  }
  var svg = container.querySelector('[data-wps-chart]');
  if (svg) wpsDrawChart(svg, _wpsProjData[key], sc.color);
}

// ── 取り崩し時暴落比較チャート ───────────────────────────────────────
function wpsDrawCrashChart(svgEl, totalAssetYen, monthlyWithdrawYen) {
  if (!svgEl || totalAssetYen <= 0) return;
  var YEARS = 35;
  var mu    = 0.065, sigma = 0.160; // オルカン想定
  var mMu   = Math.pow(1 + mu, 1/12) - 1;
  var mSig  = sigma / Math.sqrt(12);

  // シナリオ生成
  function simPath(crashYearAt) {
    var val = totalAssetYen;
    var pts = [val];
    for (var yr = 1; yr <= YEARS; yr++) {
      if (yr === crashYearAt) val *= 0.60; // -40%暴落
      for (var m = 0; m < 12; m++) {
        var r = mMu + mSig * wpsBoxMuller();
        val = Math.max(0, (val - monthlyWithdrawYen) * (1 + r));
      }
      pts.push(val);
    }
    return pts;
  }

  // 中央値ライン（複数パスの中央値）
  function medianPath(crashYearAt) {
    var paths = [];
    for (var s = 0; s < 300; s++) paths.push(simPath(crashYearAt));
    var result = [];
    for (var yr2 = 0; yr2 <= YEARS; yr2++) {
      var sorted = paths.map(function(p){ return p[yr2]; }).sort(function(a,b){ return a-b; });
      result.push(wpsPercentile(sorted, 0.50));
    }
    return result;
  }

  var pathNormal  = medianPath(999); // 暴落なし
  var pathCrash1  = medianPath(1);   // 退職直後（1年目）に暴落
  var pathCrash5  = medianPath(5);   // 5年目に暴落

  var W=640, H=260, PL=68, PR=20, PT=16, PB=36;
  var cW = W-PL-PR, cH = H-PT-PB;
  var maxVal = Math.max.apply(null, pathNormal);
  if (maxVal <= 0) return;

  function xS(yr) { return PL + (yr/YEARS)*cW; }
  function yS(v)  { return PT + cH - Math.max(0, Math.min(v/maxVal, 1))*cH; }
  function poly(path, col, dash, w) {
    var pts2 = path.map(function(v, i){ return xS(i).toFixed(1)+','+yS(v).toFixed(1); }).join(' ');
    return '<polyline points="'+pts2+'" fill="none" stroke="'+col+'" stroke-width="'+(w||2)+'"'+(dash?' stroke-dasharray="'+dash+'"':'')+'/>';
  }

  function fmtM(v) {
    if (v >= 1e8) return (v/1e8).toFixed(1)+'億円';
    return Math.round(v/1e4)+'万円';
  }

  var yTicks = '', xTicks = '';
  for (var i = 0; i <= 5; i++) {
    var v = maxVal/5*i, y = yS(v);
    yTicks += '<line x1="'+PL+'" y1="'+y.toFixed(1)+'" x2="'+(W-PR)+'" y2="'+y.toFixed(1)+'" stroke="#eee" stroke-width="1"/>';
    yTicks += '<text x="'+(PL-5)+'" y="'+(y+4).toFixed(1)+'" text-anchor="end" font-size="10" fill="#888">'+fmtM(v)+'</text>';
  }
  for (var yr4 = 0; yr4 <= YEARS; yr4 += 5) {
    xTicks += '<text x="'+xS(yr4).toFixed(1)+'" y="'+(H-4)+'" text-anchor="middle" font-size="10" fill="#888">'+yr4+'年後</text>';
  }
  // 元本ゼロライン
  var yZero = yS(0);

  svgEl.setAttribute('viewBox','0 0 '+W+' '+H);
  svgEl.innerHTML =
    '<g>'+yTicks+
    '<line x1="'+PL+'" y1="'+PT+'" x2="'+PL+'" y2="'+(PT+cH)+'" stroke="#ccc" stroke-width="1.5"/>'+
    '<line x1="'+PL+'" y1="'+(PT+cH)+'" x2="'+(W-PR)+'" y2="'+(PT+cH)+'" stroke="#ccc" stroke-width="1.5"/>'+
    xTicks+
    // 暴落発生マーカー（縦線）
    '<line x1="'+xS(1).toFixed(1)+'" y1="'+PT+'" x2="'+xS(1).toFixed(1)+'" y2="'+(PT+cH)+'" stroke="#c62828" stroke-width="1" stroke-dasharray="3,3" opacity="0.5"/>'+
    '<line x1="'+xS(5).toFixed(1)+'" y1="'+PT+'" x2="'+xS(5).toFixed(1)+'" y2="'+(PT+cH)+'" stroke="#e65100" stroke-width="1" stroke-dasharray="3,3" opacity="0.5"/>'+
    poly(pathNormal, '#1565c0', '', 2.5)+
    poly(pathCrash1, '#c62828', '6,3', 2)+
    poly(pathCrash5, '#e65100', '4,4', 2)+
    '</g>';
}

// ── 入力取得 ─────────────────────────────────────────────────────────
function wpsGetInputs() {
  function v(id, def) { var el=document.getElementById(id); return el ? (parseFloat(el.value)||def) : def; }
  function r(name)    { var el=document.querySelector('input[name="'+name+'"]:checked'); return el ? el.value : null; }
  return {
    age           : v('wps-age',30),
    income        : v('wps-income',500),
    si            : v('wps-si',-1),
    expRent       : v('wps-rent',8),
    expFood       : v('wps-food',5),
    expUtil       : v('wps-util',2),
    expTrans      : v('wps-trans',1),
    expLeisure    : v('wps-leisure',2),
    expOther      : v('wps-other',1),
    savings       : v('wps-savings',100),
    retireAge     : parseInt(r('wps-retire')||'65'),
    riskLevel     : r('wps-risk')||'balanced',
    emp           : r('wps-emp')||'employee',
    spouse        : r('wps-spouse')||'none',
    children      : parseInt(r('wps-children')||'0'),
    ideco         : (r('wps-ideco')||'yes') !== 'no',
    idecoOverride : v('wps-ideco-limit',0),
    pension       : v('wps-pension',15),
    retireBonus   : v('wps-retire-bonus',0),
    yearsWorked   : v('wps-years-worked',30),
    mortgageCredit: v('wps-mortgage-credit',0),
  };
}

// ── 計算コア ─────────────────────────────────────────────────────────
function wpsCalc(inp) {
  var income = inp.income, emp = inp.emp;
  var ded = 55;
  if (income>162.5) ded=income*0.4-10;
  if (income>180)   ded=income*0.3+8;
  if (income>360)   ded=income*0.2+44;
  if (income>660)   ded=income*0.1+110;
  if (income>850)   ded=195;
  var si = inp.si>0 ? inp.si : income*(emp==='self'?0.17:0.145);
  var spDed   = inp.spouse==='dependent' ? 38 : 0;
  var kidDed  = inp.children*38;
  var taxable = Math.max(0, income-ded-si-48-spDed-kidDed);

  var itaxRate=0.05, itaxDed=0;
  var brs=[[195,0.05,0],[330,0.10,9.75],[695,0.20,42.75],[900,0.23,63.6],[1800,0.33,153.6],[4000,0.40,279.6]];
  for (var i=0; i<brs.length; i++) {
    if (taxable<=brs[i][0]) { itaxRate=brs[i][1]; itaxDed=brs[i][2]; break; }
    if (i===brs.length-1)   { itaxRate=0.45; itaxDed=479.6; }
  }
  var itax    = Math.max(0, taxable*itaxRate-itaxDed)*1.021;
  itax        = Math.max(0, itax-inp.mortgageCredit);
  var ltax    = Math.max(0, taxable-43)*0.10;
  var takehome = income-itax-ltax-si;
  var expense  = inp.expRent+inp.expFood+inp.expUtil+inp.expTrans+inp.expLeisure+inp.expOther;
  var investable = Math.max(0, takehome/12-expense);

  var idecoLimits = {employee:2.3,employee_dc_only:2.0,employee_pension:1.2,civil:2.0,self:6.8};
  var idecoLim    = inp.idecoOverride>0 ? inp.idecoOverride : (idecoLimits[emp]||2.3);
  var idecoMonth  = inp.ideco ? Math.min(idecoLim, Math.max(0, investable*0.5)) : 0;
  var taxSaving   = idecoMonth*12*(itaxRate*1.021+0.10);
  var nisaMonth   = Math.min(10, Math.max(0, investable-idecoMonth));
  var years       = Math.max(1, inp.retireAge-inp.age);
  var rParams     = {conservative:{mu:0.050,sg:0.100},balanced:{mu:0.065,sg:0.160},aggressive:{mu:0.075,sg:0.197}};
  var rp          = rParams[inp.riskLevel]||rParams.balanced;
  var mMu         = Math.pow(1+rp.mu,1/12)-1;
  var monthly     = idecoMonth+nisaMonth;
  var fv          = monthly*10000*(Math.pow(1+mMu,years*12)-1)/mMu/10000;
  var emergTarget = expense*6;
  var pIdeco = investable>0 ? Math.round(idecoMonth/investable*100) : 0;
  var pNisa  = investable>0 ? Math.round(nisaMonth/investable*100)  : 0;
  var pFree  = Math.max(0, 100-pIdeco-pNisa);

  return { takehome:takehome, si:si, itax:itax, ltax:ltax, taxable:taxable,
    expense:expense, investable:investable, idecoMonth:idecoMonth,
    idecoLim:idecoLim, taxSaving:taxSaving, nisaMonth:nisaMonth, fv:fv,
    years:years, emergTarget:emergTarget, pIdeco:pIdeco, pNisa:pNisa, pFree:pFree,
    itaxRate:itaxRate, monthly:monthly, rp:rp };
}

// ── リアルタイム表示 ─────────────────────────────────────────────────
function wpsUpdateLive() {
  try {
    var inp=wpsGetInputs(), c=wpsCalc(inp);
    var thEl=document.getElementById('wps-takehome');
    var ivEl=document.getElementById('wps-investable');
    if (thEl) thEl.textContent=Math.round(c.takehome/12*10)/10+' 万円/月';
    if (ivEl) {
      var vv=Math.round(c.investable*10)/10;
      ivEl.textContent=vv+' 万円/月';
      ivEl.style.color=vv<2?'#e53935':vv<5?'#e65100':'#1a8a3a';
    }
  } catch(e) {}
}

// ── メイン診断 ────────────────────────────────────────────────────────
function runWPSim() {
  var inp = wpsGetInputs();
  var c   = wpsCalc(inp);
  var res = document.getElementById('wps-result');
  if (!res) return;

  // ラベル
  function riskLbl(r) {
    return r==='aggressive'?'S&P500中心・年率約6.8%':r==='conservative'?'バランス型・年率約5.0%':'全世界株式・年率約6.5%';
  }
  function riskScKey(r) {
    return r==='aggressive'?'sp500':r==='conservative'?'bond':'world';
  }

  // 状況判定
  var situation = c.investable<2?'defense':(inp.ideco&&c.taxSaving>=3)?'ideco':'nisa';

  // ── アドバイスリスト ──
  var advList = [];
  if (c.investable<2)         advList.push({cls:'warn',icon:'⚠️',txt:'月の余剰資金が <strong>'+Math.round(c.investable*10)/10+'万円</strong> と少ない状態です。生活防衛資金（月の生活費×3〜6ヶ月分 = <strong>'+Math.round(c.emergTarget*10)/10+'万円</strong>）を先に確保しましょう。'});
  if (inp.savings<c.emergTarget) advList.push({cls:'warn',icon:'🛡',txt:'生活防衛資金が目標額（<strong>'+Math.round(c.emergTarget*10)/10+'万円</strong>）に不足しています。まず貯蓄から始め、確保後に投資を開始することを推奨します。'});
  if (inp.ideco&&c.idecoMonth>0) advList.push({cls:'ok',icon:'✅',txt:'iDeCo（月<strong>'+Math.round(c.idecoMonth*10)/10+'万円</strong>）で年間 <strong>'+Math.round(c.taxSaving*10)/10+'万円</strong> の節税効果があります（所得税＋住民税の軽減）。'});
  if (c.nisaMonth>0)           advList.push({cls:'ok',icon:'📈',txt:'NISA（月<strong>'+Math.round(c.nisaMonth*10)/10+'万円</strong>）で積み立てると、<strong>'+inp.retireAge+'歳時に約'+Math.round(c.fv).toLocaleString()+'万円</strong>の資産形成が期待できます（'+riskLbl(inp.riskLevel)+'・概算）。'});
  if (inp.children>0)          advList.push({cls:'info',icon:'👶',txt:'子供 <strong>'+inp.children+'人</strong> の教育費は公立中心で約1,000万円/人、私立中心で約2,000万円/人が目安です。こどもNISAや教育資金贈与の活用も検討しましょう。'});
  if (inp.spouse==='dependent') advList.push({cls:'info',icon:'👫',txt:'配偶者もiDeCoに加入できます（専業主婦（夫）は国民年金第3号被保険者として月2.3万円まで拠出可能）。世帯全体での節税を検討しましょう。'});
  if (inp.emp==='self')        advList.push({cls:'info',icon:'💼',txt:'自営業の方はiDeCoの上限が月 <strong>6.8万円（年81.6万円）</strong> と非常に高く、節税効果が最大です。国民年金の付加保険料（月400円）との併用も検討してください。'});
  if (advList.length===0) advList.push({cls:'ok',icon:'✅',txt:'バランスの良い収支状態です。iDeCo＋NISAを継続することで着実な資産形成が期待できます。'});

  var advHTML = '<ul style="list-style:none;padding:0;margin:0;">'
    +advList.map(function(a){
      var bg=a.cls==='ok'?'#e8f5e9':a.cls==='warn'?'#fff3e0':'#e3f2fd';
      var co=a.cls==='ok'?'#1b5e20':a.cls==='warn'?'#bf360c':'#0d47a1';
      return '<li style="background:'+bg+';color:'+co+';border-radius:6px;padding:10px 14px 10px 42px;margin-bottom:8px;font-size:14px;line-height:1.8;position:relative;"><span style="position:absolute;left:12px;top:10px;">'+a.icon+'</span>'+a.txt+'</li>';
    }).join('')+'</ul>';

  // ── 配分バー ──
  var barSegs = [{p:c.pIdeco,col:'#1a1a2e',lbl:'iDeCo'},{p:c.pNisa,col:'#2e7d32',lbl:'NISA'},{p:c.pFree,col:'#aaa',lbl:'余剰'}].filter(function(s){return s.p>0;});
  var barHTML = '<div style="background:#eee;border-radius:6px;overflow:hidden;height:32px;display:flex;margin-bottom:10px;">'
    +barSegs.map(function(s){return '<div style="width:'+s.p+'%;height:100%;background:'+s.col+';display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#fff;overflow:hidden;white-space:nowrap;">'+(s.p>=10?s.lbl:'')+'</div>';}).join('')
    +'</div><div style="display:flex;flex-wrap:wrap;gap:10px;">'
    +barSegs.map(function(s){return '<span style="display:flex;align-items:center;gap:5px;font-size:12px;color:#555;"><span style="width:12px;height:12px;background:'+s.col+';border-radius:3px;display:inline-block;"></span>'+s.lbl+' '+s.p+'%</span>';}).join('')
    +'</div>';

  // ── 税金内訳 ──
  var taxRows = [
    ['年収（税込）', Math.round(inp.income)+'万円',false],
    ['社会保険料', Math.round(c.si*10)/10+'万円',false],
    ['課税所得', Math.round(c.taxable*10)/10+'万円',false],
    ['所得税（復興税込）', Math.round(c.itax*10)/10+'万円 [税率'+Math.round(c.itaxRate*100)+'%]',false],
    ['住民税', Math.round(c.ltax*10)/10+'万円',false],
    ['手取り年収', Math.round(c.takehome*10)/10+'万円',true],
    ['手取り月収', Math.round(c.takehome/12*10)/10+'万円/月',true],
  ];
  if (inp.ideco&&c.idecoMonth>0) taxRows.push(['iDeCo年間節税額','▲ '+Math.round(c.taxSaving*10)/10+'万円',true]);
  var taxHTML = '<table style="width:100%;border-collapse:collapse;font-size:13px;">'
    +'<thead><tr><th style="background:#1a1a2e;color:#fff;padding:8px 12px;text-align:left;">項目</th><th style="background:#1a1a2e;color:#fff;padding:8px 12px;text-align:right;">金額</th></tr></thead><tbody>'
    +taxRows.map(function(r,i){
      var bg=(i%2===0)?'#fff':'#f8f6f0';
      return '<tr style="'+(r[2]?'font-weight:700;background:#fff8e6;':'')+'"><td style="padding:8px 12px;border-bottom:1px solid #e0d8c8;background:'+(r[2]?'#fff8e6':bg)+';">'+r[0]+'</td><td style="padding:8px 12px;border-bottom:1px solid #e0d8c8;text-align:right;background:'+(r[2]?'#fff8e6':bg)+';color:'+(r[0].indexOf('節税')>=0?'#2e7d32':'#1a1a2e')+';">'+r[1]+'</td></tr>';
    }).join('')
    +'</tbody></table><p style="font-size:11px;color:#888;margin:8px 0 0;line-height:1.7;">※ 所得税に復興特別所得税2.1%を加算。住民税は均等割を含みません。iDeCo拠出は小規模企業共済等掛金控除として適用。</p>';

  // ── モンテカルロ計算（全シナリオ）──
  _wpsScenario = riskScKey(inp.riskLevel);
  _wpsProjData = {};
  var keys = ['world','sp500','nasdaq','nikkei','bond'];
  for (var ki=0; ki<keys.length; ki++) {
    _wpsProjData[keys[ki]] = wpsMonteCarlo(c.monthly*10000, c.years, keys[ki], 0);
  }

  // ── おすすめ記事 ──
  var recA = '';
  if (situation==='defense') recA = wpsArt(WP_SIM_BLOG+'/keep-cash-invest-efficiently/','🛡 生活防衛資金と投資の黄金比','月の余剰資金が少ない今こそ読んでおくべき基礎知識。','#2e7d32','#eef7f1','#a5d6a7');
  else if (situation==='ideco') recA = wpsArt(WP_SIM_BLOG+'/ideco-myth-debunked/','📊 iDeCoの「60歳まで引き出せない」は本当にデメリットか？','年間'+Math.round(c.taxSaving*10)/10+'万円の節税。iDeCoを最大活用する方法。','#1565c0','#eef4fb','#90caf9');
  else recA = wpsArt(WP_SIM_BLOG+'/new-nisa-explained/','📈 新NISAを「使わない理由」はあるか？','月'+Math.round(c.nisaMonth*10)/10+'万円から始める積立の具体的な手順。','#c62828','#fff5f5','#ef9a9a');
  recA += wpsArt(WP_SIM_BLOG+'/securities-account-comparison/','🏦 証券口座4社比較（クレカ積立還元率）','SBI証券・楽天証券・マネックス・松井証券を徹底比較。','#555','#fff','#e0d0a0');

  // ── おすすめ本 ──
  var bTags = situation==='defense'?['defense','nisa']:situation==='ideco'?['index','nisa']:['nisa','index'];
  var bookHTML = WPS_BOOKS.filter(function(b){return bTags.indexOf(b.tag)>=0;}).slice(0,3).map(function(b){
    return '<a href="'+b.url+'" target="_blank" rel="noopener" style="display:flex;align-items:flex-start;gap:12px;padding:12px 14px;background:#fff;border:1px solid #e0d8c8;border-radius:8px;text-decoration:none;margin-bottom:8px;">'
      +'<span style="font-size:22px;flex-shrink:0;">📖</span><div>'
      +'<p style="font-size:13px;font-weight:700;color:#1a1a2e;margin:0 0 3px;">'+b.title+'</p>'
      +'<p style="font-size:12px;color:#666;margin:0 0 3px;line-height:1.6;">'+b.sub+'</p>'
      +'<p style="font-size:11px;color:#1565c0;margin:0;">Amazon で見る →</p>'
      +'</div></a>';
  }).join('');

  // ── シナリオ pill ──
  var pillHTML = Object.keys(WPS_SCENARIOS).map(function(k){
    var sc2 = WPS_SCENARIOS[k];
    var active = (k===_wpsScenario);
    return '<button data-wps-pill="'+k+'" style="padding:5px 12px;border-radius:20px;font-size:11px;font-weight:700;cursor:pointer;border:1.5px solid '+sc2.color+';background:'+(active?sc2.color:'transparent')+';color:'+(active?'#fff':sc2.color)+';">'+sc2.label+'</button>';
  }).join('');

  // 取り崩し時の月額引き出し（4%ルール）
  var withdrawYen = Math.round(c.fv*10000/300);

  // ── 結果HTML ──
  res.innerHTML =
    // 結果ヘッダー
    '<div style="background:linear-gradient(135deg,#1a1a2e,#2d3a6e);border-radius:12px;padding:28px 24px;margin-bottom:14px;">'
    +'<p style="font-size:11px;font-weight:700;color:#c0a060;letter-spacing:3px;margin:0 0 14px;">📊 診断結果</p>'
    +'<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:12px;">'
    +wpsBox('月の投資可能額',Math.round(c.investable*10)/10+'万円','手取り − 生活費')
    +wpsBox('iDeCo年間節税額',inp.ideco?Math.round(c.taxSaving*10)/10+'万円':'—','所得税＋住民税の軽減')
    +wpsBox(inp.retireAge+'歳時の推定資産',Math.round(c.fv).toLocaleString()+'万円',riskLbl(inp.riskLevel)+'（概算）')
    +'</div>'
    +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">'
    +wpsBox('iDeCo 推奨月額',inp.ideco&&c.idecoMonth>0?Math.round(c.idecoMonth*10)/10+'万円':'—','掛金上限: '+c.idecoLim+'万円/月')
    +wpsBox('NISA 推奨月額',c.nisaMonth>0?Math.round(c.nisaMonth*10)/10+'万円':'—','非課税で長期積立')
    +'</div></div>'

    // 配分バー
    +'<div style="background:#fff;border:1px solid #e0d8c8;border-radius:10px;padding:20px 22px;margin-bottom:14px;">'
    +'<p style="font-size:11px;font-weight:700;color:#b8860b;letter-spacing:2px;margin:0 0 12px;">月々の推奨配分（'+Math.round(c.investable*10)/10+'万円）</p>'
    +barHTML+'</div>'

    // モンテカルログラフ
    +'<div style="background:#fff;border:1px solid #e0d8c8;border-radius:10px;padding:20px 22px;margin-bottom:14px;">'
    +'<p style="font-size:11px;font-weight:700;color:#b8860b;letter-spacing:2px;margin:0 0 6px;">将来資産シミュレーション（モンテカルロ法・600シナリオ）</p>'
    +'<p style="font-size:12px;color:#666;margin:0 0 12px;line-height:1.7;"><strong>過去100年のデータに基づく600通りのシナリオ</strong>で将来資産の分布を表示。年3〜5%の確率で大型暴落（-35〜-45%）を織り込んだ <strong>Jump-Diffusionモデル</strong>を採用。リロードするたびに異なる結果になります。</p>'
    +'<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px;">'+pillHTML+'</div>'
    +'<div style="width:100%;overflow-x:auto;"><svg data-wps-chart style="display:block;width:100%;" viewBox="0 0 640 280"></svg></div>'
    +'<div style="display:flex;flex-wrap:wrap;gap:10px;margin:10px 0 14px;font-size:12px;color:#666;">'
    +'<span style="display:flex;align-items:center;gap:5px;"><span style="display:inline-block;width:20px;height:4px;background:#1565c0;opacity:.2;border-radius:2px;"></span>90%が収まる範囲</span>'
    +'<span style="display:flex;align-items:center;gap:5px;"><span style="display:inline-block;width:20px;height:4px;background:#1565c0;opacity:.5;border-radius:2px;"></span>50%が収まる範囲</span>'
    +'<span style="display:flex;align-items:center;gap:5px;"><span style="display:inline-block;width:20px;height:4px;background:#1565c0;border-radius:2px;"></span>中央値</span>'
    +'<span style="display:flex;align-items:center;gap:5px;"><span style="display:inline-block;width:20px;height:4px;background:#bbb;border-radius:2px;border:1px dashed #999;"></span>元本</span>'
    +'</div>'
    +'<div data-wps-summary style="display:grid;grid-template-columns:repeat(5,1fr);gap:8px;"></div>'
    +'<p style="font-size:10px;color:#888;margin:8px 0 0;line-height:1.6;">※ 過去100年データ（Dimson-Marsh-Staunton・Shillerデータ）に基づくJump-Diffusionモデル。毎回異なるシナリオが生成されます。将来の運用成果を保証するものではありません。</p>'
    +'</div>'

    // 取り崩し時暴落比較グラフ
    +'<div style="background:#fff;border:1px solid #e0d8c8;border-radius:10px;padding:20px 22px;margin-bottom:14px;">'
    +'<p style="font-size:11px;font-weight:700;color:#b8860b;letter-spacing:2px;margin:0 0 6px;">⚠️ 取り崩し時に暴落が来たら？（シーケンス・オブ・リターンリスク）</p>'
    +'<p style="font-size:12px;color:#666;margin:0 0 12px;line-height:1.7;">'
    +inp.retireAge+'歳時に <strong>'+Math.round(c.fv).toLocaleString()+'万円</strong> の資産があり、4%ルール（月<strong>'+Math.round(withdrawYen/10000*10)/10+'万円</strong>引き出し）を開始した場合、退職直後や5年目に大型暴落（-40%）が来るとどうなるかを比較します。</p>'
    +'<div style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:14px;font-size:12px;">'
    +'<span style="display:flex;align-items:center;gap:6px;"><span style="display:inline-block;width:30px;height:3px;background:#1565c0;border-radius:2px;"></span><strong style="color:#1565c0;">暴落なし（通常シナリオ）</strong></span>'
    +'<span style="display:flex;align-items:center;gap:6px;"><span style="display:inline-block;width:30px;height:3px;background:#c62828;border-radius:2px;border:1px dashed #c62828;"></span><strong style="color:#c62828;">退職直後（1年目）に-40%暴落</strong></span>'
    +'<span style="display:flex;align-items:center;gap:6px;"><span style="display:inline-block;width:30px;height:3px;background:#e65100;border-radius:2px;border:1px dashed #e65100;"></span><strong style="color:#e65100;">5年目に-40%暴落</strong></span>'
    +'</div>'
    +'<div style="width:100%;overflow-x:auto;"><svg id="wps-crash-chart" style="display:block;width:100%;" viewBox="0 0 640 260"></svg></div>'
    +'<p style="font-size:11px;color:#888;margin:8px 0 0;line-height:1.6;">※ オルカン（全世界株式）年率6.5%・σ16%・月'+Math.round(withdrawYen/10000*10)/10+'万円引き出しのモンテカルロ中央値。退職直後の暴落は回復期間が短いため特に致命的。取り崩し初期は債券・現金バッファを持つことが重要です。</p>'
    +'</div>'

    // アドバイス
    +'<div style="background:#fff;border:1px solid #e0d8c8;border-radius:10px;padding:20px 22px;margin-bottom:14px;">'
    +'<p style="font-size:11px;font-weight:700;color:#b8860b;letter-spacing:2px;margin:0 0 12px;">あなたへのアドバイス</p>'
    +advHTML+'</div>'

    // 税金内訳
    +'<div style="background:#fff;border:1px solid #e0d8c8;border-radius:10px;padding:20px 22px;margin-bottom:14px;">'
    +'<p style="font-size:11px;font-weight:700;color:#b8860b;letter-spacing:2px;margin:0 0 12px;">税金シミュレーション</p>'
    +taxHTML+'</div>'

    // おすすめ記事
    +'<p style="font-size:12px;font-weight:700;color:#b8860b;letter-spacing:2px;margin:0 0 10px;">次に読むべき記事</p>'
    +recA

    // おすすめ本
    +'<div style="background:#fdf8ed;border:1px solid #e0d0a0;border-radius:10px;padding:20px 22px;margin-bottom:16px;">'
    +'<p style="font-size:11px;font-weight:700;color:#b8860b;letter-spacing:2px;margin:0 0 12px;">📚 あなたへのおすすめの本</p>'
    +bookHTML
    +'<p style="font-size:10px;color:#888;margin:8px 0 0;">※ Amazonの商品ページへのリンクです。</p>'
    +'</div>'

    // 詳細シミュレーターへ
    +'<div style="text-align:center;padding-top:14px;border-top:1px solid #e0d8c8;">'
    +'<a href="https://finantial-repo.github.io/money-simulator/" style="font-size:12px;color:#888;text-decoration:none;border-bottom:1px dotted #ccc;">退職後の月次収支・モンテカルログラフ詳細版（別ページ）→</a></div>';

  res.style.display = 'block';

  // ── グラフ描画（innerHTML設定後に実行）──
  var chartSvg = document.getElementById('wps-result').querySelector('[data-wps-chart]');
  if (chartSvg) wpsDrawChart(chartSvg, _wpsProjData[_wpsScenario], WPS_SCENARIOS[_wpsScenario].color);

  var crashSvg = document.getElementById('wps-crash-chart');
  if (crashSvg) wpsDrawCrashChart(crashSvg, c.fv*10000, withdrawYen);

  // ── シナリオ pill バインド（CSP対策：onclickなしでaddEventListener）──
  var pills2 = document.getElementById('wps-result').querySelectorAll('[data-wps-pill]');
  var resRef  = document.getElementById('wps-result');
  for (var pi = 0; pi < pills2.length; pi++) {
    (function(pill) {
      pill.addEventListener('click', function() {
        wpsSwitchScenario(pill.getAttribute('data-wps-pill'), resRef);
      });
    })(pills2[pi]);
  }

  setTimeout(function() {
    res.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 80);
}

// ── ヘルパー ─────────────────────────────────────────────────────────
function wpsBox(label, val, sub) {
  return '<div style="background:rgba(255,255,255,.08);border-radius:8px;padding:12px 8px;text-align:center;">'
    +'<p style="font-size:10px;color:#aab8cc;margin:0 0 4px;letter-spacing:1px;">'+label+'</p>'
    +'<p style="font-size:17px;font-weight:800;color:#e8d5a0;margin:0 0 2px;line-height:1.2;">'+val+'</p>'
    +'<p style="font-size:10px;color:#556677;margin:0;line-height:1.4;">'+sub+'</p>'
    +'</div>';
}
function wpsArt(url, title, desc, color, bg, border) {
  return '<a href="'+url+'" style="display:block;background:'+bg+';border:1px solid '+border+';border-left:5px solid '+color+';border-radius:0 10px 10px 0;padding:14px 18px;text-decoration:none;margin-bottom:10px;">'
    +'<p style="font-size:14px;font-weight:700;color:#1a1a2e;margin:0 0 4px;">'+title+'</p>'
    +'<p style="font-size:12px;color:#555;margin:0;line-height:1.6;">'+desc+'</p>'
    +'</a>';
}

// ── 自動バインド ─────────────────────────────────────────────────────
(function() {
  function bind() {
    var btn = document.getElementById('wps-btn');
    if (btn) btn.addEventListener('click', runWPSim);
    var liveIds = ['wps-income','wps-si','wps-rent','wps-food','wps-util','wps-trans','wps-leisure','wps-other'];
    for (var i=0; i<liveIds.length; i++) {
      var el = document.getElementById(liveIds[i]);
      if (el) el.addEventListener('input', wpsUpdateLive);
    }
    var radios = document.querySelectorAll('input[name="wps-emp"]');
    for (var j=0; j<radios.length; j++) radios[j].addEventListener('change', wpsUpdateLive);
    wpsUpdateLive();
  }
  if (document.readyState==='loading') document.addEventListener('DOMContentLoaded', bind);
  else setTimeout(bind, 0);
})();
