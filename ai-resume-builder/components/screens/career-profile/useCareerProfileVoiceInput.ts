import { useCallback, useEffect, useRef, useState } from 'react';
import { buildApiUrl } from '../../../src/api-config';
import { getBackendAuthToken } from '../ai-analysis/auth';

type Params = {
  onTranscript: (text: string) => void;
};

const pickRecorderMime = () => {
  const MR: any = typeof window !== 'undefined' ? (window as any).MediaRecorder : null;
  const isSupported = (value: string) => {
    try {
      return !!MR?.isTypeSupported?.(value);
    } catch {
      return false;
    }
  };
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];
  for (const item of candidates) {
    if (isSupported(item)) return item;
  }
  return '';
};

const getSpeechRecognitionCtor = () => {
  if (typeof window === 'undefined') return null;
  const w = window as any;
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
};

const normalizeSpeechError = (errorCode: any) => {
  const code = String(errorCode || '').trim().toLowerCase();
  if (!code) return '语音识别失败，请重试';
  if (code === 'not-allowed' || code === 'service-not-allowed') {
    return '麦克风权限被拒绝，请在浏览器中允许后重试';
  }
  if (code === 'audio-capture') {
    return '无法访问麦克风，请检查设备后重试';
  }
  if (code === 'no-speech') {
    return '未识别到语音内容，请重试';
  }
  if (code === 'network') {
    return '浏览器语音识别网络异常，请稍后重试';
  }
  if (code === 'aborted') {
    return '';
  }
  return '语音识别失败，请重试';
};

