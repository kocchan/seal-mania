<?php
/* Template Name: Custom Calendar Page */
get_header(); 

// --- 📅 日付・記事取得ロジック (変更なし) ---
$current_ym = isset($_GET['ym']) ? $_GET['ym'] : date('Y-m');
$timestamp = strtotime($current_ym . '-01');
$year  = date('Y', $timestamp);
$month = date('m', $timestamp);
$month_label = date('Y年n月', $timestamp);
$prev_ym = date('Y-m', strtotime('-1 month', $timestamp));
$next_ym = date('Y-m', strtotime('+1 month', $timestamp));
$days_in_month = date('t', $timestamp);
$first_day_of_week = date('w', $timestamp);

$args = array(
    'post_type'      => 'post',
    'category_name'  => 'cat-official',
    'posts_per_page' => -1,
    'date_query'     => array(
        array('year' => $year, 'month' => $month),
    ),
);
$the_query = new WP_Query($args);

$calendar_events = array();
if ($the_query->have_posts()) {
    while ($the_query->have_posts()) {
        $the_query->the_post();
        $d = (int)get_the_date('j');
        $score = get_field('scarcity_score');
        $is_confirmed = ($score >= 80);
        $calendar_events[$d][] = array(
            'title' => get_the_title(),
            'link'  => get_permalink(),
            'type'  => $is_confirmed ? 'confirmed' : 'prediction',
            'label' => $is_confirmed ? '🔴' : '🟡' // スマホ用に短縮
        );
    }
    wp_reset_postdata();
}
?>

