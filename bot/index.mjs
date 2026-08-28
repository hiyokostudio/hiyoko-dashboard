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

const activeConnections = new Map();

async function startBot() {
  console.log('🤖 システムID管理型 Botを起動します...');
  setInterval(checkTargets, 60000);
  checkTargets();
}

async function checkTargets() {
  const { data: targets } = await supabase
    .from('target_livers')
    .select('system_id, username')
    .eq('is_active', true);
    
  if (!targets) return;

  for (const target of targets) {
    if (!activeConnections.has(target.system_id)) {
      connectToLive(target.system_id, target.username);
    }
  }
}

function connectToLive(systemId, username) {
  console.log(`[${username} (${systemId})] 接続準備中...`);
  const connection = new WebcastPushConnection(username);
  activeConnections.set(systemId, connection);

  connection.connect().then(state => {
    console.log(`✅ [${username}] 接続成功! RoomID: ${state.roomId}`);
  }).catch(err => {
    console.error(`❌ [${username}] 接続エラー:`, err.message);
    activeConnections.delete(systemId);
  });

  connection.on('gift', async data => {
    if (data.giftType === 1 && !data.repeatEnd) return;
    const coins = data.diamondCount * (data.repeatCount || 1);

    const { data: viewer } = await supabase
      .from('viewers')
      .upsert(
        { 
          id: data.userId.toString(),
          unique_id: data.uniqueId,
          name: data.nickname,
          avatar_url: data.profilePictureUrl, // ←追加：アイコン画像を保存
          updated_at: new Date().toISOString() 
        }, 
        { onConflict: 'id' }
      )
      .select('id')
      .single();

    // DBには「不変のシステムID」でログを保存
    await supabase.from('gift_logs').insert({
      liver_id: systemId,
      viewer_id: viewer.id,
      gift_id: data.giftId.toString(),
      coins: coins,
      count: data.repeatCount || 1
    });
  });

  connection.on('streamEnd', () => {
    console.log(`🔴 [${username}] 配信終了`);
    activeConnections.delete(systemId);
  });
}

startBot();