let _getSecret: (key: string) => Promise<string | null> = async () => null;

export const setSecretGetter = (fn: (key: string) => Promise<string | null>) => {
  _getSecret = fn;
};

export const getSecret = (key: string): Promise<string | null> => {
  return _getSecret(key);
};
