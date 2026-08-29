const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

// ★★★ ここに .env ファイルのURLとキーを直接貼り付けてください ★★★
const supabaseUrl = 'https://tjcynorglsquasddcnad.supabase.co'; 
const supabaseKey = 'sb_publishable_mg1sl4RTg99LgcIVI93UHg_BaK_Ibj7'; 
// ★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★

if (supabaseUrl.includes('〇〇〇〇')) {
  console.error('❌ URLとKeyが正しく貼り付けられていません！');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function fixLiverNames() {
  console.log('🚀 既存ライバーの表示名自動取得を開始します...');

  // 1. 表示名が空っぽ（null）のライバーを取得
  const { data: livers, error } = await supabase.from('target_livers').select('system_id, username').is('liver_name', null);
  
  if (error || !livers || livers.length === 0) {
    console.log('✅ 更新が必要なライバーはいませんでした！');
    return;
  }

  for (const liver of livers) {
    try {
      console.log(`🔍 @${liver.username} のTikTokプロファイルを検索中...`);
      // 先ほど作ったAPIをローカルで叩く代わりに、直接fetchしてスクレイピング
      const response = await fetch(`https://www.tiktok.com/@${liver.username}`);
      const html = await response.text();
      const match = html.match(/<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application\/json">([^<]+)<\/script>/);
      
      if (match && match[1]) {
        const data = JSON.parse(match[1]);
        const nickname = data?.__DEFAULT_SCOPE__?.['webapp.user-detail']?.userInfo?.user?.nickname;
        
        if (nickname) {
          // データベースを更新
          await supabase.from('target_livers').update({ liver_name: nickname }).eq('system_id', liver.system_id);
          console.log(`✨ 更新成功: ${liver.username} -> ${nickname}`);
        } else {
          console.log(`⚠️ ${liver.username} の名前が見つかりませんでした。`);
        }
      }
    } catch (e) {
      console.error(`❌ エラー (@${liver.username}):`, e.message);
    }
    // 少し待機（TikTokへの過剰アクセスを防ぐ）
    await new Promise(r => setTimeout(r, 1000));
  }
  console.log('🎉 すべての更新処理が完了しました！');
}

fixLiverNames();