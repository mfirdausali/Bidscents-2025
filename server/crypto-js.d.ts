declare module 'crypto-js' {
  namespace CryptoJS {
    interface WordArray {
      toString(encoder?: any): string;
      concat(wordArray: WordArray): WordArray;
      clamp(): void;
      clone(): WordArray;
      words: number[];
      sigBytes: number;
    }

    interface Encoder {
      parse(str: string): WordArray;
      stringify(wordArray: WordArray): string;
    }

    interface CipherParams {
      ciphertext: WordArray;
      key: WordArray;
      iv: WordArray;
      salt: WordArray;
      algorithm: any;
      mode: any;
      padding: any;
      blockSize: number;
      formatter: any;
    }

    interface AES {
      encrypt(message: string, key: string | WordArray, cfg?: any): CipherParams;
      decrypt(ciphertext: any, key: string | WordArray, cfg?: any): WordArray;
    }

    interface Lib {
      WordArray: {
        create: (words?: number[], sigBytes?: number) => WordArray;
        random: (nBytes?: number) => WordArray;
      };
    }

    const enc: {
      Utf8: Encoder;
      Latin1: Encoder;
      Hex: Encoder;
      Base64: Encoder;
    };

    const lib: Lib;
    const AES: AES;
  }

  export = CryptoJS;
}