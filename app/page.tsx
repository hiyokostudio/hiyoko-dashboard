'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../utils/supabase';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Activity, Coins, Users, Radio, Clock, Calendar, Globe } from 'lucide-react';
import { format } from 'date-fns';

type GiftLog = {
  id: number;
  created_at: string;
  coins: number;
  viewers: { name: string } | null;
};

type DashboardStats = {
  today: number;
  month: number;
  total: number;
};

export default function Dashboard() {
  const [logs, setLogs] = useState<GiftLog[]>([]);
  const [stats, setStats] = useState<DashboardStats>({ today: 0, month: 0, total: 0 });
  const [activeTab, setActiveTab] = useState<'today' | 'month' | 'total'>('today');

  useEffect(() => {
    fetchData();
    setupRealtimeSubscription();
  }, []);

  const fetchData = async () => {
    // フィルターを解除し、純粋に最新50件を取得
    const { data: recentLogs } = await supabase
      .from('gift_logs')
      .select('id, created_at, coins, viewers(name)')
      .order('created_at', { ascending: false })
      .limit(50);
    
    if (recentLogs) setLogs(recentLogs as unknown as GiftLog[]);

    // 修正したRPC関数（ID指定なし）を呼び出す
    const { data: statsData, error } = await supabase.rpc('get_dashboard_stats');
    
    if (statsData && !error) {
      setStats(statsData as DashboardStats);
    }
  };

  const setupRealtimeSubscription = () => {
    supabase
      .channel('public:gift_logs')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'gift_logs' },
        async (payload) => {
          const { data: viewerData } = await supabase
            .from('viewers')
            .select('name')
            .eq('id', payload.new.viewer_id)
            .single();

          const newLog: GiftLog = {
            id: payload.new.id,
            created_at: payload.new.created_at,
            coins: payload.new.coins,
            viewers: { name: viewerData?.name || '不明なユーザー' },
          };

          setLogs((prev) => [newLog, ...prev].slice(0, 50));
          setStats((prev) => ({
            today: prev.today + payload.new.coins,
            month: prev.month + payload.new.coins,
            total: prev.total + payload.new.coins
          }));
        }
      )
      .subscribe();
  };

  const chartData = logs.slice().reverse().map(log => ({
    time: format(new Date(log.created_at), 'HH:mm'),
    coins: log.coins
  }));

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 p-4 md:p-8 font-sans selection:bg-indigo-500/30">
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* ヘッダー（ダミーの稼働中バッジを削除） */}
        <header className="border-b border-slate-800 pb-6">
          <h1 className="text-3xl font-bold tracking-tight text-white">
            Hiyoko <span className="text-indigo-400">Analytics</span>
          </h1>
          <p className="text-slate-400 mt-1 text-sm">TikTok Live 収益トラッキングシステム</p>
        </header>

        {/* 期間切り替えタブ */}
        <div className="flex space-x-2 bg-slate-900/50 p-1 rounded-lg w-fit border border-slate-800">
          <button
            onClick={() => setActiveTab('today')}
            className={`flex items-center px-4 py-2 rounded-md text-sm font-medium transition-all ${activeTab === 'today' ? 'bg-indigo-500 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'}`}
          >
            <Clock size={16} className="mr-2" /> 本日
          </button>
          <button
            onClick={() => setActiveTab('month')}
            className={`flex items-center px-4 py-2 rounded-md text-sm font-medium transition-all ${activeTab === 'month' ? 'bg-indigo-500 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'}`}
          >
            <Calendar size={16} className="mr-2" /> 今月
          </button>
          <button
            onClick={() => setActiveTab('total')}
            className={`flex items-center px-4 py-2 rounded-md text-sm font-medium transition-all ${activeTab === 'total' ? 'bg-indigo-500 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'}`}
          >
            <Globe size={16} className="mr-2" /> 全期間
          </button>
        </div>

        {/* KPIカード群 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-sm relative overflow-hidden">
            <div className="absolute top-0 right-0 p-6 opacity-5">
              <Coins size={80} />
            </div>
            <p className="text-sm font-medium text-slate-400 mb-2">
              {activeTab === 'today' ? '本日の収益' : activeTab === 'month' ? '今月の収益' : '累計収益'} (ダイヤ)
            </p>
            <h2 className="text-4xl font-extrabold text-white tracking-tight">
              {stats[activeTab].toLocaleString()}
            </h2>
            <p className="text-xs text-indigo-400 mt-3 flex items-center">
              <Activity size={14} className="mr-1" /> リアルタイム更新
            </p>
          </div>
          
          <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-sm relative overflow-hidden">
            <div className="absolute top-0 right-0 p-6 opacity-5">
              <Users size={80} />
            </div>
            <p className="text-sm font-medium text-slate-400 mb-2">直近のトランザクション</p>
            <h2 className="text-4xl font-extrabold text-white tracking-tight">
              {logs.length}
            </h2>
            <p className="text-xs text-slate-500 mt-3">最新50件のイベント</p>
          </div>

          <div className="bg-gradient-to-br from-indigo-600 to-purple-700 p-6 rounded-2xl shadow-lg relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-20">
              <Radio size={80} />
            </div>
            <p className="text-sm font-medium text-indigo-100 mb-2">監視対象ライバー</p>
            <h2 className="text-2xl font-bold text-white tracking-tight mt-1 truncate">
              pyokotan_54
            </h2>
            <p className="text-xs text-indigo-200 mt-3">24時間365日 監視実行中</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[500px]">
          
          <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm flex flex-col">
            <h3 className="text-lg font-semibold text-slate-200 mb-6 flex items-center">
              <Activity className="mr-2 h-5 w-5 text-indigo-400" />
              直近の収益トレンド
            </h3>
            <div className="flex-grow w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorCoins" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#818cf8" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#818cf8" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                  <XAxis dataKey="time" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `${value}`} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', borderRadius: '8px', color: '#f8fafc' }}
                    itemStyle={{ color: '#818cf8' }}
                    formatter={(value: any) => [`${value} ダイヤ`, '収益']}
                    labelFormatter={(label) => `${label} のイベント`}
                  />
                  <Area type="monotone" dataKey="coins" stroke="#818cf8" strokeWidth={3} fillOpacity={1} fill="url(#colorCoins)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm flex flex-col overflow-hidden">
            <h3 className="text-lg font-semibold text-slate-200 mb-4 flex items-center pb-4 border-b border-slate-800">
              <Coins className="mr-2 h-5 w-5 text-amber-400" />
              リアルタイム受信ログ
            </h3>
            <div className="flex-grow overflow-y-auto space-y-3 pr-2 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
              {logs.map((log) => (
                <div key={log.id} className="flex items-center justify-between p-3 rounded-lg bg-slate-800/30 hover:bg-slate-800/80 transition-colors border border-slate-700/50">
                  <div className="flex flex-col overflow-hidden">
                    <span className="font-medium text-slate-200 truncate text-sm">
                      {log.viewers?.name || '不明なユーザー'}
                    </span>
                    <span className="text-xs text-slate-500 mt-0.5">
                      {format(new Date(log.created_at), 'HH:mm:ss')}
                    </span>
                  </div>
                  <div className="flex items-center bg-indigo-500/10 px-3 py-1.5 rounded-full border border-indigo-500/20 whitespace-nowrap ml-2">
                    <span className="font-bold text-indigo-400 text-sm">
                      +{log.coins} ダイヤ
                    </span>
                  </div>
                </div>
              ))}
              {logs.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center text-slate-500 space-y-3">
                  <Radio className="animate-pulse h-8 w-8 opacity-50" />
                  <p className="text-sm">ギフトの受信を待機しています...</p>
                </div>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}