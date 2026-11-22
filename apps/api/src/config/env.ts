import { z } from 'zod';
import { PAYMENT_PROVIDERS } from '@et/shared';

const bool = z.enum(['true', 'false', '1', '0']).transform((v) => v === 'true' || v === '1');

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(3000),
    DATABASE_URL: z.string().url(),
    APP_SECRET: z.string().min(32, 'APP_SECRET must be at least 32 characters'),
    PUBLIC_WEB_URL: z.string().url().default('http://localhost:5173'),
    TRUST_PROXY: z.coerce.number().int().min(0).default(0),
    ENABLE_JOBS: bool.default('true'),
    BCRYPT_COST: z.coerce.number().int().min(4).max(15).default(11),
    PAYMENT_PROVIDER: z.enum(PAYMENT_PROVIDERS).default('mock'),
    RAZORPAY_KEY_ID: z.string().optional(),
    RAZORPAY_KEY_SECRET: z.string().optional(),
    RAZORPAY_WEBHOOK_SECRET: z.string().optional(),
    WHATSAPP_PROVIDER: z.enum(['console', 'cloud-api', 'qr']).default('console'),
    /** qr only: pause between messages, and the per-number daily cap. */
    WHATSAPP_MIN_GAP_SECONDS: z.coerce.number().min(0).default(5),
    WHATSAPP_DAILY_LIMIT: z.coerce.number().int().positive().default(200),
    WHATSAPP_TOKEN: z.string().optional(),
    WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
    WHATSAPP_COUNTRY_CODE: z
      .string()
      .regex(/^\d{1,3}$/)
      .default('91'),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === 'production' && env.PAYMENT_PROVIDER === 'mock') {
      ctx.addIssue({
        code: 'custom',
        path: ['PAYMENT_PROVIDER'],
        message: 'mock is not allowed in production',
      });
    }
    if (env.WHATSAPP_PROVIDER === 'cloud-api') {
      for (const key of ['WHATSAPP_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID'] as const) {
        if (!env[key])
          ctx.addIssue({
            code: 'custom',
            path: [key],
            message: 'required when WHATSAPP_PROVIDER=cloud-api',
          });
      }
    }
    if (env.PAYMENT_PROVIDER === 'razorpay') {
      for (const key of [
        'RAZORPAY_KEY_ID',
        'RAZORPAY_KEY_SECRET',
        'RAZORPAY_WEBHOOK_SECRET',
      ] as const) {
        if (!env[key])
          ctx.addIssue({
            code: 'custom',
            path: [key],
            message: 'required when PAYMENT_PROVIDER=razorpay',
          });
      }
    }
  });

export type Env = z.infer<typeof schema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
    throw new Error(`Invalid environment:\n${lines.join('\n')}`);
  }
  return parsed.data;
}
