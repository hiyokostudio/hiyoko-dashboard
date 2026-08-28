'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../utils/supabase';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import { Activity, DollarSign, Users, Trophy, Radio } from 'lucide-react';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';

// 型定義
type GiftLog = {
  id: number;
  created_at: string;
  coins: number;
  viewers: { name: string } | null;
};

type TopViewer = {
  name: string;
  total_coins: number;
};

export default function Dashboard() {
  const [logs, setLogs] = useState<GiftLog[]>([]);
  const [totalCoins, setTotalCoins] = useState(0);
  const [topViewers, setTopViewers] = useState<TopViewer[]>([]);
  const [isLive, setIsLive] = useState(false); // 配信ステータス（擬似）

  useEffect(() => {
    fetchInitialData();
    setupRealtimeSubscription();
  }, []);

  // 初期データの取得
  const fetchInitialData = async () => {
    // 最新のギフト履歴（直近50件）
    const { data: recentLogs } = await supabase
      .from('gift_logs')
      .select('id, created_at, coins, viewers(name)')
      .order('created_at', { ascending: false })
      .limit(50);

    if (recentLogs) setLogs(recentLogs as unknown as GiftLog[]);

    // 総ダイヤ数の計算
    const { data: allLogs } = await supabase.from('gift_logs').select('coins');
    if (allLogs) {
      const total = allLogs.reduce((sum, log) => sum + log.coins, 0);
      setTotalCoins(total);
    }
  };

  // リアルタイム通信のセットアップ（最先端SaaSの要）
  const setupRealtimeSubscription = () => {
    supabase
      .channel('public:gift_logs')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'gift_logs' },
        async (payload) => {
          // 新しいギフトが飛んできたら、viewerの名前を取得してStateに追加
          const { data: viewerData } = await supabase
            .from('viewers')
            .select('name')
            .eq('id', payload.new.viewer_id)
            .single();

          const newLog: GiftLog = {
            id: payload.new.id,
            created_at: payload.new.created_at,
            coins: payload.new.coins,
            viewers: { name: viewerData?.name || 'Unknown' },
          };

          // アニメーションを伴って画面を更新
          setLogs((prev) => [newLog, ...prev].slice(0, 50));
          setTotalCoins((prev) => prev + payload.new.coins);
          setIsLive(true);
        }
      )
      .subscribe();
  };

  // グラフ用データの整形（時間ごとの集計）
  const chartData = logs.reduce((acc: any[], log) => {
    const time = format(new Date(log.created_at), 'HH:mm');
    const existing = acc.find(d => d.time === time);
    if (existing) {
      existing.coins += log.coins;
    } else {
      acc.unshift({ time, coins: log.coins }); // 古い順にするためにunshift
    }
    return acc;
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 p-6 font-sans selection:bg-indigo-500/30">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* ヘッダーセクション */}
        <header className="flex items-center justify-between border-b border-slate-800 pb-6">
          <div>
            <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-indigo-400 to-cyan-400 bg-clip-text text-transparent">
              Hiyoko Analytics
            </h1>
            <p className="text-slate-400 mt-1">TikTok Live Revenue Tracker</p>
          </div>
          <div className="flex items-center space-x-3 bg-slate-900 px-4 py-2 rounded-full border border-slate-800 shadow-inner">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
            </span>
            <span className="text-sm font-medium text-emerald-400 tracking-wider uppercase">System Active</span>
          </div>
        </header>

        {/* KPIカードセクション */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-sm relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <DollarSign size={64} />
            </div>
            <p className="text-sm font-medium text-slate-400 mb-1">Total Revenue (Diamonds)</p>
            <h2 className="text-4xl font-extrabold text-white tracking-tight">
              {totalCoins.toLocaleString()}
            </h2>
            <p className="text-xs text-indigo-400 mt-2 flex items-center">
              <Activity size={14} className="mr-1" /> Real-time updated
            </p>
          </div>
          
          <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-sm relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <Users size={64} />
            </div>
            <p className="text-sm font-medium text-slate-400 mb-1">Recent Transactions</p>
            <h2 className="text-4xl font-extrabold text-white tracking-tight">
              {logs.length}
            </h2>
            <p className="text-xs text-slate-500 mt-2">Latest 50 events</p>
          </div>

          <div className="bg-gradient-to-br from-indigo-600 to-purple-700 p-6 rounded-2xl shadow-lg relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-20">
              <Radio size={64} />
            </div>
            <p className="text-sm font-medium text-indigo-100 mb-1">Live Status</p>
            <h2 className="text-3xl font-bold text-white tracking-tight mt-2">
              Listening...
            </h2>
            <p className="text-xs text-indigo-200 mt-2">Target ID: pyokotan_54</p>
          </div>
        </div>

        {/* メインコンテンツエリア */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[500px]">
          
          {/* グラフエリア */}
          <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm flex flex-col">
            <h3 className="text-lg font-semibold text-slate-200 mb-6 flex items-center">
              <Activity className="mr-2 h-5 w-5 text-indigo-400" />
              Revenue Timeline
            </h3>
            <div className="flex-grow w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorCoins" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                  <XAxis dataKey="time" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `${value}`} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', borderRadius: '8px', color: '#f8fafc' }}
                    itemStyle={{ color: '#818cf8' }}
                  />
                  <Area type="monotone" dataKey="coins" stroke="#818cf8" strokeWidth={3} fillOpacity={1} fill="url(#colorCoins)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* リアルタイムフィードバックエリア */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm flex flex-col overflow-hidden">
            <h3 className="text-lg font-semibold text-slate-200 mb-4 flex items-center pb-4 border-b border-slate-800">
              <Trophy className="mr-2 h-5 w-5 text-amber-400" />
              Live Activity Feed
            </h3>
            <div className="flex-grow overflow-y-auto space-y-3 pr-2 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
              {logs.map((log) => (
                <div key={log.id} className="flex items-center justify-between p-3 rounded-lg bg-slate-800/50 hover:bg-slate-800 transition-colors border border-slate-700/50">
                  <div className="flex flex-col">
                    <span className="font-medium text-slate-200 truncate w-32">{log.viewers?.name || 'Unknown'}</span>
                    <span className="text-xs text-slate-500">
                      {format(new Date(log.created_at), 'HH:mm:ss')}
                    </span>
                  </div>
                  <div className="flex items-center bg-indigo-500/10 px-3 py-1 rounded-full border border-indigo-500/20">
                    <span className="font-bold text-indigo-400 flex items-center">
                      +{log.coins} <DollarSign size={12} className="ml-0.5" />
                    </span>
                  </div>
                </div>
              ))}
              {logs.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center text-slate-500 space-y-2">
                  <Radio className="animate-pulse h-8 w-8 opacity-50" />
                  <p className="text-sm">Waiting for incoming gifts...</p>
                </div>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}