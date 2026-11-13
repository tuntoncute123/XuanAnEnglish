import { z } from 'zod';
import { managementFailure } from './manage-api.ts';
export const positiveId = z.number().int().positive();
export const shortText = z.string().trim().min(1).max(200);
export const daySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (s) =>
      !Number.isNaN(Date.parse(s)) &&
      new Date(s).toISOString().slice(0, 10) === s,
    'Ngày không hợp lệ',
  );
export class FeatureError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}
export async function featureBody(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new FeatureError('Nội dung yêu cầu không phải JSON hợp lệ.');
  }
}
export function featureError(error: unknown) {
  if (error instanceof FeatureError)
    return Response.json({ error: error.message }, { status: error.status });
  if (error instanceof z.ZodError)
    return Response.json(
      {
        error:
          'Kiểm tra dữ liệu: ' +
          error.issues
            .map((i) => `${i.path.join('.')}: ${i.message}`)
            .slice(0, 3)
            .join('; '),
      },
      { status: 400 },
    );
  console.error(
    'Learning feature:',
    error instanceof Error ? error.message : 'Unknown error',
  );
  const failure = managementFailure(error);
  return Response.json(failure.body, { status: failure.status });
}
