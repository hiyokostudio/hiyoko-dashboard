// app/api/exchange/route.ts
import { NextResponse } from 'next/server';

// キャッシュ設定：3600秒（1時間）ごとにバックグラウンドで最新の為替を再取得
export const revalidate = 3600; 

export async function GET() {
  try {
    const res = await fetch('https://api.frankfurter.app/latest?from=USD&to=JPY');
    if (!res.ok) throw new Error('API Error');
    const data = await res.json();
    return NextResponse.json({ rate: data.rates.JPY });
  } catch (error) {
    // 万が一APIが落ちていた場合の安全策（フォールバックレート）
    return NextResponse.json({ rate: 145.00 }, { status: 200 });
  }
}