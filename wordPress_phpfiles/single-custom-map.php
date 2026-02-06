<?php
/*
 * Template Name: 目撃情報カスタムテンプレート
 * Template Post Type: post
 */
get_header();

$location = get_field('location_name') ?: 'エリア不明';
$embed_code = get_field('embedded_tweet');
?>

<style>
  /* --- 子ページ用CSS (提示いただいたものをWP用に調整) --- */
  :root { --primary-color: #ff66c4; --accent-color: #8a2be2; --bg-color: #fcfcfc; }
  
  .sighting-wrapper { font-family: sans-serif; }

  /* カード */
  .sighting-card {
    background: white; border-radius: 12px;
    padding: 20px; margin-bottom: 20px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.05); border: 1px solid #eee;
  }

  /* 地図ダミー */
  .map-dummy {
    background-color: #e5e3df; height: 200px; border-radius: 8px;
    display: flex; align-items: center; justify-content: center;
    color: #666; font-weight: bold; position: relative; overflow: hidden;
    border: 2px solid white; box-shadow: inset 0 0 10px rgba(0,0,0,0.1);
    margin-bottom: 15px;
  }
  .map-dummy::before {
    content: ''; position: absolute; top: 0; left: 0; right: 0; bottom: 0;
    background-image: radial-gradient(#ccc 1px, transparent 1px);
    background-size: 20px 20px; opacity: 0.3;
  }
  .map-pin { font-size: 2rem; color: var(--primary-color); z-index: 1; }

  /* 店舗リスト */
  .shop-list { padding-left: 0; list-style: none; margin: 0; }
  .shop-list li {
    padding: 10px 0; border-bottom: 1px solid #eee;
    display: flex; align-items: center; justify-content: space-between;
  }
  .shop-list li::before { content: '🏢'; margin-right: 10px; }
  .star-rate { color: #ffc107; font-size: 0.9rem; }

  /* 掲示板テーブル */
  .bbs-table { width: 100%; border-collapse: collapse; font-size: 0.9rem; margin-top:10px; }
  .bbs-table th { background: #f9f9f9; text-align: left; padding: 10px 8px; border-bottom: 2px solid #eee; color: #666; font-size: 0.8rem;}
  .bbs-table td { border-bottom: 1px solid #eee; padding: 12px 8px; vertical-align: top; }
  .time-loc { font-weight: bold; color: #555; line-height: 1.3; }
  .time-loc small { font-weight: normal; color: #888; font-size: 0.75rem; display:block; }
  .status-ok { color: var(--primary-color); font-weight: bold; background: #ffeef8; padding: 2px 6px; border-radius: 4px; font-size: 0.85rem;}
  .status-no { color: #888; background: #eee; padding: 2px 6px; border-radius: 4px; font-size: 0.85rem;}

  /* ボタン */
  .btn-amazon { 
    display: block; width: 100%; padding: 12px; text-align: center;
    color: white; text-decoration: none; border-radius: 30px;
    font-weight: bold; background-color: #ff9900; margin-top: 15px;
    transition: opacity 0.2s;
  }
  .btn-amazon:hover { opacity: 0.9; color: white; }
  
  /* ツイート埋め込み枠 */
  .tweet-embed-box { margin-bottom: 20px; border: 1px solid #e1e8ed; border-radius: 12px; padding: 10px; }
</style>

<div class="sighting-wrapper">

  <div class="sighting-card" style="background: linear-gradient(135deg, #ff66c4, #8a2be2); color: white; text-align: center;">
    <h1 style="margin:0; font-size:1.3rem; color:white;"><?php the_title(); ?></h1>
    <p style="font-size:0.8rem; margin:5px 0 0; opacity:0.9;">最終更新: <?php the_modified_date('Y/m/d H:i'); ?></p>
  </div>

  <div class="sighting-card">
    <h2 style="color:#8a2be2; font-size:1.1rem; margin-top:0;">📍 <?php echo esc_html($location); ?>周辺の状況</h2>
    
<div style="margin-bottom:15px; border-radius:8px; overflow:hidden; border:1px solid #ccc;">
        <iframe 
            width="100%" 
            height="250" 
            frameborder="0" 
            style="border:0" 
            loading="lazy" 
            allowfullscreen 
            src="https://www.google.com/maps?output=embed&q=<?php echo urlencode($location . ' ロフト ハンズ'); ?>">
        </iframe>
    </div>
    <p style="font-size:0.8rem; color:#666; margin-top:-10px; margin-bottom:20px;">
        ※ <?php echo esc_html($location); ?>周辺の雑貨店を表示しています
    </p>

    <ul class="shop-list">
      <li>
        <strong>ハンズ/ロフト周辺</strong>
        <span class="star-rate">期待度:★★★★☆</span>
      </li>
      <li>
        <strong>イオンモール/ファンシー雑貨店</strong>
        <span class="star-rate">期待度:★★★☆☆</span>
      </li>
    </ul>
  </div>

  <div class="sighting-card">
    <h2 style="color:#ff66c4; font-size:1.1rem; margin-top:0;">🐦 リアルタイム速報 (X)</h2>
    <p style="font-size:0.9rem; color:#666; margin-bottom:15px;">
        <?php echo esc_html($location); ?>に関連する最新の目撃ツイートです。
    </p>

    <?php if ($embed_code): ?>
        <div class="tweet-embed-box">
            <?php echo $embed_code; ?>
        </div>
    <?php else: ?>
        <div class="tweet-embed-box">
            <?php the_content(); ?>
        </div>
    <?php endif; ?>

    <a href="https://search.yahoo.co.jp/realtime/search?p=ボンボンドロップ+AND+<?php echo urlencode($location); ?>" target="_blank" class="btn-amazon" style="background:#1da1f2;">
      🔍 もっと見る：「<?php echo esc_html($location); ?> × ボンボンドロップ」
    </a>
  </div>

  <div class="sighting-card" style="border: 2px solid #ff66c4; background-color:#fffcfd;">
    <h3 style="text-align:center; color:#ff66c4; margin-top:0;">📦 店舗にない場合はこちら</h3>
    <p style="font-size:0.9rem; text-align:center;">交通費をかけるより、通販が確実な場合があります。</p>
    
    <a href="#" class="btn-amazon">Amazonで在庫を見る</a>
    <p style="text-align:center; font-size:0.75rem; margin-top:5px; color:#888;">※定価より高い場合があります</p>
  </div>

</div>