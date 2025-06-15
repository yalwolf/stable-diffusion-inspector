// 使用Deno的路径模块
import * as path from "jsr:@std/path@1";
import ExifReader from "npm:exifreader@3.16.0";
import extractChunks from "npm:png-chunks-extract@1.0.0";
import * as pngChunkText from "npm:png-chunk-text@1.0.0";
import bytes from "npm:bytes@3.1.2";
import imageSize from "npm:image-size@1.0.2";
// 修复JSON模块导入语法
import modelsig from "./modelsig.json" with { type: "json" };
import { Buffer } from "node:buffer"; // 添加Buffer导入

// 类型定义保持不变
export interface ImageMetadata {
    keyword: string;
    text: string;
}

export interface FileInfoItem {
    key: string;
    value: string | { [key: string]: any };
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

class SDMetadataParser {
    private modelTypes: ModelType[] = modelsig.data;
    private availableImgExt = ['png', 'jpeg', 'jpg', 'webp', 'bmp', 'avif'];
    private availableModelExt = ['pt', 'pth', 'ckpt', 'safetensors', 'bin'];

    /**
     * 检查文件类型并分发给相应的解析器
     * @param filePath 文件路径
     */
    async inspectFile(filePath: string): Promise<ImageInspectionResult | ModelInspectionResult> {
        const ext = path.extname(filePath).slice(1).toLowerCase();

        if (this.availableImgExt.includes(ext)) {
            return this.inspectImage(filePath);
        } else if (this.availableModelExt.includes(ext)) {
            return this.inspectModel(filePath);
        } else {
            throw new Error('Unsupported file type. Supported types: ' +
                [...this.availableImgExt, ...this.availableModelExt].join(', '));
        }
    }

    /**
     * 解析图片文件的元数据
     * @param filePath 图片文件路径
     */
    async inspectImage(filePath: string): Promise<ImageInspectionResult> {
        const buffer: Uint8Array = await Deno.readFile(filePath);
        const fileName = path.basename(filePath);
        const fileStats = await Deno.stat(filePath);

        // 修复: image-size 没有默认导出
        // 获取图片尺寸信息
        // 将Uint8Array转换为Buffer
        const nodeBuffer = Buffer.from(buffer);
        const dimensions = imageSize.imageSize(nodeBuffer);
        if (!dimensions.width || !dimensions.height) {
            throw new Error('Could not determine image dimensions');
        }

        const sizeStr = bytes(fileStats.size) || `${fileStats.size} bytes`;
        const imageInfo = {
            width: dimensions.width,
            height: dimensions.height,
            size: sizeStr
        };

        // 读取EXIF数据
        const exif = await this.readExif(buffer);

        // 提取图片元数据
        const metadata = await this.extractMetadata(buffer, fileName);

        // 处理文件信息
        const fileInfo = await this.readImageFileInfo(
            buffer,
            fileName,
            fileStats.size,
            metadata
        );

        return {
            fileInfo,
            exif,
            imageInfo,
            jsonData: fileInfo.find(item => item.key === 'jsonData')?.value
        };
    }

    /**
     * 解析模型文件的元数据
     * @param filePath 模型文件路径
     */
    async inspectModel(filePath: string): Promise<ModelInspectionResult> {
        const buffer = await Deno.readFile(filePath);
        const fileName = path.basename(filePath);
        const fileStats = await Deno.stat(filePath);
        const fileSize = fileStats.size;
        const fileExt = path.extname(filePath).slice(1).toLowerCase();

        if (fileSize < 1024 * 10) {
            return {
                fileInfo: [{key: '错误', value: '🤔 文件过小，怀疑可能不是模型文件。停止解析。'}]
            };
        }

        let modelType: ModelType | null = null;
        let modelKeysContent = '';
        let metaJson: any = null;
        const knownIdentifier = this.modelTypes.map(x => x.identifier);

        // 处理safetensors格式
        if (fileExt === 'safetensors') {
            try {
                const meta = await this.getSafetensorsMeta(buffer);
                if (meta['__metadata__']) {
                    metaJson = {...meta['__metadata__']};
                    delete metaJson['modelspec.thumbnail'];

                    const jsonKeys = [
                        'ss_bucket_info',
                        'ss_network_args',
                        'ss_dataset_dirs',
                        'ss_tag_frequency'
                    ];

                    for (const k of jsonKeys) {
                        if (metaJson[k] && metaJson[k].length < 10000) {
                            try {
                                metaJson[k] = JSON.parse(metaJson[k]);
                            } catch (e) {
                                console.warn(`Failed to parse JSON key ${k}: ${e}`);
                            }
                        }
                    }
                }

                const modelKeys = Object.keys(meta).filter(key => key !== '__metadata__');
                modelKeysContent = modelKeys.join('\n');
            } catch (e: any) {
                return {
                    fileInfo: [{key: '错误', value: `😈 解析失败: ${e.message}`}]
                };
            }
        }
        // 处理其他模型格式
        else {
            modelKeysContent = new TextDecoder().decode(buffer.subarray(0, 1024 * 50));
        }

        // 识别模型类型
        if (metaJson && metaJson['modelspec.architecture'] &&
            knownIdentifier.includes(metaJson['modelspec.architecture'])) {
            modelType = this.modelTypes.find(
                x => x.identifier === metaJson['modelspec.architecture']
            ) || null;
        } else {
            for (const m of this.modelTypes) {
                if (modelType) break;

                for (const sig of m.sigs) {
                    if (modelKeysContent.includes(sig)) {
                        modelType = m;
                        break;
                    }
                }
            }
        }

        const sizeStr = bytes(fileSize) || `${fileSize} bytes`;
        const fileInfo: FileInfoItem[] = [
            {key: '文件名', value: fileName.split('.').slice(0, -1).join('.')},
            {key: '后缀名', value: fileName.split('.').pop() || ''},
            {key: '文件大小', value: sizeStr},
            {
                key: '模型种类',
                value: modelType
                    ? modelType.name
                    : '😭 未知模型种类或非模型 如果你坚信这是一个模型文件，请提交issue。'
            }
        ];

        if (modelType) {
            fileInfo.push({key: '模型用法', value: modelType.usage});
        }

        if (fileExt === 'safetensors' && metaJson) {
            fileInfo.push({key: '元数据', value: metaJson});
        }

        return {
            fileInfo,
            jsonData: metaJson
        };
    }

