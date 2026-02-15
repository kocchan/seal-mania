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
.popular-section-full {
    width: 100vw;
    position: relative;
    left: 50%;
    transform: translateX(-50%);
    margin: 20px 0 40px;
    overflow: hidden;
}

.popular-slider-container {
    width: 100%;
}

.popular-post-area {
    display: flex;
    overflow-x: auto;
    scroll-snap-type: x mandatory;
    scroll-behavior: smooth;
    -ms-overflow-style: none;
    scrollbar-width: none;
    /* 左右に20pxの余白を追加 */
    padding: 0 20px;
}

.popular-post-area::-webkit-scrollbar {
    display: none;
}

.slider-item {
    flex: 0 0 85%; /* 余白分を考慮して少し調整 */
    margin-right: 15px;
    scroll-snap-align: center;
}

.slider-item:last-child {
    margin-right: 20px; /* 最後のアイテムの右余白 */
}

.slider-item img {
    width: 100%;
    height: auto;
    border-radius: 12px;
    display: block;
    box-shadow: 0 2px 8px rgba(0,0,0,0.1);
}

.slider-dots {
    text-align: center;
    margin-top: 20px;
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

@media (min-width: 768px) {
    .popular-post-area {
        padding: 0 40px; /* PCでは少し広めに */
    }
    .slider-item {
        flex: 0 0 19%; /* 5個並ぶサイズ感 */
        margin-right: 1%;
    }
}
</style>

<script>
document.addEventListener('DOMContentLoaded', function() {
    const slider = document.getElementById('popularSlider');
    const dotsContainer = document.getElementById('sliderDots');
    const items = slider.querySelectorAll('.slider-item');
    
    if (items.length === 0) return;

    items.forEach((_, i) => {
        const dot = document.createElement('div');
        dot.classList.add('dot');
        if (i === 0) dot.classList.add('active');
        dotsContainer.appendChild(dot);
    });

    const dots = dotsContainer.querySelectorAll('.dot');
    let currentIndex = 0;

    function updateSlider() {
        const itemWidth = items[0].offsetWidth + parseInt(window.getComputedStyle(items[0]).marginRight);
        slider.scrollTo({
            left: itemWidth * currentIndex,
            behavior: 'smooth'
        });

        dots.forEach(d => d.classList.remove('active'));
        dots[currentIndex].classList.add('active');
    }

    setInterval(() => {
        currentIndex = (currentIndex + 1) % items.length;
        updateSlider();
    }, 2000);

    // 手動スクロール時のドット同期（おまけ）
    slider.addEventListener('scroll', () => {
        const index = Math.round(slider.scrollLeft / items[0].offsetWidth);
        if(index < dots.length) {
            dots.forEach(d => d.classList.remove('active'));
            dots[index].classList.add('active');
            currentIndex = index;
        }
    });
});
</script>

<?php get_footer(); ?>