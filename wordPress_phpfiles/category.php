<?php
get_header();

// 現在のカテゴリー情報を取得
$current_cat = get_queried_object();
$cat_slug = $current_cat->slug;

// 親カテゴリーの情報を取得（もしあれば）
$parent_slug = '';
if ( $current_cat->parent ) {
    $parent_cat = get_category($current_cat->parent);
    $parent_slug = $parent_cat->slug;
}

// --- 🚀 自動転送ロジック (トップページ用) ---
if ( isset($_GET['pref_redirect']) && !empty($_GET['pref_redirect']) ) {
    $pref = sanitize_text_field($_GET['pref_redirect']);
    $term = get_term_by('name', $pref, 'category');
    if ( $term && !is_wp_error($term) ) {
        wp_redirect( get_category_link($term->term_id) );
        exit;
    }
    // カテゴリがない場合は検索へ
    wp_redirect( home_url('/?s=' . urlencode($pref)) );
    exit;
}

// --- 🌟 星の計算関数 ---
function get_star_rating_by_date($post_date_timestamp) {
    $diff_days = floor((current_time('timestamp') - $post_date_timestamp) / (86400));
    if ($diff_days < 1) { return '★★★★★ (当日)'; }
    elseif ($diff_days < 2) { return '★★★★☆ (1日前)'; }
    elseif ($diff_days < 3) { return '★★★☆☆ (2日前)'; }
    elseif ($diff_days < 7) { return '★★☆☆☆ (週間)'; }
    else { return '★☆☆☆☆ (古い)'; }
}
?>

