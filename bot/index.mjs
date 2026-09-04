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
  console.error('❌ 致命的エラー: Supabaseの環境変数が設定されていません。');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
const activeConnections = new Map();
const retryCounts = new Map();
const retryTimeouts = new Map();

// 💡 コンボの進捗を記憶するキャッシュ（メモリリーク防止のため古いものから自動消去）
class GiftCache {
  constructor(limit = 5000) {
    this.cache = new Map();
    this.limit = limit;
  }
  get(key) { return this.cache.get(key); }
  set(key, value) {
    if (this.cache.size >= this.limit) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    this.cache.set(key, value);
  }
}
const comboCache = new GiftCache(5000);

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

const getStrId = (val) => {
  if (!val) return null;
  if (typeof val === 'object' && typeof val.toString === 'function') {
    const str = val.toString();
    if (str === '[object Object]') return null;
    return str;
  }
  return String(val);
};

console.log('🤖 Hiyoko Intelligence: 監視Botエンジン起動 (v8 究極差分ロジック・リアルタイム捕捉版)');

async function startBot() {
  setInterval(checkTargets, 30000);
  checkTargets();
}

async function checkTargets() {
  const { data: targets, error } = await supabase.from('target_livers').select('system_id, username, liver_name, avatar_url').eq('is_active', true);
  if (error) return;

  const activeSystemIds = new Set(targets.map(t => t.system_id));

  for (const [systemId, connection] of activeConnections.entries()) {
    if (!activeSystemIds.has(systemId)) {
      console.log(`⏹️ [${systemId}] 監視対象から外れました。通信を切断します。`);
      try { connection.disconnect(); } catch (e) {}
      activeConnections.delete(systemId);
      retryCounts.delete(systemId);
      if (retryTimeouts.has(systemId)) clearTimeout(retryTimeouts.get(systemId));
    }
  }

  for (const target of targets) {
    if (!activeConnections.has(target.system_id) && !retryTimeouts.has(target.system_id)) {
      connectToLive(target.system_id, target.username, target.liver_name, target.avatar_url);
    }
  }
}

function getBackoffDelay(retryCount) {
  return Math.min(2000 * Math.pow(2, retryCount), 60000) + Math.random() * 1000;
}

async function fetchLiverProfile(username) {
  try {
    const headers = {
      'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'ja-JP,ja;q=0.9,en-US;q=0.8,en;q=0.7'
    };

    let response = await fetch(`https://www.tiktok.com/@${username}?lang=ja-JP`, { headers });
    if (!response.ok) {
      response = await fetch(`https://m.tiktok.com/node/share/user/@${username}`, { headers });
    }
    
    if (!response.ok) return null;
    
    const html = await response.text();
    const scriptRegex = /<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application\/json">([^<]+)<\/script>/;
    const match = html.match(scriptRegex);

    if (match && match[1]) {
      const data = JSON.parse(match[1]);
      const userInfo = data?.__DEFAULT_SCOPE__?.['webapp.user-detail']?.userInfo?.user;
      if (userInfo) {
        return {
          nickname: userInfo.nickname,
          avatarUrl: userInfo.avatarLarger || userInfo.avatarMedium || userInfo.avatarThumb
        };
      }
    }
    
    try {
      const json = JSON.parse(html);
      const userInfo = json?.userInfo?.user;
      if (userInfo) {
        return {
          nickname: userInfo.nickname,
          avatarUrl: userInfo.avatarLarger || userInfo.avatarMedium || userInfo.avatarThumb
        };
      }
    } catch (e) {}

  } catch (err) {
    return null;
  }
  return null;
}

