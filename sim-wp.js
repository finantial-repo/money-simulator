// sim-wp.js — WordPress内シミュレーター（完全版）
// GitHub Pages から <script src> で読み込み、WordPress ページ内で動作
// onclick属性は使わず addEventListener で自動バインド（WordPress CSP対策）
'use strict';

var WP_SIM_BLOG = 'https://moneykyoshitsu.com';

// ── 手取り・投資可能額をリアルタイム更新 ──────────────────────────────
function wpsCalcBase() {
  var income   = parseFloat(document.getElementById('wps-income').value)  || 0;
  var expRent  = parseFloat(document.getElementById('wps-rent').value)    || 0;
  var expFood  = parseFloat(document.getElementById('wps-food').value)    || 0;
  var expUtil  = parseFloat(document.getElementById('wps-util').value)    || 0;
  var expOther = parseFloat(document.getElementById('wps-other').value)   || 0;
  var expense  = expRent + expFood + expUtil + expOther;
  var empEl    = document.querySelector('input[name="wps-emp"]:checked');
  var emp      = empEl ? empEl.value : 'company';

  // 給与所得控除
  var ded = 55;
  if (income > 162.5) ded = income * 0.4 - 10;
  if (income > 180)   ded = income * 0.3 + 8;
  if (income > 360)   ded = income * 0.2 + 44;
  if (income > 660)   ded = income * 0.1 + 110;
  if (income > 850)   ded = 195;

  var taxable = Math.max(0, income - ded - 48);

  // 所得税
  var itax = taxable * 0.4 - 279.6;
  var brs = [[195,0.05,0],[330,0.10,9.75],[695,0.20,42.75],[900,0.23,63.6],[1800,0.33,153.6]];
  for (var i = 0; i < brs.length; i++) {
    if (taxable <= brs[i][0]) { itax = taxable * brs[i][1] - brs[i][2]; break; }
  }
  var ltax = Math.max(0, taxable - 43) * 0.10;
  var si   = income * (emp === 'self' ? 0.17 : 0.15);
  var takehome   = income - itax * 1.021 - ltax - si;
  var investable = Math.max(0, takehome / 12 - expense);

  return { income: income, expense: expense, taxable: taxable, takehome: takehome,
           investable: investable, emp: emp, itax: itax, ltax: ltax, si: si };
}

function wpsUpdateLive() {
  var b = wpsCalcBase();
  var thEl = document.getElementById('wps-takehome');
  var invEl = document.getElementById('wps-investable');
  if (thEl)  thEl.textContent  = Math.round(b.takehome / 12 * 10) / 10 + ' 万円/月';
  if (invEl) {
    var v = Math.round(b.investable * 10) / 10;
    invEl.textContent = v + ' 万円/月';
    invEl.style.color = v < 2 ? '#e53935' : v < 5 ? '#e65100' : '#1a8a3a';
  }
}

