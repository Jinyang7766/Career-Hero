import React, { useEffect, useRef, useState } from 'react';
import { buildApiUrl } from '../../../../src/api-config';
import type { ChatMessage } from '../types';
import { detectSilentAudio, isVoiceDebugEnabled, pickRecorderMime } from '../interview-voice-utils';

type AudioOverride = { blob: Blob; url: string; mime: string; duration?: number };

type Params = {
  currentStep: string;
  chatMessagesRef: React.MutableRefObject<ChatMessage[]>;
  setChatMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  handleSendMessage: (
    textOverride?: string,
    audioOverride?: AudioOverride | null,
    opts?: { skipAddUserMessage?: boolean; existingUserMessageId?: string }
  ) => Promise<void>;
  showToast: (msg: string, type?: 'info' | 'success' | 'error', ms?: number) => void;
  getBackendAuthToken: () => Promise<string>;
};

export const useInterviewVoice = ({
  currentStep,
  chatMessagesRef,
  setChatMessages,
  handleSendMessage,
  showToast,
  getBackendAuthToken,
}: Params) => {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recordChunksRef = useRef<BlobPart[]>([]);
  const [audioSupported, setAudioSupported] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const isRecordingRef = useRef(false);
  const setRecording = (v: boolean) => {
    isRecordingRef.current = v;
    setIsRecording(v);
  };
  const [audioError, setAudioError] = useState<string>('');
  const [inputMode, setInputMode] = useState<'text' | 'voice'>('text');
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const holdStartRef = useRef<{ x: number; y: number } | null>(null);
  const holdActiveRef = useRef(false);
  const holdPointerIdRef = useRef<number | null>(null);
  const holdMaxTimerRef = useRef<number | null>(null);
  const holdTalkBtnRef = useRef<HTMLButtonElement | null>(null);
  const holdSessionRef = useRef(0);
  const [holdCancel, setHoldCancel] = useState(false);
  const holdCancelRef = useRef(false);
  const holdStartTimeRef = useRef<number>(0);
  const holdAwaitAudioSendRef = useRef(false);
  const voicePendingUserMsgIdRef = useRef<string | null>(null);
  const voiceBlobByMsgIdRef = useRef<Map<string, { blob: Blob; mime: string }>>(new Map());
  const voiceSilenceByMsgIdRef = useRef<Map<string, boolean>>(new Map());
  const [transcribingByMsgId, setTranscribingByMsgId] = useState<Record<string, boolean>>({});
  const audioCtxRef = useRef<AudioContext | null>(null);
  const voiceMeterStreamRef = useRef<MediaStream | null>(null);
  const voiceMeterOwnsStreamRef = useRef(false);
  const audioRafRef = useRef<number | null>(null);
  const fakeMeterTimerRef = useRef<number | null>(null);
  const [visualizerData, setVisualizerData] = useState<number[]>(new Array(24).fill(4));
  const holdVoicePeakRef = useRef(0);
  const holdAudioDiscardRef = useRef(false);
  const shortHoldToastAtRef = useRef(0);
  const showShortHoldToast = () => {
    const now = Date.now();
    if (now - shortHoldToastAtRef.current < 1500) return;
    shortHoldToastAtRef.current = now;
    showToast('按键时间太短，请按住说话', 'info', 1400);
  };
  const stopMicStreamNow = () => {
    if (!mediaStreamRef.current) return;
    try { mediaStreamRef.current.getTracks().forEach((t) => t.stop()); } catch { }
    mediaStreamRef.current = null;
  };

  useEffect(() => {
    const ok =
      typeof window !== 'undefined' &&
      typeof navigator !== 'undefined' &&
      !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia) &&
      !!((window as any).MediaRecorder);
    setAudioSupported(ok);
  }, []);

  useEffect(() => {
    if (!isRecording) return;

    const docEl = document.documentElement;
    const body = document.body;
    const prev = {
      docUserSelect: docEl.style.userSelect,
      docWebkitUserSelect: (docEl.style as any).webkitUserSelect,
      bodyUserSelect: body.style.userSelect,
      bodyWebkitUserSelect: (body.style as any).webkitUserSelect,
      bodyWebkitTouchCallout: (body.style as any).webkitTouchCallout,
    };

    docEl.style.userSelect = 'none';
    (docEl.style as any).webkitUserSelect = 'none';
    body.style.userSelect = 'none';
    (body.style as any).webkitUserSelect = 'none';
    (body.style as any).webkitTouchCallout = 'none';

    const prevent = (e: Event) => {
      try { e.preventDefault(); } catch { }
    };
    document.addEventListener('contextmenu', prevent, true);
    document.addEventListener('selectstart', prevent, true);
    document.addEventListener('dragstart', prevent, true);

    return () => {
      document.removeEventListener('contextmenu', prevent, true);
      document.removeEventListener('selectstart', prevent, true);
      document.removeEventListener('dragstart', prevent, true);
      docEl.style.userSelect = prev.docUserSelect;
      (docEl.style as any).webkitUserSelect = prev.docWebkitUserSelect;
      body.style.userSelect = prev.bodyUserSelect;
      (body.style as any).webkitUserSelect = prev.bodyWebkitUserSelect;
      (body.style as any).webkitTouchCallout = prev.bodyWebkitTouchCallout;
    };
  }, [isRecording]);

  const cleanupVoiceMeter = () => {
    if (fakeMeterTimerRef.current) {
      try { window.clearInterval(fakeMeterTimerRef.current); } catch { }
      fakeMeterTimerRef.current = null;
    }
    if (audioRafRef.current) {
      try { cancelAnimationFrame(audioRafRef.current); } catch { }
      audioRafRef.current = null;
    }
    if (voiceMeterStreamRef.current && voiceMeterOwnsStreamRef.current) {
      try { voiceMeterStreamRef.current.getTracks().forEach((t) => t.stop()); } catch { }
    }
    voiceMeterStreamRef.current = null;
    voiceMeterOwnsStreamRef.current = false;
    if (audioCtxRef.current) {
      try { audioCtxRef.current.close(); } catch { }
      audioCtxRef.current = null;
    }
    setVisualizerData(new Array(24).fill(4));
  };

  const startVoiceMeter = async (streamOverride?: MediaStream) => {
    cleanupVoiceMeter();
    if (!streamOverride) return;

    try {
      voiceMeterStreamRef.current = streamOverride;
      voiceMeterOwnsStreamRef.current = false;
      holdVoicePeakRef.current = 0;

      const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!AC) return;
      const ctx = new AC();
      audioCtxRef.current = ctx;
      try { await ctx.resume?.(); } catch { }

      const source = ctx.createMediaStreamSource(streamOverride);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.5;
      source.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      let lastUpdate = 0;
      const loop = (now: number) => {
        try {
          analyser.getByteFrequencyData(dataArray);
          if (now - lastUpdate > 50) {
            lastUpdate = now;
            let maxByte = 0;
            for (let i = 0; i < dataArray.length; i++) {
              const v = dataArray[i] || 0;
              if (v > maxByte) maxByte = v;
            }
            const peak = maxByte / 255;
            if (peak > holdVoicePeakRef.current) holdVoicePeakRef.current = peak;
            const newData: number[] = [];
            const step = Math.floor(dataArray.length / 12);
            for (let i = 0; i < 12; i++) {
              const val = dataArray[i * step] || 0;
              newData.push(4 + (val / 255) * 44);
            }
            setVisualizerData([...newData].reverse().concat(newData));
          }
        } catch { }
        audioRafRef.current = requestAnimationFrame(loop);
      };
      audioRafRef.current = requestAnimationFrame(loop);
    } catch (e) {
      console.warn('Voice meter failed:', e);
    }
  };

  const transcribeAudioOnBackend = async (audioObj: { blob: Blob; url: string; mime: string }) => {
    const token = await getBackendAuthToken();
    if (!token) throw new Error('请先登录以使用 AI 功能');
    const apiEndpoint = buildApiUrl('/api/ai/transcribe');
    const form = new FormData();
    form.append('file', audioObj.blob, `voice.${(audioObj.mime || 'audio/webm').includes('ogg') ? 'ogg' : 'webm'}`);
    form.append('mime_type', audioObj.mime || 'audio/webm');
    form.append('lang', 'zh-CN');
    const resp = await fetch(apiEndpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token.trim()}`,
      },
      body: form,
    });
    const json = await resp.json().catch(() => ({} as any));
    if (!resp.ok) throw new Error(json?.error || '转写失败');
    if (!json?.success) throw new Error(json?.error || '转写失败');
    return String(json?.text || '').trim();
  };

  const transcribeExistingVoiceMessage = async (msgId: string) => {
    if (transcribingByMsgId[msgId]) return;
    const audio = voiceBlobByMsgIdRef.current.get(msgId);
    if (!audio?.blob) {
      showToast('该语音无法转写（可能已过期），请重新发送', 'info');
      return;
    }
    const cachedSilent = voiceSilenceByMsgIdRef.current.get(msgId);
    if (cachedSilent === true) {
      showToast('未识别到语音内容', 'info');
      return;
    }

    setTranscribingByMsgId((prev) => ({ ...prev, [msgId]: true }));
    try {
      const text = await transcribeAudioOnBackend({ blob: audio.blob, url: '', mime: audio.mime });
      if (!text) {
        showToast('未识别到语音内容', 'info');
        return;
      }
      const updated = chatMessagesRef.current.map((m) => (m.id === msgId ? { ...m, text } : m));
      chatMessagesRef.current = updated;
      setChatMessages(updated);
    } catch (e) {
      const msg =
        (e && typeof e === 'object' && 'message' in (e as any) && String((e as any).message || '').trim())
          ? String((e as any).message).trim()
          : '转写失败，请稍后重试';
      showToast(msg, 'error');
      if (isVoiceDebugEnabled()) console.debug('[voice] transcribeExistingVoiceMessage failed', e);
    } finally {
      setTranscribingByMsgId((prev) => {
        const next = { ...prev };
        delete next[msgId];
        return next;
      });
    }
  };

  const startAudioRecorder = async (token: number) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      startVoiceMeter(stream);
      const mime = pickRecorderMime();
      const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      mediaRecorderRef.current = rec;
      recordChunksRef.current = [];

      rec.ondataavailable = (e: any) => {
        try {
          if (e?.data && e.data.size > 0) recordChunksRef.current.push(e.data);
        } catch { }
      };

      rec.onstop = () => {
        if (holdAudioDiscardRef.current) {
          holdAudioDiscardRef.current = false;
          stopMicStreamNow();
          mediaRecorderRef.current = null;
          recordChunksRef.current = [];
          return;
        }

        let blob: Blob | null = null;
        try {
          blob = new Blob(recordChunksRef.current, { type: mime || 'audio/webm' });
        } catch { }

        stopMicStreamNow();
        mediaRecorderRef.current = null;
        recordChunksRef.current = [];

        if (!blob || !blob.size) {
          if (isVoiceDebugEnabled()) console.debug('[voice] audio recorder stopped: empty blob');
          try {
            const pendingId = voicePendingUserMsgIdRef.current;
            voicePendingUserMsgIdRef.current = null;
            holdAwaitAudioSendRef.current = false;
            if (pendingId) {
              const filtered = chatMessagesRef.current.filter((m) => m.id !== pendingId);
              chatMessagesRef.current = filtered;
              setChatMessages(filtered);
            }
          } catch { }
          showToast('录音失败，请重试', 'error');
          return;
        }

        if (isVoiceDebugEnabled()) {
          console.debug('[voice] audio recorder stopped', {
            token,
            size: blob.size,
            mime: blob.type || mime || 'audio/webm',
            peak: holdVoicePeakRef.current,
          });
        }

        const userMsgId = voicePendingUserMsgIdRef.current;
        if (!userMsgId) return;
        voicePendingUserMsgIdRef.current = null;
        const duration = Math.max(1, Math.round((Date.now() - holdStartTimeRef.current) / 1000));

        (async () => {
          const peak = holdVoicePeakRef.current;
          let silentVerdict: boolean | null = null;
          if (peak < 0.08) silentVerdict = await detectSilentAudio(blob!);

          if (silentVerdict === true) {
            try { voiceSilenceByMsgIdRef.current.set(userMsgId, true); } catch { }
            const filtered = chatMessagesRef.current.filter((m) => m.id !== userMsgId);
            const aiMsg: ChatMessage = {
              id: `ai-${Date.now()}`,
              role: 'model',
              text: '未识别到语音内容。请检查：是否已允许麦克风权限、是否连接了蓝牙耳机、是否有其他应用占用麦克风。',
            };
            const next = [...filtered, aiMsg];
            chatMessagesRef.current = next;
            setChatMessages(next);
            holdAwaitAudioSendRef.current = false;
            return;
          }

          const url = URL.createObjectURL(blob!);
          const audioObj = { blob: blob!, url, mime: blob!.type || mime || 'audio/webm' };
          try { voiceBlobByMsgIdRef.current.set(userMsgId, { blob: audioObj.blob, mime: audioObj.mime }); } catch { }
          try { voiceSilenceByMsgIdRef.current.set(userMsgId, false); } catch { }

          const updated = chatMessagesRef.current.map((m) =>
            m.id === userMsgId
              ? { ...m, text: '（语音）', audioPending: false, audioUrl: audioObj.url, audioMime: audioObj.mime, audioDuration: duration }
              : m
          );
          chatMessagesRef.current = updated;
          setChatMessages(updated);

          if (holdAwaitAudioSendRef.current) {
            holdAwaitAudioSendRef.current = false;
            try {
              await handleSendMessage('', { ...audioObj, duration }, { skipAddUserMessage: true, existingUserMessageId: userMsgId });
            } catch { }
          }
        })();
      };

      rec.onerror = (e: any) => {
        if (isVoiceDebugEnabled()) console.debug('[voice] audio recorder error', e);
      };

      try { rec.start(120); } catch { rec.start(); }
    } catch (e: any) {
      const name = String(e?.name || '').toLowerCase();
      if (name.includes('notallowed') || name.includes('permission')) {
        setAudioError('无法使用麦克风：请在浏览器权限中允许麦克风访问');
      } else {
        setAudioError('麦克风启动失败，请重试');
      }
      stopMicStreamNow();
      mediaRecorderRef.current = null;
      setRecording(false);
      cleanupVoiceMeter();
      if (isVoiceDebugEnabled()) console.debug('[voice] startAudioRecorder failed', e);
    }
  };

  const stopAudioRecorder = (discard: boolean) => {
    const rec = mediaRecorderRef.current;
    if (!rec) {
      stopMicStreamNow();
      return;
    }
    holdAudioDiscardRef.current = !!discard;
    if (discard) holdAwaitAudioSendRef.current = false;
    try {
      if (rec.state !== 'inactive') {
        try { (rec as any).requestData?.(); } catch { }
        rec.stop();
      } else {
        stopMicStreamNow();
      }
    } catch {
      stopMicStreamNow();
      mediaRecorderRef.current = null;
    }
    // Hard fallback: ensure microphone is released even if onstop is delayed.
    window.setTimeout(() => {
      stopMicStreamNow();
    }, 450);
  };

  const MIN_VOICE_HOLD_MS = 600;
  const MAX_VOICE_HOLD_MS = 3 * 60 * 1000;

  const clearHoldMaxTimer = () => {
    if (holdMaxTimerRef.current) {
      try { window.clearTimeout(holdMaxTimerRef.current); } catch { }
      holdMaxTimerRef.current = null;
    }
  };

  const setMode = (mode: 'text' | 'voice') => {
    setInputMode(mode);
    setAudioError('');
    if (mode === 'voice') {
      try { textareaRef.current?.blur(); } catch { }
    } else {
      setTimeout(() => {
        try { textareaRef.current?.focus(); } catch { }
      }, 0);
    }
  };

  const onHoldPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setMode('voice');
    try { (e.currentTarget as any).setPointerCapture?.(e.pointerId); } catch { }
    holdActiveRef.current = true;
    holdPointerIdRef.current = e.pointerId;
    clearHoldMaxTimer();
    holdSessionRef.current += 1;
    const token = holdSessionRef.current;
    holdAwaitAudioSendRef.current = false;
    voicePendingUserMsgIdRef.current = null;
    holdStartRef.current = { x: e.clientX, y: e.clientY };
    holdStartTimeRef.current = Date.now();
    holdCancelRef.current = false;
    holdVoicePeakRef.current = 0;
    setHoldCancel(false);
    setAudioError('');
    setRecording(true);
    startAudioRecorder(token);

    holdMaxTimerRef.current = window.setTimeout(() => {
      if (!holdActiveRef.current) return;
      holdActiveRef.current = false;
      holdStartRef.current = null;
      holdCancelRef.current = false;
      setHoldCancel(false);

      const heldMs = Date.now() - (holdStartTimeRef.current || Date.now());
      if (heldMs < MIN_VOICE_HOLD_MS) {
        voicePendingUserMsgIdRef.current = null;
        holdAwaitAudioSendRef.current = false;
        stopAudioRecorder(true);
        setRecording(false);
        cleanupVoiceMeter();
        showShortHoldToast();
        return;
      }

      const userMsgId = `user-voice-${Date.now()}`;
      voicePendingUserMsgIdRef.current = userMsgId;
      const duration = Math.max(1, Math.round((Date.now() - holdStartTimeRef.current) / 1000));
      const placeholder: ChatMessage = { id: userMsgId, role: 'user', text: '', audioPending: true, audioDuration: duration };
      const next = [...chatMessagesRef.current, placeholder];
      chatMessagesRef.current = next;
      setChatMessages(next);

      holdAwaitAudioSendRef.current = true;
      stopAudioRecorder(false);
      setRecording(false);
      cleanupVoiceMeter();
      showToast('已达到3分钟上限，已自动发送', 'info');

      try {
        const pid = holdPointerIdRef.current;
        if (pid !== null) holdTalkBtnRef.current?.releasePointerCapture?.(pid);
      } catch { }
      holdPointerIdRef.current = null;
      clearHoldMaxTimer();
    }, MAX_VOICE_HOLD_MS);
  };

  const onHoldPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!holdStartRef.current) return;
    const el = e.currentTarget as HTMLElement;
    const rect = el.getBoundingClientRect();
    const insideX = e.clientX >= rect.left && e.clientX <= rect.right;
    const insideY = e.clientY >= rect.top && e.clientY <= rect.bottom;
    const startY = holdStartRef.current.y;
    const dy = startY - e.clientY;
    const screenDy = typeof window !== 'undefined' ? window.innerHeight / 3 : 240;
    const cancelThreshold = Math.max(120, Math.floor(screenDy));
    const cancel = (insideX && insideY) ? false : (dy > cancelThreshold);
    if (cancel !== holdCancelRef.current) {
      holdCancelRef.current = cancel;
      setHoldCancel(cancel);
    }
  };

  const onHoldPointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    try { (e.currentTarget as any).releasePointerCapture?.(e.pointerId); } catch { }
    clearHoldMaxTimer();
    holdPointerIdRef.current = null;
    if (!holdActiveRef.current) return;
    const cancel = holdCancelRef.current;
    holdActiveRef.current = false;
    holdStartRef.current = null;
    holdCancelRef.current = false;
    setHoldCancel(false);
    if (cancel) {
      voicePendingUserMsgIdRef.current = null;
      stopAudioRecorder(true);
    } else {
      const heldMs = Date.now() - (holdStartTimeRef.current || Date.now());
      if (heldMs < MIN_VOICE_HOLD_MS) {
        voicePendingUserMsgIdRef.current = null;
        holdAwaitAudioSendRef.current = false;
        stopAudioRecorder(true);
        setRecording(false);
        cleanupVoiceMeter();
        showShortHoldToast();
        return;
      }
      const userMsgId = `user-voice-${Date.now()}`;
      voicePendingUserMsgIdRef.current = userMsgId;
      const duration = Math.max(1, Math.round((Date.now() - holdStartTimeRef.current) / 1000));
      const placeholder: ChatMessage = { id: userMsgId, role: 'user', text: '', audioPending: true, audioDuration: duration };
      const next = [...chatMessagesRef.current, placeholder];
      chatMessagesRef.current = next;
      setChatMessages(next);

      holdAwaitAudioSendRef.current = true;
      stopAudioRecorder(false);
    }
    setRecording(false);
    cleanupVoiceMeter();
  };

  const onHoldPointerCancel = (e: React.PointerEvent<HTMLButtonElement>) => {
    try { (e.currentTarget as any).releasePointerCapture?.(e.pointerId); } catch { }
    clearHoldMaxTimer();
    holdPointerIdRef.current = null;
    holdActiveRef.current = false;
    holdStartRef.current = null;
    holdCancelRef.current = false;
    setHoldCancel(false);
    voicePendingUserMsgIdRef.current = null;
    stopAudioRecorder(true);
    setRecording(false);
    cleanupVoiceMeter();
  };

  useEffect(() => {
    if (currentStep !== 'chat') {
      if (isRecordingRef.current) {
        setRecording(false);
        holdActiveRef.current = false;
        try {
          if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            mediaRecorderRef.current.stop();
          }
        } catch { }
      }
      stopMicStreamNow();
      cleanupVoiceMeter();
      clearHoldMaxTimer();
      holdCancelRef.current = false;
      setHoldCancel(false);
    }
  }, [currentStep]);

  useEffect(() => {
    return () => {
      try {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
          mediaRecorderRef.current.stop();
        }
      } catch { }
      stopMicStreamNow();
      cleanupVoiceMeter();
      clearHoldMaxTimer();
    };
  }, []);

  const toggleChatInputMode = () => setMode(inputMode === 'text' ? 'voice' : 'text');
  const hasVoiceBlobForMsg = (msgId: string) => !!voiceBlobByMsgIdRef.current.get(msgId)?.blob;

  return {
    audioSupported,
    isRecording,
    audioError,
    setAudioError,
    inputMode,
    textareaRef,
    holdTalkBtnRef,
    holdCancel,
    visualizerData,
    transcribingByMsgId,
    toggleChatInputMode,
    onHoldPointerDown,
    onHoldPointerMove,
    onHoldPointerUp,
    onHoldPointerCancel,
    hasVoiceBlobForMsg,
    transcribeExistingVoiceMessage,
  };
};
