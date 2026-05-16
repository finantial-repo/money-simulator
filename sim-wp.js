// sim-wp.js - WordPress内シミュレーター計算エンジン
// GitHub Pages から読み込み、WordPress ページ内で実行される
// 結果はWordPressページ内に直接表示 -> 記事への導線も同ページに

'use strict';

var WP_SIM_BLOG = 'https://moneykyoshitsu.com';

function runWPSim() {
  var income  = parseFloat(document.getElementById('wps-income').value)  || 500;
  var expense = parseFloat(document.getElementById('wps-expense').value) || 18;
  var age     = parseInt(document.getElementById('wps-age').value)       || 30;
  var empEl   = document.querySelector('input[name="wps-emp"]:checked');
  var emp     = empEl ? empEl.value : 'company';
  var idecoEl = document.querySelector('input[name="wps-ideco"]:checked');
  var ideco   = idecoEl ? idecoEl.value !== 'no' : true;

  // ── 手取り計算 ───────────────────────────────
  var ded = 55;
  if (income > 162.5) ded = income * 0.4 - 10;
  if (income > 180)   ded = income * 0.3 + 8;
  if (income > 360)   ded = income * 0.2 + 44;
  if (income > 660)   ded = income * 0.1 + 110;
  if (income > 850)   ded = 195;

  var taxable = Math.max(0, income - ded - 48);

  var itax = taxable * 0.4 - 279.6;
  var brs = [[195,0.05,0],[330,0.10,9.75],[695,0.20,42.75],[900,0.23,63.6],[1800,0.33,153.6]];
  for (var i = 0; i < brs.length; i++) {
    if (taxable <= brs[i][0]) { itax = taxable * brs[i][1] - brs[i][2]; break; }
  }
  var ltax = Math.max(0, taxable - 43) * 0.10;
  var si   = income * (emp === 'self' ? 0.17 : 0.15);
  var takehome  = income - itax * 1.021 - ltax - si;
  var investable = Math.max(0, takehome / 12 - expense);

  // ── iDeCo 計算 ───────────────────────────────
  var idecoLim = { company: 2.3, gov: 1.2, self: 6.8 };
  var limit = idecoLim[emp] || 2.3;
  var idecoMonth = ideco ? Math.min(limit, Math.max(0, investable * 0.5)) : 0;
  var mRate = taxable <= 195 ? 0.05 : taxable <= 330 ? 0.10 : taxable <= 695 ? 0.20 : 0.23;
  var idecoSaving = idecoMonth * 12 * (mRate * 1.021 + 0.10);

  // ── NISA・将来資産 ────────────────────────────
  var nisaMonth = Math.min(10, Math.max(0, investable - idecoMonth));
  var years  = Math.max(1, 65 - age);
  var r      = 0.004167; // 5%/年 → 月次
  var fv     = (idecoMonth + nisaMonth) * 10000 * (Math.pow(1 + r, years * 12) - 1) / r / 10000;

  // ── 結果表示 ────────────────────────────────
  var res = document.getElementById('wps-result');
  if (!res) return;

  function box(label, val, sub) {
    return '<div style="background:rgba(255,255,255,.08);border-radius:8px;padding:12px;text-align:center;">'
      + '<p style="font-size:10px;color:#aab8cc;margin:0 0 4px;">' + label + '</p>'
      + '<p style="font-size:20px;font-weight:800;color:#e8d5a0;margin:0 0 2px;">' + val + '</p>'
      + '<p style="font-size:10px;color:#556677;margin:0;">' + sub + '</p>'
      + '</div>';
  }

  // 結果連動おすすめ記事
  var rec = '';
  if (investable < 3) {
    rec = '<a href="' + WP_SIM_BLOG + '/keep-cash-invest-efficiently/" '
      + 'style="display:block;background:#eef7f1;border-left:5px solid #2e7d32;border-radius:0 10px 10px 0;'
      + 'padding:14px 18px;text-decoration:none;margin-bottom:8px;">'
      + '<p style="font-size:11px;font-weight:700;color:#2e7d32;margin:0 0 4px;">🛡 あなたへのおすすめ記事</p>'
      + '<p style="font-size:14px;font-weight:700;color:#1a1a2e;margin:0 0 3px;">生活防衛資金と投資の黄金比</p>'
      + '<p style="font-size:12px;color:#666;margin:0;">月の余剰資金が少ない場合、投資前にまず生活防衛資金の確保が最優先です。</p>'
      + '</a>';
  } else if (ideco && idecoSaving > 3) {
    rec = '<a href="' + WP_SIM_BLOG + '/ideco-myth-debunked/" '
      + 'style="display:block;background:#eef4fb;border-left:5px solid #1565c0;border-radius:0 10px 10px 0;'
      + 'padding:14px 18px;text-decoration:none;margin-bottom:8px;">'
      + '<p style="font-size:11px;font-weight:700;color:#1565c0;margin:0 0 4px;">📊 あなたへのおすすめ記事</p>'
      + '<p style="font-size:14px;font-weight:700;color:#1a1a2e;margin:0 0 3px;">iDeCoの「60歳まで引き出せない」は本当にデメリットか？</p>'
      + '<p style="font-size:12px;color:#666;margin:0;">年間' + Math.round(idecoSaving * 10) / 10 + '万円の節税効果があります。iDeCoを最大活用する方法を解説。</p>'
      + '</a>'
      + '<a href="' + WP_SIM_BLOG + '/securities-account-comparison/" '
      + 'style="display:block;background:#fff;border:1px solid #e8e0d5;border-radius:10px;'
      + 'padding:12px 16px;text-decoration:none;">'
      + '<p style="font-size:14px;font-weight:700;color:#1a1a2e;margin:0 0 3px;">🏦 証券口座4社を比較して選ぶ</p>'
      + '<p style="font-size:12px;color:#666;margin:0;">SBI証券・楽天証券・マネックス・松井証券のiDeCo対応を比較。</p>'
      + '</a>';
  } else {
    rec = '<a href="' + WP_SIM_BLOG + '/new-nisa-explained/" '
      + 'style="display:block;background:#fff5f5;border-left:5px solid #c62828;border-radius:0 10px 10px 0;'
      + 'padding:14px 18px;text-decoration:none;margin-bottom:8px;">'
      + '<p style="font-size:11px;font-weight:700;color:#c62828;margin:0 0 4px;">📈 あなたへのおすすめ記事</p>'
      + '<p style="font-size:14px;font-weight:700;color:#1a1a2e;margin:0 0 3px;">新NISAを「使わない理由」はあるか？</p>'
      + '<p style="font-size:12px;color:#666;margin:0;">月' + Math.round(nisaMonth * 10) / 10 + '万円からNISA積立を始める具体的な方法を解説。</p>'
      + '</a>'
      + '<a href="' + WP_SIM_BLOG + '/securities-account-comparison/" '
      + 'style="display:block;background:#fff;border:1px solid #e8e0d5;border-radius:10px;'
      + 'padding:12px 16px;text-decoration:none;">'
      + '<p style="font-size:14px;font-weight:700;color:#1a1a2e;margin:0 0 3px;">🏦 どの証券会社で始めるか比較する</p>'
      + '<p style="font-size:12px;color:#666;margin:0;">クレカ積立還元率・iDeCo商品数で4社を徹底比較。</p>'
      + '</a>';
  }

  // アドバイス文
  var advice = investable < 3
    ? '⚠️ 月の余剰資金が' + Math.round(investable * 10) / 10 + '万円と少ない状態です。生活防衛資金（月の生活費×3〜6ヶ月分）を先に確保しましょう。'
    : ideco && idecoSaving > 3
      ? '✅ iDeCo優先推奨：年間' + Math.round(idecoSaving * 10) / 10 + '万円の節税効果があります。iDeCoを最大活用してから残りをNISAへ。'
      : '✅ NISA優先推奨：月' + Math.round(nisaMonth * 10) / 10 + '万円を全世界株式インデックスで積み立てると、65歳時に約' + Math.round(fv).toLocaleString() + '万円の資産形成が期待できます（概算）。';

  res.innerHTML =
    '<div style="background:#1a1a2e;border-radius:12px;padding:22px;margin-bottom:14px;">'
    + '<p style="font-size:11px;font-weight:700;color:#c0a060;letter-spacing:3px;margin:0 0 12px;">📊 診断結果</p>'
    + '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:10px;">'
    + box('月の投資可能額', Math.round(investable * 10) / 10 + '万円', '手取り − 生活費')
    + box('iDeCo年間節税額', ideco ? Math.round(idecoSaving * 10) / 10 + '万円' : '—', '所得税＋住民税の軽減')
    + box('65歳時の推定資産', Math.round(fv).toLocaleString() + '万円', '年率5%・積立のみの概算')
    + '</div>'
    + '<p style="font-size:12px;color:#aab8cc;margin:0;">※ 手取り月収: ' + Math.round(takehome / 12 * 10) / 10 + '万円 ／ 年収' + income + '万円・月支出' + expense + '万円の計算結果</p>'
    + '</div>'
    + '<div style="background:#fdf8ed;border:1px solid #e0d0a0;border-radius:10px;padding:14px 18px;margin-bottom:14px;">'
    + '<p style="font-size:14px;color:#444;margin:0;line-height:1.8;">' + advice + '</p>'
    + '</div>'
    + '<h2 style="font-size:14px;font-weight:700;color:#b8860b;letter-spacing:2px;margin:0 0 10px;">次に読むべき記事</h2>'
    + rec
    + '<div style="text-align:center;margin-top:16px;padding-top:14px;border-top:1px solid #f0ece4;">'
    + '<a href="' + WP_SIM_BLOG + '/simulator/" '
    + 'style="font-size:12px;color:#888;text-decoration:none;border-bottom:1px dotted #ccc;">'
    + 'モンテカルロ法による詳細な将来資産シミュレーション（別ページ）→</a>'
    + '</div>';

  res.style.display = 'block';
  setTimeout(function() {
    res.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 100);
}
