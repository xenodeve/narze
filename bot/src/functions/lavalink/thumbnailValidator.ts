import chalk from "chalk";

/**
 * ฟังก์ชันเช็คว่า image URL สามารถดึงได้จริงหรือไม่
 */
export async function isValidImageUrl(url: string): Promise<boolean> {
    try {
        const response = await fetch(url, { 
            method: 'HEAD',
            signal: AbortSignal.timeout(5000) // timeout 5 วินาที
        });
        
        // เช็คว่า response OK และเป็น image content-type
        if (response.ok) {
            const contentType = response.headers.get('content-type');
            const contentLength = response.headers.get('content-length');
            
            // เช็คว่าเป็น image และมีขนาดมากกว่า 1KB (ป้องกันรูป placeholder เล็กๆ)
            if (contentType?.startsWith('image/') && 
                contentLength && parseInt(contentLength) > 1024) {
                return true;
            }
        }
        return false;
    } catch (error) {
        console.log(`[${chalk.bold.redBright('IMAGE CHECK')}] Failed to validate image URL: ${url}`);
        return false;
    }
}

/**
 * ฟังก์ชันแปลงและตรวจสอบ YouTube thumbnail URL
 * @param originalUrl URL เดิมของรูปภาพ
 * @returns URL ที่ผ่านการตรวจสอบแล้ว หรือ null หากไม่สามารถใช้ได้
 */
export async function validateAndConvertThumbnail(originalUrl: string | null): Promise<string | null> {
    if (!originalUrl) return null;

    // กรณีที่เป็น YouTube thumbnail (mqdefault)
    if (originalUrl.includes('mqdefault')) {
        const maxresUrl = originalUrl.replace('mqdefault', 'maxresdefault');
        
        // เช็คว่า maxresdefault URL สามารถดึงได้จริงหรือไม่
        const isMaxresValid = await isValidImageUrl(maxresUrl);
        
        if (isMaxresValid) {
            console.log(`[${chalk.bold.greenBright('THUMBNAIL')}] ✅ Successfully converted to maxresdefault: ${maxresUrl}`);
            return maxresUrl;
        } else {
            // หาก maxresdefault ไม่สามารถดึงได้ ให้ลองใช้ hqdefault แทน
            const hqdefaultUrl = originalUrl.replace('mqdefault', 'hqdefault');
            const isHqValid = await isValidImageUrl(hqdefaultUrl);
            
            if (isHqValid) {
                console.log(`[${chalk.bold.yellowBright('THUMBNAIL')}] ⚠️  Fallback to hqdefault: ${hqdefaultUrl}`);
                return hqdefaultUrl;
            } else {
                // ใช้ mqdefault เดิม
                console.log(`[${chalk.bold.redBright('THUMBNAIL')}] ❌ Using original mqdefault: ${originalUrl}`);
                return originalUrl;
            }
        }
    } else {
        // เช็ครูปภาพเดิมว่าดึงได้หรือไม่ (สำหรับกรณีที่ไม่ใช่ YouTube)
        const isOriginalValid = await isValidImageUrl(originalUrl);
        if (!isOriginalValid) {
            console.log(`[${chalk.bold.redBright('THUMBNAIL')}] ❌ Original thumbnail unavailable: ${originalUrl}`);
            return null; // ไม่ใส่รูปเลย
        }
        return originalUrl;
    }
}

/**
 * ฟังก์ชันสำหรับ YouTube thumbnail โดยเฉพาะ (แปลงจาก mqdefault เป็นคุณภาพสูงสุดที่มี)
 */
export async function getOptimalYoutubeThumbnail(videoId: string): Promise<string | null> {
    const baseUrl = 'https://i.ytimg.com/vi/' + videoId;
    
    // ลำดับความชัดของรูปภาพ YouTube
    const qualities = [
        'maxresdefault.jpg',  // 1280x720
        'hqdefault.jpg',      // 480x360  
        'mqdefault.jpg'       // 320x180
    ];
    
    for (const quality of qualities) {
        const url = `${baseUrl}/${quality}`;
        const isValid = await isValidImageUrl(url);
        
        if (isValid) {
            console.log(`[${chalk.bold.greenBright('YOUTUBE THUMBNAIL')}] ✅ Using ${quality}: ${url}`);
            return url;
        }
    }
    
    console.log(`[${chalk.bold.redBright('YOUTUBE THUMBNAIL')}] ❌ No valid thumbnail found for video: ${videoId}`);
    return null;
}
