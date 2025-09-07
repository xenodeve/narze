/**
 * ตัวอย่างการใช้งาน Artist Image Configuration
 * สำหรับทดสอบการดึงรูปศิลปินจาก Spotify API
 */

import { getArtistImage } from '../functions/spotify/index';
import { getIconURL } from '../functions/lavalink/iconConfig';

// ตัวอย่างศิลปินสำหรับทดสอบ
const testArtists = [
    'Taylor Swift',
    'Ed Sheeran', 
    'BTS',
    'Adele',
    'The Weeknd',
    'Billie Eilish',
    'Drake',
    'Dua Lipa',
    'Post Malone',
    'Ariana Grande'
];

// ตัวอย่าง track object
const mockTrack = {
    info: {
        title: 'Test Song',
        author: 'Taylor Swift',
        uri: 'https://example.com/track',
        length: 180000,
        thumbnail: 'https://example.com/thumbnail.jpg'
    }
};

/**
 * ทดสอบการดึงรูปศิลปินจาก Spotify
 */
export async function testArtistImageRetrieval() {
    console.log('🎨 Testing Artist Image Retrieval...\n');

    for (const artist of testArtists) {
        console.log(`🎤 Testing: ${artist}`);
        
        try {
            const startTime = Date.now();
            const imageUrl = await getArtistImage(artist);
            const endTime = Date.now();
            
            if (imageUrl) {
                console.log(`✅ Success: ${imageUrl}`);
                console.log(`   Time: ${endTime - startTime}ms`);
            } else {
                console.log(`❌ No image found`);
            }
        } catch (error) {
            console.log(`💥 Error: ${error.message}`);
        }
        
        console.log('');
        
        // เพิ่ม delay เล็กน้อยเพื่อไม่ให้ hit rate limit
        await new Promise(resolve => setTimeout(resolve, 100));
    }
}

/**
 * ทดสอบ getIconURL กับ artistImage config
 */
export async function testIconURLWithArtistImage() {
    console.log('🖼️ Testing getIconURL with artistImage...\n');

    const userAvatar = 'https://cdn.discordapp.com/avatars/123/avatar.png';
    
    // Mock different artists
    const testTracks = [
        { ...mockTrack, info: { ...mockTrack.info, author: 'Taylor Swift' } },
        { ...mockTrack, info: { ...mockTrack.info, author: 'Ed Sheeran' } },
        { ...mockTrack, info: { ...mockTrack.info, author: 'BTS' } },
        { ...mockTrack, info: { ...mockTrack.info, author: 'Unknown Artist 123' } }
    ];

    for (const track of testTracks) {
        console.log(`🎵 Testing track by: ${track.info.author}`);
        
        try {
            const startTime = Date.now();
            const iconURL = await getIconURL(track, userAvatar);
            const endTime = Date.now();
            
            console.log(`✅ Icon URL: ${iconURL}`);
            console.log(`   Time: ${endTime - startTime}ms`);
            
            // ตรวจสอบว่าเป็น artist image หรือ fallback
            if (iconURL.includes('spotify') || iconURL.includes('scdn.co')) {
                console.log(`   🎨 Type: Artist Image`);
            } else if (iconURL === userAvatar) {
                console.log(`   👤 Type: User Avatar (fallback)`);
            } else {
                console.log(`   🤖 Type: Bot Avatar (fallback)`);
            }
        } catch (error) {
            console.log(`💥 Error: ${error.message}`);
        }
        
        console.log('');
    }
}

/**
 * ทดสอบ performance ของ artist image
 */