<style>
  /* --- デザイン修正版CSS --- */
  :root {
    --primary-color: #ff66c4;
    --accent-color: #8a2be2;
    --warning-color: #f1c40f;
    --danger-color: #dc3545;
  }
  
  /* Cocoonのメインカラム幅に合わせる設定 */
  .calendar-wrapper {
    width: 100%;
    box-sizing: border-box;
    font-family: sans-serif;
  }

  /* ヘッダー装飾 */
  .cal-header-banner {
    background: linear-gradient(135deg, var(--primary-color), var(--accent-color));
    color: white; 
    padding: 15px; 
    text-align: center;
    border-radius: 8px;
    margin-bottom: 20px;
    /* 影をつけて浮き上がらせる */
    box-shadow: 0 4px 6px rgba(0,0,0,0.1);
  }
  .cal-header-banner h1 { margin: 0; font-size: 1.3rem; color: white; line-height: 1.4; }
  .cal-header-banner p { margin: 5px 0 0; font-size: 0.8rem; opacity: 0.9; color: white; }

  /* カード共通 */
  .cal-card {
    background: white; 
    border-radius: 8px;
    padding: 15px; 
    margin-bottom: 20px;
    border: 1px solid #eee; /* 薄い枠線で境界をはっきりさせる */
  }

  /* ナビゲーション */
  .month-navigation { 
    display: flex; 
    justify-content: space-between; 
    align-items: center; 
    margin-bottom: 15px; 
  }
  .nav-btn {
    background-color: var(--primary-color); color: white; border: none;
    padding: 6px 12px; border-radius: 4px; text-decoration: none;
    font-weight: bold; font-size: 0.85rem; display: inline-block;
  }
  .nav-btn:hover { background-color: #e055ac; color: white; opacity: 0.9; }
  .current-month { font-size: 1.1rem; font-weight: bold; color: var(--accent-color); }

  /* --- 📅 カレンダーグリッド (修正箇所) --- */
  .calendar-grid {
    display: grid; 
    /* 【重要】minmax(0, 1fr) にすることで、中身が長くてもセルが伸びないようにする */
    grid-template-columns: repeat(7, minmax(0, 1fr)); 
    gap: 1px;
    background-color: #ddd; 
    border-radius: 6px; 
    overflow: hidden; 
    border: 1px solid #ddd;
  }
  
  .calendar-head {
    background-color: var(--accent-color); color: white; 
    padding: 8px 2px; text-align: center; 
    font-weight: bold; font-size: 0.75rem;
  }
  
  .calendar-day {
    background-color: white; 
    padding: 4px; 
    min-height: 70px; /*高さを少し抑える*/
    display: flex; 
    flex-direction: column; 
  }
  
  .calendar-day.empty { background-color: #f9f9f9; }
  .day-number { font-size: 0.85rem; margin-bottom: 4px; color: #555; font-weight: bold; }
  
  /* 今日のスタイル */
  .calendar-day.today { background-color: #fffde7; }

  /* イベントバッジ (文字省略設定) */
  .day-event {
    font-size: 0.65rem; 
    margin: 2px 0; 
    padding: 3px 4px;
    border-radius: 3px; 
    color: #333; 
    display: block; 
    text-decoration: none;
    background: #f4f4f4;
    border-left: 3px solid #ccc;
    
    /* 【重要】はみ出した文字を「...」にする設定 */
    white-space: nowrap;      /* 改行しない */
    overflow: hidden;         /* はみ出しを隠す */
    text-overflow: ellipsis;  /* ...を表示 */
    max-width: 100%;          /* 親要素からはみ出さない */
  }
  
  /* 確定（赤系） */
  .day-event.type-confirmed {
    background-color: #ffebee; border-left-color: var(--danger-color); color: #c62828;
  }
  /* 予測（黄系） */
  .day-event.type-prediction {
    background-color: #fff9c4; border-left-color: var(--warning-color); color: #f57f17;
  }

  /* リスト表示スタイル */
  .schedule-list { list-style:none; padding:0; margin:0; }
  .schedule-item {
    border-bottom: 1px solid #eee; padding: 10px 0;
  }
  .schedule-item:last-child { border-bottom: none; }
  
  .schedule-date { font-weight: bold; color: var(--accent-color); font-size: 0.9rem; display: inline-block; width: 80px; }
  .schedule-content { display: inline-block; vertical-align: top; width: calc(100% - 90px); }
  .schedule-link { color: #333; text-decoration: none; font-weight: bold; font-size: 0.95rem; }
  .schedule-link:hover { color: var(--primary-color); text-decoration: underline; }

</style>

<div class="calendar-wrapper">

    <div class="cal-header-banner">
        <h1>📅 発売・再入荷スケジュール</h1>
        <p>いつ買える？公式情報をまとめてお届け</p>
    </div>

    <div style="text-align: right; font-size: 0.75rem; color: #888; margin-bottom: 10px;">
        最終更新: <?php echo current_time('Y/m/d H:i'); ?>
    </div>

    <div class="cal-card" style="border-left: 4px solid #ffc107; background-color: #fffcf0; padding: 10px 15px;">
        <p style="margin:0; font-size:0.8rem; color:#856404;">
            <strong>⚠️ 注意:</strong> 掲載情報は公式発表および予測です。正確な時間は各店舗へご確認ください。
        </p>
    </div>

    <div class="cal-card">
        <div class="month-navigation">
            <a href="?ym=<?php echo $prev_ym; ?>" class="nav-btn">← 前月</a>
            <div class="current-month"><?php echo $month_label; ?></div>
            <a href="?ym=<?php echo $next_ym; ?>" class="nav-btn">次月 →</a>
        </div>

        <div style="text-align:center; margin-bottom:10px; font-size:0.75rem;">
            <span style="margin-right:10px;">🔴 確定情報</span>
            <span>🟡 予測情報</span>
        </div>

        <div class="calendar-grid">
            <div class="calendar-head">日</div>
            <div class="calendar-head">月</div>
            <div class="calendar-head">火</div>
            <div class="calendar-head">水</div>
            <div class="calendar-head">木</div>
            <div class="calendar-head">金</div>
            <div class="calendar-head">土</div>

            <?php
            // 空白セル
            for ($i = 0; $i < $first_day_of_week; $i++) {
                echo '<div class="calendar-day empty"></div>';
            }

            // 日付セル
            $today_day = (int)date('d');
            $is_current_month = ($current_ym == date('Y-m'));

            for ($day = 1; $day <= $days_in_month; $day++) {
                $today_class = ($is_current_month && $day == $today_day) ? 'today' : '';
                echo '<div class="calendar-day ' . $today_class . '">';
                echo '<span class="day-number">' . $day . '</span>';
                
                if (isset($calendar_events[$day])) {
                    foreach ($calendar_events[$day] as $event) {
                        // タイトル表示：PCならそのまま、スマホなら短縮などを検討しても良いが、CSSで省略する
                        echo '<a href="' . $event['link'] . '" class="day-event type-' . $event['type'] . '">';
                        echo $event['label'] . ' ' . esc_html($event['title']);
                        echo '</a>';
                    }
                }
                echo '</div>';
            }
            ?>
        </div>
    </div>

    <?php if (!empty($calendar_events)) : ?>
    <div class="cal-card">
        <h3 style="font-size:1rem; border-bottom:2px solid #eee; padding-bottom:10px; margin-top:0;">📋 今月の予定リスト</h3>
        <ul class="schedule-list">
            <?php
            foreach ($calendar_events as $day => $events) {
                foreach ($events as $event) {
            ?>
                <li class="schedule-item">
                    <div class="schedule-date"><?php echo $month; ?>/<?php echo $day; ?></div>
                    <div class="schedule-content">
                        <a href="<?php echo $event['link']; ?>" class="schedule-link">
                           <?php echo $event['label']; ?> <?php echo esc_html($event['title']); ?>
                        </a>
                    </div>
                </li>
            <?php
                }
            }
            ?>
        </ul>
    </div>
    <?php endif; ?>

</div>

<?php get_footer(); ?>