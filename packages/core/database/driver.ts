export interface SqlDriver {
  select<T>(sql: string, params?: unknown[]): Promise<T>;
  execute(sql: string, params?: unknown[]): Promise<{ rowsAffected: number; lastInsertId?: number }>;
}

let driver: SqlDriver | null = null;

export const setDriver = (d: SqlDriver) => {
  driver = d;
};

export const getDatabase = () => {
  if (!driver) throw new Error("SqlDriver not set - call setDriver() before first DB access");
  return driver;
};