export async function testArtistImagePerformance() {
    console.log('⏱️ Testing Artist Image Performance...\n');

    const artist = 'Taylor Swift';
    const iterations = 5;
    const times: number[] = [];

    console.log(`Testing ${iterations} requests for: ${artist}`);

    for (let i = 0; i < iterations; i++) {
        console.log(`🔄 Request ${i + 1}/${iterations}...`);
        
        const startTime = Date.now();
        
        try {
            const imageUrl = await getArtistImage(artist);
            const endTime = Date.now();
            const duration = endTime - startTime;
            times.push(duration);
            
            console.log(`   Time: ${duration}ms`);
            console.log(`   Success: ${imageUrl ? 'Yes' : 'No'}`);
        } catch (error) {
            console.log(`   Error: ${error.message}`);
        }
        
        // Small delay between requests
        await new Promise(resolve => setTimeout(resolve, 200));
    }

    if (times.length > 0) {
        const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
        const minTime = Math.min(...times);
        const maxTime = Math.max(...times);
        
        console.log(`\n📊 Performance Summary:`);
        console.log(`   Average: ${avgTime.toFixed(2)}ms`);
        console.log(`   Min: ${minTime}ms`);
        console.log(`   Max: ${maxTime}ms`);
        console.log(`   Success Rate: ${(times.length / iterations * 100).toFixed(1)}%`);
    }
}

/**
 * ทดสอบ fallback system
 */
export async function testFallbackSystem() {
    console.log('🔄 Testing Fallback System...\n');

    const userAvatar = 'https://cdn.discordapp.com/avatars/123/avatar.png';
    
    const testCases = [
        {
            name: 'Valid Artist',
            track: { ...mockTrack, info: { ...mockTrack.info, author: 'Taylor Swift' } }
        },
        {
            name: 'Invalid Artist',
            track: { ...mockTrack, info: { ...mockTrack.info, author: 'NonExistentArtist12345' } }
        },
        {
            name: 'Empty Artist',
            track: { ...mockTrack, info: { ...mockTrack.info, author: '' } }
        },
        {
            name: 'No Artist',
            track: { ...mockTrack, info: { ...mockTrack.info, author: null } }
        }
    ];

    for (const testCase of testCases) {
        console.log(`🧪 Testing: ${testCase.name}`);
        
        try {
            const iconURL = await getIconURL(testCase.track, userAvatar);
            console.log(`✅ Result: ${iconURL}`);
            
            // Analyze result
            if (iconURL.includes('spotify') || iconURL.includes('scdn.co')) {
                console.log(`   📊 Fallback Level: 0 (Artist Image)`);
            } else if (iconURL === userAvatar) {
                console.log(`   📊 Fallback Level: 1 (User Avatar)`);
            } else {
                console.log(`   📊 Fallback Level: 2 (Bot Avatar)`);
            }
        } catch (error) {
            console.log(`💥 Error: ${error.message}`);
        }
        
        console.log('');
    }
}

/**
 * รันการทดสอบทั้งหมด
 */
export async function runAllArtistImageTests() {
    console.log('🧪 Running Artist Image Tests\n');
    console.log('=' .repeat(60));
    
    try {
        await testArtistImageRetrieval();
        console.log('=' .repeat(60));
        
        await testIconURLWithArtistImage();
        console.log('=' .repeat(60));
        
        await testArtistImagePerformance();
        console.log('=' .repeat(60));
        
        await testFallbackSystem();
        console.log('=' .repeat(60));
        
        console.log('✅ All artist image tests completed!');
    } catch (error) {
        console.error('❌ Test suite failed:', error);
    }
}

// Export all test functions
export default {
    testArtistImageRetrieval,
    testIconURLWithArtistImage,
    testArtistImagePerformance,
    testFallbackSystem,
    runAllArtistImageTests
};

/*
วิธีการใช้งาน:

1. ทดสอบการดึงรูปศิลปิน:
   ```typescript
   import tests from './examples/artistImageTest';
   await tests.testArtistImageRetrieval();
   ```

2. ทดสอบ performance:
   ```typescript
   import { testArtistImagePerformance } from './examples/artistImageTest';
   await testArtistImagePerformance();
   ```

3. ทดสอบ fallback system:
   ```typescript
   import { testFallbackSystem } from './examples/artistImageTest';
   await testFallbackSystem();
   ```

4. รันทุกการทดสอบ:
   ```typescript
   import { runAllArtistImageTests } from './examples/artistImageTest';
   await runAllArtistImageTests();
   ```

หมายเหตุ:
- ต้องตั้งค่า Spotify credentials ใน lavalink/application.yml ก่อน
- ต้องมี internet connection
- ควรตั้งค่า icon_config.normal_track = "artistImage" ก่อนทดสอบ
*/