// ── メイン診断 ────────────────────────────────────────────────────────
function runWPSim() {
  var b      = wpsCalcBase();
  var age    = parseInt(document.getElementById('wps-age').value) || 30;
  var idecoEl= document.querySelector('input[name="wps-ideco"]:checked');
  var ideco  = idecoEl ? idecoEl.value !== 'no' : true;

  var income     = b.income;
  var expense    = b.expense;
  var taxable    = b.taxable;
  var takehome   = b.takehome;
  var investable = b.investable;
  var emp        = b.emp;

  // iDeCo
  var idecoLim = { company: 2.3, gov: 2.0, self: 6.8 };
  var limit    = idecoLim[emp] || 2.3;
  var idecoMonth  = ideco ? Math.min(limit, Math.max(0, investable * 0.5)) : 0;
  var mRate    = taxable <= 195 ? 0.05 : taxable <= 330 ? 0.10 : taxable <= 695 ? 0.20 : 0.23;
  var idecoSaving = idecoMonth * 12 * (mRate * 1.021 + 0.10);

  // NISA
  var nisaMonth = Math.min(10, Math.max(0, investable - idecoMonth));
  var years     = Math.max(1, 65 - age);
  var r         = 0.004167; // 5%/年→月次
  var fv        = (idecoMonth + nisaMonth) * 10000
                  * (Math.pow(1 + r, years * 12) - 1) / r / 10000;

  var res = document.getElementById('wps-result');
  if (!res) return;

  // 状況判定
  var situation = investable < 2 ? 'defense'
                : (ideco && idecoSaving >= 3) ? 'ideco'
                : 'nisa';

  // ── アドバイス ──
  var adviceColor = situation === 'defense' ? '#c62828'
                  : situation === 'ideco'   ? '#1565c0'
                  : '#2e7d32';
  var adviceBg    = situation === 'defense' ? '#fff5f5'
                  : situation === 'ideco'   ? '#eef4fb'
                  : '#eef7f1';
  var adviceIcon  = situation === 'defense' ? '⚠️' : '✅';
  var adviceText  = situation === 'defense'
    ? '月の余剰資金が <strong>' + Math.round(investable*10)/10 + '万円</strong> と少ない状態です。まず生活防衛資金（月の生活費×3〜6ヶ月分）を確保しましょう。投資はその後です。'
    : situation === 'ideco'
    ? 'iDeCo優先を推奨します。年間 <strong>' + Math.round(idecoSaving*10)/10 + '万円</strong> の節税効果があります（所得税＋住民税の軽減）。iDeCoを最大活用してから残りをNISAへ回しましょう。'
    : 'NISA積立を中心に進めましょう。月 <strong>' + Math.round(nisaMonth*10)/10 + '万円</strong> を全世界株式インデックスで積み立てると、65歳時に約 <strong>' + Math.round(fv).toLocaleString() + '万円</strong> の資産形成が期待できます（年率5%・概算）。';

  // ── おすすめ記事 ──
  var recHTML = '';
  if (situation === 'defense') {
    recHTML = wpsArticle(WP_SIM_BLOG+'/keep-cash-invest-efficiently/',
      '🛡 生活防衛資金と投資の黄金比',
      '月の余剰資金が少ない今こそ読んでおくべき基礎知識。いくら確保すれば投資を始めてよいか。',
      '#2e7d32','#eef7f1','#a5d6a7');
  } else if (situation === 'ideco') {
    recHTML = wpsArticle(WP_SIM_BLOG+'/ideco-myth-debunked/',
      '📊 iDeCoの「60歳まで引き出せない」は本当にデメリットか？',
      '年間'+Math.round(idecoSaving*10)/10+'万円の節税効果があります。iDeCoを最大活用する方法を解説。',
      '#1565c0','#eef4fb','#90caf9')
    + wpsArticle(WP_SIM_BLOG+'/securities-account-comparison/',
      '🏦 証券口座4社比較 — iDeCo対応・クレカ積立還元率',
      'SBI証券・楽天証券・マネックス・松井証券のiDeCo商品数・手数料を徹底比較。',
      '#555','#fff','#e0d0a0');
  } else {
    recHTML = wpsArticle(WP_SIM_BLOG+'/new-nisa-explained/',
      '📈 新NISAを「使わない理由」はあるか？',
      '月'+Math.round(nisaMonth*10)/10+'万円から始める新NISA積立の具体的な手順と注意点。',
      '#c62828','#fff5f5','#ef9a9a')
    + wpsArticle(WP_SIM_BLOG+'/securities-account-comparison/',
      '🏦 証券口座4社比較 — クレカ積立還元率で選ぶ',
      'SBI証券・楽天証券・マネックス・松井証券のクレカ積立還元率と使いやすさを比較。',
      '#555','#fff','#e0d0a0');
  }

  res.innerHTML =
    // ── 結果ヘッダー（ネイビー）──
    '<div style="background:linear-gradient(135deg,#1a1a2e,#2d3a6e);border-radius:12px;padding:28px 24px;margin-bottom:16px;">'
    + '<p style="font-size:11px;font-weight:700;color:#c0a060;letter-spacing:3px;margin:0 0 16px;">📊 診断結果</p>'
    + '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:14px;">'
    + wpsBox('月の投資可能額',   Math.round(investable*10)/10+'万円',    '手取り − 生活費合計')
    + wpsBox('iDeCo年間節税額',  ideco ? Math.round(idecoSaving*10)/10+'万円' : '—',  '所得税＋住民税の軽減')
    + wpsBox('65歳時の推定資産', Math.round(fv).toLocaleString()+'万円', '年率5%・積立のみ（概算）')
    + '</div>'
    + '<p style="font-size:11px;color:#7a8aa0;margin:0;">手取り月収: '
    + Math.round(takehome/12*10)/10+'万円 ／ 年収'+income+'万円・月支出'+Math.round(expense*10)/10+'万円</p>'
    + '</div>'

    // ── アドバイス ──
    + '<div style="background:'+adviceBg+';border-left:5px solid '+adviceColor
    + ';border-radius:0 10px 10px 0;padding:16px 20px;margin-bottom:16px;">'
    + '<p style="font-size:13px;font-weight:700;color:'+adviceColor+';margin:0 0 6px;">'
    + adviceIcon + ' アドバイス</p>'
    + '<p style="font-size:14px;color:#2c2c2c;margin:0;line-height:1.8;">'+adviceText+'</p>'
    + '</div>'

    // ── おすすめ記事 ──
    + '<p style="font-size:12px;font-weight:700;color:#b8860b;letter-spacing:2px;margin:0 0 10px;">次に読むべき記事</p>'
    + recHTML

    // ── 詳細シミュレーターへ ──
    + '<div style="text-align:center;margin-top:20px;padding-top:16px;border-top:1px solid #e0d8c8;">'
    + '<a href="https://finantial-repo.github.io/money-simulator/" '
    + 'style="font-size:12px;color:#888;text-decoration:none;border-bottom:1px dotted #ccc;">'
    + 'モンテカルロ法による詳細シミュレーション（グラフ付き）→</a>'
    + '</div>';

  res.style.display = 'block';
  setTimeout(function() {
    res.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 80);
}

// ── ヘルパー：結果ボックス ────────────────────────────────────────────
function wpsBox(label, val, sub) {
  return '<div style="background:rgba(255,255,255,.08);border-radius:8px;padding:12px 8px;text-align:center;">'
    + '<p style="font-size:10px;color:#aab8cc;margin:0 0 4px;letter-spacing:1px;">'+label+'</p>'
    + '<p style="font-size:20px;font-weight:800;color:#e8d5a0;margin:0 0 2px;line-height:1.2;">'+val+'</p>'
    + '<p style="font-size:10px;color:#556677;margin:0;">'+sub+'</p>'
    + '</div>';
}

// ── ヘルパー：おすすめ記事カード ─────────────────────────────────────
function wpsArticle(url, title, desc, color, bg, border) {
  return '<a href="'+url+'" style="display:block;background:'+bg+';border:1px solid '+border+';'
    + 'border-left:5px solid '+color+';border-radius:0 10px 10px 0;'
    + 'padding:14px 18px;text-decoration:none;margin-bottom:10px;">'
    + '<p style="font-size:14px;font-weight:700;color:#1a1a2e;margin:0 0 4px;">'+title+'</p>'
    + '<p style="font-size:12px;color:#555;margin:0;line-height:1.6;">'+desc+'</p>'
    + '</a>';
}

// ── 自動バインド（CSP対策：onclick属性は使わない）────────────────────
(function() {
  function bind() {
    // 診断ボタン
    var btn = document.getElementById('wps-btn');
    if (btn) btn.addEventListener('click', runWPSim);

    // リアルタイム手取り計算
    var liveIds = ['wps-income','wps-rent','wps-food','wps-util','wps-other'];
    for (var i = 0; i < liveIds.length; i++) {
      var el = document.getElementById(liveIds[i]);
      if (el) el.addEventListener('input', wpsUpdateLive);
    }
    // ラジオボタン（雇用形態）
    var radios = document.querySelectorAll('input[name="wps-emp"]');
    for (var j = 0; j < radios.length; j++) {
      radios[j].addEventListener('change', wpsUpdateLive);
    }
    wpsUpdateLive();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bind);
  } else {
    // 外部スクリプトがページ末尾より先に実行されることがあるので両方カバー
    setTimeout(bind, 0);
  }
})();
