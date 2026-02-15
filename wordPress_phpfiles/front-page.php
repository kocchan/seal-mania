<?php
/**
 * Template Name: フロントページ用テンプレート
 */
get_header();
?>

<main id="main" class="main front-page-main" role="main">
    
    <div class="main-visual-area">
        <img src="http://www.seal-search.com/wp-content/uploads/2026/02/Gemini_Generated_Image_sw3lrxsw3lrxsw3l.png" alt="BONBON DROP" class="main-visual-img pc-only">
        <img src="http://www.seal-search.com/wp-content/uploads/2026/02/Gemini_Generated_Image_hn23y9hn23y9hn23-2.png" alt="BONBON DROP" class="main-visual-img sp-only">
    </div>

    <div class="content-container">
        
        <section class="content-section popular-section-full">
            <?php /* 「話題の記事」の見出しは削除しました */ ?>
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
                            <a href="<?php the_permalink(); ?>" class="article-item slider-item">
                                <?php if (has_post_thumbnail()) : ?>
                                    <?php the_post_thumbnail('medium'); ?>
                                <?php else : ?>
                                    <div class="article-placeholder"><span class="no-image-title"><?php the_title(); ?></span></div>
                                <?php endif; ?>
                            </a>
                        <?php endwhile; wp_reset_postdata();
                    endif; ?>
                </div>
                <div class="slider-dots" id="sliderDots"></div>
            </div>
        </section>

        <section class="content-section location-section">
            <h2 class="section-title-blue">場所から探す</h2>
            <?php
            // カテゴリーのスラッグと表示名のマッピング
            $regions = [
                '北海道/東北' => 'hokkaido-tohoku',
                '関東'       => 'kanto',
                '中部'       => 'chubu',
                '近畿'       => 'kinki',
                '中国・四国'   => 'chugoku-shikoku',
                '九州・沖縄'   => 'kyushu-okinawa',
            ];

            foreach ($regions as $region_name => $slug) :
                // スラッグからカテゴリー情報を取得
                $cat = get_category_by_slug($slug);
                // カテゴリーが存在すればそのリンクを、なければ # をセット
                $region_link = $cat ? get_category_link($cat->term_id) : '#';
                
                // 指定したスラッグのカテゴリーの記事を取得
                $args = array(
                    'category_name'  => $slug,
                    'posts_per_page' => 5
                );
                $query = new WP_Query($args);
            ?>
            <div class="region-block">
                <h3 class="sub-title-pink"><?php echo esc_html($region_name); ?></h3>
                <?php if ($query->have_posts()) : ?>
                    <div class="article-grid-5">
                        <?php while ($query->have_posts()) : $query->the_post(); ?>
                            <a href="<?php the_permalink(); ?>" class="article-item">
                                <?php if (has_post_thumbnail()) : ?>
                                    <?php the_post_thumbnail('medium'); ?>
                                <?php else : ?>
                                    <div class="article-placeholder"><span class="no-image-title"><?php the_title(); ?></span></div>
                                <?php endif; ?>
                            </a>
                        <?php endwhile; wp_reset_postdata(); ?>
                    </div>
                    <?php if ($cat) : ?>
                        <div class="more-link-wrap"><a href="<?php echo esc_url($region_link); ?>" class="more-link">もっと見る＞</a></div>
                    <?php endif; ?>
                <?php else : ?>
                    <div class="no-posts-message">記事準備中です＞＜<br>更新されるまでお待ちください</div>
                <?php endif; ?>
            </div>
            <?php endforeach; ?>
        </section>

        <section class="content-section store-section">
            <h2 class="section-title-blue">店舗から探す</h2>
            <div class="store-grid-wrapper">
                <?php 
                $store_query = new WP_Query(array('category_name' => 'store', 'posts_per_page' => 15));
                if ($store_query->have_posts()) :
                    while ($store_query->have_posts()) : $store_query->the_post(); ?>
                        <a href="<?php the_permalink(); ?>" class="article-item">
                            <?php if (has_post_thumbnail()) : ?>
                                <?php the_post_thumbnail('medium'); ?>
                            <?php else : ?>
                                <div class="article-placeholder"><span class="no-image-title"><?php the_title(); ?></span></div>
                            <?php endif; ?>
                        </a>
                    <?php endwhile; wp_reset_postdata();
                endif; ?>
            </div>
        </section>

        <section class="content-section character-section">
            <h2 class="section-title-blue">キャラクターから探す</h2>
            <div class="store-grid-wrapper">
                <?php 
                $char_query = new WP_Query(array('category_name' => 'character', 'posts_per_page' => 15));
                if ($char_query->have_posts()) :
                    while ($char_query->have_posts()) : $char_query->the_post(); ?>
                        <a href="<?php the_permalink(); ?>" class="article-item">
                            <?php if (has_post_thumbnail()) : ?>
                                <?php the_post_thumbnail('medium'); ?>
                            <?php else : ?>
                                <div class="article-placeholder"><span class="no-image-title"><?php the_title(); ?></span></div>
                            <?php endif; ?>
                        </a>
                    <?php endwhile; wp_reset_postdata();
                endif; ?>
            </div>
        </section>

        <section class="content-section news-section">
            <h2 class="section-title-blue">入荷/抽選情報</h2>
            <div class="store-grid-wrapper">
                <?php 
                $news_query = new WP_Query(array('category_name' => 'news', 'posts_per_page' => 15));
                if ($news_query->have_posts()) :
                    while ($news_query->have_posts()) : $news_query->the_post(); ?>
                        <a href="<?php the_permalink(); ?>" class="article-item">
                            <?php if (has_post_thumbnail()) : ?>
                                <?php the_post_thumbnail('medium'); ?>
                            <?php else : ?>
                                <div class="article-placeholder"><span class="no-image-title"><?php the_title(); ?></span></div>
                            <?php endif; ?>
                        </a>
                    <?php endwhile; wp_reset_postdata();
                endif; ?>
            </div>
        </section>

        <section class="content-section guide-section">
            <h2 class="section-title-blue">豆知識</h2>
            <div class="store-grid-wrapper">
                <?php 
                $guide_query = new WP_Query(array('category_name' => 'guide', 'posts_per_page' => 15));
                if ($guide_query->have_posts()) :
                    while ($guide_query->have_posts()) : $guide_query->the_post(); ?>
                        <a href="<?php the_permalink(); ?>" class="article-item">
                            <?php if (has_post_thumbnail()) : ?>
                                <?php the_post_thumbnail('medium'); ?>
                            <?php else : ?>
                                <div class="article-placeholder"><span class="no-image-title"><?php the_title(); ?></span></div>
                            <?php endif; ?>
                        </a>
                    <?php endwhile; wp_reset_postdata();
                endif; ?>
            </div>
        </section>

    </div>

