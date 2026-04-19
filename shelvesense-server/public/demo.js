(function () {
  const btn = document.getElementById('speakBtn');
  const ta = document.getElementById('speechText');
  const status = document.getElementById('status');
  const out = document.getElementById('out');
  const spokenLine = document.getElementById('spokenLine');
  const player = document.getElementById('player');
  let lastUrl = null;

  function setStatus(msg) {
    status.textContent = msg || '';
  }

  function tryBrowserTts(text, statusMsg) {
    if (typeof window === 'undefined' || !window.speechSynthesis) return false;
    spokenLine.textContent = text;
    out.classList.remove('hidden');
    player.removeAttribute('src');
    setStatus(statusMsg + ' (Web Speech API — free, local.)');
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
    return true;
  }

  btn.addEventListener('click', async function () {
    const text = (ta.value || '').trim();
    if (!text) {
      setStatus('Enter some text first.');
      return;
    }

    btn.disabled = true;
    setStatus('Calling /api/speech…');
    out.classList.add('hidden');

    try {
      const res = await fetch('/api/speech', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ text }),
      });
      const raw = await res.text();
      if (!res.ok) {
        if (tryBrowserTts(text, 'Server error ' + res.status + '. Using browser voice instead.')) {
          return;
        }
        setStatus('Error ' + res.status + ': ' + raw.slice(0, 200));
        return;
      }
      const data = JSON.parse(raw);
      if (!data.mimeType) {
        setStatus('Unexpected response shape.');
        return;
      }

      spokenLine.textContent = data.spokenLine || text;

      if (!data.audioBase64 || data.audioBase64.length < 16) {
        if (tryBrowserTts(data.spokenLine || text, 'No server audio — using browser voice.')) {
          return;
        }
        setStatus('No audio in response.');
        return;
      }

      const binary = atob(data.audioBase64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const blob = new Blob([bytes], { type: data.mimeType });
      if (lastUrl) URL.revokeObjectURL(lastUrl);
      lastUrl = URL.createObjectURL(blob);
      player.src = lastUrl;
      out.classList.remove('hidden');
      setStatus('Ready — press play if needed.');
      try {
        await player.play();
      } catch (_e) {
        setStatus('Ready — press play on the audio bar (browser blocked autoplay).');
      }
    } catch (e) {
      if (tryBrowserTts(text, 'Network error. Using browser voice instead.')) {
        return;
      }
      setStatus('Network error: ' + (e && e.message ? e.message : String(e)));
    } finally {
      btn.disabled = false;
    }
  });
})();
