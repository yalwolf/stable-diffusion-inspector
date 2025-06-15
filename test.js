const SDMetadataParser = require('./dist/main');

async function main() {
    const parser = new SDMetadataParser();

    try {
        // 解析图片
        const imageResult = await parser.inspectImage('test.png');
        console.log('图片元数据:', imageResult.fileInfo);
        console.log('图片尺寸:', imageResult.imageInfo);
        // 解析模型
        const modelResult = await parser.inspectModel('test.safetensors');
        console.log('模型信息:', modelResult.fileInfo);
    } catch (error) {
        console.error('解析失败:', error);
    }
}

main();