</main>

<style>
/* 話題の記事セクション専用スタイル */
.popular-section-full {
    width: 100vw;
    position: relative;
    left: 50%;
    transform: translateX(-50%);
    margin-bottom: 40px;
    overflow: hidden;
}

.popular-slider-container {
    width: 100%;
    position: relative;
}

.popular-post-area {
    display: flex;
    overflow-x: auto;
    scroll-snap-type: x mandatory;
    scroll-behavior: smooth;
    -ms-overflow-style: none; /* IE, Edge */
    scrollbar-width: none; /* Firefox */
}

.popular-post-area::-webkit-scrollbar {
    display: none; /* Chrome, Safari */
}

.slider-item {
    flex: 0 0 80%; /* スマホなどでは少し次が見えるように80% */
    max-width: 400px; /* デスクトップで大きくなりすぎないよう調整 */
    margin: 0 10px;
    scroll-snap-align: center;
}

.slider-item img {
    width: 100%;
    height: auto;
    border-radius: 8px;
    display: block;
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
    width: 10px;
    height: 10px;
    background: #ccc;
    border-radius: 50%;
    transition: background 0.3s;
}

.dot.active {
    background: #ff8fb1; /* アクティブ時の色 */
}

@media (min-width: 768px) {
    .slider-item {
        flex: 0 0 20%; /* PCでは5個並ぶ感覚 */
        max-width: none;
    }
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
    let currentIndex = 0;

    // 2秒ごとにスクロール
    setInterval(() => {
        currentIndex++;
        if (currentIndex >= items.length) {
            currentIndex = 0;
        }
        
        const scrollStep = slider.scrollWidth / items.length;
        slider.scrollTo({
            left: scrollStep * currentIndex,
            behavior: 'smooth'
        });

        // ドット更新
        dots.forEach(d => d.classList.remove('active'));
        dots[currentIndex].classList.add('active');
    }, 2000);
});
</script>

<?php get_footer(); ?>