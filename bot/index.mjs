import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { TikTokLiveConnection } from 'tiktok-live-connector'; // ← ここが正解でした！！！
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ 環境変数が設定されていません。');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const targetUsername = 'pyokotan_54'; 
const TARGET_LIVER_DB_ID = '7594791795658145809';

console.log(`TikTokユーザー ${targetUsername} に接続中...`);

// ↓ ここも修正！
const tiktokLiveConnection = new TikTokLiveConnection(targetUsername, {
    processInitialData: false,
    enableExtendedGiftInfo: true,
    enableWebsocketUpgrade: true,
    requestPollingIntervalMs: 2000,
});

tiktokLiveConnection.connect().then((state) => {
    console.info(`✅ 接続成功! ルームID: ${state.roomId}`);
    console.info(`📡 ギフト受信の待機を開始しました...`);
}).catch((err) => {
    console.error('❌ 接続エラー:', err);
});

tiktokLiveConnection.on('streamEnd', (actionId) => {
    console.log('🛑 配信が終了しました。Action ID:', actionId);
});

tiktokLiveConnection.on('disconnected', () => {
    console.log('⚠️ 切断されました。');
});

tiktokLiveConnection.on('gift', async (data) => {
    const giftName = data.giftName;
    const coins = data.diamondCount * data.repeatCount;
    const viewerId = data.userId.toString();
    const viewerName = data.nickname;
    
    if(coins === 0) return;

    console.log(`🎁 ギフト受信: ${viewerName} さんから ${giftName} x${data.repeatCount} (合計 ${coins} ダイヤ)`);

    try {
        const { error: viewerError } = await supabase
            .from('viewers')
            .upsert({ id: viewerId, name: viewerName }, { onConflict: 'id' });

        if (viewerError) return console.error('viewers保存エラー:', viewerError);

        const { error: logError } = await supabase
            .from('gift_logs')
            .insert({
                liver_id: TARGET_LIVER_DB_ID,
                viewer_id: viewerId,
                coins: coins
            });
            
        if (logError) {
            console.error('gift_logs保存エラー:', logError);
        } else {
             console.log(`✅ DB保存完了: +${coins}ダイヤ`);
        }
    } catch (e) {
        console.error('DB処理中の例外:', e);
    }
});
// --- クラウド用ヘルスチェックサーバー ---
import http from 'http';
const PORT = process.env.PORT || 10000;
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Hiyoko Bot is running!\n');
}).listen(PORT, () => {
    console.log(`☁️ クラウド用ヘルスチェックサーバー起動 (Port: ${PORT})`);
});