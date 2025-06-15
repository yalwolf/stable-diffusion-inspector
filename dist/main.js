"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function (o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
        desc = {
            enumerable: true, get: function () {
                return m[k];
            }
        };
    }
    Object.defineProperty(o, k2, desc);
}) : (function (o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function (o, v) {
    Object.defineProperty(o, "default", {enumerable: true, value: v});
}) : function (o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function (o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : {"default": mod};
};
exports.SDMetadataParser = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const exifreader_1 = __importDefault(require("exifreader"));
// @ts-ignore
const png_chunks_extract_1 = __importDefault(require("png-chunks-extract"));
// @ts-ignore
const pngChunkText = __importStar(require("png-chunk-text"));
const bytes_1 = __importDefault(require("bytes"));
const image_size_1 = __importDefault(require("image-size"));
const modelsig_json_1 = __importDefault(require("./modelsig.json"));
class SDMetadataParser {
    constructor() {
        this.modelTypes = modelsig_json_1.default.data;
        this.availableImgExt = ['png', 'jpeg', 'jpg', 'webp', 'bmp', 'avif'];
        this.availableModelExt = ['pt', 'pth', 'ckpt', 'safetensors', 'bin'];
    }
    /**
     * 检查文件类型并分发给相应的解析器
     * @param filePath 文件路径
     */
    async inspectFile(filePath) {
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
    async inspectImage(filePath) {
        var _a;
        const buffer = await fs.promises.readFile(filePath);
        const fileName = path.basename(filePath);
        const fileStats = await fs.promises.stat(filePath);
        // 获取图片尺寸信息
        const dimensions = (0, image_size_1.default)(buffer);
        if (!dimensions.width || !dimensions.height) {
            throw new Error('Could not determine image dimensions');
        }
        const imageInfo = {
            width: dimensions.width,
            height: dimensions.height,
            size: (0, bytes_1.default)(fileStats.size)
        };
        // 读取EXIF数据
        const exif = await this.readExif(buffer);
        // 提取图片元数据
        const metadata = await this.extractMetadata(buffer, fileName);
        // 处理文件信息
        const fileInfo = await this.readImageFileInfo(buffer, fileName, fileStats.size, metadata);
        return {
            fileInfo,
            exif,
            imageInfo,
            jsonData: (_a = fileInfo.find(item => item.key === 'jsonData')) === null || _a === void 0 ? void 0 : _a.value
        };
    }
    /**
     * 解析模型文件的元数据
     * @param filePath 模型文件路径
     */
    async inspectModel(filePath) {
        const buffer = await fs.promises.readFile(filePath);
        const fileName = path.basename(filePath);
        const fileStats = await fs.promises.stat(filePath);
        const fileSize = fileStats.size;
        const fileExt = path.extname(filePath).slice(1).toLowerCase();
        if (fileSize < 1024 * 10) {
            return {
                fileInfo: [{key: '错误', value: '🤔 文件过小，怀疑可能不是模型文件。停止解析。'}]
            };
        }
        let modelType = null;
        let modelKeysContent = '';
        let metaJson = null;
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
            } catch (e) {
                return {
                    fileInfo: [{key: '错误', value: `😈 解析失败: ${e.message}`}]
                };
            }
        }
        // 处理其他模型格式
        else {
            modelKeysContent = buffer.toString('utf8', 0, 1024 * 50);
        }
        // 识别模型类型
        if (metaJson && metaJson['modelspec.architecture'] &&
            knownIdentifier.includes(metaJson['modelspec.architecture'])) {
            modelType = this.modelTypes.find(x => x.identifier === metaJson['modelspec.architecture']) || null;
        } else {
            for (const m of this.modelTypes) {
                if (modelType)
                    break;
                for (const sig of m.sigs) {
                    if (modelKeysContent.includes(sig)) {
                        modelType = m;
                        break;
                    }
                }
            }
        }
        const fileInfo = [
            {key: '文件名', value: fileName.split('.').slice(0, -1).join('.')},
            {key: '后缀名', value: fileName.split('.').pop() || ''},
            // @ts-ignore
            {key: '文件大小', value: this.printableBytes(fileSize)},
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
    async getSafetensorsMeta(buffer) {
        // 检查文件长度是否足够
        if (buffer.length < 8) {
            throw new Error('File too short to be a valid safetensors file.');
        }
        // 读取头部长度 (8字节小端序)
        const headerLength = Number(buffer.readBigUInt64LE(0));
        // 检查头部长度是否合理
        if (8 + headerLength > buffer.length) {
            throw new Error('Header length exceeds file size.');
        }
        // 提取JSON头部
        const headerJson = buffer.toString('utf8', 8, 8 + headerLength);
        try {
            return JSON.parse(headerJson);
        } catch (e) {
            throw new Error('Invalid safetensors header: ' + e.message);
        }
    }
    /**
     * 读取图片文件的EXIF数据
     * @param buffer 图片Buffer
     */
    async readExif(buffer) {
        try {
            const tags = exifreader_1.default.load(buffer.buffer);
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
    async extractMetadata(buffer, fileName) {
        const ext = path.extname(fileName).slice(1).toLowerCase();
        // PNG格式处理
        if (ext === 'png') {
            try {
                const chunks = (0, png_chunks_extract_1.default)(new Uint8Array(buffer));
                return chunks
                    .filter((chunk) => chunk.name === 'tEXt' || chunk.name === 'iTXt')
                    .map((chunk) => {
                        if (chunk.name === 'iTXt') {
                            const data = chunk.data.filter((x) => x !== 0x00);
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
                return [];
            }
        }
        // WEBP/JPEG/AVIF格式处理
        else if (['webp', 'jpeg', 'jpg', 'avif'].includes(ext)) {
            try {
                const data = exifreader_1.default.load(buffer.buffer);
                if (data.UserComment) {
                    // @ts-ignore
                    const metadata = String.fromCodePoint(...data.UserComment.value)
                        .replace(/\x00/g, '')
                        .slice(7);
                    return [{keyword: 'parameters', text: metadata}];
                }
            } catch (e) {
                // 忽略错误
            }
        }
        return [];
    }
    /**
     * 处理WebUI生成的标签
     * @param data 原始数据
     */
    handleWebUiTag(data) {
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
    async readImageFileInfo(buffer, fileName, fileSize, metadata) {
        let parsed = [];
        let metaType = 'SD-WEBUI';
        let jsonData = null;
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
        const fileInfo = [
            {key: '文件名', value: fileName.split('.').slice(0, -1).join('.')},
            {key: '后缀名', value: fileName.split('.').pop() || ''},
            {key: '文件大小', value: (0, bytes_1.default)(fileSize)},
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
    showJsonViewer(title) {
        return ['Comment', 'workflow'].includes(title);
    }
    /**
     * 格式化字节大小
     * @param size 字节大小
     */
    printableBytes(size) {
        return (0, bytes_1.default)(size);
    }
    /**
     * 获取隐藏的EXIF数据
     * @param buffer 图片Buffer
     */
    async getStealthExif(buffer) {
        // 简化实现 - 实际中可能需要更复杂的逻辑
        try {
            const exif = exifreader_1.default.load(buffer.buffer);
            return exif ? Object.fromEntries(Object.entries(exif).map(([key, value]) => [key, value.description || value.value])) : null;
        } catch (e) {
            return null;
        }
    }
}
exports.default = SDMetadataParser;
module.exports = SDMetadataParser;
