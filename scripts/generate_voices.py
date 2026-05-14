"""
Hermes Pet - 内置语音生成脚本（萝莉音版）
使用 Windows SAPI Huihui + <pitch> 标记提升音调

用法: python scripts/generate_voices.py
输出: assets/audio/*.wav
"""

import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

try:
    import pyttsx3
except ImportError:
    print("pip install pyttsx3"); sys.exit(1)

OUTPUT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "assets", "audio")

# 台词不改，但通过 SAPI XML 调整音调
PHRASES = [
    ("greeting_01",  "赫赫在呢！有什么可以帮你的？"),
    ("greeting_02",  "嗨嗨～咱在这里！"),
    ("greeting_03",  "啊，被召唤了！有什么吩咐？"),
    ("greeting_04",  "嘿嘿，终于有人理咱了～要聊点什么呢？"),
    ("greeting_05",  "来啦来啦！今天也是元气满满的一天！"),
    ("drag_01",      "诶嘿～"),
    ("error_ollama", "唔…咱好像连不上AI大脑了…检查一下Ollama是不是在运行？"),
    ("idle_01",      "好安静呢…大家是不是都在忙？"),
    ("idle_02",      "咱在发呆中……啊！没有睡着啦！"),
    ("idle_03",      "要不要聊聊天？咱知道很多有趣的事哦"),
    ("idle_04",      "无聊地转圈圈…转～转～转～"),
    ("stt_listening","咱在听呢…竖起耳朵"),
    ("stt_error",    "没听清楚呢…要不打字试试？"),
    ("stt_disabled", "语音输入未开启，请在设置中启用"),
]

def wrap_xml(text, pitch="+30%", rate="+15%"):
    """用 SAPI XML 标记调整语调"""
    return f'<prosody pitch="{pitch}" rate="{rate}">{text}</prosody>'

# 不同台词配不同语调（更有层次感）
MOODS = {
    "greeting": ("+35%", "+10%"),   # 问候：高亢
    "drag":     ("+45%", "+5%"),    # 拖拽：最尖
    "error":    ("+15%", "+0%"),    # 错误：略高
    "idle":     ("+30%", "+8%"),    # 空闲：正常偏高
    "stt":      ("+30%", "+10%"),   # 语音：偏高
}

def get_mood(filename):
    for prefix in MOODS:
        if filename.startswith(prefix):
            return MOODS[prefix]
    return ("+25%", "+10%")

def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    
    print(f"\n🎙️  语音: Microsoft Huihui (萝莉调音版)")
    print(f"📐  通过 SAPI <prosody> 标记提升音调")
    print(f"📁 输出: {OUTPUT_DIR}")
    print(f"📝 共 {len(PHRASES)} 句\n")
    
    engine = pyttsx3.init()
    engine.setProperty('voice', 'HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Speech\\Voices\\Tokens\\TTS_MS_ZH-CN_HUIHUI_11.0')
    engine.setProperty('rate', 190)   # 基础语速稍快
    engine.setProperty('volume', 0.95)
    
    for filename, text in PHRASES:
        pitch, rate = get_mood(filename)
        xml_text = wrap_xml(text, pitch, rate)
        output_path = os.path.join(OUTPUT_DIR, f"{filename}.wav")
        engine.save_to_file(xml_text, output_path)
        print(f"  🔄 {filename}.wav (pitch={pitch} rate={rate}) - {text[:25]}...")
    
    engine.runAndWait()
    
    total = 0
    for f in sorted(os.listdir(OUTPUT_DIR)):
        if f.endswith('.wav'):
            s = os.path.getsize(os.path.join(OUTPUT_DIR, f))
            total += s
            print(f"  ✅ {f} ({s/1024:.1f} KB)")
    
    print(f"\n✨ 完成! {len(PHRASES)} 文件, {total/1024:.1f} KB")

if __name__ == "__main__":
    main()
