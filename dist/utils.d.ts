export declare class DataReader {
    data: number[];
    index: number;
    constructor(data: any);
    readBit(): number;
    readNBits(n: any): number[];
    readByte(): number;
    readNBytes(n: any): number[];
    readInt32(): number;
}
export declare const asyncFileReaderAsDataURL: (file: File) => Promise<string>;
export declare const tryExtractSafetensorsMeta: (content: any) => any;
export declare const getSafetensorsMeta: (file: File) => Promise<any>;
export declare const getSafetensorsMetaKohya: (file: File) => Promise<any>;
export declare function getStealthExif(src: any): Promise<any>;
//# sourceMappingURL=utils.d.ts.map