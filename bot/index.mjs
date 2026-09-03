import { TikTokLiveConnection } from 'tiktok-live-connector';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ 環境変数 NEXT_PUBLIC_SUPABASE_URL または NEXT_PUBLIC_SUPABASE_ANON_KEY が設定されていません。');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const activeConnections = new Map();
const retryCounts = new Map();
const retryTimeouts = new Map();

// 💡 TikTokがダイヤ数を隠してきた時のための「強制価格辞書」
const GIFT_PRICES = {
  'Rose': 1, 'TikTok': 1, 'GG': 1, 'Heart Me': 1, 'Mini Speaker': 1, 'Tennis': 1,
  'Popular Vote': 1, 'ぴょこギフ': 1, 'ぼくリス大筆': 1, 'Coffee': 1, 'Ice Cream': 1,
  'Finger Heart': 5, 'Mic': 5, 'Panda': 5,
  'Doughnut': 30, 'Perfume': 20,
  'Hat and Mustache': 99, 'Cap': 99, 'Paper Crane': 99,
  'Money Gun': 500, 'Corgi': 299,
  'Confetti': 100, 'Hand Hearts': 100,
  'Garland': 1500, 'Carousel': 1500,
  'Ferris Wheel': 3000, 'Whale Diving': 3000,
  'Lion': 29999, 'TikTok Universe': 34999
};

console.log('🤖 Hiyoko Intelligence: 監視Botエンジン起動 (Production Ready)');

async function startBot() {
  setInterval(checkTargets, 30000);
  checkTargets();
}

async function checkTargets() {
  console.log(`🔍 DBから監視対象を確認中...`);

  const { data: targets, error } = await supabase
    .from('target_livers')
    .select('system_id, username')
    .eq('is_active', true);
    
  if (error) {
    console.error('❌ Supabase取得エラー:', error.message);
    return;
  }

  console.log(`✅ 現在の有効な監視対象: ${targets?.length || 0} 人`);
  if (!targets || targets.length === 0) return;

  const activeSystemIds = new Set(targets.map(t => t.system_id));

  for (const [systemId, connection] of activeConnections.entries()) {
    if (!activeSystemIds.has(systemId)) {
      console.log(`⏹️ [${systemId}] 監視対象から外れました。切断します。`);
      try { connection.disconnect(); } catch (e) {}
      activeConnections.delete(systemId);
      retryCounts.delete(systemId);
      if (retryTimeouts.has(systemId)) {
        clearTimeout(retryTimeouts.get(systemId));
        retryTimeouts.delete(systemId);
      }
    }
  }

  for (const target of targets) {
    if (!activeConnections.has(target.system_id) && !retryTimeouts.has(target.system_id)) {
      connectToLive(target.system_id, target.username);
    }
  }
}

function getBackoffDelay(retryCount) {
  const baseDelay = 2000; 
  const maxDelay = 60000; 
  const delay = Math.min(baseDelay * Math.pow(2, retryCount), maxDelay) + Math.random() * 1000;
  return Math.floor(delay);
}

