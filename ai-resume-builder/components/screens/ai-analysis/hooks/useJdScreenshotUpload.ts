import { useState } from 'react';

type Params = {
  getBackendAuthToken: () => Promise<string>;
  buildApiUrl: (path: string) => string;
  setJdText: (v: string) => void;
};

export const useJdScreenshotUpload = ({
  getBackendAuthToken,
  buildApiUrl,
  setJdText,
}: Params) => {
  const JD_MAX_CHARS = 1500;
  const [isUploading, setIsUploading] = useState(false);

  const readFileAsDataUrl = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (event) => resolve(String(event.target?.result || ''));
      reader.onerror = () => reject(new Error('文件读取失败'));
      reader.readAsDataURL(file);
    });

  const loadImage = (dataUrl: string) =>
    new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('图片加载失败'));
      img.src = dataUrl;
    });

  const maybeCompressImage = async (file: File): Promise<string> => {
    const originalDataUrl = await readFileAsDataUrl(file);

    // Small images are sent directly to avoid unnecessary client-side re-encoding cost.
    if (file.size <= 1.2 * 1024 * 1024) {
      return originalDataUrl;
    }

    const img = await loadImage(originalDataUrl);
    const maxSide = 1800;
    const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
    const width = Math.max(1, Math.round(img.width * scale));
    const height = Math.max(1, Math.round(img.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return originalDataUrl;

    ctx.drawImage(img, 0, 0, width, height);

    // WebP usually gives much smaller payload for screenshot-like images.
    let quality = 0.9;
    let compressed = canvas.toDataURL('image/webp', quality);
    const maxBytes = 1.3 * 1024 * 1024;
    while (compressed.length * 0.75 > maxBytes && quality > 0.55) {
      quality -= 0.08;
      compressed = canvas.toDataURL('image/webp', quality);
    }

    // If compression unexpectedly grows payload, fall back to original.
    if (compressed.length >= originalDataUrl.length) {
      return originalDataUrl;
    }
    return compressed;
  };

  const handleScreenshotUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const maxSize = 5 * 1024 * 1024;
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];

    if (file.size > maxSize) {
      alert('文件大小不能超过5MB');
      return;
    }

    if (!allowedTypes.includes(file.type)) {
      alert('只支持JPG、PNG和WEBP格式的图片');
      return;
    }

    setIsUploading(true);

    try {
      const base64Image = await maybeCompressImage(file);
      const token = await getBackendAuthToken();
      if (!token) {
        alert('登录已过期，请重新登录');
        return;
      }

      const response = await fetch(buildApiUrl('/api/ai/parse-screenshot'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token.trim()}`
        },
        body: JSON.stringify({ image: base64Image })
      });

      if (response.ok) {
        const result = await response.json();
        if (result?.success && result?.text) {
          const text = String(result.text || '');
          const clipped = text.slice(0, JD_MAX_CHARS);
          setJdText(clipped);
          if (text.length > JD_MAX_CHARS) {
            alert(`截图识别成功，内容较长，已截取前 ${JD_MAX_CHARS} 字填充到文本框`);
          } else {
            alert('截图识别成功，已填充到文本框');
          }
        } else {
          alert(result?.error || '截图识别失败，请重试');
        }
      } else {
        alert('截图识别失败，请重试');
      }
    } catch (error) {
      console.error('Screenshot upload error:', error);
      alert('上传失败，请重试');
    } finally {
      setIsUploading(false);
      e.target.value = '';
    }
  };

  return {
    isUploading,
    handleScreenshotUpload,
  };
};
