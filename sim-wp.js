// sim-wp.js — WordPress内シミュレーター フル版
// <script src> で WordPress に読み込み、addEventListener で自動バインド（CSP対策）
'use strict';

var WP_SIM_BLOG = 'https://moneykyoshitsu.com';

// ── おすすめ本 ──────────────────────────────────────────────────────────
var WPS_BOOKS = [
  { id:'random_walker', title:'ウォール街のランダム・ウォーカー',
    url:'https://www.amazon.co.jp/dp/4296115871',
    sub:'インデックス投資の聖書。なぜ市場平均に勝てないかを徹底解説。',
    tag:'index' },
  { id:'index_wins', title:'インデックス投資は勝者のゲーム',
    url:'https://www.amazon.co.jp/dp/4775972324',
    sub:'手数料の重要性とインデックス投資の圧倒的な優位性を証明。',
    tag:'index' },
  { id:'okane_nekase', title:'お金は寝かせて増やしなさい',
    url:'https://www.amazon.co.jp/dp/486680260X',
    sub:'NISAを最大活用するための日本版インデックス投資入門。',
    tag:'nisa' },
  { id:'psychology', title:'サイコロジー・オブ・マネー',
    url:'https://www.amazon.co.jp/dp/4478115826',
    sub:'お金と人間心理の関係。投資の感情コントロールに必読。',
    tag:'defense' },
  { id:'hottarakashi', title:'ほったらかし投資術',
    url:'https://www.amazon.co.jp/dp/4023320617',
    sub:'月1回見るだけでOK。インデックス投資の実践マニュアル。',
    tag:'nisa' },
];

// ── 計算コア ────────────────────────────────────────────────────────────
function wpsGetInputs() {
  function v(id, def) {
    var el = document.getElementById(id);
    return el ? (parseFloat(el.value) || def) : def;
  }
  function r(name) {
    var el = document.querySelector('input[name="'+name+'"]:checked');
    return el ? el.value : null;
  }
  return {
    age       : v('wps-age', 30),
    income    : v('wps-income', 500),
    si        : v('wps-si', -1),   // -1 = 自動推定
    expRent   : v('wps-rent', 8),
    expFood   : v('wps-food', 5),
    expUtil   : v('wps-util', 2),
    expTrans  : v('wps-trans', 1),
    expLeisure: v('wps-leisure', 2),
    expOther  : v('wps-other', 1),
    savings   : v('wps-savings', 100),
    freeMonth : v('wps-free', -1), // -1 = 自動
    retireAge : parseInt(r('wps-retire') || '65'),
    riskLevel : r('wps-risk') || 'balanced',
    emp       : r('wps-emp') || 'employee',
    spouse    : r('wps-spouse') || 'none',
    children  : parseInt(r('wps-children') || '0'),
    home      : r('wps-home') || 'rent',
    ideco     : (r('wps-ideco') || 'yes') !== 'no',
    idecoOverride: v('wps-ideco-limit', 0),
    pension   : v('wps-pension', 15),
    retireBonus: v('wps-retire-bonus', 0),
    yearsWorked: v('wps-years-worked', 30),
    mortgageCredit: v('wps-mortgage-credit', 0),
  };
}