function connectToLive(systemId, username) {
  const currentRetry = retryCounts.get(systemId) || 0;
  console.log(`📡 [${username} (${systemId})] 接続試行中... (リトライ回数: ${currentRetry})`);
  
  const connection = new TikTokLiveConnection(username, {
    processInitialData: false,
    enableExtendedGiftInfo: false,
    clientParams: {
      "app_language": "ja-JP",
      "device_platform": "web"
    }
  });
  
  activeConnections.set(systemId, connection);

  connection.connect().then(async state => {
    console.log(`✅ [${username}] 接続成功! RoomID: ${state.roomId}`);
    retryCounts.set(systemId, 0); 
    try {
      const avatarUrl = state.roomInfo?.owner?.avatar_thumb?.url_list?.[0];
      const liverName = state.roomInfo?.owner?.nickname;
      const updateData = {};
      if (avatarUrl) updateData.avatar_url = avatarUrl;
      if (liverName) updateData.liver_name = liverName;
      if (Object.keys(updateData).length > 0) {
        await supabase.from('target_livers').update(updateData).eq('system_id', systemId);
      }
    } catch (e) {}
  }).catch(err => {
    console.error(`❌ [${username}] 接続エラー:`, err.message || err);
    handleDisconnect(systemId, username, false);
  });

  connection.on('gift', async data => {
    try {
      const giftName = data.giftName || data.gift?.name || data.gift?.describe || '不明なギフト';
      const repeatCount = data.repeatCount || 1;
      
      let diamondCount = data.diamondCount || data.gift?.diamond_count || data.gift?.coin_count || 0;
      if (diamondCount === 0) {
        diamondCount = GIFT_PRICES[giftName] || 0;
      }
      
      const coins = diamondCount * repeatCount;
      const nickname = data.nickname || data.user?.nickname || '名無し';

      // 連打の途中のデータは弾く
      if (data.giftType === 1 && !data.repeatEnd) return; 

      console.log(`🎁 [${username}] ギフト捕捉: ${nickname} から ${giftName} x${repeatCount} (単価補完: ${diamondCount} / 計: ${coins})`);

      const rawGiftId = data.giftId || data.gift?.gift_id || data.gift?.id || 'unknown_gift';
      const uniqueId = data.uniqueId || data.user?.uniqueId || 'unknown';
      const profilePic = data.profilePictureUrl || data.user?.profilePictureUrl || null;

      let viewerId;
      const { data: existingViewers, error: searchError } = await supabase
        .from('viewers')
        .select('id')
        .eq('unique_id', uniqueId)
        .limit(1);

      if (searchError) {
        console.error(`❌ [${username}] Viewer検索エラー:`, searchError.message);
        return;
      }

      if (existingViewers && existingViewers.length > 0) {
        viewerId = existingViewers[0].id;
        // 既存リスナーのアイコン・名前・最終更新日時を最新化
        await supabase.from('viewers').update({
          name: nickname,
          avatar_url: profilePic,
          updated_at: new Date().toISOString()
        }).eq('id', viewerId);
      } else {
        const { data: newViewer, error: insertError } = await supabase
          .from('viewers')
          .insert({
            unique_id: uniqueId,
            name: nickname,
            avatar_url: profilePic
          })
          .select('id')
          .single();

        if (insertError) {
          console.error(`❌ [${username}] Viewer新規作成エラー:`, insertError.message);
          return;
        }
        viewerId = newViewer.id;
      }

      const { error: insertError } = await supabase.from('gift_logs').insert({
        liver_id: systemId,
        viewer_id: viewerId,
        gift_id: String(rawGiftId),
        gift_name: giftName,
        coins: coins,
        count: repeatCount
      });

      if (insertError) {
          console.error(`❌ [${username}] Log保存エラー:`, insertError.message);
      } else {
          console.log(`✅ [${username}] DB保存完了: ${giftName} (+${coins}ダイヤ)`);
      }

    } catch (e) {
      console.error(`❌ [${username}] DB書込例外:`, e.message);
    }
  });

  connection.on('streamEnd', () => {
    console.log(`🔴 [${username}] 配信終了`);
    handleDisconnect(systemId, username, true);
  });

  connection.on('disconnected', () => {
    console.warn(`🔌 [${username}] WebSocketが不意に切断されました`);
    handleDisconnect(systemId, username, false);
  });

  connection.on('error', err => {
    console.error(`🚨 [${username}] 内部エラー:`, err?.message || err);
  });
}

function handleDisconnect(systemId, username, isStreamEnd) {
  if (activeConnections.has(systemId)) {
    try { activeConnections.get(systemId).disconnect(); } catch (e) {}
    activeConnections.delete(systemId);
  }

  if (isStreamEnd) {
    retryCounts.set(systemId, 0); 
    return;
  }

  let currentRetry = retryCounts.get(systemId) || 0;
  const delay = getBackoffDelay(currentRetry);
  retryCounts.set(systemId, currentRetry + 1);

  console.log(`🔄 [${username}] ${Math.round(delay / 1000)}秒後に再接続を試行します...`);

  if (retryTimeouts.has(systemId)) {
    clearTimeout(retryTimeouts.get(systemId));
  }

  const timeoutId = setTimeout(() => {
    retryTimeouts.delete(systemId);
    supabase.from('target_livers').select('is_active').eq('system_id', systemId).single()
      .then(({ data }) => {
        if (data && data.is_active) {
          connectToLive(systemId, username);
        } else {
          console.log(`⏹️ [${username}] 待機中に監視対象から外れたため再接続をキャンセル`);
        }
      }).catch(() => {
        connectToLive(systemId, username);
      });
  }, delay);

  retryTimeouts.set(systemId, timeoutId);
}

startBot();