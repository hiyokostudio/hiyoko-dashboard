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
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
const activeConnections = new Map();
const retryCounts = new Map();
const retryTimeouts = new Map();

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

// 💡 64ビット精度の崩壊を防ぎ、本物の数字IDを正確に抽出する関数
const getStrId = (val) => {
  if (!val) return null;
  if (typeof val === 'object' && typeof val.toString === 'function') {
    const str = val.toString();
    if (str === '[object Object]') return null;
    return str;
  }
  return String(val);
};

console.log('Hiyoko Intelligence: Bot Engine Started (Production v5)');

async function startBot() {
  setInterval(checkTargets, 30000);
  checkTargets();
}

async function checkTargets() {
  const { data: targets, error } = await supabase.from('target_livers').select('system_id, username').eq('is_active', true);
  if (error) return;

  const activeSystemIds = new Set(targets.map(t => t.system_id));

  for (const [systemId, connection] of activeConnections.entries()) {
    if (!activeSystemIds.has(systemId)) {
      try { connection.disconnect(); } catch (e) {}
      activeConnections.delete(systemId);
      retryCounts.delete(systemId);
      if (retryTimeouts.has(systemId)) clearTimeout(retryTimeouts.get(systemId));
    }
  }

  for (const target of targets) {
    if (!activeConnections.has(target.system_id) && !retryTimeouts.has(target.system_id)) {
      connectToLive(target.system_id, target.username);
    }
  }
}

function getBackoffDelay(retryCount) {
  return Math.min(2000 * Math.pow(2, retryCount), 60000) + Math.random() * 1000;
}

function connectToLive(systemId, username) {
  const connection = new TikTokLiveConnection(username, {
    processInitialData: false,
    enableExtendedGiftInfo: false,
    clientParams: { "app_language": "ja-JP", "device_platform": "web" }
  });
  
  activeConnections.set(systemId, connection);

  connection.connect().then(async state => {
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
    handleDisconnect(systemId, username, false);
  });

  connection.on('gift', async data => {
    try {
      if (data.giftType === 1 && !data.repeatEnd) return; 

      const giftName = data.giftName || data.gift?.name || data.gift?.describe || 'unknown_gift';
      const repeatCount = data.repeatCount || 1;
      
      let diamondCount = data.diamondCount || data.gift?.diamondCount || data.gift?.diamond_count || data.gift?.coinCount || 0;
      if (diamondCount === 0) diamondCount = GIFT_PRICES[giftName] || 0;
      const coins = diamondCount * repeatCount;

      // 💡 正しいIDを抽出して絶対に他人と混同させない
      const rawUserId = getStrId(data.userId) || getStrId(data.user?.userId) || getStrId(data.user?.id) || getStrId(data.user?.uid);
      const uniqueId = data.uniqueId || data.user?.uniqueId || data.user?.displayId || data.user?.display_id || 'unknown';
      const nickname = data.nickname || data.user?.nickname || 'unknown';
      
      const immutableUserId = rawUserId ? String(rawUserId) : `unknown_${uniqueId}_${nickname}_${Date.now()}`; 
      
      // 💡 限界まで深い階層から本物のアイコン画像を引っこ抜く
      let profilePic = data.profilePictureUrl || data.user?.profilePictureUrl || null;
      if (!profilePic && data.user?.avatarThumb?.urlList?.length > 0) profilePic = data.user.avatarThumb.urlList[0];
      if (!profilePic && data.user?.avatarMedium?.urlList?.length > 0) profilePic = data.user.avatarMedium.urlList[0];
      
      // URL長すぎエラー防止
      if (profilePic && profilePic.length > 250) {
          profilePic = profilePic.substring(0, 250);
      }

      const rawGiftId = getStrId(data.giftId) || getStrId(data.gift?.id) || getStrId(data.gift?.gift_id) || 'unknown_gift';

      let viewerId;
      const { data: existingViewers, error: searchError } = await supabase
        .from('viewers')
        .select('id')
        .eq('tiktok_id', immutableUserId)
        .limit(1);

      if (searchError) return;

      if (existingViewers && existingViewers.length > 0) {
        viewerId = existingViewers[0].id;
        await supabase.from('viewers').update({
          unique_id: uniqueId,
          name: nickname,
          avatar_url: profilePic,
          updated_at: new Date().toISOString()
        }).eq('id', viewerId);
      } else {
        const { data: newViewer, error: insertError } = await supabase
          .from('viewers')
          .insert({
            tiktok_id: immutableUserId,
            unique_id: uniqueId,
            name: nickname,
            avatar_url: profilePic
          })
          .select('id')
          .single();

        if (insertError) return;
        viewerId = newViewer.id;
      }

      await supabase.from('gift_logs').insert({
        liver_id: systemId,
        viewer_id: viewerId,
        gift_id: String(rawGiftId),
        gift_name: giftName,
        coins: coins,
        count: repeatCount
      });

    } catch (e) {}
  });

  connection.on('streamEnd', () => {
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

  if (retryTimeouts.has(systemId)) {
    clearTimeout(retryTimeouts.get(systemId));
  }

  const timeoutId = setTimeout(() => {
    retryTimeouts.delete(systemId);
    supabase.from('target_livers').select('is_active').eq('system_id', systemId).single()
      .then(({ data }) => {
        if (data && data.is_active) connectToLive(systemId, username);
      }).catch(() => {
        connectToLive(systemId, username);
      });
  }, delay);

  retryTimeouts.set(systemId, timeoutId);
}

startBot();