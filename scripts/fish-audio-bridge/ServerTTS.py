import os
import re
import threading
import requests
import io
import wave
from flask import Flask, request, Response, jsonify

# Constants
app = Flask(__name__)
# Securely load API key from environment, with your placeholder as a fallback
API_KEY = os.getenv("FISH_AUDIO_API_KEY", "YOUR_API_KEY_HERE")
FISH_URL = "https://api.302.ai/fish-audio/v1/tts"
TERMINAL_PUNC = ("。", "！", "？", "…", "!", "?", ".")
MAX_CACHE_SIZE = 100  # Bound the cache to prevent memory leaks

VOICE_MAP = {
    # place your voice ids in here, and give it a preferred name
    "VOICE_NAME": "VOICE_ID",
}

http_session = requests.Session()
audio_cache = {}
cache_lock = threading.Lock()


@app.route('/tts/audio/voices', methods=['GET'])
def get_voices():
    return jsonify(VOICE_MAP)


@app.route('/tts/audio/speech', methods=['POST'])
def handle_speech():
    data = request.json

    # FIX: Validate JSON shape to prevent runtime errors
    if not isinstance(data, dict):
        return Response("Bad Request: Payload must be a JSON object", status=400)

    text_raw = data.get('input', '')

    # Ensure text_raw is a string (handles cases where input is explicitly null/None)
    if text_raw is None:
        text_raw = ''
    elif not isinstance(text_raw, str):
        text_raw = str(text_raw)

    default_voice_name = next(iter(VOICE_MAP), "")
    requested_voice = data.get("voice")
    if not isinstance(requested_voice, str):
        requested_voice = default_voice_name
    target_voice_id = VOICE_MAP.get(requested_voice, VOICE_MAP.get(default_voice_name))

    # --- 1. Clean Text (Handles Nested Parentheses) ---
    text_clean = ""
    action_depth = 0
    for char in text_raw:
        if char in ('(', '（'):
            action_depth += 1
            continue
        if char in (')', '）'):
            action_depth = max(0, action_depth - 1)
            continue
        if action_depth == 0:
            text_clean += char

    # --- 2. Improved Regex: Only split on terminal punctuation ---
    raw_parts = re.split(r'([。！？…!?.\n]+)', text_clean.strip())

    sentences = []
    for i in range(0, len(raw_parts), 2):
        text = raw_parts[i].strip()
        punc = raw_parts[i + 1] if i + 1 < len(raw_parts) else ""
        combined = text + punc

        # Use \w to support all Unicode languages
        if re.search(r'\w', combined):
            sentences.append(combined)

    if not sentences: return Response(b"", status=204)

    # --- 3. Safe Audio Concatenation using `wave` ---
    combined_frames = b""
    audio_params = None

    for i, s in enumerate(sentences):
        chunk = get_audio_bytes(s, target_voice_id)

        if chunk:
            chunk_io = io.BytesIO(chunk)
            try:
                with wave.open(chunk_io, 'rb') as w_in:
                    if audio_params is None:
                        audio_params = w_in.getparams()

                    combined_frames += w_in.readframes(w_in.getnframes())

                    if s.endswith(TERMINAL_PUNC):
                        silence_duration = 0.5
                        bytes_per_sample = w_in.getsampwidth()
                        channels = w_in.getnchannels()
                        sample_rate = w_in.getframerate()

                        num_silence_frames = int(sample_rate * silence_duration)
                        silence_bytes = b'\x00' * (num_silence_frames * channels * bytes_per_sample)
                        combined_frames += silence_bytes

            except wave.Error:
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
    """Fetches audio bytes, caching by both text and voice_id to prevent overlaps."""
    cache_key = (text, voice_id)
    with cache_lock:
        if cache_key in audio_cache: return audio_cache[cache_key]

    headers = {'Authorization': f'Bearer {API_KEY}', 'Content-Type': 'application/json'}
    payload = {"text": text, "reference_id": voice_id, "latency": "low", "temperature": 0.9, "top_p": 0.7,
               "format": "wav"}

    # Catch upstream request failures gracefully
    try:
        response = http_session.post(FISH_URL, headers=headers, json=payload, timeout=20)
        if response.status_code == 200:
            audio_url = response.json().get("url")
            audio_res = http_session.get(audio_url, timeout=10)
            if audio_res.status_code == 200:
                with cache_lock:
                    audio_cache[cache_key] = audio_res.content
                    # Bound the cache to prevent RAM growth
                    if len(audio_cache) > MAX_CACHE_SIZE:
                        audio_cache.pop(next(iter(audio_cache)))
                return audio_res.content
    except (requests.exceptions.RequestException, ValueError) as e:
        print(f"Network, API, or JSON parsing error when fetching audio: {e}")
        return None

    return None


if __name__ == '__main__':
    app.run(host='127.0.0.1', port=11996, debug=False, threaded=True)