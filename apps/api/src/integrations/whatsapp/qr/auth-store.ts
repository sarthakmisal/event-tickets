import { BufferJSON, initAuthCreds, proto } from '@whiskeysockets/baileys';
import type { SignalDataTypeMap } from '@whiskeysockets/baileys';
import type { Db } from '../../../db/schema';
import type { AuthHandle } from './types';

const encode = (value: unknown) => JSON.stringify(value, BufferJSON.replacer);
const decode = <T>(text: string): T => JSON.parse(text, BufferJSON.reviver) as T;

/** Baileys auth state (credentials + signal keys) persisted in Postgres, so restarts keep the link. */
export function createAuthStore(db: Db) {
  return {
    async load(ownerKey: string): Promise<AuthHandle> {
      const row = await db
        .selectFrom('whatsapp_sessions')
        .select('creds')
        .where('owner_key', '=', ownerKey)
        .executeTakeFirst();
      const creds = row ? decode<ReturnType<typeof initAuthCreds>>(row.creds) : initAuthCreds();
      if (!row) {
        await db
          .insertInto('whatsapp_sessions')
          .values({ owner_key: ownerKey, creds: encode(creds) })
          .onConflict((oc) => oc.column('owner_key').doNothing())
          .execute();
      }
      return {
        state: {
          creds,
          keys: {
            get: async (type, ids) => {
              const rows = ids.length
                ? await db
                    .selectFrom('whatsapp_auth_keys')
                    .select(['id', 'value'])
                    .where('owner_key', '=', ownerKey)
                    .where('type', '=', type)
                    .where('id', 'in', ids)
                    .execute()
                : [];
              const data: { [id: string]: SignalDataTypeMap[typeof type] } = {};
              for (const { id, value } of rows) {
                const parsed = decode<SignalDataTypeMap[typeof type]>(value);
                data[id] =
                  type === 'app-state-sync-key'
                    ? (proto.Message.AppStateSyncKeyData.fromObject(
                        parsed as object,
                      ) as unknown as SignalDataTypeMap[typeof type])
                    : parsed;
              }
              return data;
            },
            set: async (data) => {
              for (const [type, entries] of Object.entries(data)) {
                for (const [id, value] of Object.entries(entries ?? {})) {
                  if (value) {
                    await db
                      .insertInto('whatsapp_auth_keys')
                      .values({ owner_key: ownerKey, type, id, value: encode(value) })
                      .onConflict((oc) =>
                        oc
                          .columns(['owner_key', 'type', 'id'])
                          .doUpdateSet({ value: encode(value) }),
                      )
                      .execute();
                  } else {
                    await db
                      .deleteFrom('whatsapp_auth_keys')
                      .where('owner_key', '=', ownerKey)
                      .where('type', '=', type)
                      .where('id', '=', id)
                      .execute();
                  }
                }
              }
            },
          },
        },
        saveCreds: async () => {
          await db
            .updateTable('whatsapp_sessions')
            .set({ creds: encode(creds), updated_at: new Date() })
            .where('owner_key', '=', ownerKey)
            .execute();
        },
      };
    },

    async markRegistered(ownerKey: string, phone: string): Promise<void> {
      await db
        .updateTable('whatsapp_sessions')
        .set({ registered: true, phone })
        .where('owner_key', '=', ownerKey)
        .execute();
    },

    /** Forgets the link entirely (keys cascade). */
    async clear(ownerKey: string): Promise<void> {
      await db.deleteFrom('whatsapp_sessions').where('owner_key', '=', ownerKey).execute();
    },

    /** Sessions that were linked before, to reconnect on boot. */
    async listRegistered(): Promise<string[]> {
      const rows = await db
        .selectFrom('whatsapp_sessions')
        .select('owner_key')
        .where('registered', '=', true)
        .execute();
      return rows.map((r) => r.owner_key);
    },
  };
}

export type AuthStore = ReturnType<typeof createAuthStore>;
