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
  const [isUploading, setIsUploading] = useState(false);

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
      const reader = new FileReader();
      reader.onload = async (event) => {
        const base64Image = event.target?.result as string;

        const token = await getBackendAuthToken();
        if (!token) {
          alert('登录已过期，请重新登录');
          setIsUploading(false);
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
            setJdText(result.text);
            alert('截图识别成功，已填充到文本框');
          } else {
            alert(result?.error || '截图识别失败，请重试');
          }
        } else {
          alert('截图识别失败，请重试');
        }

        setIsUploading(false);
      };

      reader.onerror = () => {
        alert('文件读取失败，请重试');
        setIsUploading(false);
      };

      reader.readAsDataURL(file);
    } catch (error) {
      console.error('Screenshot upload error:', error);
      alert('上传失败，请重试');
      setIsUploading(false);
    }
  };

  return {
    isUploading,
    handleScreenshotUpload,
  };
};

