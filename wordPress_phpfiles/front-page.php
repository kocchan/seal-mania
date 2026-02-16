<?php
/**
 * Template Name: フロントページ用テンプレート
 */
get_header();
?>

<main id="main" class="main front-page-main" role="main">
    
    <div class="main-visual-area">
        <img src="http://www.seal-search.com/wp-content/uploads/2026/02/Gemini_Generated_Image_sw3lrxsw3lrxsw3l.png" alt="BONBON DROP" class="main-visual-img pc-only">
        <img src="http://www.seal-search.com/wp-content/uploads/2026/02/Gemini_Generated_Image_gu1sshgu1sshgu1s.png" alt="BONBON DROP" class="main-visual-img sp-only">
    </div>

    <div class="content-container">
        
        <section class="content-section popular-section-full">
            <div class="popular-slider-container">
                <div class="popular-post-area" id="popularSlider">
                    <?php 
                    $popular_args = array(
                        'posts_per_page' => 5,
                        'meta_key'       => 'views',
                        'orderby'        => 'meta_value_num',
                        'order'          => 'DESC',
                    );
                    $popular_query = new WP_Query($popular_args);

                    if (!$popular_query->have_posts()) {
                        $popular_args = array('posts_per_page' => 5);
                        $popular_query = new WP_Query($popular_args);
                    }

                    if ($popular_query->have_posts()) :
                        while ($popular_query->have_posts()) : $popular_query->the_post(); ?>
                            <div class="slider-item">
                                <a href="<?php the_permalink(); ?>" class="img-only-link">
                                    <div class="slider-img-wrap">
                                        <?php if (has_post_thumbnail()) : ?>
                                            <?php the_post_thumbnail('medium'); ?>
                                        <?php else : ?>
                                            <div class="article-placeholder"><span class="no-image-title"><?php the_title(); ?></span></div>
                                        <?php endif; ?>
                                    </div>
                                </a>
                                
                                <a href="<?php the_permalink(); ?>" class="title-only-link">
                                    <div class="safe-post-title">
                                        <?php echo esc_html(get_the_title()); ?>
                                    </div>
                                </a>
                            </div>
                        <?php endwhile; wp_reset_postdata();
                    endif; ?>
                </div>
                <div class="slider-dots" id="sliderDots"></div>
            </div>
        </section>

        <section class="content-section location-section">
            <h2 class="section-title-blue">場所から探す</h2>
            <?php
            $regions = [
                '北海道/東北' => 'hokkaido-tohoku',
                '関東'       => 'kanto',
                '中部'       => 'chubu',
                '近畿'       => 'kinki',
                '中国・四国'   => 'chugoku-shikoku',
                '九州・沖縄'   => 'kyushu-okinawa',
            ];

            foreach ($regions as $region_name => $slug) :
                $cat = get_category_by_slug($slug);
                $region_link = $cat ? get_category_link($cat->term_id) : '#';
                
                $args = array(
                    'category_name'  => $slug,
                    'posts_per_page' => 4 /* 5から4に変更 */
                );
                $query = new WP_Query($args);

                if ($query->have_posts()) :
            ?>
            <div class="region-block">
                <h3 class="sub-title-pink"><?php echo esc_html($region_name); ?></h3>
                <div class="article-grid-4">
                    <?php while ($query->have_posts()) : $query->the_post(); ?>
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
                    <?php endwhile; wp_reset_postdata(); ?>
                </div>
                <?php if ($cat) : ?>
                    <div class="more-link-wrap"><a href="<?php echo esc_url($region_link); ?>" class="more-link">もっと見る＞</a></div>
                <?php endif; ?>
            </div>
            <?php 
                endif; 
            endforeach; 
            ?>
        </section>

        <section class="content-section store-section">
            <h2 class="section-title-blue">店舗から探す</h2>
            <?php
            $stores = [
                'ドンキ' => 'donki',
                'LOFT' => 'loft',
                'ハンズ' => 'hands',
                'コンビニ' => 'convini',
                'ヴィレッジヴァンガード' => 'village-vanguard',
                'TSUTAYA' => 'tsutaya',
                'その他' => 'other-store',
            ];

            foreach ($stores as $store_name => $slug) :
                $cat = get_category_by_slug($slug);
                $store_link = $cat ? get_category_link($cat->term_id) : '#';
                
                $args = array(
                    'category_name'  => $slug,
                    'posts_per_page' => 4 /* 5から4に変更 */
                );
                $query = new WP_Query($args);

                if ($query->have_posts()) :
            ?>
            <div class="region-block">
                <h3 class="sub-title-pink"><?php echo esc_html($store_name); ?></h3>
                <div class="article-grid-4">
                    <?php while ($query->have_posts()) : $query->the_post(); ?>
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
                    <?php endwhile; wp_reset_postdata(); ?>
                </div>
                <?php if ($cat) : ?>
                    <div class="more-link-wrap"><a href="<?php echo esc_url($store_link); ?>" class="more-link">もっと見る＞</a></div>
                <?php endif; ?>
            </div>
            <?php 
                endif; 
            endforeach; 
            ?>
        </section>

        <section class="content-section character-section">
            <h2 class="section-title-blue">キャラクターから探す</h2>
            <?php
            $characters = [
                'ディズニー' => 'disney',
                'サンリオ' => 'sanrio',
                'たまごっち' => 'tamagotchi',
                'しずくちゃん' => 'shizukuchan',
                'ちいかわ' => 'chiikawa',
                'その他' => 'other-character',
            ];

            foreach ($characters as $char_name => $slug) :
                $cat = get_category_by_slug($slug);
                $char_link = $cat ? get_category_link($cat->term_id) : '#';
                
                $args = array(
                    'category_name'  => $slug,
                    'posts_per_page' => 4 /* 5から4に変更 */
                );
                $query = new WP_Query($args);

                if ($query->have_posts()) :
            ?>
            <div class="region-block">
                <h3 class="sub-title-pink"><?php echo esc_html($char_name); ?></h3>
                <div class="article-grid-4">
                    <?php while ($query->have_posts()) : $query->the_post(); ?>
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
                    <?php endwhile; wp_reset_postdata(); ?>
                </div>
                <?php if ($cat) : ?>
                    <div class="more-link-wrap"><a href="<?php echo esc_url($char_link); ?>" class="more-link">もっと見る＞</a></div>
                <?php endif; ?>
            </div>
            <?php 
                endif; 
            endforeach; 
            ?>
        </section>

        <section class="content-section news-section">
            <h2 class="section-title-blue">入荷/抽選情報</h2>
            <?php
            $news_categories = [
                '今月の新作' => 'new-item',
                '抽選・予約情報' => 'reservation',
                'オンライン通販' => 'online',
            ];

            foreach ($news_categories as $news_name => $slug) :
                $cat = get_category_by_slug($slug);
                $news_link = $cat ? get_category_link($cat->term_id) : '#';
                
                $args = array(
                    'category_name'  => $slug,
                    'posts_per_page' => 4 /* 5から4に変更 */
                );
                $query = new WP_Query($args);

                if ($query->have_posts()) :
            ?>
            <div class="region-block">
                <h3 class="sub-title-pink"><?php echo esc_html($news_name); ?></h3>
                <div class="article-grid-4">
                    <?php while ($query->have_posts()) : $query->the_post(); ?>
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
                    <?php endwhile; wp_reset_postdata(); ?>
                </div>
                <?php if ($cat) : ?>
                    <div class="more-link-wrap"><a href="<?php echo esc_url($news_link); ?>" class="more-link">もっと見る＞</a></div>
                <?php endif; ?>
            </div>
            <?php 
                endif; 
            endforeach; 
            ?>
        </section>

        <section class="content-section guide-section">
            <h2 class="section-title-blue">豆知識</h2>
            <div class="store-grid-wrapper">
                <?php 
                /* 豆知識も取得件数を 15 から 4 に変更 */
                $guide_query = new WP_Query(array('category_name' => 'guide', 'posts_per_page' => 4));
                if ($guide_query->have_posts()) :
                    while ($guide_query->have_posts()) : $guide_query->the_post(); ?>
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
                    <?php endwhile; wp_reset_postdata();
                endif; ?>
            </div>
        </section>

    </div>