    /**
     * 从safetensors文件提取元数据
     * @param buffer 文件Buffer
     */
    private async getSafetensorsMeta(buffer: Uint8Array): Promise<any> {
        // 检查文件长度是否足够
        if (buffer.length < 8) {
            throw new Error('File too short to be a valid safetensors file.');
        }

        // 创建DataView以读取数字
        const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);

        // 读取头部长度 (8字节小端序)
        const headerLength = Number(view.getBigUint64(0, true));

        // 检查头部长度是否合理
        if (8 + headerLength > buffer.length) {
            throw new Error('Header length exceeds file size.');
        }

        // 提取JSON头部
        const headerJson = new TextDecoder().decode(buffer.subarray(8, 8 + headerLength));

        try {
            return JSON.parse(headerJson);
        } catch (e: any) {
            throw new Error('Invalid safetensors header: ' + e.message);
        }
    }

    /**
     * 读取图片文件的EXIF数据
     * @param buffer 图片Buffer
     */
    private async readExif(buffer: Uint8Array): Promise<any[]> {
        try {
            // 将Uint8Array转换为ArrayBuffer
            const arrayBuffer = buffer.buffer.slice(
                buffer.byteOffset,
                buffer.byteOffset + buffer.byteLength
            );
            const tags = ExifReader.load(arrayBuffer);
            return Object.entries(tags).map(([key, value]) => ({key, value}));
        } catch (e) {
            return [];
        }
    }

    /**
     * 从图片文件中提取元数据
     * @param buffer 图片Buffer
     * @param fileName 文件名（用于确定类型）
     */
    private async extractMetadata(buffer: Uint8Array, fileName: string): Promise<ImageMetadata[]> {
        const ext = path.extname(fileName).slice(1).toLowerCase();

        // PNG格式处理
        if (ext === 'png') {
            try {
                const chunks = extractChunks(buffer);
                return chunks
                    .filter((chunk: any) => chunk.name === 'tEXt' || chunk.name === 'iTXt')
                    .map((chunk: any) => {
                        if (chunk.name === 'iTXt') {
                            // 修复: 移除所有null字节
                            const data = chunk.data.filter((x: any) => x !== 0x00);
                            const header = new TextDecoder().decode(data.slice(0, 11));
                            if (header === 'Description') {
                                const textData = data.slice(11);
                                return {
                                    keyword: 'Description',
                                    text: new TextDecoder().decode(textData)
                                };
                            } else {
                                return {
                                    keyword: 'Unknown',
                                    text: new TextDecoder().decode(data)
                                };
                            }
                        } else {
                            return pngChunkText.decode(chunk.data);
                        }
                    });
            } catch (err) {
                console.error('PNG metadata extraction error:', err);
                return [];
            }
        }
        // WEBP/JPEG/AVIF格式处理
        else if (['webp', 'jpeg', 'jpg', 'avif'].includes(ext)) {
            try {
                // 将Uint8Array转换为ArrayBuffer
                const arrayBuffer = buffer.buffer.slice(
                    buffer.byteOffset,
                    buffer.byteOffset + buffer.byteLength
                );
                const data = ExifReader.load(arrayBuffer);
                if (data.UserComment) {
                    // 修复: 正确处理UserComment类型
                    let metadata = "";
                    if (Array.isArray(data.UserComment.value)) {
                        metadata = String.fromCodePoint(...data.UserComment.value)
                            .replace(/\x00/g, '')
                            .slice(7);
                    } else {
                        metadata = String(data.UserComment.value)
                            .replace(/\x00/g, '')
                            .slice(7);
                    }
                    return [{keyword: 'parameters', text: metadata}];
                }
            } catch (e) {
                console.error('EXIF metadata extraction error:', e);
            }
        }

        return [];
    }

