'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/utils/supabase';
import Link from 'next/link';

export default function ImportPage() {
  const [livers, setLivers] = useState<any[]>([]);
  const [selectedLiver, setSelectedLiver] = useState('');
  const [pastedData, setPastedData] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');

  useEffect(() => {
    async function fetchLivers() {
      const { data } = await supabase.from('livers').select('id, name');
      if (data) {
        setLivers(data);
        if (data.length > 0) setSelectedLiver(data[0].id);
      }
    }
    fetchLivers();
  }, []);

  const handleImport = async () => {
    if (!selectedLiver || !pastedData) {
      alert('ライバーを選択し、データを貼り付けてください。');
      return;
    }

    setLoading(true);
    setStatus('データを解析中...');

    try {
      const rows = pastedData.trim().split('\n').map(row => row.split('\t'));
      const viewersMap = new Map();
      const giftLogs = [];
      const startIndex = rows[0][0].toLowerCase() === 'id' ? 1 : 0;

      for (let i = startIndex; i < rows.length; i++) {
        const row = rows[i];
        if (row.length < 6) continue;

        const createdAt = row[1];
        const username = row[2];
        const nickname = row[3];
        const coins = parseInt(row[5], 10);

        if (!username || isNaN(coins)) continue;

        if (!viewersMap.has(username)) {
          viewersMap.set(username, { id: username, name: nickname || username });
        }

        giftLogs.push({
          liver_id: selectedLiver,
          viewer_id: username,
          coins: coins,
          created_at: new Date(createdAt).toISOString(),
        });
      }

      setStatus(`リスナー ${viewersMap.size}名、ギフト履歴 ${giftLogs.length}件をデータベースに登録中...`);

      const viewersArray = Array.from(viewersMap.values());
      const { error: viewerError } = await supabase
        .from('viewers')
        .upsert(viewersArray, { onConflict: 'id' });

      if (viewerError) throw viewerError;

      const chunkSize = 1000;
      for (let i = 0; i < giftLogs.length; i += chunkSize) {
        setStatus(`ギフト履歴を登録中... (${i} / ${giftLogs.length}件)`);
        const chunk = giftLogs.slice(i, i + chunkSize);
        const { error: giftError } = await supabase.from('gift_logs').insert(chunk);
        if (giftError) throw giftError;
      }

      setStatus('🎉 すべてのデータのインポートが完了しました！');
      setPastedData('');
    } catch (error: any) {
      console.error(error);
      setStatus(`❌ エラーが発生しました: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F7F9FC] p-6 md:p-10 font-sans text-gray-900">
      <div className="max-w-3xl mx-auto bg-white rounded-3xl p-8 border border-gray-100 shadow-sm">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-gray-900">過去データ 一括インポート</h1>
            <p className="text-sm font-medium text-gray-500 mt-1">Excelのデータをコピペして流し込みます</p>
          </div>
          <Link href="/" className="px-4 py-2 text-sm font-bold text-gray-500 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
            ダッシュボードへ戻る
          </Link>
        </div>

        <div className="space-y-6">
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">1. データを紐づけるライバーを選択</label>
            <select 
              className="block w-full px-4 py-3 border border-gray-200 rounded-xl text-sm bg-gray-50 focus:ring-2 focus:ring-blue-500"
              value={selectedLiver}
              onChange={(e) => setSelectedLiver(e.target.value)}
            >
              {livers.map(liver => (
                <option key={liver.id} value={liver.id}>{liver.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">2. Excelのデータを貼り付け</label>
            <p className="text-xs text-gray-500 mb-2">※ A列(id)からF列(coins)まで、全選択してコピー＆ペーストしてください。</p>
            <textarea
              className="block w-full px-4 py-3 border border-gray-200 rounded-xl text-sm font-mono bg-gray-50 h-64 focus:ring-2 focus:ring-blue-500 whitespace-pre"
              placeholder="ここにExcelからコピーしたデータを貼り付け..."
              value={pastedData}
              onChange={(e) => setPastedData(e.target.value)}
            />
          </div>

          {status && (
            <div className={`p-4 rounded-xl text-sm font-bold ${status.includes('エラー') ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600'}`}>
              {status}
            </div>
          )}

          <div className="pt-4 text-right">
            <button 
              onClick={handleImport}
              disabled={loading || !pastedData}
              className={`bg-gray-900 text-white px-8 py-3 rounded-xl text-sm font-bold shadow-sm hover:bg-gray-800 transition-all ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              {loading ? '処理中...' : 'インポートを実行する'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}