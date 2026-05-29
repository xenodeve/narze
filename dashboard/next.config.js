/** @type {import('next').NextConfig} */
const nextConfig = {
    images: {
        remotePatterns: [
            // --- YouTube ---
            { protocol: 'https', hostname: 'i.ytimg.com' },               // ปกคลิปหลัก
            { protocol: 'https', hostname: 'yt3.googleusercontent.com' }, // รูปโปรไฟล์หลัก
            { protocol: 'https', hostname: 'img.youtube.com' },           // ปกคลิปสำรอง
            { protocol: 'https', hostname: 'yt3.ggpht.com' },             // รูปโปรไฟล์เก่า

            // --- Spotify (อัปเกรด) ---
            { protocol: 'https', hostname: 'i.scdn.co' },                 // ปกอัลบั้มทั่วไป
            { protocol: 'https', hostname: 'mosaic.scdn.co' },            // ปก Playlist ทั่วไป
            { protocol: 'https', hostname: '*.scdn.co' },                 // ✅ เก็บตก Playlist พิเศษทุกแบบ (Daily Mix, This Is etc.)
            { protocol: 'https', hostname: 'image-cdn-ak.spotifycdn.com' }, // ✅ CDN ใหม่ของ Spotify

            // --- Discord & Others ---
            { protocol: 'https', hostname: 'cdn.discordapp.com' },
            { protocol: 'https', hostname: 'media.discordapp.net' },      // ✅ เผื่อไว้สำหรับรูปที่ถูก Discord Proxy
            { protocol: 'https', hostname: 'via.placeholder.com' },
            { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
        ],
    },
}

module.exports = nextConfig