</main>

<style>
/* ▼ 追加：PCで4列、スマホで2列にして記事を大きく見せる（親テーマの5列設定を上書き） ▼ */
.article-grid-4,
.store-grid-wrapper {
    display: grid !important;
    grid-template-columns: repeat(4, 1fr) !important; /* 横に4つ並べる */
    gap: 15px !important;
}

@media screen and (max-width: 768px) {
    .article-grid-4,
    .store-grid-wrapper {
        grid-template-columns: repeat(2, 1fr) !important; /* スマホでは2列×2段で大きく見せる */
        gap: 10px !important;
    }
}
/* ▲ 追加ここまで ▲ */

/* キービジュアルとスライダーの間の余白を極限まで狭くする */
.main-visual-area {
    margin-bottom: 20px !important; 
}

.content-container {
    padding-top: 20px !important; 
}

/* 分離したリンクとタイトルの確実なスタイル（テーマCSSのリセット含む） */
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

/* スライダー全体のコンテナ上余白もゼロに */
.popular-section-full {
    width: 100vw;
    position: relative;
    left: 50%;
    transform: translateX(-50%);
    margin: 0 0 40px !important; 
    overflow: hidden;
}

/* スライダー内部：絶対に折り返さない(2段にならない)設定 */
.popular-post-area {
    display: flex !important;
    flex-wrap: nowrap !important;
    overflow-x: auto;
    scroll-snap-type: x mandatory;
    scroll-behavior: smooth;
    -ms-overflow-style: none;
    scrollbar-width: none;
    padding: 0 20px; 
}

