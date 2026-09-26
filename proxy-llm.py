from fastapi import FastAPI, Request
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
import httpx
import uvicorn
import json
import hashlib
from urllib.parse import quote
import time
import re
import os

app = FastAPI(title="AIRI DeepSeek Proxy + 字幕中文优化版")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

client = httpx.AsyncClient(timeout=120.0)

# ====================== 配置区域 ======================
# 请在这里填写你的配置信息

DEEPSEEK_URL = "https://api.deepseek.com/v1/chat/completions"
DEEPSEEK_KEY = ""                    # ← 在这里填你的 DeepSeek API Key

BAIDU_APPID = ""                     # ← 在这里填你的百度翻译 AppID
BAIDU_KEY = ""                       # ← 在这里填你的百度翻译 密钥

# 字幕输出文件路径（请修改成你自己的实际路径）
SUBTITLE_FILE = r"C:\Users\你的用户名\subtitle.txt"

# ====================== 特殊词配置 ======================
# 你可以在这里添加需要特殊处理的词，此处只做示例，实际情况按需要修改（原词 → 中文显示）
# 格式： "原词": "中文显示"
SPECIAL_WORDS = {
    "ドクター": "博士",
    "博士": "博士",
}

# ====================== 工具函数 ======================
def replace_doctor(text: str) -> str:
    """强制把所有博士相关称呼统一成「博士」，此处只做示例，实际情况按需要修改"""
    text = re.sub(r"ドクター", "博士", text)
    text = re.sub(r"医生", "博士", text)
    text = re.sub(r"醫生", "博士", text)
    text = re.sub(r"博士さん", "博士", text)
    return text

def baidu_translate(text: str) -> str:
    """调用百度翻译（纯翻译，不处理特殊词）"""
    if not text.strip():
        return text

    if not BAIDU_APPID or not BAIDU_KEY:
        print("[Baidu] 未配置百度翻译密钥，使用原始文本")
        return text

    salt = str(int(time.time() * 1000))
    sign_str = BAIDU_APPID + text + salt + BAIDU_KEY
    sign = hashlib.md5(sign_str.encode('utf-8')).hexdigest()

    url = (
        f"https://fanyi-api.baidu.com/api/trans/vip/translate"
        f"?q={quote(text)}"
        f"&from=auto&to=zh"
        f"&appid={BAIDU_APPID}"
        f"&salt={salt}"
        f"&sign={sign}"
    )

    try:
        resp = httpx.get(url, timeout=15)
        data = resp.json()

        if "trans_result" in data and data["trans_result"]:
            translated_parts = [item["dst"] for item in data["trans_result"]]
            return " ".join(translated_parts)
        else:
            print("[Baidu] 翻译失败:", data.get("error_msg"))
            return text
    except Exception as e:
        print(f"[Baidu] 异常: {str(e)}")
        return text


# ====================== 主代理逻辑 ======================
@app.post("/v1/chat/completions")
@app.post("/chat/completions")
async def proxy_chat(request: Request):
    body = await request.json()
    user_message = body.get("messages", [{}])[-1].get("content", "无内容")
    print(f"[Proxy] 收到 AIRI 请求: {user_message}")

    headers = {
        "Authorization": f"Bearer {DEEPSEEK_KEY}",
        "Content-Type": "application/json"
    }

    # 新对话清空字幕
    try:
        open(SUBTITLE_FILE, "w", encoding="utf-8").close()
        print("[Proxy] 新对话开始，已清空字幕文件")
    except Exception:
        pass

    content_parts = []

    async def forward_original():
        try:
            async with client.stream("POST", DEEPSEEK_URL, json=body, headers=headers) as resp:
                async for chunk in resp.aiter_bytes():
                    text = chunk.decode('utf-8', errors='ignore')
                    lines = text.split('\n')
                    for line in lines:
                        line = line.strip()
                        if line.startswith('data: ') and '[DONE]' not in line:
                            try:
                                data_str = line[6:].strip()
                                if data_str.startswith('{'):
                                    data = json.loads(data_str)
                                    delta = data.get('choices', [{}])[0].get('delta', {})
                                    content = delta.get('content', '')
                                    if content:
                                        content_parts.append(content)
                            except:
                                continue
                    
                    # 转发原始日文给 AIRI（保证语音合成发音正确）
                    yield chunk

                # ==================== 流结束处理 ====================
                if content_parts:
                    full_japanese = "".join(content_parts).strip()
                    full_japanese = re.sub(r'\s+', ' ', full_japanese)

                    # 1. 翻译成中文
                    translated_chinese = baidu_translate(full_japanese)

                    # 2. 强制替换成「博士」，此处只做示例，实际情况按需要修改
                    final_subtitle = replace_doctor(translated_chinese)

                    # 3. 写入字幕文件
                    try:
                        with open(SUBTITLE_FILE, "w", encoding="utf-8") as f:
                            f.write(final_subtitle)
                        print(f"[Proxy] 字幕已写入: {final_subtitle[:100]}...")
                    except Exception as e:
                        print(f"[Proxy] 写字幕失败: {e}")

                yield "data: [DONE]\n\n"

        except Exception as e:
            print(f"[Proxy] 转发异常: {str(e)}")

    return StreamingResponse(forward_original(), media_type="text/event-stream")


@app.get("/v1/models")
@app.get("/models")
async def get_models():
    return {
        "data": [
            {"id": "deepseek-chat", "object": "model", "owned_by": "deepseek"},
            {"id": "deepseek-reasoner", "object": "model", "owned_by": "deepseek"}
        ]
    }

@app.get("/")
async def root():
    return {"status": "Proxy online", "for": "AIRI + 独立字幕"}

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=9000, log_level="info")