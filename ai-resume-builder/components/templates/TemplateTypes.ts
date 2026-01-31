export interface Template {
  id: string;
  name: string;
  category: 'modern' | 'classic' | 'creative' | 'minimal';
  thumbnail: string;
  description: string;
  isPro?: boolean;
}

export interface TemplateData {
  id: string;
  css: string;
  layout: 'single-column' | 'two-column' | 'sidebar';
}
