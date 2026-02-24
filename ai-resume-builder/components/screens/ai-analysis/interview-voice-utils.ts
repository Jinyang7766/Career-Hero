export const isVoiceDebugEnabled = () => {
  try {
    return localStorage.getItem('voice_debug') === '1';
  } catch {
    return false;
  }
};

export const pickRecorderMime = () => {
  const MR: any = typeof window !== 'undefined' ? (window as any).MediaRecorder : null;
  const isSupported = (t: string) => {
    try {
      return !!MR?.isTypeSupported?.(t);
    } catch {
      return false;
    }
  };
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];
  for (const c of candidates) {
    if (isSupported(c)) return c;
  }
  return '';
};

export const detectSilentAudio = async (blob: Blob): Promise<boolean | null> => {
  try {
    const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AC) return null;
    const buf = await blob.arrayBuffer();
    const ctx: AudioContext = new AC();
    try {
      await (ctx as any).resume?.();
    } catch {
      // ignore
    }

    const audioBuffer = await new Promise<AudioBuffer>((resolve, reject) => {
      try {
        const ab = buf.slice(0);
        ctx.decodeAudioData(ab, (decoded) => resolve(decoded), (err) => reject(err));
      } catch (e) {
        reject(e);
      }
    });

    const ch = audioBuffer.numberOfChannels || 1;
    const len = audioBuffer.length || 0;
    if (!len) {
      try {
        ctx.close();
      } catch {
        // ignore
      }
      return true;
    }

    const step = Math.max(1, Math.floor(len / 48000));
    let sumSq = 0;
    let count = 0;
    let peak = 0;
    for (let c = 0; c < ch; c++) {
      const data = audioBuffer.getChannelData(c);
      for (let i = 0; i < len; i += step) {
        const v = data[i] || 0;
        const av = Math.abs(v);
        if (av > peak) peak = av;
        sumSq += v * v;
        count++;
      }
    }
    const rms = Math.sqrt(sumSq / Math.max(1, count));

    try {
      ctx.close();
    } catch {
      // ignore
    }

    return rms < 0.003 && peak < 0.02;
  } catch {
    return null;
  }
};
