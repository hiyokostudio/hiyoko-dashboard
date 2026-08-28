const fs = require('fs');
const path = require('path');

// バグが潜んでいるTikTokライブラリのフォルダを指定
const dir = path.join(__dirname, 'node_modules', 'tiktok-live-connector', 'dist');

if (fs.existsSync(dir)) {
  fs.readdirSync(dir).forEach(file => {
    if (file.endsWith('.js')) {
      const filePath = path.join(dir, file);
      let content = fs.readFileSync(filePath, 'utf8');
      
      // 拡張子が省略されているバグ部分を、正しいパスに強制書き換え
      if (content.includes('tiktok-live-proto/v3')) {
        content = content.replace(/['"]tiktok-live-proto\/v3['"]/g, "'tiktok-live-proto/v3/index.js'");
        fs.writeFileSync(filePath, content);
      }
    }
  });
  console.log('✅ ライブラリの外科手術が完了しました！');
} else {
  console.log('フォルダが見つかりません。');
}