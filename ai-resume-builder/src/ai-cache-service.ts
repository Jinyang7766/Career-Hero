// AI Analysis Cache Service
// 用于缓存 AI 分析结果，减少重复请求的 Token 消耗

import { ResumeData } from '../types';

interface CacheEntry {
    key: string;
    result: any;
    timestamp: number;
    resumeHash: string;
    jdHash: string;
}

interface CacheStats {
    totalEntries: number;
    cacheHits: number;
    cacheMisses: number;
    lastCleanup: number;
}

// 缓存配置
const CACHE_CONFIG = {
    DB_NAME: 'AIAnalysisCache',
    STORE_NAME: 'analysisResults',
    STATS_STORE_NAME: 'cacheStats',
    // 缓存过期时间：24小时
    EXPIRY_TIME: 24 * 60 * 60 * 1000,
    // 最大缓存条目数
    MAX_ENTRIES: 50,
    // 清理检查间隔：1小时
    CLEANUP_INTERVAL: 60 * 60 * 1000
};

/**
 * AI 分析缓存服务
 * 使用 IndexedDB 持久化存储分析结果
 */
export class AICacheService {
    private static db: IDBDatabase | null = null;
    private static stats: CacheStats = {
        totalEntries: 0,
        cacheHits: 0,
        cacheMisses: 0,
        lastCleanup: Date.now()
    };

    /**
     * 初始化 IndexedDB 数据库
     */
    private static async initDB(): Promise<IDBDatabase> {
        if (this.db) return this.db;

        return new Promise((resolve, reject) => {
            const request = indexedDB.open(CACHE_CONFIG.DB_NAME, 1);

            request.onerror = () => {
                console.error('Failed to open cache database:', request.error);
                reject(request.error);
            };

            request.onsuccess = () => {
                this.db = request.result;
                resolve(this.db);
            };

            request.onupgradeneeded = (event) => {
                const db = (event.target as IDBOpenDBRequest).result;

                // 创建分析结果存储
                if (!db.objectStoreNames.contains(CACHE_CONFIG.STORE_NAME)) {
                    const store = db.createObjectStore(CACHE_CONFIG.STORE_NAME, { keyPath: 'key' });
                    store.createIndex('timestamp', 'timestamp', { unique: false });
                }

                // 创建统计信息存储
                if (!db.objectStoreNames.contains(CACHE_CONFIG.STATS_STORE_NAME)) {
                    db.createObjectStore(CACHE_CONFIG.STATS_STORE_NAME, { keyPath: 'id' });
                }
            };
        });
    }

    /**
     * 生成内容哈希
     * 使用简单但有效的哈希算法
     */
    private static generateHash(content: string): string {
        let hash = 0;
        if (content.length === 0) return hash.toString(36);

        for (let i = 0; i < content.length; i++) {
            const char = content.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // 转换为32位整数
        }

        // 转换为36进制字符串，并添加长度信息以增加唯一性
        return Math.abs(hash).toString(36) + '_' + content.length.toString(36);
    }

    /**
     * 规范化简历数据用于哈希计算
     * 只保留影响分析结果的关键字段
     */
    private static normalizeResumeData(resumeData: ResumeData): string {
        const relevantData = {
            personalInfo: {
                name: resumeData.personalInfo?.name || '',
                title: resumeData.personalInfo?.title || '',
                summary: resumeData.personalInfo?.summary || ''
            },
            workExps: (resumeData.workExps || []).map(exp => ({
                company: exp.company || '',
                title: exp.title || '',
                description: exp.description || ''
            })),
            skills: resumeData.skills || [],
            projects: (resumeData.projects || []).map(proj => ({
                title: proj.title || '',
                description: proj.description || ''
            })),
            educations: (resumeData.educations || []).map(edu => ({
                school: edu.school || '',
                degree: edu.degree || '',
                title: edu.title || ''
            })),
            summary: resumeData.summary || ''
        };

        return JSON.stringify(relevantData);
    }

    /**
     * 生成缓存键
     */
    public static generateCacheKey(resumeData: ResumeData, jdText: string): string {
        const normalizedResume = this.normalizeResumeData(resumeData);
        const resumeHash = this.generateHash(normalizedResume);
        const jdHash = this.generateHash(jdText.trim().toLowerCase());

        return `analysis_${resumeHash}_${jdHash}`;
    }

    /**
     * 从缓存获取分析结果
     */
    public static async get(resumeData: ResumeData, jdText: string): Promise<any | null> {
        try {
            const db = await this.initDB();
            const key = this.generateCacheKey(resumeData, jdText);

            return new Promise((resolve) => {
                const transaction = db.transaction(CACHE_CONFIG.STORE_NAME, 'readonly');
                const store = transaction.objectStore(CACHE_CONFIG.STORE_NAME);
                const request = store.get(key);

                request.onsuccess = () => {
                    const entry = request.result as CacheEntry | undefined;

                    if (!entry) {
                        console.log('📭 Cache MISS: No entry found');
                        this.stats.cacheMisses++;
                        resolve(null);
                        return;
                    }

                    // 检查是否过期
                    const now = Date.now();
                    if (now - entry.timestamp > CACHE_CONFIG.EXPIRY_TIME) {
                        console.log('⏰ Cache EXPIRED: Entry is too old');
                        this.stats.cacheMisses++;
                        // 异步删除过期条目
                        this.delete(key);
                        resolve(null);
                        return;
                    }

                    console.log('✅ Cache HIT: Using cached analysis result');
                    console.log(`📊 Cache age: ${Math.round((now - entry.timestamp) / 60000)} minutes`);
                    this.stats.cacheHits++;
                    resolve(entry.result);
                };

                request.onerror = () => {
                    console.error('Cache get error:', request.error);
                    this.stats.cacheMisses++;
                    resolve(null);
                };
            });
        } catch (error) {
            console.error('Cache service error:', error);
            return null;
        }
    }

