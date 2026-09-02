import { WebcastPushConnection } from 'tiktok-live-connector';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// 状態管理用（コネクション本体、リトライ回数、タイマーを一元管理）
const activeConnections = new Map();
const retryCounts = new Map();
const retryTimeouts = new Map();

async function startBot() {
  console.log('🤖 Hiyoko Intelligence: 監視Botエンジン起動 (自己修復・Exponential Backoff搭載)');
  // 30秒ごとにターゲットをチェック（新規ライバーを素早く検知するため短縮）
  setInterval(checkTargets, 30000);
  checkTargets();
}

async function checkTargets() {
  const { data: targets, error } = await supabase
    .from('target_livers')
    .select('system_id, username')
    .eq('is_active', true);
    
  if (error || !targets) {
    console.error('❌ ターゲット取得エラー:', error?.message);
    return;
  }

  const activeSystemIds = new Set(targets.map(t => t.system_id));

  // 1. 管理画面で削除・OFFにされたライバーのクリーンアップ
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

  // 2. 新規追加、または再接続待機中ではないライバーを接続
  for (const target of targets) {
    if (!activeConnections.has(target.system_id) && !retryTimeouts.has(target.system_id)) {
      connectToLive(target.system_id, target.username);
    }
  }
}

// 💡 指数的バックオフ (Exponential Backoff + Jitter) の計算
function getBackoffDelay(retryCount) {
  const baseDelay = 2000; // 初期2秒
  const maxDelay = 60000; // 最大60秒
  // 2^retryCount * 2000 + ジッター(0〜1000msのランダムな揺らぎで機械的なアクセスを偽装)
  const delay = Math.min(baseDelay * Math.pow(2, retryCount), maxDelay) + Math.random() * 1000;
  return Math.floor(delay);
}

function connectToLive(systemId, username) {
  const currentRetry = retryCounts.get(systemId) || 0;
  console.log(`📡 [${username} (${systemId})] 接続試行中... (リトライ回数: ${currentRetry})`);
  
  // WAF回避・安定化のためのオプション強化
  const connection = new WebcastPushConnection(username, {
    processInitialData: false,
    enableExtendedGiftInfo: true,
    enableWebsocketUpgrade: true, // 200 OK エラーを回避するためWSアップグレードを強制
    requestPollingIntervalMs: 2000,
    clientParams: {
      "app_language": "ja-JP",
      "device_platform": "web"
    }
  });
  
  activeConnections.set(systemId, connection);

  connection.connect().then(async state => {
    console.log(`✅ [${username}] 接続成功! RoomID: ${state.roomId}`);
    retryCounts.set(systemId, 0); // 成功したらリトライ回数をリセット
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
    console.error(`❌ [${username}] 接続エラー:`, err.message);
    handleDisconnect(systemId, username, false);
  });

  // --- リアルタイムイベント ---

  connection.on('gift', async data => {
    if (data.giftType === 1 && !data.repeatEnd) return; // 連打ギフトは最後のみ処理（負荷軽減）
    const coins = data.diamondCount * (data.repeatCount || 1);
    if (coins <= 0) return;

    try {
      const { data: viewer } = await supabase
        .from('viewers')
        .upsert(
          { 
            id: data.userId.toString(),
            unique_id: data.uniqueId,
            name: data.nickname,
            avatar_url: data.profilePictureUrl,
            updated_at: new Date().toISOString() 
          }, 
          { onConflict: 'id' }
        )
        .select('id')
        .single();

      await supabase.from('gift_logs').insert({
        liver_id: systemId,
        viewer_id: viewer.id,
        gift_id: data.giftId.toString(),
        gift_name: data.giftName || 'ギフト',
        coins: coins,
        count: data.repeatCount || 1
      });
    } catch (e) {
      console.error(`❌ [${username}] DB書込エラー:`, e.message);
    }
  });

  connection.on('streamEnd', () => {
    console.log(`🔴 [${username}] 配信終了`);
    handleDisconnect(systemId, username, true);
  });

  // 💡 不安定さの最大の原因だった「予期せぬ切断」時のリカバリー処理
  connection.on('disconnected', () => {
    console.warn(`🔌 [${username}] WebSocketが不意に切断されました`);
    handleDisconnect(systemId, username, false);
  });

  connection.on('error', err => {
    console.error(`🚨 [${username}] 内部エラー:`, err.message);
    handleDisconnect(systemId, username, false);
  });
}

// 💡 エラー時の自己修復ハブ
function handleDisconnect(systemId, username, isStreamEnd) {
  // まずアクティブな接続リストから消す
  if (activeConnections.has(systemId)) {
    try { activeConnections.get(systemId).disconnect(); } catch (e) {}
    activeConnections.delete(systemId);
  }

  if (isStreamEnd) {
    // 配信終了のときはすぐには再接続せず、次の定期巡回に任せるためタイマーはセットしない
    retryCounts.set(systemId, 0); 
    return;
  }

  // エラーや予期せぬ切断の場合はバックオフ再接続をスケジュール
  let currentRetry = retryCounts.get(systemId) || 0;
  const delay = getBackoffDelay(currentRetry);
  retryCounts.set(systemId, currentRetry + 1);

  console.log(`🔄 [${username}] ${Math.round(delay / 1000)}秒後に再接続を試行します...`);

  if (retryTimeouts.has(systemId)) {
    clearTimeout(retryTimeouts.get(systemId));
  }

  const timeoutId = setTimeout(() => {
    retryTimeouts.delete(systemId);
    // 待機中に管理画面で対象から外されていないか確認してから再接続
    supabase.from('target_livers').select('is_active').eq('system_id', systemId).single()
      .then(({ data }) => {
        if (data && data.is_active) {
          connectToLive(systemId, username);
        } else {
          console.log(`⏹️ [${username}] 待機中に監視対象から外れたため再接続をキャンセル`);
        }
      }).catch(() => {
        // DB取得エラー時もとりあえず再接続を試みる
        connectToLive(systemId, username);
      });
  }, delay);

  retryTimeouts.set(systemId, timeoutId);
}

startBot();