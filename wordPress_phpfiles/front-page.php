<?php
/**
 * Template Name: フロントページ用テンプレート
 */
get_header();
?>

<main id="main" class="main front-page-main" role="main">
    
    <div class="main-visual-area">
        <img src="http://www.seal-search.com/wp-content/uploads/2026/02/Gemini_Generated_Image_payaoppayaoppaya-scaled.png" alt="BONBON DROP" class="main-visual-img pc-only">
        <img src="http://www.seal-search.com/wp-content/uploads/2026/02/Gemini_Generated_Image_hn23y9hn23y9hn23-2.png" alt="BONBON DROP" class="main-visual-img sp-only">
    </div>

    <div class="content-container">
        
        <section class="content-section">
            <h2 class="section-title-blue">話題の記事</h2>
            <div class="popular-post-area">
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

        <section class="content-section location-section">
            <h2 class="section-title-blue">場所から探す</h2>
            <?php
            $regions = [
                '北海道/東北' => 'hokkaido-tohoku',
                '関東'       => 'kanto',
                '中部'       => 'chubu',
                '近畿'       => 'kinki',
                '中国/九州'   => 'chugoku-kyushu',
            ];

            foreach ($regions as $region_name => $slug) :
                $cat = get_category_by_slug($slug);
                $region_link = $cat ? get_category_link($cat->term_id) : '#';
                $args = array('category_name' => $slug, 'posts_per_page' => 5);
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
                    <div class="more-link-wrap"><a href="<?php echo esc_url($region_link); ?>" class="more-link">もっと見る＞</a></div>
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

<?php get_footer(); ?>