.popular-post-area::-webkit-scrollbar {
    display: none;
}

/* 1枚あたりの設定 */
.slider-item {
    flex: 0 0 75%; /* スマホ：1枚が大きく見える */
    margin-right: 15px;
    scroll-snap-align: center;
    display: flex;
    flex-direction: column;
}

.slider-img-wrap img {
    width: 100%;
    height: auto;
    border-radius: 12px;
    display: block;
    box-shadow: 0 2px 8px rgba(0,0,0,0.1);
}

/* PC表示の調整 */
@media (min-width: 768px) {
    .popular-post-area {
        padding: 0 40px;
    }
    .slider-item {
        flex: 0 0 calc(20% - 15px); /* トップのスライダーは5枚並ぶサイズを維持 */
        margin-right: 15px;
    }
}

/* ドットインジケーター */
.slider-dots {
    text-align: center;
    margin-top: 15px;
    display: flex;
    justify-content: center;
    gap: 8px;
}

.dot {
    width: 8px;
    height: 8px;
    background: #e0e0e0;
    border-radius: 50%;
    transition: all 0.3s;
}

.dot.active {
    background: #ff8fb1;
    transform: scale(1.2);
}
</style>

<script>
document.addEventListener('DOMContentLoaded', function() {
    const slider = document.getElementById('popularSlider');
    const dotsContainer = document.getElementById('sliderDots');
    const items = slider.querySelectorAll('.slider-item');
    
    if (items.length === 0) return;

    // ドットの生成
    items.forEach((_, i) => {
        const dot = document.createElement('div');
        dot.classList.add('dot');
        if (i === 0) dot.classList.add('active');
        dotsContainer.appendChild(dot);
    });

    const dots = dotsContainer.querySelectorAll('.dot');

    // 手動スクロール時のドット同期のみ実行（自動スクロールを削除）
    slider.addEventListener('scroll', () => {
        const index = Math.round((slider.scrollLeft) / (items[0].offsetWidth + 15));
        if(index < dots.length) {
            dots.forEach(d => d.classList.remove('active'));
            dots[index].classList.add('active');
        }
    });
});
</script>

<?php get_footer(); ?>