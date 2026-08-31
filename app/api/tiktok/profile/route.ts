export const dynamic = 'force-dynamic'; // ★諸悪の根源（キャッシュ）を破壊する1行

import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const username = searchParams.get('username');

  if (!username) {
    return NextResponse.json({ error: 'Username is required' }, { status: 400 });
  }

  const cleanUsername = username.replace('@', '').trim();

  try {
    // TikTokのプロフィールページを裏側で取得
    const response = await fetch(`https://www.tiktok.com/@${cleanUsername}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
      },
      next: { revalidate: 0 } 
    });

    if (!response.ok) throw new Error('TikTokプロフィールの取得に失敗しました');

    const html = await response.text();

    // 隠されたデータ（JSON）を正規表現で抽出
    const scriptRegex = /<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application\/json">([^<]+)<\/script>/;
    const match = html.match(scriptRegex);

    if (!match || !match[1]) {
       throw new Error('データが見つかりません。アカウントが存在しない可能性があります。');
    }

    const data = JSON.parse(match[1]);
    const userDetail = data?.__DEFAULT_SCOPE__?.['webapp.user-detail'];
    const userInfo = userDetail?.userInfo?.user;

    if (!userInfo || !userInfo.id) {
      throw new Error('ユーザー情報の抽出に失敗しました');
    }

    return NextResponse.json({
      userId: userInfo.id, // これが欲しかったシステムID
      username: userInfo.uniqueId,
      nickname: userInfo.nickname,
      avatarUrl: userInfo.avatarLarger || userInfo.avatarMedium || userInfo.avatarThumb
    });

  } catch (error: any) {
    console.error('TikTok Scrape Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
