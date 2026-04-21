import re
import threading
import requests
import io
import wave
from concurrent.futures import ThreadPoolExecutor
from flask import Flask, request, Response, jsonify

# Constants
app = Flask(__name__)
IN_ACTION = False
API_KEY = "YOUR_API_KEY_HERE" ## place your API key in here
FISH_URL = "https://api.302.ai/fish-audio/v1/tts"
TERMINAL_PUNC = ("。", "！", "？", "…", "!", "?")

VOICE_MAP = {
    ## place your voice ids in here, and give it a preferred name
    ## each voice should be separated with a comma (,)
    "VOICE_NAME": "VOICE_ID",
}

http_session = requests.Session()
executor = ThreadPoolExecutor(max_workers=5)
audio_cache = {}
cache_lock = threading.Lock()


@app.route('/tts/audio/voices', methods=['GET'])
def get_voices():
    return jsonify(VOICE_MAP)

@app.route('/tts/audio/speech', methods=['POST'])
def handle_speech():
    global IN_ACTION
    data = request.json
    text_raw = data.get('input', '')
    default_voice_name = next(iter(VOICE_MAP), "")
    requested_voice = data.get("voice", default_voice_name)
    target_voice_id = VOICE_MAP.get(requested_voice, list(VOICE_MAP.values())[0] if VOICE_MAP else None)

    # --- 1. Clean Text ---
    text_clean = ""
    for char in text_raw:
        if char in ('(', '（'): IN_ACTION = True; continue
        if char in (')', '）'): IN_ACTION = False; continue
        if not IN_ACTION: text_clean += char

    # --- 2. Improved Regex: Only split on terminal punctuation ---
    raw_parts = re.split(r'([。！？…!?\n]+)', text_clean.strip())

    sentences = []
    for i in range(0, len(raw_parts), 2):
        text = raw_parts[i].strip()
        punc = raw_parts[i + 1] if i + 1 < len(raw_parts) else ""
        combined = text + punc

        if re.search(r'[\u4e00-\u9fa5a-zA-Z0-9]', combined):
            sentences.append(combined)

    if not sentences: return Response(b"", status=204)

    # --- 3. Safe Audio Concatenation using `wave` ---
    combined_frames = b""
    audio_params = None

    for i, s in enumerate(sentences):
        chunk = get_audio_bytes(s, target_voice_id)

        if chunk:
            # Load the chunk safely into the wave module
            chunk_io = io.BytesIO(chunk)
            try:
                with wave.open(chunk_io, 'rb') as w_in:
                    # Capture parameters from the first chunk to use for the final output
                    if audio_params is None:
                        audio_params = w_in.getparams()

                    # Extract the pure audio frames (no headers)
                    combined_frames += w_in.readframes(w_in.getnframes())

                    # --- Dynamically generate silence for terminal punctuation ---
                    if s.endswith(TERMINAL_PUNC):
                        # Generate 0.5 seconds of silence
                        silence_duration = 0.5
                        bytes_per_sample = w_in.getsampwidth()
                        channels = w_in.getnchannels()
                        sample_rate = w_in.getframerate()

                        # A frame consists of (channels * bytes_per_sample) bytes of zeros
                        num_silence_frames = int(sample_rate * silence_duration)
                        silence_bytes = b'\x00' * (num_silence_frames * channels * bytes_per_sample)
                        combined_frames += silence_bytes

            except wave.Error:
                # Fallback just in case the API returned an invalid wav for a specific chunk
                print(f"Failed to parse WAV chunk for sentence: {s}")
                continue

    # --- 4. Write a perfectly formed WAV file ---
    if not audio_params:
        return Response(b"", status=204)

    output_io = io.BytesIO()
    with wave.open(output_io, 'wb') as w_out:
        w_out.setparams(audio_params)
        w_out.writeframes(combined_frames)

    return Response(output_io.getvalue(), content_type='audio/wav')


def get_audio_bytes(text, voice_id):
    with cache_lock:
        if text in audio_cache: return audio_cache[text]

    headers = {'Authorization': f'Bearer {API_KEY}', 'Content-Type': 'application/json'}
    payload = {"text": text, "reference_id": voice_id, "latency": "low", "temperature": 0.9, "top_p": 0.7,
               "format": "wav"}

    response = http_session.post(FISH_URL, headers=headers, json=payload, timeout=20)
    if response.status_code == 200:
        audio_url = response.json().get("url")
        audio_res = http_session.get(audio_url, timeout=10)
        if audio_res.status_code == 200:
            with cache_lock:
                audio_cache[text] = audio_res.content
            return audio_res.content
    return None


def prefetch_audio(text, voice_id):
    if not text or text in audio_cache: return
    get_audio_bytes(text, voice_id)


if __name__ == '__main__':
    app.run(host='127.0.0.1', port=11996, debug=False, threaded=True)