<?php //子テーマ用関数
if ( !defined( 'ABSPATH' ) ) exit;

//子テーマ用のビジュアルエディタースタイルを適用
add_editor_style();

//以下に子テーマ用の関数を書く


// カテゴリを一括自動作成する関数（階層対応版）
function auto_create_all_categories() {
    
    // カテゴリ構成の定義（配列で親・子・孫の階層を作ります）
    $category_tree = array(
        // 1. 都道府県別（親）
        array(
            'name' => '都道府県別', 'slug' => 'prefecture',
            'children' => array(
                array(
                    'name' => '北海道・東北', 'slug' => 'hokkaido-tohoku',
                    'children' => array(
                        array('name' => '北海道', 'slug' => 'hokkaido'),
                        array('name' => '青森', 'slug' => 'aomori'),
                        array('name' => '岩手', 'slug' => 'iwate'),
                        array('name' => '宮城', 'slug' => 'miyagi'),
                        array('name' => '秋田', 'slug' => 'akita'),
                        array('name' => '山形', 'slug' => 'yamagata'),
                        array('name' => '福島', 'slug' => 'fukushima'),
                    )
                ),
                array(
                    'name' => '関東', 'slug' => 'kanto',
                    'children' => array(
                        array('name' => '茨城', 'slug' => 'ibaraki'),
                        array('name' => '栃木', 'slug' => 'tochigi'),
                        array('name' => '群馬', 'slug' => 'gunma'),
                        array('name' => '埼玉', 'slug' => 'saitama'),
                        array('name' => '千葉', 'slug' => 'chiba'),
                        array('name' => '東京', 'slug' => 'tokyo'),
                        array('name' => '神奈川', 'slug' => 'kanagawa'),
                    )
                ),
                array(
                    'name' => '中部', 'slug' => 'chubu',
                    'children' => array(
                        array('name' => '新潟', 'slug' => 'niigata'),
                        array('name' => '富山', 'slug' => 'toyama'),
                        array('name' => '石川', 'slug' => 'ishikawa'),
                        array('name' => '福井', 'slug' => 'fukui'),
                        array('name' => '山梨', 'slug' => 'yamanashi'),
                        array('name' => '長野', 'slug' => 'nagano'),
                        array('name' => '岐阜', 'slug' => 'gifu'),
                        array('name' => '静岡', 'slug' => 'shizuoka'),
                        array('name' => '愛知', 'slug' => 'aichi'),
                    )
                ),
                array(
                    'name' => '近畿', 'slug' => 'kinki',
                    'children' => array(
                        array('name' => '三重', 'slug' => 'mie'),
                        array('name' => '滋賀', 'slug' => 'shiga'),
                        array('name' => '京都', 'slug' => 'kyoto'),
                        array('name' => '大阪', 'slug' => 'osaka'),
                        array('name' => '兵庫', 'slug' => 'hyogo'),
                        array('name' => '奈良', 'slug' => 'nara'),
                        array('name' => '和歌山', 'slug' => 'wakayama'),
                    )
                ),
                array(
                    'name' => '中国・四国', 'slug' => 'chugoku-shikoku',
                    'children' => array(
                        array('name' => '鳥取', 'slug' => 'tottori'),
                        array('name' => '島根', 'slug' => 'shimane'),
                        array('name' => '岡山', 'slug' => 'okayama'),
                        array('name' => '広島', 'slug' => 'hiroshima'),
                        array('name' => '山口', 'slug' => 'yamaguchi'),
                        array('name' => '徳島', 'slug' => 'tokushima'),
                        array('name' => '香川', 'slug' => 'kagawa'),
                        array('name' => '愛媛', 'slug' => 'ehime'),
                        array('name' => '高知', 'slug' => 'kochi'),
                    )
                ),
                array(
                    'name' => '九州・沖縄', 'slug' => 'kyushu-okinawa',
                    'children' => array(
                        array('name' => '福岡', 'slug' => 'fukuoka'),
                        array('name' => '佐賀', 'slug' => 'saga'),
                        array('name' => '長崎', 'slug' => 'nagasaki'),
                        array('name' => '熊本', 'slug' => 'kumamoto'),
                        array('name' => '大分', 'slug' => 'oita'),
                        array('name' => '宮崎', 'slug' => 'miyazaki'),
                        array('name' => '鹿児島', 'slug' => 'kagoshima'),
                        array('name' => '沖縄', 'slug' => 'okinawa'),
                    )
                ),
            )
        ),
        
        // 2. 入荷・抽選情報（親）
        array(
            'name' => '入荷・抽選情報', 'slug' => 'news',
            'children' => array(
                array('name' => '今月の新作', 'slug' => 'new-item'),
                array('name' => '抽選・予約情報', 'slug' => 'reservation'),
                array('name' => 'オンライン通販', 'slug' => 'online'),
            )
        ),

        // 3. 店舗攻略情報（親）
        array(
            'name' => '店舗攻略情報', 'slug' => 'store',
            'children' => array(
                array('name' => 'ドンキ', 'slug' => 'donki'),
                array('name' => 'LOFT', 'slug' => 'loft'),
                array('name' => 'ハンズ', 'slug' => 'hands'),
                array('name' => 'コンビニ', 'slug' => 'convini'),
                array('name' => 'ヴィレッジヴァンガード', 'slug' => 'village-vanguard'),
                array('name' => 'TSUTAYA', 'slug' => 'tsutaya'),
                array('name' => 'その他', 'slug' => 'other-store'),
            )
        ),

        // 4. キャラクターシール（親）
        array(
            'name' => 'キャラクターシール', 'slug' => 'character',
            'children' => array(
                array('name' => 'ディズニー', 'slug' => 'disney'),
                array('name' => 'サンリオ', 'slug' => 'sanrio'),
                array('name' => 'たまごっち', 'slug' => 'tamagotchi'),
                array('name' => 'しずくちゃん', 'slug' => 'shizukuchan'),
                array('name' => 'ちいかわ', 'slug' => 'chiikawa'),
                array('name' => 'その他', 'slug' => 'other-character'),
            )
        ),

        // 5. 一般ガイド（親・子なし）
        array('name' => '一般ガイド', 'slug' => 'guide'),
    );

    // ツリーを再帰的に（親から子へ順番に）作成するヘルパー関数
    if ( ! function_exists( 'insert_category_tree' ) ) {
        function insert_category_tree( $categories, $parent_id = 0 ) {
            foreach ( $categories as $cat ) {
                $term_id = 0;
                // 同じ階層に同じ名前のカテゴリがないかチェック
                $term_exists = term_exists( $cat['name'], 'category', $parent_id );

                if ( ! $term_exists ) {
                    $inserted = wp_insert_term(
                        $cat['name'],
                        'category',
                        array(
                            'slug'   => $cat['slug'],
                            'parent' => $parent_id,
                        )
                    );
                    if ( ! is_wp_error( $inserted ) ) {
                        $term_id = $inserted['term_id'];
                    }
                } else {
                    $term_id = is_array( $term_exists ) ? $term_exists['term_id'] : $term_exists;
                }

                // 子カテゴリ(children)が設定されている場合は、取得した親IDを使って自分自身を呼び出す
                if ( $term_id && ! empty( $cat['children'] ) ) {
                    insert_category_tree( $cat['children'], $term_id );
                }
            }
        }
    }

    // 実行
    insert_category_tree( $category_tree );
}

// サイトにアクセスしたタイミングで実行
add_action( 'init', 'auto_create_all_categories' );