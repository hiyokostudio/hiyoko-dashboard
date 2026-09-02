import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const username = searchParams.get('username');

  if (!username) {
    return NextResponse.json({ error: 'Username is required' }, { status: 400 });
  }

  const cleanUsername = username.replace('@', '').trim();

  try {
    const headers = {
      'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'ja-JP,ja;q=0.9,en-US;q=0.8,en;q=0.7',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Upgrade-Insecure-Requests': '1',
    };

    // Botのアクセスパターンを回避する微小なランダム遅延
    await new Promise(resolve => setTimeout(resolve, Math.random() * 500 + 100));

    let response = await fetch(`https://www.tiktok.com/@${cleanUsername}?lang=ja-JP`, {
      headers,
      next: { revalidate: 0 }
    });

    if (!response.ok) {
      console.warn(`[Profile API] メインルートがブロックされました (Status: ${response.status})。フォールバックを試みます...`);
      response = await fetch(`https://m.tiktok.com/node/share/user/@${cleanUsername}`, {
        headers,
        next: { revalidate: 0 }
      });
      if (!response.ok) {
        throw new Error(`アクセスがブロックされました (Status: ${response.status})`);
      }
    }

    const html = await response.text();

    const scriptRegex = /<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application\/json">([^<]+)<\/script>/;
    const match = html.match(scriptRegex);

    if (match && match[1]) {
      const data = JSON.parse(match[1]);
      const userDetail = data?.__DEFAULT_SCOPE__?.['webapp.user-detail'];
      const userInfo = userDetail?.userInfo?.user;

      if (userInfo && userInfo.id) {
        return NextResponse.json({
          userId: userInfo.id,
          username: userInfo.uniqueId,
          nickname: userInfo.nickname,
          avatarUrl: userInfo.avatarLarger || userInfo.avatarMedium || userInfo.avatarThumb || ''
        });
      }
    }

    try {
      const json = JSON.parse(html);
      const userInfo = json?.userInfo?.user;
      if (userInfo && userInfo.id) {
        return NextResponse.json({
          userId: userInfo.id,
          username: userInfo.uniqueId,
          nickname: userInfo.nickname,
          avatarUrl: userInfo.avatarLarger || userInfo.avatarMedium || userInfo.avatarThumb || ''
        });
      }
    } catch (e) {
      // JSONパースエラーは無視
    }

    throw new Error('データが見つかりません。Bot対策WAFにより遮断されている可能性があります。');

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    console.error('TikTok Scrape Error:', errorMessage);
    
    return NextResponse.json({ 
        error: errorMessage || '通信エラーが発生しました。手動でシステムIDを入力してください。',
    }, { status: 500 });
  }
}