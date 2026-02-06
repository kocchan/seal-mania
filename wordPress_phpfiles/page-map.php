<?php
/* Template Name: Custom Map Page */

// --- 🚀 自動転送ロジック (修正版：カテゴリ優先) ---
if ( isset($_GET['pref_redirect']) && !empty($_GET['pref_redirect']) ) {
    $pref = sanitize_text_field($_GET['pref_redirect']);
    
    // 【Step 1】 まず、その県名の「カテゴリー」が存在するか確認する
    // (例: 「東京」という名前のカテゴリがあれば、そのIDを取得)
    $term = get_term_by('name', $pref, 'category');

    if ( $term && !is_wp_error($term) ) {
        // ★カテゴリーが見つかった場合 → カテゴリーページ(/map/tokyo/)へジャンプ
        $cat_link = get_category_link($term->term_id);
        wp_redirect($cat_link);
        exit;
    }

    // 【Step 2】 カテゴリーが見つからない場合の予備動作 (今まで通りの記事検索)
    // その都道府県名が含まれる最新の記事を1つ探す
    $args = array(
        'post_type'      => 'post',
        's'              => $pref, 
        'posts_per_page' => 1,     
        'orderby'        => 'date',
        'order'          => 'DESC' 
    );
    
    $query = new WP_Query($args);
    if ( $query->have_posts() ) {
        $query->the_post();
        $url = get_permalink();
        wp_reset_postdata();
        wp_redirect($url);
        exit;
    } else {
        wp_redirect( home_url('/?s=' . urlencode($pref)) );
        exit;
    }
}
// ------------------------------------------

get_header(); 

// 速報用記事取得 (カテゴリ: cat-sighting)
$args = array(
    'post_type'      => 'post',
    'category_name'  => 'cat-sighting',
    'posts_per_page' => 5, // 最新5件
);
$news_query = new WP_Query($args);
?>