    /**
     * 处理WebUI生成的标签
     * @param data 原始数据
     */
    private handleWebUiTag(data: ImageMetadata): ImageMetadata[] {
        const [prompts, otherParas] = data.text.split('Steps: ');
        const promptSplit = prompts.split('Negative prompt: ');
        const negativePrompt = promptSplit.length > 1 ? promptSplit[1] : '无';

        return [
            {keyword: '提示词', text: promptSplit[0]},
            {keyword: '负面提示词', text: negativePrompt},
            {keyword: '其他参数', text: 'Steps: ' + otherParas}
        ];
    }

    /**
     * 读取图片文件信息
     * @param buffer 图片Buffer
     * @param fileName 文件名
     * @param fileSize 文件大小
     * @param metadata 元数据
     */
    private async readImageFileInfo(
        buffer: Uint8Array,
        fileName: string,
        fileSize: number,
        metadata: ImageMetadata[]
    ): Promise<FileInfoItem[]> {
        let parsed: ImageMetadata[] = [];
        let metaType = 'SD-WEBUI';
        let jsonData: any = null;

        if (metadata.length === 0) {
            // 尝试读取隐藏的EXIF数据
            const stealthExif = await this.getStealthExif(buffer);
            if (stealthExif) {
                parsed = Object.keys(stealthExif).map(key => ({
                    keyword: key,
                    text: stealthExif[key]
                }));
                metaType = 'NOVELAI';
            } else {
                return [{
                    key: '提示',
                    value: '😭 无法读取到图像 Metadata，这可能不是一张 Stable Diffusion 生成的图。或者不是原图，经过了压缩。'
                }];
            }
        } else if (metadata.length === 1) {
            parsed = this.handleWebUiTag(metadata[0]);
        } else {
            parsed = metadata;
            metaType = 'NOVELAI';
        }

        const sizeStr = bytes(fileSize) || `${fileSize} bytes`;
        const fileInfo: FileInfoItem[] = [
            {key: '文件名', value: fileName.split('.').slice(0, -1).join('.')},
            {key: '后缀名', value: fileName.split('.').pop() || ''},
            {key: '文件大小', value: sizeStr},
            ...parsed.map(v => {
                if (this.showJsonViewer(v.keyword)) {
                    try {
                        jsonData = JSON.parse(v.text);
                        return {key: v.keyword, value: jsonData};
                    } catch (e) {
                        console.error('JSON parse error:', e);
                        return {key: v.keyword, value: v.text};
                    }
                }
                return {key: v.keyword, value: v.text};
            })
        ];

        if (metaType === 'SD-WEBUI' && metadata[0]) {
            fileInfo.push({key: '完整生成信息', value: metadata[0].text});
        }

        if (parsed.length === 0) {
            fileInfo.push({
                key: '提示',
                value: '😭 无法读取到图像 Metadata，这可能不是一张 Stable Diffusion 生成的图。或者不是原图，经过了压缩。'
            });
        }

        // 添加JSON数据到结果
        if (jsonData) {
            fileInfo.push({key: 'jsonData', value: jsonData});
        }

        return fileInfo;
    }

    /**
     * 检查是否需要显示JSON查看器
     * @param title 标题
     */
    private showJsonViewer(title: string): boolean {
        return ['Comment', 'workflow'].includes(title);
    }

    /**
     * 获取隐藏的EXIF数据
     * @param buffer 图片Buffer
     */
    private async getStealthExif(buffer: Uint8Array): Promise<Record<string, string> | null> {
        try {
            // 将Uint8Array转换为ArrayBuffer
            const arrayBuffer = buffer.buffer.slice(
                buffer.byteOffset,
                buffer.byteOffset + buffer.byteLength
            );
            const exif = ExifReader.load(arrayBuffer);
            if (!exif) return null;

            // 将EXIF数据转换为简单键值对
            const result: Record<string, string> = {};
            for (const [key, value] of Object.entries(exif)) {
                // @ts-ignore
                result[key] = value.description || value.value || "";
            }
            return result;
        } catch (e) {
            console.error('Stealth EXIF extraction error:', e);
            return null;
        }
    }
}

export default SDMetadataParser;
export { SDMetadataParser };