function wpsCalc(inp) {
  var income = inp.income;
  var emp    = inp.emp;

  // 給与所得控除
  var ded = 55;
  if (income > 162.5) ded = income * 0.4 - 10;
  if (income > 180)   ded = income * 0.3 + 8;
  if (income > 360)   ded = income * 0.2 + 44;
  if (income > 660)   ded = income * 0.1 + 110;
  if (income > 850)   ded = 195;

  // 社会保険料（手動入力 or 推定）
  var si = inp.si > 0 ? inp.si : income * (emp === 'self' ? 0.17 : 0.145);

  // 扶養控除
  var spouseDed   = (inp.spouse === 'dependent') ? 38 : 0;
  var childrenDed = inp.children * 38;
  // 住宅ローン控除は税額控除（後で適用）

  var taxable = Math.max(0, income - ded - si - 48 - spouseDed - childrenDed);

  // 所得税（超過累進）
  var itaxRate = 0.05, itaxDeduct = 0;
  var brs = [[195,0.05,0],[330,0.10,9.75],[695,0.20,42.75],[900,0.23,63.6],[1800,0.33,153.6],[4000,0.40,279.6]];
  for (var i = 0; i < brs.length; i++) {
    if (taxable <= brs[i][0]) { itaxRate = brs[i][1]; itaxDeduct = brs[i][2]; break; }
    if (i === brs.length - 1) { itaxRate = 0.45; itaxDeduct = 479.6; }
  }
  var itax = Math.max(0, taxable * itaxRate - itaxDeduct);
  itax = Math.max(0, itax * 1.021 - inp.mortgageCredit); // 復興税・住宅ローン控除

  // 住民税
  var ltax = Math.max(0, taxable - 43) * 0.10;

  // 手取り
  var takehome  = income - itax - ltax - si;
  var expense   = inp.expRent + inp.expFood + inp.expUtil + inp.expTrans + inp.expLeisure + inp.expOther;
  var investable = Math.max(0, takehome / 12 - expense);

  // iDeCo
  var idecoLimits = { employee:2.3, employee_dc_only:2.0, employee_pension:1.2, civil:2.0, self:6.8 };
  var idecoLim    = inp.idecoOverride > 0 ? inp.idecoOverride : (idecoLimits[emp] || 2.3);
  var idecoMonth  = inp.ideco ? Math.min(idecoLim, Math.max(0, investable * 0.5)) : 0;

  // iDeCo節税額
  var taxSaving = idecoMonth * 12 * (itaxRate * 1.021 + 0.10);

  // NISA（上限10万/月）
  var nisaMonth = Math.min(10, Math.max(0, investable - idecoMonth));

  // リスク別リターン
  var rParams = {
    conservative: { mu: 0.003750, sigma: 0.030 },   // 株60:債券40
    balanced:     { mu: 0.004583, sigma: 0.043 },    // 全世界株式
    aggressive:   { mu: 0.005167, sigma: 0.055 },    // S&P500
  };
  var rp = rParams[inp.riskLevel] || rParams['balanced'];
  var years = Math.max(1, inp.retireAge - inp.age);
  var months = years * 12;
  var monthly = idecoMonth + nisaMonth;
  var fv = monthly * 10000 * (Math.pow(1 + rp.mu, months) - 1) / rp.mu / 10000;

  // 生活防衛資金の目標
  var emergTarget = expense * 6;

  // 配分バー（%）
  var totalSlots = Math.max(investable, 0.01);
  var pIdeco  = Math.round(idecoMonth / totalSlots * 100);
  var pNisa   = Math.round(nisaMonth  / totalSlots * 100);
  var pEmerg  = investable > emergTarget / 12 ? 0 : Math.round(Math.min(1, (emergTarget/12)/totalSlots) * 100);
  var pFree   = Math.max(0, 100 - pIdeco - pNisa - pEmerg);

  return {
    takehome: takehome, si: si, itax: itax, ltax: ltax, taxable: taxable,
    expense: expense, investable: investable,
    idecoMonth: idecoMonth, idecoLim: idecoLim, taxSaving: taxSaving,
    nisaMonth: nisaMonth, fv: fv, years: years,
    emergTarget: emergTarget,
    pIdeco: pIdeco, pNisa: pNisa, pEmerg: pEmerg, pFree: pFree,
    itaxRate: itaxRate, rp: rp, monthly: monthly,
  };
}

// ── リアルタイム表示 ──────────────────────────────────────────────────
function wpsUpdateLive() {
  try {
    var inp = wpsGetInputs();
    var c   = wpsCalc(inp);
    var thEl  = document.getElementById('wps-takehome');
    var invEl = document.getElementById('wps-investable');
    if (thEl)  thEl.textContent  = Math.round(c.takehome / 12 * 10) / 10 + ' 万円/月';
    if (invEl) {
      var v = Math.round(c.investable * 10) / 10;
      invEl.textContent = v + ' 万円/月';
      invEl.style.color = v < 2 ? '#e53935' : v < 5 ? '#e65100' : '#1a8a3a';
    }
  } catch(e) {}
}

