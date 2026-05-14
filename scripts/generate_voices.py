"""
Hermes Pet - 语音生成脚本 (FreeTTS XiaoYi 晓伊 - 年轻活泼女声)
使用免费 REST API: https://freetts.org/api/tts

用法: python scripts/generate_voices.py
输出: assets/audio/*.mp3 (晓伊萝莉音)
"""

import os, sys, json, time, urllib.request

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUTPUT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "assets", "audio")

# FreeTTS API
API_TTS  = "https://freetts.org/api/tts"
API_AUDIO = "https://freetts.org/api/audio"
VOICE = "zh-CN-XiaoyiNeural"  # 晓伊 - 年轻活泼女声 (最接近萝莉音)

HEADERS = {
    "Content-Type": "application/json",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Origin": "https://freetts.org",
    "Referer": "https://freetts.org/",
}

PHRASES = [
    # 双击问候 - 活泼高亢
    ("greeting_01",  "赫赫在呢！有什么可以帮你的？",           "+15%", "+5Hz"),
    ("greeting_02",  "嗨嗨～咱在这里！",                       "+20%", "+8Hz"),
    ("greeting_03",  "啊，被召唤了！有什么吩咐？",              "+15%", "+5Hz"),
    ("greeting_04",  "嘿嘿，终于有人理咱了～要聊点什么呢？",     "+15%", "+8Hz"),
    ("greeting_05",  "来啦来啦！今天也是元气满满的一天！",       "+20%", "+8Hz"),
    # 拖拽 - 最可爱
    ("drag_01",      "诶嘿～",                                "+25%", "+10Hz"),
    # 错误
    ("error_ollama", "唔…咱好像连不上AI大脑了…检查一下Ollama是不是在运行？", "+0%", "+0Hz"),
    # 空闲搭话
    ("idle_01",      "好安静呢…大家是不是都在忙？",             "+10%", "+5Hz"),
    ("idle_02",      "咱在发呆中……啊！没有睡着啦！",            "+15%", "+8Hz"),
    ("idle_03",      "要不要聊聊天？咱知道很多有趣的事哦",       "+15%", "+8Hz"),
    ("idle_04",      "无聊地转圈圈…转～转～转～",              "+10%", "+8Hz"),
    # 语音输入
    ("stt_listening","咱在听呢…竖起耳朵",                      "+10%", "+5Hz"),
    ("stt_error",    "没听清楚呢…要不打字试试？",               "+10%", "+5Hz"),
    ("stt_disabled", "语音输入未开启，请在设置中启用",           "+5%",  "+3Hz"),
]

def generate_one(name, text, rate, pitch):
    """生成单个语音文件"""
    output_path = os.path.join(OUTPUT_DIR, f"{name}.mp3")
    
    body = json.dumps({"text": text, "voice": VOICE, "rate": rate, "pitch": pitch}).encode()
    req = urllib.request.Request(API_TTS, data=body, headers=HEADERS, method="POST")
    
    with urllib.request.urlopen(req, timeout=15) as resp:
        result = json.loads(resp.read())
    
    file_id = result.get("file_id")
    if not file_id:
        raise Exception(f"No file_id in response: {result}")
    
    # 下载音频
    audio_url = f"{API_AUDIO}/{file_id}"
    req2 = urllib.request.Request(audio_url, headers={"User-Agent": HEADERS["User-Agent"]})
    with urllib.request.urlopen(req2, timeout=15) as resp:
        with open(output_path, "wb") as f:
            f.write(resp.read())
    
    size_kb = os.path.getsize(output_path) / 1024
    print(f"  ✅ {name}.mp3 ({size_kb:.1f} KB) - {text[:25]}...")
    return output_path

def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    
    print(f"\n🎙️  语音: {VOICE} (晓伊 - 年轻活泼女声)")
    print(f"🌐  来源: FreeTTS API (免费)")
    print(f"📁 输出: {OUTPUT_DIR}")
    print(f"📝 共 {len(PHRASES)} 句台词\n")
    
    for name, text, rate, pitch in PHRASES:
        try:
            generate_one(name, text, rate, pitch)
            time.sleep(0.5)  # 避免触发频率限制 (20/min)
        except Exception as e:
            print(f"  ❌ {name} 失败: {e}")
    
    total = sum(os.path.getsize(os.path.join(OUTPUT_DIR, f)) 
                for f in os.listdir(OUTPUT_DIR) if f.endswith('.mp3') and not f.startswith('test'))
    print(f"\n✨ 完成! 总大小 {total/1024:.1f} KB")

if __name__ == "__main__":
    main()
