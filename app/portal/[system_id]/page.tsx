// app/portal/[system_id]/page.tsx
'use client';

import { useEffect, useState, use } from 'react';
import { supabase } from '@/utils/supabase';
import { Flame, Coins, Activity, Zap, TrendingUp } from 'lucide-react';

type GiftLog = { id: number; coins: number; viewers: { name: string } | null; };

export default function LiverPortal({ params }: { params: Promise<{ system_id: string }> }) {
  const { system_id } = use(params);
  
  const [liverInfo, setLiverInfo] = useState<{ username: string; avatar_url: string | null; reward_rate: number } | null>(null);
  const [todayCoins, setTodayCoins] = useState(0);
  const [exchangeRate, setExchangeRate] = useState(145.00);
  const [recentLogs, setRecentLogs] = useState<GiftLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchInitialData();
    
    // リアルタイムギフト受信サブスクリプション
    const channel = supabase.channel(`portal:${system_id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'gift_logs', filter: `liver_id=eq.${system_id}` }, async (payload) => {
        // 今日の売上に加算
        const logDate = new Date(payload.new.created_at).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
        const todayStr = new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }).split(' ')[0];
        if (logDate.startsWith(todayStr)) {
          setTodayCoins(prev => prev + payload.new.coins);
        }
        
        // 最新ログに追加
        const { data: viewerData } = await supabase.from('viewers').select('name').eq('id', payload.new.viewer_id).single();
        const newLog: GiftLog = { id: payload.new.id, coins: payload.new.coins, viewers: { name: viewerData?.name || '不明' } };
        setRecentLogs(prev => [newLog, ...prev].slice(0, 10));
      }).subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [system_id]);

  const fetchInitialData = async () => {
    // 1. ライバー情報と報酬率の取得
    const { data: liver } = await supabase.from('target_livers').select('username, avatar_url, reward_rate').eq('system_id', system_id).single();
    if (liver) setLiverInfo(liver as any);

    // 2. 本日のダイヤ取得 (JST)
    const today = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));
    today.setHours(0, 0, 0, 0);
    const startIso = new Date(today.getTime() - 9 * 60 * 60 * 1000).toISOString();

    const { data: logs } = await supabase.from('gift_logs').select('id, coins, viewers(name)').eq('liver_id', system_id).gte('created_at', startIso).order('created_at', { ascending: false });
    
    if (logs) {
      setTodayCoins(logs.reduce((sum, log) => sum + log.coins, 0));
      setRecentLogs(logs.slice(0, 10) as unknown as GiftLog[]);
    }

    // 3. 為替レート取得 (自社API経由)
    try {
      const res = await fetch('/api/exchange');
      const data = await res.json();
      if (data.rate) setExchangeRate(data.rate);
    } catch (e) { console.error('為替取得エラー'); }

    setLoading(false);
  };

  if (loading) return <div className="min-h-screen bg-slate-950 flex items-center justify-center font-black text-indigo-500 animate-pulse">CONNECTING...</div>;
  if (!liverInfo) return <div className="min-h-screen bg-slate-950 flex items-center justify-center font-black text-rose-500">LIVER NOT FOUND</div>;

  // 社長と確定した究極の報酬計算ロジック
  // 報酬(円) = (ダイヤ × (報酬率 / 10000)) × 為替レート
  const currentRewardUSD = todayCoins * (liverInfo.reward_rate / 10000);
  const currentRewardJPY = Math.floor(currentRewardUSD * exchangeRate);

  // 1Kあたりのドル単価
  const unitPriceUSD = (1000 * (liverInfo.reward_rate / 10000)).toFixed(2);

  return (
    <div className="min-h-screen bg-[#050505] text-slate-50 font-sans sm:pb-0 pb-10">
      {/* スマホ特化のレイアウト幅制限 */}
      <div className="max-w-md mx-auto min-h-screen bg-[#0A0A0A] border-x border-slate-900/50 shadow-2xl relative overflow-hidden flex flex-col">
        
        {/* バックグラウンドエフェクト */}
        <div className="absolute top-[-10%] left-[-20%] w-[140%] h-[40%] bg-indigo-600/20 blur-[120px] rounded-full pointer-events-none"></div>

        {/* ヘッダー */}
        <header className="px-6 pt-10 pb-6 flex items-center justify-between relative z-10">
          <div className="flex items-center gap-4">
            {liverInfo.avatar_url ? (
              <img src={liverInfo.avatar_url} className="w-12 h-12 rounded-full border-2 border-indigo-500/50 object-cover shadow-[0_0_15px_rgba(99,102,241,0.4)]" alt=""/>
            ) : (
              <div className="w-12 h-12 rounded-full bg-indigo-500/20 border-2 border-indigo-500/50 flex items-center justify-center text-indigo-300 font-bold text-xl shadow-[0_0_15px_rgba(99,102,241,0.4)]">{liverInfo.username.charAt(0).toUpperCase()}</div>
            )}
            <div>
              <h1 className="text-lg font-black tracking-tight text-white">{liverInfo.username}</h1>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="flex items-center text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20"><Activity size={10} className="mr-1" /> ONLINE</span>
              </div>
            </div>
          </div>
        </header>

        {/* メイン報酬ディスプレイ */}
        <div className="px-6 relative z-10 flex-grow flex flex-col">
          <div className="bg-gradient-to-br from-slate-900/80 to-black border border-slate-800/80 p-6 rounded-3xl shadow-2xl backdrop-blur-md relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-10"><Zap size={100} className="text-indigo-400"/></div>
            
            <p className="text-xs font-black text-slate-400 tracking-widest uppercase mb-1 flex items-center"><TrendingUp size={12} className="mr-1.5 text-indigo-400"/> 本日の推定報酬</p>
            <div className="flex items-baseline gap-1 mt-2">
              <span className="text-3xl font-black text-indigo-400">¥</span>
              <span className="text-6xl font-black text-white tracking-tighter tabular-nums drop-shadow-[0_0_15px_rgba(255,255,255,0.2)]">
                {currentRewardJPY.toLocaleString()}
              </span>
            </div>
            
            <div className="mt-6 flex items-center gap-4 border-t border-slate-800/80 pt-4">
              <div className="flex-1">
                <p className="text-[10px] font-bold text-slate-500 uppercase">獲得ダイヤ</p>
                <p className="text-xl font-black text-slate-200 tabular-nums flex items-center gap-1.5 mt-0.5"><Coins size={14} className="text-amber-400"/> {todayCoins.toLocaleString()}</p>
              </div>
              <div className="w-px h-8 bg-slate-800"></div>
              <div className="flex-1">
                <p className="text-[10px] font-bold text-slate-500 uppercase">現在レート / 1K</p>
                <p className="text-xl font-black text-slate-200 tabular-nums mt-0.5">${unitPriceUSD} <span className="text-[10px] text-emerald-400 font-bold ml-1">({liverInfo.reward_rate}%)</span></p>
              </div>
            </div>
            <div className="mt-4 bg-slate-950/50 rounded-xl p-3 flex justify-between items-center border border-slate-800/50">
               <span className="text-[10px] font-bold text-slate-500">リアルタイム為替</span>
               <span className="text-xs font-black text-slate-300">1 USD = {exchangeRate.toFixed(2)} JPY</span>
            </div>
          </div>

          {/* リアルタイム受信フィード */}
          <div className="mt-8 flex-grow flex flex-col min-h-0">
            <h2 className="text-xs font-black text-slate-400 tracking-widest uppercase mb-4 flex items-center"><Flame size={14} className="mr-1.5 text-orange-500"/> Live Activity</h2>
            
            <div className="flex-grow overflow-y-auto space-y-3 pr-2 pb-6 scrollbar-none">
              {recentLogs.map((log, i) => (
                <div key={log.id} className={`flex items-center justify-between p-4 rounded-2xl border transition-all duration-500 ${i === 0 ? 'bg-indigo-600/10 border-indigo-500/30 shadow-[0_0_15px_rgba(99,102,241,0.1)]' : 'bg-slate-900/40 border-slate-800/50'}`}>
                  <div className="font-bold text-sm text-slate-200 truncate pr-4">{log.viewers?.name || '不明'}</div>
                  <div className="flex items-center gap-1 bg-gradient-to-r from-amber-500/20 to-orange-500/20 px-3 py-1 rounded-full border border-amber-500/20 flex-shrink-0">
                    <Coins size={12} className="text-amber-400"/>
                    <span className="font-black text-amber-400 text-xs">+{log.coins}</span>
                  </div>
                </div>
              ))}
              {recentLogs.length === 0 && (
                <div className="text-center py-10 text-slate-600 text-xs font-bold uppercase tracking-widest">待機中...</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}