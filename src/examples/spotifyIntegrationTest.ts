/**
 * ตัวอย่างการใช้งาน Spotify Integration
 * สำหรับทดสอบการดึง Spotify playlist thumbnails
 */

import { getPlaylistThumbnailMain, isPlaylistUrl } from '../functions/youtube/index';
import { getSpotifyPlaylistThumbnail, isSpotifyPlaylistUrl, isSpotifyUrl } from '../functions/spotify/index';

// ตัวอย่าง URLs สำหรับทดสอบ
const testUrls = {
    spotify: {
        playlist: 'https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M',
        playlistWithParams: 'https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M?si=abc123',
        spotifyUri: 'spotify:playlist:37i9dQZF1DXcBWIGoYBM5M'
    },
    youtube: {
        playlist: 'https://www.youtube.com/playlist?list=PLrAXtmRdnEQy8V',
        musicPlaylist: 'https://music.youtube.com/playlist?list=PLrAXtmRdnEQy8V'
    }
};

/**
 * ทดสอบการตรวจสอบ URL types
 */
export async function testUrlDetection() {
    console.log('🔍 Testing URL Detection...\n');

    Object.entries(testUrls).forEach(([platform, urls]) => {
        console.log(`📱 ${platform.toUpperCase()} URLs:`);
        
        Object.entries(urls).forEach(([type, url]) => {
            console.log(`  ${type}:`);
            console.log(`    URL: ${url}`);
            console.log(`    isPlaylistUrl: ${isPlaylistUrl(url)}`);
            console.log(`    isSpotifyUrl: ${isSpotifyUrl(url)}`);
            console.log(`    isSpotifyPlaylistUrl: ${isSpotifyPlaylistUrl(url)}`);
            console.log('');
        });
    });
}

/**
 * ทดสอบการดึง Spotify thumbnail
 */
export async function testSpotifyThumbnail() {
    console.log('🎵 Testing Spotify Thumbnail Extraction...\n');

    for (const [type, url] of Object.entries(testUrls.spotify)) {
        console.log(`📀 Testing ${type}: ${url}`);
        
        try {
            const thumbnail = await getSpotifyPlaylistThumbnail(url, {
                size: 'large',
                fallbackToDefault: true
            });
            
            console.log(`✅ Success: ${thumbnail}`);
        } catch (error) {
            console.log(`❌ Error: ${error.message}`);
        }
        
        console.log('');
    }
}

/**
 * ทดสอบ main function ที่รวมทุกอย่าง
 */
export async function testMainFunction() {
    console.log('🚀 Testing Main getPlaylistThumbnailMain Function...\n');

    const allUrls = [
        ...Object.values(testUrls.spotify),
        ...Object.values(testUrls.youtube)
    ];

    for (const url of allUrls) {
        console.log(`🔗 Testing: ${url}`);
        
        try {
            const thumbnail = await getPlaylistThumbnailMain(url, undefined, {
                method: 'auto',
                fallbackToVideo: true,
                highQuality: true
            });
            
            if (thumbnail) {
                console.log(`✅ Success: ${thumbnail}`);
                console.log(`   Platform: ${isSpotifyUrl(url) ? 'Spotify' : 'YouTube'}`);
            } else {
                console.log(`⚠️  No thumbnail found`);
            }
        } catch (error) {
            console.log(`❌ Error: ${error.message}`);
        }
        
        console.log('');
    }
}

/**
 * ทดสอบ performance
 */
export async function testPerformance() {
    console.log('⏱️  Testing Performance...\n');

    const testUrl = testUrls.spotify.playlist;
    const iterations = 3;
    const times: number[] = [];

    for (let i = 0; i < iterations; i++) {
        console.log(`🔄 Run ${i + 1}/${iterations}...`);
        
        const startTime = Date.now();
        
        try {
            await getPlaylistThumbnailMain(testUrl);
            const endTime = Date.now();
            const duration = endTime - startTime;
            times.push(duration);
            
            console.log(`   Time: ${duration}ms`);
        } catch (error) {
            console.log(`   Error: ${error.message}`);
        }
    }

    if (times.length > 0) {
        const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
        const minTime = Math.min(...times);
        const maxTime = Math.max(...times);
        
        console.log(`\n📊 Performance Summary:`);
        console.log(`   Average: ${avgTime.toFixed(2)}ms`);
        console.log(`   Min: ${minTime}ms`);
        console.log(`   Max: ${maxTime}ms`);
    }
}

/**
 * รันการทดสอบทั้งหมด
 */
export async function runAllTests() {
    console.log('🧪 Running Spotify Integration Tests\n');
    console.log('=' .repeat(50));
    
    try {
        await testUrlDetection();
        console.log('=' .repeat(50));
        
        await testSpotifyThumbnail();
        console.log('=' .repeat(50));
        
        await testMainFunction();
        console.log('=' .repeat(50));
        
        await testPerformance();
        console.log('=' .repeat(50));
        
        console.log('✅ All tests completed!');
    } catch (error) {
        console.error('❌ Test suite failed:', error);
    }
}

// Export all test functions
export default {
    testUrlDetection,
    testSpotifyThumbnail,
    testMainFunction,
    testPerformance,
    runAllTests
};

/*
วิธีการใช้งาน:

1. ทดสอบใน development:
   ```typescript
   import tests from './examples/spotifyIntegrationTest';
   await tests.runAllTests();
   ```

2. ทดสอบแค่ URL detection:
   ```typescript
   import { testUrlDetection } from './examples/spotifyIntegrationTest';
   await testUrlDetection();
   ```

3. ทดสอบ performance:
   ```typescript
   import { testPerformance } from './examples/spotifyIntegrationTest';
   await testPerformance();
   ```

หมายเหตุ:
- ต้องตั้งค่า Spotify credentials ใน lavalink/application.yml ก่อน
- ต้องมี internet connection
- บาง playlists อาจเป็น private และดึงไม่ได้
*/
