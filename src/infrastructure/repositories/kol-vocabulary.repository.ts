import { createAdminClient } from '@/infrastructure/supabase/admin';
import type { KolVocabularyTerm, CreateKolVocabularyInput } from '@/domain/models';

type DbKolVocabulary = {
  id: string;
  kol_id: string;
  pattern: string;
  replacement: string;
  is_regex: boolean;
  category: string;
  note: string | null;
  created_at: string;
  updated_at: string;
};

function mapDbToTerm(row: DbKolVocabulary): KolVocabularyTerm {
  return {
    id: row.id,
    kolId: row.kol_id,
    pattern: row.pattern,
    replacement: row.replacement,
    isRegex: row.is_regex,
    category: row.category,
    note: row.note,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

export async function listVocabularyByKol(kolId: string): Promise<KolVocabularyTerm[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('kol_vocabulary')
    .select('*')
    .eq('kol_id', kolId)
    .order('category')
    .order('created_at');
  if (error) throw new Error(`listVocabularyByKol: ${error.message}`);
  return (data as unknown as DbKolVocabulary[]).map(mapDbToTerm);
}

export async function createVocabularyTerm(
  input: CreateKolVocabularyInput
): Promise<KolVocabularyTerm> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('kol_vocabulary')
    .insert({
      kol_id: input.kolId,
      pattern: input.pattern,
      replacement: input.replacement,
      is_regex: input.isRegex ?? false,
      category: input.category ?? 'kol_specific',
      note: input.note ?? null,
    })
    .select()
    .single();
  if (error) throw new Error(`createVocabularyTerm: ${error.message}`);
  return mapDbToTerm(data as unknown as DbKolVocabulary);
}

export async function deleteVocabularyTerm(id: string): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase.from('kol_vocabulary').delete().eq('id', id);
  if (error) throw new Error(`deleteVocabularyTerm: ${error.message}`);
}
