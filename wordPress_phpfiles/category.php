<?php
/**
 * カテゴリー（都道府県・店舗など）一覧用のテンプレート
 */
get_header();
?>

<main id="main" class="main category-page-main" role="main">
    <div class="content-container">
        
        <section class="content-section">
            <h2 class="section-title-blue"><?php single_term_title(); ?>の記事一覧</h2>

            <?php if (have_posts()) : ?>
                <div class="article-grid-category">
                    <?php while (have_posts()) : the_post(); ?>
                        <div class="grid-item-wrap">
                            <a href="<?php the_permalink(); ?>" class="img-only-link">
                                <?php if (has_post_thumbnail()) : ?>
                                    <?php the_post_thumbnail('medium'); ?>
                                <?php else : ?>
                                    <div class="article-placeholder"><span class="no-image-title"><?php the_title(); ?></span></div>
                                <?php endif; ?>
                            </a>
                            <a href="<?php the_permalink(); ?>" class="title-only-link">
                                <div class="safe-post-title">
                                    <?php echo esc_html(get_the_title()); ?>
                                </div>
                            </a>
                        </div>
                    <?php endwhile; ?>
                </div>

                <div class="pagination-wrap">
                    <?php 
                    // 不要な記号（＜ や ＞）を削除し、純粋なテキストのみを出力させます
                    the_posts_pagination(array(
                        'mid_size'  => 2,
                        'prev_text' => '前へ',
                        'next_text' => '次へ',
                    )); 
                    ?>
                </div>

            <?php else : ?>
                <div class="no-posts-message">
                    記事準備中です＞＜<br>更新されるまでお待ちください
                </div>
            <?php endif; ?>
        </section>

    </div>
</main>

<style>
/* 右サイドバーを非表示にし、中央に広々と配置する */
#sidebar {
    display: none !important;
}
#main {
    width: 100% !important;
    float: none !important;
    margin: 0 auto !important;
}

.content-container {
    padding-top: 30px !important; 
    max-width: 1000px;
    width: 95%;
    margin: 0 auto !important;
}

.section-title-blue {
    font-size: 18px;
    font-weight: bold;
    color: #333;
    border-bottom: 2px solid #00bfff;
    padding-bottom: 10px;
    margin-bottom: 25px;
}

/* 記事グリッドの調整 */
.article-grid-category {
    display: grid !important;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)) !important;
    gap: 20px !important;
}

@media screen and (max-width: 768px) {
    .article-grid-category {
        grid-template-columns: repeat(2, 1fr) !important;
        gap: 12px !important;
    }
}

/* 記事カードのデザイン */
.img-only-link {
    display: block !important;
    text-decoration: none !important;
    aspect-ratio: 16 / 9 !important; 
    overflow: hidden !important;
    border-radius: 8px !important;
    background-color: #f5f5f5 !important;
}

.img-only-link img {
    width: 100% !important;
    height: 100% !important;
    object-fit: cover !important;
}

.title-only-link {
    display: block !important;
    text-decoration: none !important;
    margin-top: 8px !important;
    aspect-ratio: auto !important; 
    background-color: transparent !important; 
    padding: 0 !important;
    height: auto !important;
}

.safe-post-title {
    font-size: 13px !important;
    color: #333 !important;
    line-height: 1.5 !important;
    font-weight: bold !important;
    text-align: left !important;
    display: -webkit-box !important;
    -webkit-box-orient: vertical !important;
    -webkit-line-clamp: 2 !important;
    overflow: hidden !important;
    text-overflow: ellipsis !important;
    height: 3em !important; 
    visibility: visible !important;
    opacity: 1 !important;
    text-indent: 0 !important;
    white-space: normal !important;
    word-break: break-all !important;
    background: transparent !important;
}

.grid-item-wrap {
    display: flex;
    flex-direction: column;
}

div.article-placeholder {
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    padding: 8px !important;
    box-sizing: border-box !important;
    background-image: url('http://www.seal-search.com/wp-content/uploads/2026/02/Group-1.png') !important;
    background-size: cover !important;
    background-position: center center !important;
    background-repeat: no-repeat !important;
    width: 100%;
    height: 100%;
}

.no-image-title {
    font-size: 12px;
    font-weight: bold;
    color: #555;
    text-align: center;
    line-height: 1.4;
    width: 100%;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 3;
    overflow: hidden;
}

.no-posts-message {
    text-align: center;
    padding: 40px 15px;
    background-color: #fcfcfc;
    border: 2px dashed #cccccc;
    border-radius: 8px;
    color: #888;
    font-size: 14px;
    font-weight: bold;
    line-height: 1.8;
}

/* ▼▼▼ ページネーション（ページ送り）の徹底リセット ▼▼▼ */
.pagination-wrap {
    margin-top: 40px !important;
    text-align: center !important;
    clear: both !important;
}

/* 「投稿ナビゲーション」などの不要なテキストを隠す */
.pagination-wrap .screen-reader-text {
    display: none !important;
}

/* ボタンを横並びにする大枠 */
.pagination-wrap .nav-links {
    display: flex !important;
    flex-direction: row !important;
    justify-content: center !important;
    align-items: center !important;
    gap: 10px !important;
    flex-wrap: wrap !important;
}

/* 各ボタンの設定 */
.pagination-wrap .page-numbers {
    display: flex !important;
    flex-direction: row !important;
    justify-content: center !important;
    align-items: center !important;
    min-width: 40px !important;
    height: 40px !important;
    padding: 0 15px !important;
    margin: 0 !important;
    border: 1px solid #ddd !important;
    border-radius: 4px !important;
    color: #333 !important;
    text-decoration: none !important;
    font-weight: bold !important;
    font-size: 14px !important;
    background: #fff !important;
    line-height: 1 !important;
    box-sizing: border-box !important;
    position: static !important;
}

/* 現在のページ */
.pagination-wrap .page-numbers.current {
    background-color: #ff69b4 !important;
    color: #fff !important;
    border-color: #ff69b4 !important;
}

/* ホバー（マウスを乗せた時） */
.pagination-wrap a.page-numbers:hover {
    background-color: #f5f5f5 !important;
}

/* ★超重要★ テーマ(Cocoon)が勝手に追加するアイコンや位置ズレを強制的に無効化 */
.pagination-wrap .page-numbers::before,
.pagination-wrap .page-numbers::after {
    display: none !important;
    content: none !important;
}

/* ボタン内の文字とアイコンの配置リセット */
.pagination-wrap .page-numbers span {
    display: inline !important;
    position: static !important;
    margin: 0 !important;
    padding: 0 !important;
    font-family: inherit !important;
}

/* 矢印アイコン(FontAwesome等)自体を消滅させる */
.pagination-wrap .page-numbers span[class*="fa"],
.pagination-wrap .page-numbers span[class*="icon"] {
    display: none !important;
}

/* スマホ表示の調整 */
@media screen and (max-width: 768px) {
    .no-image-title {
        font-size: 10px;
        -webkit-line-clamp: 2;
    }
    .pagination-wrap .page-numbers {
        padding: 0 10px !important;
        font-size: 13px !important;
        height: 36px !important;
        min-width: 36px !important;
    }
}
</style>

<?php get_footer(); ?>