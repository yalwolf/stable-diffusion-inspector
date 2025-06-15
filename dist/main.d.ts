export interface ImageMetadata {
    keyword: string;
    text: string;
}

export interface FileInfoItem {
    key: string;
    value: string | {
        [key: string]: any;
    };
}

export interface ModelType {
    name: string;
    identifier: string;
    usage: string;
    sigs: string[];
}

export interface ImageInspectionResult {
    fileInfo: FileInfoItem[];
    exif?: any[];
    imageInfo?: {
        width: number;
        height: number;
        size: string;
    };
    jsonData?: any;
}

export interface ModelInspectionResult {
    fileInfo: FileInfoItem[];
    jsonData?: any;
}

declare class SDMetadataParser {
    private modelTypes;
    private availableImgExt;
    private availableModelExt;

    /**
     * 检查文件类型并分发给相应的解析器
     * @param filePath 文件路径
     */
    inspectFile(filePath: string): Promise<ImageInspectionResult | ModelInspectionResult>;

    /**
     * 解析图片文件的元数据
     * @param filePath 图片文件路径
     */
    inspectImage(filePath: string): Promise<ImageInspectionResult>;

    /**
     * 解析模型文件的元数据
     * @param filePath 模型文件路径
     */
    inspectModel(filePath: string): Promise<ModelInspectionResult>;

    /**
     * 从safetensors文件提取元数据
     * @param buffer 文件Buffer
     */
    private getSafetensorsMeta;
    /**
     * 读取图片文件的EXIF数据
     * @param buffer 图片Buffer
     */
    private readExif;
    /**
     * 从图片文件中提取元数据
     * @param buffer 图片Buffer
     * @param fileName 文件名（用于确定类型）
     */
    private extractMetadata;
    /**
     * 处理WebUI生成的标签
     * @param data 原始数据
     */
    private handleWebUiTag;
    /**
     * 读取图片文件信息
     * @param buffer 图片Buffer
     * @param fileName 文件名
     * @param fileSize 文件大小
     * @param metadata 元数据
     */
    private readImageFileInfo;
    /**
     * 检查是否需要显示JSON查看器
     * @param title 标题
     */
    private showJsonViewer;
    /**
     * 格式化字节大小
     * @param size 字节大小
     */
    private printableBytes;
    /**
     * 获取隐藏的EXIF数据（待实现）
     * @param buffer 图片Buffer
     */
    private getStealthExif;
}

export default SDMetadataParser;
//# sourceMappingURL=main.d.ts.map