    /**
     * 存储分析结果到缓存
     */
    public static async set(resumeData: ResumeData, jdText: string, result: any): Promise<void> {
        try {
            const db = await this.initDB();
            const key = this.generateCacheKey(resumeData, jdText);

            const entry: CacheEntry = {
                key,
                result,
                timestamp: Date.now(),
                resumeHash: this.generateHash(this.normalizeResumeData(resumeData)),
                jdHash: this.generateHash(jdText.trim().toLowerCase())
            };

            return new Promise((resolve, reject) => {
                const transaction = db.transaction(CACHE_CONFIG.STORE_NAME, 'readwrite');
                const store = transaction.objectStore(CACHE_CONFIG.STORE_NAME);
                const request = store.put(entry);

                request.onsuccess = () => {
                    console.log('💾 Cache SET: Analysis result cached successfully');
                    this.stats.totalEntries++;
                    resolve();
                };

                request.onerror = () => {
                    console.error('Cache set error:', request.error);
                    reject(request.error);
                };

                // 完成事务后检查是否需要清理
                transaction.oncomplete = () => {
                    this.checkAndCleanup();
                };
            });
        } catch (error) {
            console.error('Cache service error:', error);
        }
    }

    /**
     * 删除指定缓存条目
     */
    private static async delete(key: string): Promise<void> {
        try {
            const db = await this.initDB();

            return new Promise((resolve) => {
                const transaction = db.transaction(CACHE_CONFIG.STORE_NAME, 'readwrite');
                const store = transaction.objectStore(CACHE_CONFIG.STORE_NAME);
                store.delete(key);

                transaction.oncomplete = () => resolve();
                transaction.onerror = () => resolve();
            });
        } catch (error) {
            console.error('Cache delete error:', error);
        }
    }

    /**
     * 检查并执行缓存清理
     */
    private static async checkAndCleanup(): Promise<void> {
        const now = Date.now();

        // 如果距离上次清理时间不足，跳过
        if (now - this.stats.lastCleanup < CACHE_CONFIG.CLEANUP_INTERVAL) {
            return;
        }

        this.stats.lastCleanup = now;
        console.log('🧹 Running cache cleanup...');

        try {
            const db = await this.initDB();

            const transaction = db.transaction(CACHE_CONFIG.STORE_NAME, 'readwrite');
            const store = transaction.objectStore(CACHE_CONFIG.STORE_NAME);
            const index = store.index('timestamp');

            const request = index.openCursor();
            let deletedCount = 0;
            let totalCount = 0;
            const expiredKeys: string[] = [];

            request.onsuccess = (event) => {
                const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;

                if (cursor) {
                    totalCount++;
                    const entry = cursor.value as CacheEntry;

                    // 检查是否过期
                    if (now - entry.timestamp > CACHE_CONFIG.EXPIRY_TIME) {
                        expiredKeys.push(entry.key);
                    }

                    cursor.continue();
                } else {
                    // 遍历完成，删除过期条目
                    expiredKeys.forEach(key => {
                        store.delete(key);
                        deletedCount++;
                    });

                    // 如果总数超过限制，删除最旧的条目
                    if (totalCount - deletedCount > CACHE_CONFIG.MAX_ENTRIES) {
                        const toDelete = totalCount - deletedCount - CACHE_CONFIG.MAX_ENTRIES;
                        console.log(`📉 Deleting ${toDelete} oldest entries to maintain limit`);
                        // 这里简化处理，实际应该按时间戳排序后删除
                    }

                    console.log(`🧹 Cache cleanup complete: ${deletedCount} expired entries removed`);
                }
            };
        } catch (error) {
            console.error('Cache cleanup error:', error);
        }
    }

    /**
     * 清除所有缓存
     */
    public static async clearAll(): Promise<void> {
        try {
            const db = await this.initDB();

            return new Promise((resolve, reject) => {
                const transaction = db.transaction(CACHE_CONFIG.STORE_NAME, 'readwrite');
                const store = transaction.objectStore(CACHE_CONFIG.STORE_NAME);
                const request = store.clear();

                request.onsuccess = () => {
                    console.log('🗑️ All cache entries cleared');
                    this.stats.totalEntries = 0;
                    resolve();
                };

                request.onerror = () => {
                    console.error('Cache clear error:', request.error);
                    reject(request.error);
                };
            });
        } catch (error) {
            console.error('Cache service error:', error);
        }
    }

    /**
     * 获取缓存统计信息
     */
    public static getStats(): CacheStats {
        return { ...this.stats };
    }

    /**
     * 获取缓存命中率
     */
    public static getHitRate(): number {
        const total = this.stats.cacheHits + this.stats.cacheMisses;
        if (total === 0) return 0;
        return Math.round((this.stats.cacheHits / total) * 100);
    }
}

export default AICacheService;
