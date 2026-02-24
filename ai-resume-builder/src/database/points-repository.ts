import { supabase } from '../supabase-client';

export const createPointsLedgerEntry = async (entry: {
  userId: string;
  delta: number;
  action: string;
  sourceType?: string | null;
  sourceId?: string | number | null;
  note?: string | null;
  balanceAfter?: number | null;
  metadata?: any;
}) => {
  try {
    const { error } = await supabase
      .from('points_ledger')
      .insert({
        user_id: entry.userId,
        delta: entry.delta,
        action: entry.action,
        source_type: entry.sourceType ?? null,
        source_id: entry.sourceId == null ? null : String(entry.sourceId),
        note: entry.note ?? null,
        balance_after: entry.balanceAfter ?? null,
        metadata: entry.metadata ?? null,
        created_at: new Date().toISOString(),
      });

    if (error) {
      console.error('Error creating points ledger:', error);
      return { success: false, error };
    }
    return { success: true };
  } catch (err) {
    console.error('Database operation failed:', err);
    return { success: false, error: err };
  }
};

export const listPointsLedgerEntries = async (userId: string, limit: number = 200) => {
  try {
    const safeLimit = Math.max(1, Math.min(500, Number(limit) || 200));
    const { data, error } = await supabase
      .from('points_ledger')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(safeLimit);

    if (error) {
      console.error('Error listing points ledger:', error);
      return { success: false, error, data: [] as any[] };
    }
    return { success: true, data: data || [] };
  } catch (err) {
    console.error('Database operation failed:', err);
    return { success: false, error: err, data: [] as any[] };
  }
};
