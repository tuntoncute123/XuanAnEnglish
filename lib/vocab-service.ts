import { z } from 'zod';
import { all, run } from './db';
import { positiveId, shortText } from './growth-validation';
const schema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('vocab_save'),
    id: positiveId.optional(),
    class_id: positiveId,
    unit: shortText,
    word: shortText,
    meaning: z.string().trim().min(1).max(500),
    example: z.string().trim().max(1000),
  }),
  z.object({ action: z.literal('vocab_delete'), id: positiveId }),
]);
export async function vocabData() {
  return all('SELECT * FROM vocab_cards ORDER BY unit,id');
}
export async function vocabAction(body: unknown) {
  const a = schema.parse(body);
  if (a.action === 'vocab_delete')
    await run('DELETE FROM vocab_cards WHERE id=?', a.id);
  else if (a.id)
    await run(
      'UPDATE vocab_cards SET class_id=?,unit=?,word=?,meaning=?,example=? WHERE id=?',
      a.class_id,
      a.unit,
      a.word,
      a.meaning,
      a.example,
      a.id,
    );
  else
    await run(
      'INSERT INTO vocab_cards(class_id,unit,word,meaning,example) VALUES(?,?,?,?,?)',
      a.class_id,
      a.unit,
      a.word,
      a.meaning,
      a.example,
    );
}