<style>
  /* --- 基本スタイル設定 --- */
  :root {
    --primary-color: #ff66c4;
    --accent-color: #8a2be2;
    --bg-color: #fcfcfc;
    --text-color: #333;
    --border-radius: 12px;
  }
  
  .map-wrapper { width: 100%; font-family: sans-serif; }

  /* ヘッダー */
  .map-header {
    background: linear-gradient(135deg, var(--primary-color), var(--accent-color));
    color: white; padding: 20px 15px; text-align: center;
    box-shadow: 0 4px 10px rgba(0,0,0,0.1); border-radius: 8px; margin-bottom: 20px;
  }
  .map-header h1 { margin: 0; font-size: 1.5rem; color: white; }
  .map-header p { margin: 5px 0 0; font-size: 0.9rem; opacity: 0.9; color: white; }

  /* カード共通 */
  .map-card {
    background: white; border-radius: var(--border-radius);
    padding: 20px; margin-bottom: 20px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.05); border: 1px solid #eee;
  }

  /* 検索ボックス */
  .pref-search-form { display: flex; gap: 10px; }
  .pref-search-input {
    flex: 1; padding: 12px; border: 2px solid #eee; border-radius: 6px;
    font-size: 1rem; outline: none; transition: border-color 0.2s;
  }
  .pref-search-input:focus { border-color: var(--primary-color); }
  .pref-search-btn {
    background: var(--primary-color); color: white; border: none;
    padding: 0 20px; border-radius: 6px; font-weight: bold; cursor: pointer;
  }
  .pref-search-btn:hover { opacity: 0.9; }

  /* エリア開閉メニュー */
  .area-details {
    margin-bottom: 10px; border: 1px solid #eee; border-radius: 8px; overflow: hidden;
    background: white;
  }
  .area-summary {
    padding: 12px 15px; font-weight: bold; cursor: pointer;
    display: flex; justify-content: space-between; align-items: center;
    background-color: #fff; list-style: none;
  }
  .area-summary:hover { background-color: #fafafa; }
  .area-summary::after { content: '+'; color: var(--primary-color); font-weight: bold; }
  .area-details[open] .area-summary::after { content: '-'; }
  
  .area-grid {
    display: grid; grid-template-columns: repeat(auto-fill, minmax(80px, 1fr)); 
    gap: 8px; padding: 10px; border-top: 1px solid #eee;
  }

  /* ボタン */
  .btn-area {
    display: flex; align-items: center; justify-content: center;
    padding: 10px 2px; background-color: #f9f9f9; color: var(--text-color);
    text-decoration: none; border: 1px solid #eee; border-radius: 6px;
    font-size: 0.85rem; transition: all 0.2s; min-height: 40px;
  }
  .btn-area:hover { background-color: #ffeef8; border-color: var(--primary-color); color: var(--primary-color); }
  
  .btn-highlight {
    background-color: var(--primary-color); color: white; border: none; font-weight: bold;
    box-shadow: 0 2px 4px rgba(255, 102, 196, 0.3);
  }
  .btn-highlight:hover { background-color: #e055ac; opacity: 1; color: white; }

  /* 速報リスト */
  .news-list { list-style: none; padding: 0; margin: 0; }
  .news-item {
    border-bottom: 1px solid #eee; padding: 12px 0;
    display: flex; align-items: flex-start;
  }
  .news-badge {
    background: #ff3333; color: white; font-size: 0.65rem; font-weight: bold;
    padding: 3px 6px; border-radius: 4px; margin-right: 10px; white-space: nowrap;
  }
  .news-badge.new { background: var(--accent-color); }
  .news-content { flex-grow: 1; }
  .news-date { font-size: 0.75rem; color: #999; margin-bottom: 4px; }
  .news-title {
    color: var(--text-color); text-decoration: none; font-weight: bold;
    display: block; line-height: 1.4;
  }
  .news-title:hover { color: var(--primary-color); }

  h3 { border-left: 5px solid var(--primary-color); padding-left: 10px; font-size: 1rem; margin: 0 0 15px 0; }
</style>

<div class="map-wrapper">
  
  <div class="map-header">
    <h1>📍 トレンド在庫マップ</h1>
    <p>人気グッズの「今、売ってる場所」がわかる</p>
  </div>
  
  <div class="map-card">
    <h3 style="border:none; padding:0;">🔍 都道府県名で検索</h3>
    <p style="font-size:0.85rem; color:#666; margin-bottom:10px;">ピンポイントで探したい場合はこちら</p>
    <form role="search" method="get" class="pref-search-form" action="<?php echo home_url('/'); ?>">
        <input type="text" value="" name="s" class="pref-search-input" placeholder="例: 大阪、横浜、ハンズ..." required>
        <button type="submit" class="pref-search-btn">検索</button>
    </form>
  </div>

  <div style="margin-bottom: 30px;">
    <h3 style="border:none; padding:0;">📂 地域別リスト (全47都道府県)</h3>
    <p style="font-size:0.8rem; color:#666; margin-left:10px;">※タップすると各地域の最新情報へ飛びます</p>

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

    <details class="area-details" open>
      <summary class="area-summary">関東エリア</summary>
      <div class="area-grid">
        <a href="?pref_redirect=茨城" class="btn-area">茨城</a>
        <a href="?pref_redirect=栃木" class="btn-area">栃木</a>
        <a href="?pref_redirect=群馬" class="btn-area">群馬</a>
        <a href="?pref_redirect=埼玉" class="btn-area">埼玉</a>
        <a href="?pref_redirect=千葉" class="btn-area">千葉</a>
        <a href="?pref_redirect=東京" class="btn-area">東京</a>
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
      <summary class="area-summary">中国・四国エリア</summary>
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
      </div>
    </details>

    <details class="area-details">
      <summary class="area-summary">九州・沖縄エリア</summary>
      <div class="area-grid">
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

  <div class="map-card">
    <h3>🔥 最新の目撃速報！</h3>
    <ul class="news-list">
      <?php if ($news_query->have_posts()) : ?>
        <?php while ($news_query->have_posts()) : $news_query->the_post(); 
             $is_breaking = (strpos(get_the_title(), '速報') !== false);
        ?>
        <li class="news-item">
            <span class="news-badge <?php echo $is_breaking ? '' : 'new'; ?>">
                <?php echo $is_breaking ? '速報' : '新着'; ?>
            </span>
            <div class="news-content">
                <div class="news-date"><?php echo get_the_modified_date('m/d H:i'); ?> 更新</div>
                <a href="<?php the_permalink(); ?>" class="news-title"><?php the_title(); ?></a>
            </div>
        </li>
        <?php endwhile; wp_reset_postdata(); ?>
      <?php else : ?>
        <li class="news-item"><p>現在、新しい情報はありません。</p></li>
      <?php endif; ?>
    </ul>
    
    <div style="text-align:center; margin-top:20px;">
        <a href="<?php echo get_category_link( get_cat_ID( 'cat-sighting' ) ); ?>" class="btn-area" style="background:var(--primary-color); color:white; border:none; font-weight:bold; padding:12px;">
            速報をもっと見る一覧へ →
        </a>
    </div>
  </div>

</div>
<?php get_footer(); ?>