// ── メイン診断 ────────────────────────────────────────────────────────
function runWPSim() {
  var inp = wpsGetInputs();
  var c   = wpsCalc(inp);
  var res = document.getElementById('wps-result');
  if (!res) return;

  // 状況判定
  var situation = c.investable < 2 ? 'defense'
                : (inp.ideco && c.taxSaving >= 3) ? 'ideco'
                : 'nisa';

  // ── アドバイスリスト ──
  var advices = [];
  if (c.investable < 2) {
    advices.push({ cls:'warn', icon:'⚠️',
      text:'月の余剰資金が <strong>' + Math.round(c.investable*10)/10 + '万円</strong> と少ない状態です。生活防衛資金（月の生活費×3〜6ヶ月 = <strong>' + Math.round(c.emergTarget*10)/10 + '万円</strong>）を先に確保しましょう。' });
  }
  if (inp.savings < c.emergTarget) {
    advices.push({ cls:'warn', icon:'🛡',
      text:'生活防衛資金が目標額（<strong>' + Math.round(c.emergTarget*10)/10 + '万円</strong>）に不足しています。まず不足分を普通預金に積み立ててから投資を開始することを推奨します。' });
  }
  if (inp.ideco && c.idecoMonth > 0) {
    advices.push({ cls:'ok', icon:'✅',
      text:'iDeCo（月<strong>' + Math.round(c.idecoMonth*10)/10 + '万円</strong>）で年間 <strong>' + Math.round(c.taxSaving*10)/10 + '万円</strong> の節税効果があります（所得税' + Math.round(inp.income > 0 ? c.itaxRate*100 : 5) + '%＋住民税10%の軽減）。' });
  }
  if (c.nisaMonth > 0) {
    advices.push({ cls:'ok', icon:'📈',
      text:'NISA（月<strong>' + Math.round(c.nisaMonth*10)/10 + '万円</strong>）で積み立てると、<strong>' + inp.retireAge + '歳時に約' + Math.round(c.fv).toLocaleString() + '万円</strong>の資産形成が期待できます（' + inp.riskLevel === 'aggressive' ? 'S&P500・年率約6.2%' : inp.riskLevel === 'conservative' ? 'バランス型・年率約4.5%' : '全世界株式・年率約5.5%' + '・概算）。' });
  }
  if (inp.children > 0) {
    advices.push({ cls:'info', icon:'👶',
      text:'子供 <strong>' + inp.children + '人</strong> の教育費は公立中心で約1,000万円/人、私立中心で約2,000万円/人が目安です。こどもNISAや教育資金贈与の活用も検討しましょう。' });
  }
  if (inp.spouse === 'dependent') {
    advices.push({ cls:'info', icon:'👫',
      text:'専業主婦（夫）がいる場合、配偶者のiDeCoも活用できます。配偶者名義でも最大2.3万円/月（会社員の場合）の掛け金が可能です。' });
  }
  if (c.investable > 10) {
    advices.push({ cls:'info', icon:'💡',
      text:'投資可能額が月10万円を超えています。NISA（月最大10万円）を満額活用した上で、余剰分は特定口座での投資も検討できます。' });
  }
  if (advices.length === 0) {
    advices.push({ cls:'ok', icon:'✅',
      text:'バランスの良い収支状況です。iDeCo＋NISAを継続することで、着実な資産形成が期待できます。' });
  }

  var adviceHTML = '<ul style="list-style:none;padding:0;margin:0;">'
    + advices.map(function(a) {
        var bg = a.cls === 'ok' ? '#e8f5e9' : a.cls === 'warn' ? '#fff3e0' : '#e3f2fd';
        var col = a.cls === 'ok' ? '#1b5e20' : a.cls === 'warn' ? '#bf360c' : '#0d47a1';
        return '<li style="background:' + bg + ';color:' + col + ';border-radius:6px;'
          + 'padding:10px 14px 10px 42px;margin-bottom:8px;font-size:14px;line-height:1.8;position:relative;">'
          + '<span style="position:absolute;left:12px;top:10px;">' + a.icon + '</span>'
          + a.text + '</li>';
      }).join('')
    + '</ul>';

  // ── 配分バー ──
  var barSegs = [
    { pct: c.pIdeco, color: '#1a1a2e', label: 'iDeCo' },
    { pct: c.pNisa,  color: '#2e7d32', label: 'NISA' },
    { pct: c.pEmerg, color: '#1565c0', label: '生活防衛' },
    { pct: c.pFree,  color: '#aaa',    label: '自由資金' },
  ].filter(function(s){ return s.pct > 0; });

  var barHTML = '<div style="background:#eee;border-radius:6px;overflow:hidden;height:32px;display:flex;margin-bottom:10px;">'
    + barSegs.map(function(s){
        return '<div style="width:' + s.pct + '%;height:100%;background:' + s.color + ';display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#fff;min-width:0;overflow:hidden;white-space:nowrap;">'
          + (s.pct >= 10 ? s.label : '') + '</div>';
      }).join('')
    + '</div>'
    + '<div style="display:flex;flex-wrap:wrap;gap:10px;">'
    + barSegs.map(function(s){
        return '<span style="display:flex;align-items:center;gap:5px;font-size:12px;color:#555;">'
          + '<span style="width:12px;height:12px;background:' + s.color + ';border-radius:3px;display:inline-block;"></span>'
          + s.label + ' ' + s.pct + '%</span>';
      }).join('')
    + '</div>';

  // ── 税金内訳表 ──
  var taxRows = [
    ['年収（税込）',           Math.round(inp.income) + '万円'],
    ['給与所得控除後の所得',    Math.round(inp.income - (inp.income > 162.5 ? (inp.income > 180 ? (inp.income > 360 ? (inp.income > 660 ? (inp.income > 850 ? 195 : inp.income*0.1+110) : inp.income*0.2+44) : inp.income*0.3+8) : inp.income*0.4-10) : 55)) + '万円'],
    ['社会保険料',              Math.round(c.si*10)/10 + '万円'],
    ['基礎控除ほか',            '48万円以上'],
    ['課税所得',                Math.round(c.taxable*10)/10 + '万円'],
    ['所得税（復興税込）',      Math.round(c.itax*10)/10 + '万円  [税率' + Math.round(c.itaxRate*100) + '%]'],
    ['住民税',                  Math.round(c.ltax*10)/10 + '万円'],
    ['手取り年収',              Math.round(c.takehome*10)/10 + '万円'],
    ['手取り月収',              Math.round(c.takehome/12*10)/10 + '万円/月'],
  ];
  if (inp.ideco && c.idecoMonth > 0) {
    taxRows.push(['iDeCo年間節税額', '▲ ' + Math.round(c.taxSaving*10)/10 + '万円']);
  }
  var taxHTML = '<table style="width:100%;border-collapse:collapse;font-size:13px;">'
    + '<thead><tr>'
    + '<th style="background:#1a1a2e;color:#fff;padding:8px 12px;text-align:left;font-weight:600;">項目</th>'
    + '<th style="background:#1a1a2e;color:#fff;padding:8px 12px;text-align:right;font-weight:600;">金額</th>'
    + '</tr></thead><tbody>'
    + taxRows.map(function(r, i) {
        var bg = (i % 2 === 0) ? '#fff' : '#f8f6f0';
        var highlight = r[0].indexOf('手取り月収') >= 0 || r[0].indexOf('節税') >= 0;
        return '<tr style="' + (highlight ? 'font-weight:700;background:#fff8e6!important;' : '') + '">'
          + '<td style="padding:8px 12px;border-bottom:1px solid #e0d8c8;background:' + bg + ';">' + r[0] + '</td>'
          + '<td style="padding:8px 12px;border-bottom:1px solid #e0d8c8;text-align:right;background:' + bg + ';color:' + (r[0].indexOf('節税') >= 0 ? '#2e7d32' : '#1a1a2e') + ';">' + r[1] + '</td>'
          + '</tr>';
      }).join('')
    + '</tbody></table>'
    + '<p style="font-size:11px;color:#888;margin:8px 0 0;line-height:1.7;">'
    + '※ 所得税に復興特別所得税2.1%を加算。住民税は均等割を含みません。iDeCo拠出は小規模企業共済等掛金控除として適用。</p>';

  // ── おすすめ記事 ──
  var recArticle = '';
  if (situation === 'defense') {
    recArticle = wpsArticle(WP_SIM_BLOG+'/keep-cash-invest-efficiently/',
      '🛡 生活防衛資金と投資の黄金比',
      '月の余剰資金が少ない今こそ読んでおくべき基礎知識。いくら確保すれば投資を始めてよいか。',
      '#2e7d32','#eef7f1','#a5d6a7');
  } else if (situation === 'ideco') {
    recArticle = wpsArticle(WP_SIM_BLOG+'/ideco-myth-debunked/',
      '📊 iDeCoの「60歳まで引き出せない」は本当にデメリットか？',
      '年間' + Math.round(c.taxSaving*10)/10 + '万円の節税効果があります。iDeCoを最大活用する方法を解説。',
      '#1565c0','#eef4fb','#90caf9');
  } else {
    recArticle = wpsArticle(WP_SIM_BLOG+'/new-nisa-explained/',
      '📈 新NISAを「使わない理由」はあるか？',
      '月' + Math.round(c.nisaMonth*10)/10 + '万円から始める新NISA積立の具体的な手順と注意点。',
      '#c62828','#fff5f5','#ef9a9a');
  }
  recArticle += wpsArticle(WP_SIM_BLOG+'/securities-account-comparison/',
    '🏦 証券口座4社比較 — クレカ積立還元率で選ぶ',
    'SBI証券・楽天証券・マネックス・松井証券のiDeCo対応・クレカ積立還元率を徹底比較。',
    '#555','#fff','#e0d0a0');

  // ── おすすめの本 ──
  var bookTags = situation === 'defense' ? ['defense','nisa']
               : situation === 'ideco'   ? ['index','nisa']
               : ['nisa','index'];
  var bookHTML = WPS_BOOKS.filter(function(b){
      return bookTags.indexOf(b.tag) >= 0;
    }).slice(0, 3).map(function(b) {
      return '<a href="' + b.url + '" target="_blank" rel="noopener"'
        + ' style="display:flex;align-items:flex-start;gap:12px;padding:12px 14px;'
        + 'background:#fff;border:1px solid #e0d8c8;border-radius:8px;'
        + 'text-decoration:none;margin-bottom:8px;">'
        + '<span style="font-size:22px;flex-shrink:0;">📖</span>'
        + '<div>'
        + '<p style="font-size:13px;font-weight:700;color:#1a1a2e;margin:0 0 3px;">' + b.title + '</p>'
        + '<p style="font-size:12px;color:#666;margin:0;line-height:1.6;">' + b.sub + '</p>'
        + '<p style="font-size:11px;color:#1565c0;margin:4px 0 0;">Amazon で見る →</p>'
        + '</div></a>';
    }).join('');

  // ── 結果HTML組立て ──
  res.innerHTML =
    // 結果ヘッダー
    '<div style="background:linear-gradient(135deg,#1a1a2e,#2d3a6e);border-radius:12px;padding:28px 24px;margin-bottom:16px;">'
    + '<p style="font-size:11px;font-weight:700;color:#c0a060;letter-spacing:3px;margin:0 0 16px;">📊 診断結果</p>'
    + '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:14px;">'
    + wpsBox('月の投資可能額',   Math.round(c.investable*10)/10+'万円', '手取り − 生活費')
    + wpsBox('iDeCo年間節税額',  inp.ideco ? Math.round(c.taxSaving*10)/10+'万円' : '—',  '所得税＋住民税の軽減')
    + wpsBox(inp.retireAge+'歳時の推定資産', Math.round(c.fv).toLocaleString()+'万円', riskLabel(inp.riskLevel)+'・'+inp.years+'年間積立（概算）')
    + '</div>'
    + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">'
    + wpsBox('iDeCo 推奨月額',  inp.ideco && c.idecoMonth > 0 ? Math.round(c.idecoMonth*10)/10+'万円' : '—', '掛金上限: '+c.idecoLim+'万円/月')
    + wpsBox('NISA 推奨月額',   c.nisaMonth > 0 ? Math.round(c.nisaMonth*10)/10+'万円' : '—', '非課税で長期積立')
    + '</div>'
    + '</div>'

    // 月々の推奨配分
    + '<div style="background:#fff;border:1px solid #e0d8c8;border-radius:10px;padding:20px 22px;margin-bottom:14px;">'
    + '<p style="font-size:11px;font-weight:700;color:#b8860b;letter-spacing:2px;margin:0 0 12px;">月々の推奨配分（' + Math.round(c.investable*10)/10 + '万円）</p>'
    + barHTML
    + '</div>'

    // アドバイス
    + '<div style="background:#fff;border:1px solid #e0d8c8;border-radius:10px;padding:20px 22px;margin-bottom:14px;">'
    + '<p style="font-size:11px;font-weight:700;color:#b8860b;letter-spacing:2px;margin:0 0 12px;">あなたへのアドバイス</p>'
    + adviceHTML
    + '</div>'

    // 税金内訳
    + '<div style="background:#fff;border:1px solid #e0d8c8;border-radius:10px;padding:20px 22px;margin-bottom:14px;">'
    + '<p style="font-size:11px;font-weight:700;color:#b8860b;letter-spacing:2px;margin:0 0 12px;">税金シミュレーション</p>'
    + taxHTML
    + '</div>'

    // おすすめ記事
    + '<p style="font-size:12px;font-weight:700;color:#b8860b;letter-spacing:2px;margin:0 0 10px;">次に読むべき記事</p>'
    + recArticle

    // おすすめの本
    + '<div style="background:#fdf8ed;border:1px solid #e0d0a0;border-radius:10px;padding:20px 22px;margin-top:4px;margin-bottom:16px;">'
    + '<p style="font-size:11px;font-weight:700;color:#b8860b;letter-spacing:2px;margin:0 0 12px;">📚 あなたへのおすすめの本</p>'
    + bookHTML
    + '<p style="font-size:10px;color:#888;margin:8px 0 0;">※ Amazonの商品ページへのリンクです。</p>'
    + '</div>'

    // 詳細シミュレーターへ
    + '<div style="text-align:center;padding-top:14px;border-top:1px solid #e0d8c8;">'
    + '<a href="https://finantial-repo.github.io/money-simulator/" '
    + 'style="font-size:12px;color:#888;text-decoration:none;border-bottom:1px dotted #ccc;">'
    + 'モンテカルロ法による詳細グラフシミュレーション（別ページ）→</a>'
    + '</div>';

  res.style.display = 'block';
  setTimeout(function() {
    res.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 80);
}

function riskLabel(r) {
  return r === 'aggressive' ? 'S&P500中心・年率約6.2%'
       : r === 'conservative' ? 'バランス型・年率約4.5%'
       : '全世界株式・年率約5.5%';
}

function wpsBox(label, val, sub) {
  return '<div style="background:rgba(255,255,255,.08);border-radius:8px;padding:12px 8px;text-align:center;">'
    + '<p style="font-size:10px;color:#aab8cc;margin:0 0 4px;letter-spacing:1px;">' + label + '</p>'
    + '<p style="font-size:18px;font-weight:800;color:#e8d5a0;margin:0 0 2px;line-height:1.2;">' + val + '</p>'
    + '<p style="font-size:10px;color:#556677;margin:0;line-height:1.4;">' + sub + '</p>'
    + '</div>';
}

function wpsArticle(url, title, desc, color, bg, border) {
  return '<a href="' + url + '" style="display:block;background:' + bg + ';border:1px solid ' + border + ';'
    + 'border-left:5px solid ' + color + ';border-radius:0 10px 10px 0;'
    + 'padding:14px 18px;text-decoration:none;margin-bottom:10px;">'
    + '<p style="font-size:14px;font-weight:700;color:#1a1a2e;margin:0 0 4px;">' + title + '</p>'
    + '<p style="font-size:12px;color:#555;margin:0;line-height:1.6;">' + desc + '</p>'
    + '</a>';
}

// ── 自動バインド（CSP対策：onclick属性不使用） ─────────────────────────
(function() {
  function bind() {
    var btn = document.getElementById('wps-btn');
    if (btn) btn.addEventListener('click', runWPSim);

    // リアルタイム手取り計算
    var liveIds = ['wps-income','wps-si','wps-rent','wps-food','wps-util','wps-trans','wps-leisure','wps-other'];
    for (var i = 0; i < liveIds.length; i++) {
      var el = document.getElementById(liveIds[i]);
      if (el) el.addEventListener('input', wpsUpdateLive);
    }
    var radios = document.querySelectorAll('input[name="wps-emp"]');
    for (var j = 0; j < radios.length; j++) {
      radios[j].addEventListener('change', wpsUpdateLive);
    }
    wpsUpdateLive();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bind);
  } else {
    setTimeout(bind, 0);
  }
})();