function connectToLive(systemId, username, currentLiverName, currentAvatarUrl) {
  const currentRetry = retryCounts.get(systemId) || 0;
  console.log(`📡 [${username}] 接続を試行中... (リトライ回数: ${currentRetry})`);
  
  const connection = new TikTokLiveConnection(username, {
    processInitialData: false,
    enableExtendedGiftInfo: false,
    clientParams: { "app_language": "ja-JP", "device_platform": "web" }
  });
  
  activeConnections.set(systemId, connection);

  connection.connect().then(async state => {
    console.log(`✅ [${username}] ライブ接続成功！ (RoomID: ${state.roomId})`);
    retryCounts.set(systemId, 0); 
    try {
      let newAvatarUrl = null;
      let newLiverName = null;

      const owner = state?.roomInfo?.owner || state?.roomData?.owner || state?.upInfo || {};
      newAvatarUrl = owner.avatarThumb?.urlList?.[0] || owner.avatar_thumb?.url_list?.[0] || owner.avatarUrl || null;
      newLiverName = owner.nickname || owner.displayId || null;

      if (!newAvatarUrl || !newLiverName) {
        const profile = await fetchLiverProfile(username);
        if (profile) {
          if (!newAvatarUrl && profile.avatarUrl) newAvatarUrl = profile.avatarUrl;
          if (!newLiverName && profile.nickname) newLiverName = profile.nickname;
        }
      }

      const updateData = {};
      
      if (newAvatarUrl && newAvatarUrl.length <= 250 && newAvatarUrl !== currentAvatarUrl) {
        if (!newAvatarUrl.includes('tiktok_logo')) {
          updateData.avatar_url = newAvatarUrl;
        }
      }
      
      if (newLiverName && newLiverName !== currentLiverName) {
        if (!newLiverName.toLowerCase().includes('tiktok - make your day') && !newLiverName.toLowerCase().includes('tiktok')) {
          updateData.liver_name = newLiverName;
        }
      }

      if (Object.keys(updateData).length > 0) {
        await supabase.from('target_livers').update(updateData).eq('system_id', systemId);
        console.log(`🔄 [${username}] プロフィール情報（名前 / アイコン）を最新版に自動修復しました`);
      }
    } catch (e) {}
  }).catch(err => {
    handleDisconnect(systemId, username, false);
  });

  connection.on('gift', async data => {
    try {
      const giftName = data.giftName || data.gift?.name || data.gift?.describe || '不明なギフト';
      const currentRepeatCount = data.repeatCount || 1;
      
      const groupId = getStrId(data.groupId) || getStrId(data.gift?.groupId) || getStrId(data.msgId);
      let diffCount = currentRepeatCount;

      // 💡 差分計算（Diff）ロジック
      if (groupId) {
        const prevCount = comboCache.get(groupId) || 0;
        diffCount = currentRepeatCount - prevCount;
        
        // 差分が0以下（重複通知や遅延した古い通知）の場合は完全に弾く
        if (diffCount <= 0) return;
        
        // キャッシュを最新の連打数に更新
        comboCache.set(groupId, currentRepeatCount);
      }

      let diamondCount = data.diamondCount || data.gift?.diamondCount || data.gift?.diamond_count || data.gift?.coinCount || 0;
      if (diamondCount === 0) diamondCount = GIFT_PRICES[giftName] || 0;
      
      // 💡 確実な単価 × 増えた分（差分）の数
      const coins = diamondCount * diffCount;

      if (coins <= 0) return;

      const rawUserId = getStrId(data.userId) || getStrId(data.user?.userId) || getStrId(data.user?.id) || getStrId(data.user?.uid);
      const uniqueId = data.uniqueId || data.user?.uniqueId || data.user?.displayId || data.user?.display_id || 'unknown';
      const nickname = data.nickname || data.user?.nickname || '名無し';
      
      const immutableUserId = rawUserId ? String(rawUserId) : `unknown_${uniqueId}_${nickname}_${Date.now()}`; 
      
      let profilePic = data.profilePictureUrl || data.user?.profilePictureUrl || null;
      if (!profilePic && data.user?.avatarThumb?.urlList?.length > 0) profilePic = data.user.avatarThumb.urlList[0];
      if (!profilePic && data.user?.avatarMedium?.urlList?.length > 0) profilePic = data.user.avatarMedium.urlList[0];
      
      if (profilePic && profilePic.length > 250) profilePic = profilePic.substring(0, 250);

      const rawGiftId = getStrId(data.giftId) || getStrId(data.gift?.id) || getStrId(data.gift?.gift_id) || 'unknown_gift';

      let viewerId;
      const { data: existingViewers, error: searchError } = await supabase.from('viewers').select('id').eq('tiktok_id', immutableUserId).limit(1);

      if (searchError) return;

      if (existingViewers && existingViewers.length > 0) {
        viewerId = existingViewers[0].id;
        await supabase.from('viewers').update({ unique_id: uniqueId, name: nickname, avatar_url: profilePic, updated_at: new Date().toISOString() }).eq('id', viewerId);
      } else {
        const { data: newViewer, error: insertError } = await supabase.from('viewers').insert({ tiktok_id: immutableUserId, unique_id: uniqueId, name: nickname, avatar_url: profilePic }).select('id').single();
        if (insertError) return;
        viewerId = newViewer.id;
      }

      const { error: insertError } = await supabase.from('gift_logs').insert({ liver_id: systemId, viewer_id: viewerId, gift_id: String(rawGiftId), gift_name: giftName, coins: coins, count: diffCount });
      
      if (!insertError) {
        console.log(`🎁 [${username}] ギフト記録完了: ${nickname} から ${giftName} x${diffCount} (+${coins}ダイヤ) [現在コンボ: ${currentRepeatCount}]`);
      }
    } catch (e) {}
  });

  connection.on('streamEnd', () => {
    console.log(`🔴 [${username}] ライブ配信が終了しました`);
    handleDisconnect(systemId, username, true);
  });

  connection.on('disconnected', () => {
    handleDisconnect(systemId, username, false);
  });

  connection.on('error', err => {});
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

  if (retryTimeouts.has(systemId)) clearTimeout(retryTimeouts.get(systemId));

  const timeoutId = setTimeout(() => {
    retryTimeouts.delete(systemId);
    supabase.from('target_livers').select('is_active').eq('system_id', systemId).single()
      .then(({ data }) => { 
        if (data && data.is_active) connectToLive(systemId, username); 
        else console.log(`⏹️ [${username}] 監視対象から外れたため再接続をキャンセルしました`);
      })
      .catch(() => connectToLive(systemId, username));
  }, delay);

  retryTimeouts.set(systemId, timeoutId);
}

startBot();