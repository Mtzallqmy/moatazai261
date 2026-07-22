import "server-only";
export interface SecretCrypto { encrypt(plaintext:string,context:{userId:string;providerId:string}):Promise<string>; decrypt(ciphertext:string,context:{userId:string;providerId:string}):Promise<string>; }
export class UnconfiguredSecretCrypto implements SecretCrypto { async encrypt():Promise<string>{throw new Error("Configure KMS or Vault before storing provider secrets");} async decrypt():Promise<string>{throw new Error("Configure KMS or Vault before reading provider secrets");} }
