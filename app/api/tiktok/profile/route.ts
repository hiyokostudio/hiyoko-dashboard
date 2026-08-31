import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const username = searchParams.get('username');

  if (!username) {
    return NextResponse.json({ error: 'Username is required' }, { status: 400 });
  }

  const cleanUsername = username.replace('@', '').trim();

  try {
    // 【最強戦略1】Googlebotに偽装してBot対策をすり抜け、完全なデータ（画像含む）を抜く
    const directResponse = await fetch(`https://www.tiktok.com/@${cleanUsername}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
      },
      cache: 'no-store'
    });

    if (directResponse.ok) {
      const html = await directResponse.text();
      const scriptRegex = /<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application\/json">([^<]+)<\/script>/;
      const match = html.match(scriptRegex);

      if (match && match[1]) {
        const data = JSON.parse(match[1]);
        const userDetail = data?.__DEFAULT_SCOPE__?.['webapp.user-detail'];
        const userInfo = userDetail?.userInfo?.user;

        if (userInfo && userInfo.id) {
          return NextResponse.json({
            userId: userInfo.id, // 完璧なシステムID
            username: userInfo.uniqueId,
            nickname: userInfo.nickname,
            avatarUrl: userInfo.avatarLarger || userInfo.avatarMedium || userInfo.avatarThumb
          });
        }
      }
    }

    // 【最強戦略2】万が一戦略1が弾かれた場合、Botシステムと同じ迂回サーバーを自動経由する
    const proxyResponse = await fetch(`https://api.tik.tools/v1/user/${cleanUsername}`, {
      cache: 'no-store'
    });

    if (!proxyResponse.ok) throw new Error('APIブロックを検知しました');
    
    const proxyData = await proxyResponse.json();
    const proxyUser = proxyData?.userInfo?.user || proxyData?.user || proxyData;

    if (!proxyUser || (!proxyUser.uid && !proxyUser.id)) {
      throw new Error('システムIDの抽出に失敗しました');
    }

    return NextResponse.json({
      userId: proxyUser.uid || proxyUser.id,
      username: proxyUser.uniqueId || proxyUser.unique_id || cleanUsername,
      nickname: proxyUser.nickname || cleanUsername,
      avatarUrl: proxyUser.avatarLarger || proxyUser.avatar_url || ''
    });

  } catch (error: any) {
    console.error('TikTok Fetch Error:', error);
    // 完全にブロックされた場合のみエラーを返す
    return NextResponse.json({ error: '取得ブロック' }, { status: 500 });
  }
}
