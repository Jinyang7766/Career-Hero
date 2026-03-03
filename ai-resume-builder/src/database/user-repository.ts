import { supabase } from '../supabase-client';

const isNoRowsError = (error: any) => {
  const code = String(error?.code || '').trim().toUpperCase();
  const msg = String(error?.message || '').toLowerCase();
  return code === 'PGRST116' || msg.includes('contains 0 rows') || msg.includes('single json object');
};

export const createUserRecord = async (userId: string, email: string, name: string) => {
  try {
    const { error } = await supabase
      .from('users')
      .insert({
        id: userId,
        email,
        name,
        created_at: new Date().toISOString(),
      });

    if (error) {
      console.error('Error creating user record:', error);
      return { success: false, error };
    }

    return { success: true };
  } catch (err) {
    console.error('Database operation failed:', err);
    return { success: false, error: err };
  }
};

export const getUserRecord = async (userId: string) => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      if (isNoRowsError(error)) {
        return { success: false, error: null, data: null };
      }
      console.error('Error fetching user:', error);
      return { success: false, error, data: null };
    }

    return { success: true, data };
  } catch (err) {
    console.error('Database operation failed:', err);
    return { success: false, error: err, data: null };
  }
};

export const updateUserRecord = async (userId: string, updates: any) => {
  try {
    const { error } = await supabase
      .from('users')
      .update({
        ...updates,
      })
      .eq('id', userId);

    if (error) {
      console.error('Error updating user:', error);
      return { success: false, error };
    }

    return { success: true };
  } catch (err) {
    console.error('Database operation failed:', err);
    return { success: false, error: err };
  }
};