<style>
  /* --- 🎨 デザイン修正版 CSS --- */
  :root { 
      --primary-color: #ff66c4; 
      --accent-color: #8a2be2;
      --text-main: #333;
      --bg-gray: #f9f9f9;
  }
  
  .sighting-wrapper { 
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; 
      max-width: 800px; 
      margin: 0 auto; 
      padding-top: 20px;
  }

  /* カード共通 */
  .sighting-card { 
      background: white; border-radius: 16px; padding: 20px; 
      margin-bottom: 20px; box-shadow: 0 4px 12px rgba(0,0,0,0.05); 
      border: 1px solid #f0f0f0; 
  }

  /* ヘッダーカード */
  .header-card {
      background: linear-gradient(135deg, var(--primary-color), var(--accent-color));
      color: white; text-align: center; border: none;
  }
  .header-card h1 { margin: 0; font-size: 1.4rem; color: white; font-weight: bold; }
  .header-card p { font-size: 0.85rem; margin: 5px 0 0; opacity: 0.95; color: white; }

  /* 見出し */
  h2, h3 { color: var(--text-main); font-weight: bold; margin-top: 0; }

  /* 検索ボックス */
  .search-box-form { display: flex; gap: 8px; margin-top: 10px; }
  .search-input {
      flex: 1; padding: 12px 15px; border: 2px solid #eee; border-radius: 8px; 
      font-size: 1rem; outline: none; transition: border-color 0.2s;
  }
  .search-input:focus { border-color: var(--primary-color); }
  .search-btn {
      background: var(--primary-color); color: white; border: none; 
      padding: 0 24px; border-radius: 8px; font-weight: bold; cursor: pointer;
  }

  /* エリアリスト (アコーディオン) */
  .area-details { 
      margin-bottom: 12px; border: 1px solid #eee; border-radius: 10px; 
      overflow: hidden; background: white; 
  }
  .area-summary { 
      padding: 14px 18px; font-weight: bold; cursor: pointer; 
      display: flex; justify-content: space-between; align-items: center; 
      background-color: #fff; list-style: none; color: #444;
  }
  .area-summary:hover { background-color: #fafafa; }
  .area-summary::after { content: '+'; color: var(--primary-color); font-weight: bold; font-size: 1.2rem; }
  .area-details[open] .area-summary::after { content: '-'; }

  .area-grid { 
      display: grid; grid-template-columns: repeat(auto-fill, minmax(85px, 1fr)); 
      gap: 10px; padding: 15px; border-top: 1px solid #f5f5f5; background-color: #fff;
  }
  .btn-area { 
      display: flex; align-items: center; justify-content: center; 
      padding: 8px 4px; background-color: var(--bg-gray); color: #444; 
      text-decoration: none; border: 1px solid #eee; border-radius: 8px; 
      font-size: 0.85rem; font-weight: bold; transition: all 0.2s; min-height: 44px;
  }
  .btn-area:hover { 
      background-color: #ffeef8; border-color: var(--primary-color); 
      color: var(--primary-color); transform: translateY(-1px);
  }

  /* 店舗リスト (詳細ページ) */
  .shop-list { padding-left: 0; list-style: none; margin: 0; }
  .shop-list li { 
      border-bottom: 1px solid #eee; transition: background-color 0.2s;
  }
  /* リンク全体をクリック可能にするためのスタイル */
  .shop-link {
      display: flex; align-items: center; justify-content: space-between;
      padding: 15px 10px; text-decoration: none; color: inherit; width: 100%;
  }
  .shop-link:hover { background-color: #fafafa; }
  .shop-icon { margin-right: 12px; font-size: 1.2rem; }
  .star-rate { color: #ffbf00; font-size: 0.95rem; font-weight:bold; }

  /* ニュースリンク */
  .news-link { 
      display: block; padding: 15px; background: #f4f9ff; border-radius: 10px; 
      text-decoration: none; color: #333; font-weight: bold; margin-bottom: 12px; 
      transition: 0.2s; border-left: 6px solid #1da1f2; 
      box-shadow: 0 2px 4px rgba(0,0,0,0.03);
  }
  .news-link:hover { background: #e6f3ff; transform: translateX(2px); }
  .news-date { font-size: 0.75rem; color: #777; font-weight: normal; display: block; margin-top: 6px; }

  /* Amazonボタン */
  .btn-amazon { 
      display: block; width: 100%; padding: 14px; text-align: center; color: white; 
      text-decoration: none; border-radius: 30px; font-weight: bold; 
      background-color: #ff9900; margin-top: 20px; 
      box-shadow: 0 3px 6px rgba(255, 153, 0, 0.3); transition: opacity 0.2s;
  }
  .btn-amazon:hover { opacity: 0.9; color: white; }
  
  .normal-archive h1 { 
      font-size: 1.5rem; border-bottom: 3px solid var(--primary-color); 
      padding-bottom: 10px; margin-bottom: 25px; 
  }
</style>

<div class="content">
<div class="sighting-wrapper">

<?php /* --- 条件分岐1: トップの在庫マップ (親カテゴリなしの cat-official) --- */ ?>
<?php if ( ( $cat_slug === 'cat-official' || $cat_slug === 'map' ) && $parent_slug === '' ) : ?>
    <div class="sighting-card header-card">
        <h1>📍 トレンド在庫マップ</h1>
        <p>人気グッズの「今、売ってる場所」がわかる</p>
    </div>

    <div class="sighting-card">
        <h3 style="border:none; padding:0; margin-top:0;">🔍 都道府県名で検索</h3>
        <p style="font-size:0.8rem; color:#888; margin:5px 0 0;">ピンポイントで探したい場合はこちら</p>
        <form role="search" method="get" action="<?php echo home_url('/'); ?>" class="search-box-form">
            <input type="text" value="" name="s" class="search-input" placeholder="例: 埼玉、大阪..." required>
            <button type="submit" class="search-btn">検索</button>
        </form>
    </div>

    <div class="sighting-card">
        <h3 style="border:none; padding:0; margin-top:0; margin-bottom:15px;">📂 地域別リスト</h3>
        
        <details class="area-details">
          <summary class="area-summary">北海道・東北</summary>
          <div class="area-grid">
            <a href="?pref_redirect=北海道" class="btn-area">北海道</a>
            <a href="?pref_redirect=青森" class="btn-area">青森</a>
            <a href="?pref_redirect=岩手" class="btn-area">岩手</a>
            <a href="?pref_redirect=宮城" class="btn-area">宮城</a>
            <a href="?pref_redirect=秋田" class="btn-area">秋田</a>
            <a href="?pref_redirect=山形" class="btn-area">山形</a>
            <a href="?pref_redirect=福島" class="btn-area">福島</a>
          </div>
        </details>

        <details class="area-details">
          <summary class="area-summary">関東エリア</summary>
          <div class="area-grid">
            <a href="?pref_redirect=茨城" class="btn-area">茨城</a>
            <a href="?pref_redirect=栃木" class="btn-area">栃木</a>
            <a href="?pref_redirect=群馬" class="btn-area">群馬</a>
            <a href="?pref_redirect=東京" class="btn-area">東京</a>
            <a href="?pref_redirect=埼玉" class="btn-area">埼玉</a>
            <a href="?pref_redirect=千葉" class="btn-area">千葉</a>
            <a href="?pref_redirect=神奈川" class="btn-area">神奈川</a>
          </div>
        </details>

        <details class="area-details">
          <summary class="area-summary">中部エリア</summary>
          <div class="area-grid">
            <a href="?pref_redirect=新潟" class="btn-area">新潟</a>
            <a href="?pref_redirect=富山" class="btn-area">富山</a>
            <a href="?pref_redirect=石川" class="btn-area">石川</a>
            <a href="?pref_redirect=福井" class="btn-area">福井</a>
            <a href="?pref_redirect=山梨" class="btn-area">山梨</a>
            <a href="?pref_redirect=長野" class="btn-area">長野</a>
            <a href="?pref_redirect=岐阜" class="btn-area">岐阜</a>
            <a href="?pref_redirect=静岡" class="btn-area">静岡</a>
            <a href="?pref_redirect=愛知" class="btn-area">愛知</a>
          </div>
        </details>

        <details class="area-details">
          <summary class="area-summary">近畿エリア</summary>
          <div class="area-grid">
            <a href="?pref_redirect=三重" class="btn-area">三重</a>
            <a href="?pref_redirect=滋賀" class="btn-area">滋賀</a>
            <a href="?pref_redirect=京都" class="btn-area">京都</a>
            <a href="?pref_redirect=大阪" class="btn-area">大阪</a>
            <a href="?pref_redirect=兵庫" class="btn-area">兵庫</a>
            <a href="?pref_redirect=奈良" class="btn-area">奈良</a>
            <a href="?pref_redirect=和歌山" class="btn-area">和歌山</a>
          </div>
        </details>
        
        <details class="area-details">
            <summary class="area-summary">中国・四国・九州</summary>
            <div class="area-grid">
                <a href="?pref_redirect=鳥取" class="btn-area">鳥取</a>
                <a href="?pref_redirect=島根" class="btn-area">島根</a>
                <a href="?pref_redirect=岡山" class="btn-area">岡山</a>
                <a href="?pref_redirect=広島" class="btn-area">広島</a>
                <a href="?pref_redirect=山口" class="btn-area">山口</a>
                <a href="?pref_redirect=徳島" class="btn-area">徳島</a>
                <a href="?pref_redirect=香川" class="btn-area">香川</a>
                <a href="?pref_redirect=愛媛" class="btn-area">愛媛</a>
                <a href="?pref_redirect=高知" class="btn-area">高知</a>
                <a href="?pref_redirect=福岡" class="btn-area">福岡</a>
                <a href="?pref_redirect=佐賀" class="btn-area">佐賀</a>
                <a href="?pref_redirect=長崎" class="btn-area">長崎</a>
                <a href="?pref_redirect=熊本" class="btn-area">熊本</a>
                <a href="?pref_redirect=大分" class="btn-area">大分</a>
                <a href="?pref_redirect=宮崎" class="btn-area">宮崎</a>
                <a href="?pref_redirect=鹿児島" class="btn-area">鹿児島</a>
                <a href="?pref_redirect=沖縄" class="btn-area">沖縄</a>
            </div>
        </details>
    </div>

<?php /* --- 条件分岐2: 各都道府県の詳細ページ (親が cat-official) --- */ ?>
<?php elseif ( $parent_slug === 'cat-official' || $parent_slug === 'map' ) : ?>
    <?php
    $latest_shop_name = '日本'; 
    if ( have_posts() ) {
        the_post(); 
        $latest_shop_name = get_post_meta(get_the_ID(), 'shop_name', true) ?: get_the_title();
        rewind_posts(); 
    }
    ?>

    <div class="sighting-card header-card">
        <h1>【<?php single_cat_title(); ?>】 目撃情報</h1>
        <p>最終更新: <?php echo date('Y/m/d H:i'); ?></p>
    </div>

    <div class="sighting-card">
        <h2 style="color:var(--accent-color); font-size:1.1rem; margin-top:0;">📍 <?php single_cat_title(); ?>周辺の状況</h2>
        <div style="margin-bottom:20px; border-radius:12px; overflow:hidden; border:1px solid #ccc; box-shadow: 0 2px 5px rgba(0,0,0,0.1);">
            <iframe width="100%" height="300" frameborder="0" style="border:0" loading="lazy" allowfullscreen 
                src="https://maps.google.co.jp/maps?q=<?php echo urlencode($latest_shop_name); ?>&output=embed&t=m&z=14">
            </iframe>
        </div>
        <p style="font-size:0.8rem; color:#666; margin-top:-10px; margin-bottom:20px;">
            ※ 直近の「<?php echo esc_html($latest_shop_name); ?>」周辺を表示
        </p>

        <ul class="shop-list">
        <?php if ( have_posts() ) : ?>
            <?php while ( have_posts() ) : the_post(); 
                $s_name = get_post_meta(get_the_ID(), 'shop_name', true) ?: get_the_title();
                $s_rate = get_star_rating_by_date( get_the_time('U') );
            ?>
            <li>
                <a href="<?php the_permalink(); ?>" class="shop-link">
                    <div style="flex:1;">
                        <span class="shop-icon">🏢</span>
                        <strong style="font-size:1.05rem; color:#333;"><?php echo esc_html($s_name); ?></strong>
                        <span style="display:block; font-size:0.75rem; color:#999; margin-top:4px;">
                            <?php echo get_the_date(); ?>
                        </span>
                    </div>
                    <span class="star-rate"><?php echo esc_html($s_rate); ?></span>
                </a>
            </li>
            <?php endwhile; ?>
        <?php else : ?>
            <li style="padding:15px;">情報がありません</li>
        <?php endif; ?>
        </ul>
    </div>

    <div class="sighting-card">
        <h2 style="color:var(--primary-color); font-size:1.1rem; margin-top:0;">🐦 リアルタイム速報</h2>
        <p style="font-size:0.85rem; color:#666; margin-bottom:15px;">タップして詳細を確認できます</p>
        
        <?php if ( have_posts() ) : ?>
            <?php rewind_posts(); ?>
            <?php while ( have_posts() ) : the_post(); ?>
                <a href="<?php the_permalink(); ?>" class="news-link">
                    <span style="font-size:1rem;"><?php the_title(); ?></span>
                    <span class="news-date">📅 <?php echo get_the_date('Y/m/d H:i'); ?></span>
                </a>
            <?php endwhile; ?>
        <?php endif; ?>
        
        <a href="https://search.yahoo.co.jp/realtime/search?p=ボンボンドロップ+AND+<?php echo urlencode(single_cat_title('', false)); ?>" target="_blank" class="btn-amazon" style="background:#1da1f2; margin-top:10px;">
        🔍 X(Twitter)でもっと見る
        </a>
    </div>
    
    <div class="sighting-card" style="border: 2px solid var(--primary-color); background-color:#fff5f9;">
        <h3 style="text-align:center; color:var(--primary-color); margin-top:0;">📦 店舗にない場合はこちら</h3>
        <p style="text-align:center; font-size:0.85rem; color:#555;">交通費をかけるより、通販が確実な場合があります。</p>
        <a href="https://amzn.to/4gQ5pX7" class="btn-amazon">Amazonで在庫を見る</a>
        <p style="text-align:center; font-size:0.75rem; color:#999; margin-top:5px;">※定価より高い場合があります</p>
    </div>

<?php else : ?>
    <div class="sighting-card normal-archive">
        <h1><?php single_cat_title(); ?></h1>
        <?php if ( have_posts() ) : while ( have_posts() ) : the_post(); ?>
            <div style="margin-bottom:20px; border-bottom:1px solid #eee; padding-bottom:10px;">
                <h2 style="font-size:1.2rem;"><a href="<?php the_permalink(); ?>" style="color:#333; text-decoration:none;"><?php the_title(); ?></a></h2>
                <p style="font-size:0.8rem; color:#888;"><?php echo get_the_date(); ?></p>
                <div style="font-size:0.9rem; color:#555;"><?php the_excerpt(); ?></div>
            </div>
        <?php endwhile; endif; ?>
    </div>

<?php endif; ?>

</div>
</div>
<?php get_footer(); ?>