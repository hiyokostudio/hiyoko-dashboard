import { createRequire } from 'module';
import { createClient } from '@supabase/supabase-js';

const require = createRequire(import.meta.url);
const pkg = require('tiktok-live-connector');

// 1. クラスの自動探索（エラー回避の最終兵器）
let WebcastPushConnection = pkg.WebcastPushConnection || pkg.default?.WebcastPushConnection;
if (!WebcastPushConnection) {
  const keys = Object.keys(pkg);
  const foundKey = keys.find(k => k.includes('Connection') && typeof pkg[k] === 'function');
  if (foundKey) {
    WebcastPushConnection = pkg[foundKey];
  } else {
    console.error("🚨 接続クラス不在。パッケージ内の全機能名リスト:");
    console.error(keys.join(', '));
    throw new Error("リスト抽出完了。上のログを確認してください。");
  }
}

// 2. Supabaseクライアントの初期化
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ 環境変数 NEXT_PUBLIC_SUPABASE_URL または NEXT_PUBLIC_SUPABASE_ANON_KEY が設定されていません。');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// 3. 状態管理
const activeConnections = new Map();
const retryCounts = new Map();
const retryTimeouts = new Map();
const MAX_RETRIES = 5;
const BASE_RETRY_DELAY = 5000;

console.log('🤖 Hiyoko Intelligence: 監視Botエンジン起動 (自己修復・Exponential Backoff搭載)');

// 4. 監視対象の確認と接続管理
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

  // 監視対象から外れたものを切断
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

  // 新規対象に接続
  for (const target of targets) {
    if (!activeConnections.has(target.system_id) && !retryTimeouts.has(target.system_id)) {
      connectToLive(target.system_id, target.username);
    }
  }
}

// 5. ライブ接続ロジック
function connectToLive(systemId, username) {
  const currentRetry = retryCounts.get(systemId) || 0;
  console.log(`🚀 [${username} (${systemId})] 接続試行中... (リトライ回数: ${currentRetry})`);

  const connection = new WebcastPushConnection(username, {
    processInitialData: false,
    enableExtendedGiftInfo: true,
    enableWebsocketUpgrade: true,
    requestPollingIntervalMs: 2000,
    clientParams: {
      "app_language": "ja-JP",
      "device_platform": "web"
    }
  });

  connection.connect().then(state => {
    console.log(`✅ [${username}] 接続成功! RoomID: ${state.roomId}`);
    activeConnections.set(systemId, connection);
    retryCounts.delete(systemId); 

    connection.on('chat', async (data) => {
      await saveEvent(systemId, 'comment', {
        username: data.uniqueId,
        display_name: data.nickname,
        comment_text: data.comment,
        profile_picture_url: data.profilePictureUrl
      });
    });

    connection.on('gift', async (data) => {
      if (data.giftType === 1 && !data.repeatEnd) return; 
      await saveEvent(systemId, 'gift', {
        username: data.uniqueId,
        display_name: data.nickname,
        comment_text: `ギフトを送信しました`,
        gift_id: data.giftId,
        gift_name: data.giftName,
        gift_value: data.diamondCount * data.repeatCount,
        profile_picture_url: data.profilePictureUrl
      });
    });

    connection.on('like', async (data) => {
      await saveEvent(systemId, 'like', {
        username: data.uniqueId,
        display_name: data.nickname,
        comment_text: `いいねを${data.likeCount}回送りました`,
        profile_picture_url: data.profilePictureUrl
      });
    });

    connection.on('member', async (data) => {
      await saveEvent(systemId, 'join', {
        username: data.uniqueId,
        display_name: data.nickname,
        comment_text: `配信に参加しました`,
        profile_picture_url: data.profilePictureUrl
      });
    });

  }).catch(err => {
    console.error(`❌ [${username}] 接続エラー:`, err.message);
    handleDisconnect(systemId, username);
  });

  connection.on('disconnected', () => {
    console.log(`🔌 [${username}] 切断されました。`);
    handleDisconnect(systemId, username);
  });

  connection.on('error', err => {
    console.error(`⚠️ [${username}] エラー発生:`, err.message);
  });
}

// 6. 切断時の自動再接続（バックオフ）
function handleDisconnect(systemId, username) {
  activeConnections.delete(systemId);
  const currentRetry = retryCounts.get(systemId) || 0;
  
  if (currentRetry >= MAX_RETRIES) {
    console.log(`🛑 [${username}] 最大リトライ回数(${MAX_RETRIES})に達しました。一時停止します。`);
    return;
  }

  const delay = BASE_RETRY_DELAY * Math.pow(2, currentRetry);
  retryCounts.set(systemId, currentRetry + 1);
  
  console.log(`⏳ [${username}] ${delay / 1000}秒後に再接続します...`);
  const timeout = setTimeout(() => {
    retryTimeouts.delete(systemId);
    connectToLive(systemId, username);
  }, delay);
  
  retryTimeouts.set(systemId, timeout);
}

// 7. DB保存ロジック
async function saveEvent(systemId, eventType, data) {
  const { error } = await supabase
    .from('live_comments')
    .insert({
      target_id: systemId,
      event_type: eventType,
      username: data.username,
      display_name: data.display_name,
      comment_text: data.comment_text,
      gift_id: data.gift_id || null,
      gift_name: data.gift_name || null,
      gift_value: data.gift_value || 0,
      profile_picture_url: data.profile_picture_url || null
    });

  if (error) {
    console.error(`❌ DB保存エラー (${eventType}):`, error.message);
  }
}

checkTargets();
setInterval(checkTargets, 30000);