export const useCareerProfileVoiceInput = ({ onTranscript }: Params) => {
  const [audioSupported, setAudioSupported] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [voiceError, setVoiceError] = useState('');
  const [voiceHint, setVoiceHint] = useState('');
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const speechRecognitionRef = useRef<any>(null);
  const speechTranscriptRef = useRef('');
  const speechErrorRef = useRef('');

  const clearStream = useCallback(() => {
    if (!mediaStreamRef.current) return;
    try {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
    } catch {
      // ignore cleanup failures
    }
    mediaStreamRef.current = null;
  }, []);

  const transcribeAudio = useCallback(async (blob: Blob) => {
    const token = await getBackendAuthToken();
    if (!token) throw new Error('请先登录后再使用语音输入');

    const endpoint = buildApiUrl('/api/ai/transcribe');
    const form = new FormData();
    const mime = blob.type || 'audio/webm';
    form.append('file', blob, `career-profile-voice.${mime.includes('ogg') ? 'ogg' : 'webm'}`);
    form.append('mime_type', mime);
    form.append('lang', 'zh-CN');

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token.trim()}`,
      },
      body: form,
    });
    const payload = await response.json().catch(() => ({} as any));
    if (!response.ok || !payload?.success) {
      throw new Error(String(payload?.error || '语音转写失败'));
    }
    return String(payload?.text || '').trim();
  }, []);

  const startBackendRecorder = useCallback(async (options?: { fromFallback?: boolean }) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      const mime = pickRecorderMime();
      const recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (event: any) => {
        try {
          if (event?.data && event.data.size > 0) chunksRef.current.push(event.data);
        } catch {
          // ignore chunk failures
        }
      };

      recorder.onstop = () => {
        setIsRecording(false);
        clearStream();
        const blob = new Blob(chunksRef.current, { type: mime || 'audio/webm' });
        chunksRef.current = [];
        mediaRecorderRef.current = null;

        if (!blob.size) {
          setVoiceError('录音内容为空，请重试');
          return;
        }

        void (async () => {
          setIsTranscribing(true);
          setVoiceHint('正在转写语音...');
          try {
            const text = await transcribeAudio(blob);
            if (!text) {
              setVoiceError('未识别到语音内容，请重试');
              setVoiceHint('');
              return;
            }
            onTranscript(text);
            setVoiceHint('语音已转写并追加到输入框');
          } catch (error: any) {
            setVoiceError(String(error?.message || '语音转写失败，请稍后重试'));
            setVoiceHint('');
          } finally {
            setIsTranscribing(false);
          }
        })();
      };

      try {
        recorder.start(200);
      } catch {
        recorder.start();
      }
      setIsRecording(true);
      setVoiceHint(
        options?.fromFallback
          ? '浏览器识别不可用，已切换录音转写；再次点击停止并转写'
          : '录音中，再次点击停止并转写'
      );
    } catch (error: any) {
      const errorName = String(error?.name || '').toLowerCase();
      if (errorName.includes('permission') || errorName.includes('notallowed')) {
        setVoiceError('麦克风权限被拒绝，请在浏览器中允许后重试');
      } else {
        setVoiceError('无法启动麦克风，请检查设备后重试');
      }
      clearStream();
      mediaRecorderRef.current = null;
      setIsRecording(false);
    }
  }, [clearStream, onTranscript, transcribeAudio]);

  const startBrowserRecognition = useCallback(() => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) return false;
    try {
      const recognition = new Ctor();
      speechRecognitionRef.current = recognition;
      speechTranscriptRef.current = '';
      speechErrorRef.current = '';

      recognition.lang = 'zh-CN';
      recognition.interimResults = true;
      recognition.continuous = true;
      recognition.maxAlternatives = 1;

      recognition.onstart = () => {
        setIsRecording(true);
        setVoiceHint('浏览器语音识别中，再次点击停止');
      };

      recognition.onresult = (event: any) => {
        const finalizedParts: string[] = [];
        for (let i = Number(event?.resultIndex || 0); i < Number(event?.results?.length || 0); i += 1) {
          const result = event?.results?.[i];
          if (!result?.isFinal) continue;
          const transcript = String(result?.[0]?.transcript || '').trim();
          if (transcript) finalizedParts.push(transcript);
        }
        if (!finalizedParts.length) return;
        const nextText = finalizedParts.join(' ');
        speechTranscriptRef.current = speechTranscriptRef.current
          ? `${speechTranscriptRef.current}\n${nextText}`
          : nextText;
      };

      recognition.onerror = (event: any) => {
        speechErrorRef.current = normalizeSpeechError(event?.error);
      };

      recognition.onend = () => {
        setIsRecording(false);
        speechRecognitionRef.current = null;
        const text = String(speechTranscriptRef.current || '').trim();
        const errorMsg = String(speechErrorRef.current || '').trim();
        speechTranscriptRef.current = '';
        speechErrorRef.current = '';

        if (text) {
          onTranscript(text);
          setVoiceError('');
          setVoiceHint('语音已识别并追加到输入框');
          return;
        }
        if (errorMsg) {
          setVoiceError(errorMsg);
          setVoiceHint('');
          return;
        }
        setVoiceError('未识别到语音内容，请重试');
        setVoiceHint('');
      };

      recognition.start();
      return true;
    } catch {
      speechRecognitionRef.current = null;
      speechTranscriptRef.current = '';
      speechErrorRef.current = '';
      return false;
    }
  }, [onTranscript]);

  const stopRecording = useCallback(() => {
    const recognition = speechRecognitionRef.current;
    if (recognition) {
      try {
        recognition.stop();
      } catch {
        speechRecognitionRef.current = null;
        setIsRecording(false);
      }
      return;
    }

    const recorder = mediaRecorderRef.current;
    if (!recorder) return;
    try {
      if (recorder.state !== 'inactive') recorder.stop();
    } catch {
      clearStream();
      mediaRecorderRef.current = null;
      setIsRecording(false);
    }
  }, [clearStream]);

  const startRecording = useCallback(async () => {
    if (isRecording || isTranscribing) return;
    setVoiceError('');
    setVoiceHint('');

    const browserRecognitionStarted = startBrowserRecognition();
    if (browserRecognitionStarted) return;
    await startBackendRecorder({ fromFallback: true });
  }, [isRecording, isTranscribing, startBackendRecorder, startBrowserRecognition]);

  useEffect(() => {
    const browserRecognitionSupported = !!getSpeechRecognitionCtor();
    const recorderSupported =
      typeof window !== 'undefined' &&
      typeof navigator !== 'undefined' &&
      !!navigator.mediaDevices?.getUserMedia &&
      !!(window as any).MediaRecorder;
    setAudioSupported(browserRecognitionSupported || recorderSupported);
  }, []);

  useEffect(() => {
    return () => {
      const recognition = speechRecognitionRef.current;
      if (recognition) {
        try { recognition.stop?.(); } catch { /* ignore */ }
        try { recognition.abort?.(); } catch { /* ignore */ }
      }
      speechRecognitionRef.current = null;
      try {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
          mediaRecorderRef.current.stop();
        }
      } catch {
        // ignore
      }
      clearStream();
    };
  }, [clearStream]);

  return {
    audioSupported,
    isRecording,
    isTranscribing,
    voiceError,
    voiceHint,
    setVoiceError,
    setVoiceHint,
    startRecording,
    stopRecording,
  };
};
