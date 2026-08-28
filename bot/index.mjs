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

// 接続中のライバーを管理するリスト
const activeConnections = new Map();

async function startBot() {
  console.log('🤖 複数人監視Botを起動します...');
  // 1分ごとにデータベースの名簿をチェック
  setInterval(checkTargets, 60000);
  checkTargets();
}

async function checkTargets() {
  const { data: targets } = await supabase
    .from('target_livers')
    .select('username')
    .eq('is_active', true);
    
  if (!targets) return;

  const activeUsernames = targets.map(t => t.username);

  // 名簿にあって、まだ接続していないライバーに接続開始
  for (const username of activeUsernames) {
    if (!activeConnections.has(username)) {
      connectToLive(username);
    }
  }
}

function connectToLive(username) {
  console.log(`[${username}] 接続準備中...`);
  const connection = new WebcastPushConnection(username);
  activeConnections.set(username, connection);

  connection.connect().then(state => {
    console.log(`✅ [${username}] 接続成功! 配信ルームID: ${state.roomId}`);
  }).catch(err => {
    console.error(`❌ [${username}] 接続エラー:`, err.message);
    activeConnections.delete(username);
  });

  connection.on('gift', async data => {
    if (data.giftType === 1 && !data.repeatEnd) return;
    const coins = data.diamondCount * (data.repeatCount || 1);
    console.log(`🎁 [${username}] ${data.nickname} から ${coins} ダイヤ`);

    const { data: viewer } = await supabase
      .from('viewers')
      .upsert(
        { id: data.userId.toString(), name: data.nickname, updated_at: new Date().toISOString() }, 
        { onConflict: 'id' }
      )
      .select('id')
      .single();

    // liver_idにユーザー名を入れて保存（誰のデータか分かるようにする）
    await supabase.from('gift_logs').insert({
      liver_id: username,
      viewer_id: viewer.id,
      gift_id: data.giftId.toString(),
      coins: coins,
      count: data.repeatCount || 1
    });
  });

  connection.on('streamEnd', () => {
    console.log(`🔴 [${username}] 配信終了`);
    activeConnections.delete(username);
  });
}

startBot();